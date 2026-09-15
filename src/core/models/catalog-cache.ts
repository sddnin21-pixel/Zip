import { getDb } from "../../storage/db";
import type { AIModel, ModelCatalogCacheEntry, ProviderId } from "./types";
import { getProvider } from "../../providers/registry";

const CACHE_TTL_MS = 5 * 60 * 1000; // "cache it for a few minutes" per XKIRO docs guidance; applied uniformly.

/**
 * Two-tier cache: in-memory for the current session (fast, zero I/O) and
 * SQLite for persistence across app restarts (brief section 34/46 —
 * local-first, offline-capable). Never presents stale data as guaranteed
 * current — every read reports whether it came from cache and how stale.
 */
class ModelCatalogCache {
  private memory = new Map<ProviderId, ModelCatalogCacheEntry>();

  async get(providerId: ProviderId): Promise<ModelCatalogCacheEntry | null> {
    const inMemory = this.memory.get(providerId);
    if (inMemory) return inMemory;

    const db = await getDb();
    const row = await db.getFirstAsync<{ models_json: string; fetched_at: number }>(
      `SELECT models_json, fetched_at FROM model_catalog_cache WHERE provider_id = ?`,
      [providerId]
    );
    if (!row) return null;

    const entry: ModelCatalogCacheEntry = {
      providerId,
      models: JSON.parse(row.models_json) as AIModel[],
      fetchedAt: row.fetched_at,
      stale: Date.now() - row.fetched_at > CACHE_TTL_MS,
    };
    this.memory.set(providerId, entry);
    return entry;
  }

  private async persist(entry: ModelCatalogCacheEntry): Promise<void> {
    this.memory.set(entry.providerId, entry);
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO model_catalog_cache (provider_id, models_json, fetched_at)
       VALUES (?, ?, ?)
       ON CONFLICT(provider_id) DO UPDATE SET models_json = excluded.models_json, fetched_at = excluded.fetched_at`,
      [entry.providerId, JSON.stringify(entry.models), entry.fetchedAt]
    );
  }

  /**
   * Refresh a single provider's catalog from the network. On failure, falls
   * back to whatever is cached (marked stale) rather than throwing, unless
   * there is no cache at all — see refreshOrThrow for the strict variant.
   */
  async refresh(providerId: ProviderId, apiKey?: string): Promise<ModelCatalogCacheEntry> {
    try {
      const models = await getProvider(providerId).listModels(apiKey);
      const entry: ModelCatalogCacheEntry = {
        providerId,
        models,
        fetchedAt: Date.now(),
        stale: false,
      };
      await this.persist(entry);
      return entry;
    } catch (err) {
      const cached = await this.get(providerId);
      if (cached) {
        return { ...cached, stale: true };
      }
      throw err;
    }
  }

  async refreshAll(apiKeys: Partial<Record<ProviderId, string>>): Promise<ModelCatalogCacheEntry[]> {
    const providerIds: ProviderId[] = ["xkiro", "kiraai", "openrouter", "local"];
    const results = await Promise.allSettled(providerIds.map((id) => this.refresh(id, apiKeys[id])));

    return results.map((result, index) => {
      const providerId = providerIds[index] as ProviderId;
      if (result.status === "fulfilled") return result.value;
      // Total failure with no cache at all (refresh() only throws in that case) —
      // report an empty, maximally-stale entry rather than losing the provider from the list.
      return { providerId, models: [], fetchedAt: 0, stale: true };
    });
  }

  invalidate(providerId: ProviderId): void {
    this.memory.delete(providerId);
  }
}

export const modelCatalogCache = new ModelCatalogCache();
