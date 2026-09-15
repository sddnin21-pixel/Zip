import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { getDb } from "../../storage/db";
import type { ProviderId } from "../models/types";
import { normalizedError, type NormalizedError } from "../../providers/shared/errors";

export interface ApiKeyRecord {
  id: string;
  providerId: ProviderId;
  name: string;
  maskedPreview: string;
  enabled: boolean;
  status: "unknown" | "valid" | "invalid" | "rate_limited" | "cooldown";
  lastSuccessAt?: number;
  lastFailureAt?: number;
  cooldownUntil?: number;
  createdAt: number;
}

function secureStoreKeyFor(recordId: string): string {
  return `qusin_apikey_${recordId}`;
}

function maskKey(secret: string): string {
  if (secret.length <= 8) return "•".repeat(secret.length);
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

/**
 * Multi-key pool manager. Section 11: "A key belongs to exactly one
 * provider." Section 12: never log secrets, never display the full secret
 * after saving unless explicitly revealed, never put keys in conversation
 * history. The actual secret value lives ONLY in expo-secure-store
 * (OS keychain / Android Keystore) — SQLite only ever holds the masked
 * preview and metadata.
 */
class KeyManager {
  async addKey(providerId: ProviderId, name: string, secret: string): Promise<ApiKeyRecord> {
    const id = Crypto.randomUUID();
    await SecureStore.setItemAsync(secureStoreKeyFor(id), secret, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    });

    const record: ApiKeyRecord = {
      id,
      providerId,
      name,
      maskedPreview: maskKey(secret),
      enabled: true,
      status: "unknown",
      createdAt: Date.now(),
    };

    const db = await getDb();
    await db.runAsync(
      `INSERT INTO providers_keys (id, provider_id, name, secure_store_ref, masked_preview, enabled, status, created_at)
       VALUES (?, ?, ?, ?, ?, 1, 'unknown', ?)`,
      [id, providerId, name, secureStoreKeyFor(id), record.maskedPreview, record.createdAt]
    );

    return record;
  }

  async renameKey(id: string, name: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(`UPDATE providers_keys SET name = ? WHERE id = ?`, [name, id]);
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const db = await getDb();
    await db.runAsync(`UPDATE providers_keys SET enabled = ? WHERE id = ?`, [enabled ? 1 : 0, id]);
  }

  async deleteKey(id: string): Promise<void> {
    await SecureStore.deleteItemAsync(secureStoreKeyFor(id));
    const db = await getDb();
    await db.runAsync(`DELETE FROM providers_keys WHERE id = ?`, [id]);
  }

  /** Only call this when the user explicitly chooses to reveal a key (brief section 12). */
  async revealSecret(id: string): Promise<string | null> {
    return SecureStore.getItemAsync(secureStoreKeyFor(id));
  }

  async listKeys(providerId?: ProviderId): Promise<ApiKeyRecord[]> {
    const db = await getDb();
    const rows = providerId
      ? await db.getAllAsync<Record<string, unknown>>(
          `SELECT * FROM providers_keys WHERE provider_id = ? ORDER BY created_at ASC`,
          [providerId]
        )
      : await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM providers_keys ORDER BY created_at ASC`);
    return rows.map(rowToRecord);
  }

  async markSuccess(id: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `UPDATE providers_keys SET status = 'valid', last_success_at = ?, cooldown_until = NULL WHERE id = ?`,
      [Date.now(), id]
    );
  }

  async markRateLimited(id: string, cooldownMs: number): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `UPDATE providers_keys SET status = 'rate_limited', last_failure_at = ?, cooldown_until = ? WHERE id = ?`,
      [Date.now(), Date.now() + cooldownMs, id]
    );
  }

  async markInvalid(id: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(`UPDATE providers_keys SET status = 'invalid', last_failure_at = ? WHERE id = ?`, [
      Date.now(),
      id,
    ]);
  }

  /**
   * Resolve the *secret* for the given strategy. Throws a normalized
   * NO_AVAILABLE_KEY-style error (mapped to AUTH_FAILED) if the pool is
   * exhausted, so the ModelRouter can decide whether to fail over to
   * another provider (brief section 14).
   */
  async resolveKey(
    providerId: ProviderId,
    strategy: "manual" | "round_robin" | "failover" | "smart",
    manualKeyId?: string
  ): Promise<{ id: string; secret: string } | null> {
    const all = await this.listKeys(providerId);
    const usable = all.filter((k) => k.enabled && k.status !== "invalid" && !this.isCoolingDown(k));

    if (strategy === "manual") {
      const chosen = manualKeyId ? all.find((k) => k.id === manualKeyId) : usable[0];
      if (!chosen) return null;
      const secret = await this.revealSecret(chosen.id);
      return secret ? { id: chosen.id, secret } : null;
    }

    if (usable.length === 0) return null;

    if (strategy === "round_robin") {
      const next = usable[this.roundRobinCursor(providerId) % usable.length];
      const secret = next ? await this.revealSecret(next.id) : null;
      return next && secret ? { id: next.id, secret } : null;
    }

    // failover and smart both prefer the healthiest key first; "smart"
    // additionally prefers keys with a recent success timestamp.
    const sorted = [...usable].sort((a, b) => {
      if (strategy === "smart") {
        return (b.lastSuccessAt ?? 0) - (a.lastSuccessAt ?? 0);
      }
      return 0;
    });
    const chosen = sorted[0];
    if (!chosen) return null;
    const secret = await this.revealSecret(chosen.id);
    return secret ? { id: chosen.id, secret } : null;
  }

  private isCoolingDown(key: ApiKeyRecord): boolean {
    return key.status === "rate_limited" && !!key.cooldownUntil && key.cooldownUntil > Date.now();
  }

  private cursors = new Map<ProviderId, number>();
  private roundRobinCursor(providerId: ProviderId): number {
    const current = this.cursors.get(providerId) ?? 0;
    this.cursors.set(providerId, current + 1);
    return current;
  }

  toAuthError(providerId: ProviderId): NormalizedError {
    return normalizedError(
      "AUTH_FAILED",
      `No usable ${providerId} API key available — all keys are disabled, invalid, or cooling down.`,
      { providerId }
    );
  }
}

function rowToRecord(row: Record<string, unknown>): ApiKeyRecord {
  return {
    id: row.id as string,
    providerId: row.provider_id as ProviderId,
    name: row.name as string,
    maskedPreview: row.masked_preview as string,
    enabled: row.enabled === 1,
    status: row.status as ApiKeyRecord["status"],
    lastSuccessAt: (row.last_success_at as number) ?? undefined,
    lastFailureAt: (row.last_failure_at as number) ?? undefined,
    cooldownUntil: (row.cooldown_until as number) ?? undefined,
    createdAt: row.created_at as number,
  };
}

export const keyManager = new KeyManager();
