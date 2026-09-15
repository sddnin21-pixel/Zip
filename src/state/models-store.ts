import { create } from "zustand";
import type { AIModel, ProviderId } from "../core/models/types";
import { modelCatalogCache } from "../core/models/catalog-cache";
import { keyManager } from "../core/keys/key-manager";

interface ModelsState {
  catalogs: Record<ProviderId, AIModel[]>;
  staleFlags: Record<ProviderId, boolean>;
  loading: Record<ProviderId, boolean>;
  errors: Partial<Record<ProviderId, string>>;
  searchQuery: string;

  loadAll: () => Promise<void>;
  refresh: (providerId: ProviderId) => Promise<void>;
  setSearchQuery: (q: string) => void;
  filteredModels: (providerId: ProviderId) => AIModel[];
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  catalogs: { xkiro: [], kiraai: [], openrouter: [], local: [] },
  staleFlags: { xkiro: false, kiraai: false, openrouter: false, local: false },
  loading: { xkiro: false, kiraai: false, openrouter: false, local: false },
  errors: {},
  searchQuery: "",

  loadAll: async () => {
    const providerIds: ProviderId[] = ["xkiro", "kiraai", "openrouter", "local"];
    set((s) => ({ loading: { ...s.loading, ...Object.fromEntries(providerIds.map((p) => [p, true])) } }));

    for (const providerId of providerIds) {
      try {
        const keys = providerId === "local" ? [] : await keyManager.listKeys(providerId);
        const secret = keys.length > 0 ? await keyManager.revealSecret(keys[0]!.id) : undefined;
        const entry = await modelCatalogCache.refresh(providerId, secret ?? undefined);
        set((s) => ({
          catalogs: { ...s.catalogs, [providerId]: entry.models },
          staleFlags: { ...s.staleFlags, [providerId]: entry.stale },
          loading: { ...s.loading, [providerId]: false },
          errors: { ...s.errors, [providerId]: undefined },
        }));
      } catch (err) {
        set((s) => ({
          loading: { ...s.loading, [providerId]: false },
          errors: { ...s.errors, [providerId]: err instanceof Error ? err.message : String(err) },
        }));
      }
    }
  },

  refresh: async (providerId) => {
    set((s) => ({ loading: { ...s.loading, [providerId]: true } }));
    try {
      const keys = providerId === "local" ? [] : await keyManager.listKeys(providerId);
      const secret = keys.length > 0 ? await keyManager.revealSecret(keys[0]!.id) : undefined;
      const entry = await modelCatalogCache.refresh(providerId, secret ?? undefined);
      set((s) => ({
        catalogs: { ...s.catalogs, [providerId]: entry.models },
        staleFlags: { ...s.staleFlags, [providerId]: entry.stale },
        loading: { ...s.loading, [providerId]: false },
        errors: { ...s.errors, [providerId]: undefined },
      }));
    } catch (err) {
      set((s) => ({
        loading: { ...s.loading, [providerId]: false },
        errors: { ...s.errors, [providerId]: err instanceof Error ? err.message : String(err) },
      }));
    }
  },

  setSearchQuery: (q) => set({ searchQuery: q }),

  filteredModels: (providerId) => {
    const { catalogs, searchQuery } = get();
    const models = catalogs[providerId] ?? [];
    if (!searchQuery.trim()) return models;
    const q = searchQuery.toLowerCase();
    return models.filter(
      (m) => m.displayName.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.ownedBy?.toLowerCase().includes(q)
    );
  },
}));
