import type { AIProvider } from "./shared/provider-interface";
import type { ProviderId } from "../core/models/types";
import { XkiroProvider } from "./xkiro/xkiro-provider";
import { KiraAiProvider } from "./kiraai/kiraai-provider";
import { OpenRouterProvider } from "./openrouter/openrouter-provider";
import { LocalProvider } from "./local/local-provider";

/**
 * Single authoritative provider instance per ProviderId (brief section 75 —
 * no duplicate/legacy provider systems). Everything that needs to talk to a
 * provider goes through this registry, never constructs an adapter itself.
 */
const providers: Record<ProviderId, AIProvider> = {
  xkiro: new XkiroProvider(),
  kiraai: new KiraAiProvider(),
  openrouter: new OpenRouterProvider(),
  local: new LocalProvider(),
};

export function getProvider(id: ProviderId): AIProvider {
  return providers[id];
}

export function getAllProviders(): AIProvider[] {
  return Object.values(providers);
}

export const ALL_PROVIDER_IDS: ProviderId[] = ["xkiro", "kiraai", "openrouter", "local"];
