import type { AIModel, ModelCapabilities, ModelModality } from "../../core/models/types";
import { EMPTY_CAPABILITIES } from "../../core/models/types";
import type { KiraAiModelEntry } from "./types";

function toModality(category: string | undefined): ModelModality {
  switch (category) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "tts":
      return "tts";
    case "chat":
    default:
      return "chat";
  }
}

export function normalizeKiraAiModel(entry: KiraAiModelEntry): AIModel {
  const modality = toModality(entry.category);
  const isFreeTier = entry.free ?? entry.id.startsWith("kira-");

  const capabilities: ModelCapabilities = {
    ...EMPTY_CAPABILITIES,
    text: modality === "chat",
    vision: entry.capabilities?.vision ?? false,
    toolCalling: entry.capabilities?.tools ?? false,
    reasoning: entry.capabilities?.reasoning ?? false,
    streaming: modality === "chat",
    imageGeneration: modality === "image",
    videoGeneration: modality === "video",
    audioOutput: modality === "tts",
  };

  return {
    id: entry.id,
    providerId: "kiraai",
    displayName: entry.display_name ?? entry.name ?? entry.id,
    modality,
    capabilities,
    contextWindow: entry.context_length,
    maxOutputTokens: entry.max_output_tokens,
    pricing: entry.pricing
      ? {
          input: entry.pricing.input,
          output: entry.pricing.output,
          currency: entry.pricing.currency ?? "VND",
          unit: entry.pricing.unit,
        }
      : undefined,
    accessTier: isFreeTier ? "free" : "paid",
    source: "remote",
    status: entry.status === "inactive" ? "unavailable" : "available",
    metadata: entry.description ? { description: entry.description } : undefined,
    lastUpdated: Date.now(),
  };
}
