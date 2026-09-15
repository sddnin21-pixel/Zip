import type { AIModel, ModelCapabilities } from "../../core/models/types";
import { EMPTY_CAPABILITIES } from "../../core/models/types";
import type { OpenRouterModelEntry } from "./types";

/** OpenRouter prices are USD-per-token strings; the rest of Qusin works in USD-per-1M-tokens to match XKIRO/KiraAI, so convert once here. */
function perTokenToPer1M(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n * 1_000_000;
}

export function normalizeOpenRouterModel(entry: OpenRouterModelEntry): AIModel {
  const supported = new Set(entry.supported_parameters ?? []);
  const inputModalities = entry.architecture?.input_modalities ?? [];

  const capabilities: ModelCapabilities = {
    ...EMPTY_CAPABILITIES,
    text: true,
    vision: inputModalities.includes("image"),
    audioInput: inputModalities.includes("audio"),
    toolCalling: supported.has("tools") || supported.has("tool_choice"),
    reasoning: supported.has("reasoning") || supported.has("include_reasoning"),
    structuredOutput: supported.has("response_format") || supported.has("structured_outputs"),
    streaming: true,
  };

  return {
    id: entry.id,
    providerId: "openrouter",
    displayName: entry.name,
    modality: "chat",
    capabilities,
    contextWindow: entry.top_provider?.context_length ?? entry.context_length,
    maxOutputTokens: entry.top_provider?.max_completion_tokens,
    pricing: entry.pricing
      ? {
          input: perTokenToPer1M(entry.pricing.prompt),
          output: perTokenToPer1M(entry.pricing.completion),
          currency: "USD",
          unit: "per_1m_tokens",
        }
      : undefined,
    source: "remote",
    status: "available",
    metadata: {
      description: entry.description,
      architecture: entry.architecture,
      supportedParameters: entry.supported_parameters,
    },
    lastUpdated: Date.now(),
  };
}
