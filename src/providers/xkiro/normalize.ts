import type { AIModel, ModelCapabilities } from "../../core/models/types";
import { EMPTY_CAPABILITIES } from "../../core/models/types";
import type { XkiroModelEntry } from "./types";

export function normalizeXkiroModel(entry: XkiroModelEntry): AIModel {
  const capabilities: ModelCapabilities = {
    ...EMPTY_CAPABILITIES,
    text: entry.modality === "chat",
    vision: entry.capabilities.vision,
    toolCalling: entry.capabilities.tools,
    reasoning: entry.capabilities.reasoning,
    streaming: entry.modality === "chat",
    imageGeneration: entry.modality === "image",
    videoGeneration: entry.modality === "video",
    audioOutput: entry.modality === "tts",
    audioInput: entry.modality === "stt",
    embeddings: entry.modality === "embedding",
    // XKIRO's chat-completions endpoint accepts file parts as image_url data
    // URLs today; it does not document a generic non-image file upload, so
    // we do not claim broader file support than vision implies.
  };

  return {
    id: entry.id,
    providerId: "xkiro",
    displayName: entry.display_name,
    ownedBy: entry.owned_by,
    modality: entry.modality,
    capabilities,
    contextWindow: entry.context_length,
    maxOutputTokens: entry.max_output_tokens,
    pricing: entry.pricing
      ? {
          input: entry.pricing.input,
          output: entry.pricing.output,
          cacheRead: entry.pricing.cache_read,
          cacheWrite: entry.pricing.cache_write,
          currency: entry.pricing.currency,
          unit: entry.pricing.unit,
        }
      : undefined,
    accessTier: entry.access_tier,
    minPlanUsd: entry.min_plan_usd,
    minPlanNames: entry.min_plan_names,
    reasoning: entry.reasoning_efforts
      ? { levels: entry.reasoning_efforts.levels, default: entry.reasoning_efforts.default }
      : undefined,
    source: "remote",
    status: "available",
    lastUpdated: Date.now(),
  };
}
