/**
 * Normalized internal model representation.
 * Provider-specific fields must NEVER leak past the adapter boundary —
 * every provider adapter is responsible for mapping its raw API response
 * into this shape. See the normalize.ts file inside each provider's folder.
 *
 * Brief reference: section 10 (MODEL REGISTRY), section 48 (CAPABILITY MATRIX)
 */

export type ProviderId = "xkiro" | "kiraai" | "openrouter" | "local";

export type ModelSource = "remote" | "local";

export type ModelStatus =
  | "available"
  | "unavailable"
  | "loading"
  | "error"
  // local-only statuses (superset used by the Local Model Manager, section 8)
  | "not_downloaded"
  | "downloading"
  | "paused"
  | "downloaded"
  | "installing"
  | "ready"
  | "loaded"
  | "unloading"
  | "unsupported"
  | "incompatible"
  | "corrupted";

export interface ModelCapabilities {
  text: boolean;
  vision: boolean;
  audioInput: boolean;
  audioOutput: boolean;
  imageGeneration: boolean;
  videoGeneration: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
  reasoning: boolean;
  embeddings: boolean;
  streaming: boolean;
}

export const EMPTY_CAPABILITIES: ModelCapabilities = {
  text: true,
  vision: false,
  audioInput: false,
  audioOutput: false,
  imageGeneration: false,
  videoGeneration: false,
  toolCalling: false,
  structuredOutput: false,
  reasoning: false,
  embeddings: false,
  streaming: false,
};

export interface ModelPricing {
  /** USD per 1M tokens unless otherwise noted by the provider. */
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  currency?: string;
  unit?: string;
}

export type ModelModality =
  | "chat"
  | "image"
  | "tts"
  | "stt"
  | "embedding"
  | "ocr"
  | "moderation"
  | "video"
  | "music";

export interface ReasoningConfig {
  levels: string[];
  default: string;
}

/**
 * The single normalized model shape used everywhere outside of a provider
 * adapter. UI, router, context manager, memory — all consume AIModel, never
 * a provider's raw response type.
 */
export interface AIModel {
  /** Full ID including vendor/provider prefix, e.g. "openai/gpt-5.6-sol" or "kira-3.5-flash". Pass verbatim to the provider adapter. */
  id: string;
  providerId: ProviderId;
  displayName: string;
  ownedBy?: string;
  modality: ModelModality;

  capabilities: ModelCapabilities;

  contextWindow?: number;
  maxOutputTokens?: number;

  pricing?: ModelPricing;

  /** Which access tier the account needs — free / paid / premium (min deposit or plan). Absent means unknown. */
  accessTier?: "free" | "paid" | "premium";
  /** If a provider gates a model behind a specific paid plan (e.g. XKIRO's min_plan_usd), surface it so the UI can explain a 403 instead of guessing. */
  minPlanUsd?: number;
  minPlanNames?: string[];

  reasoning?: ReasoningConfig;

  source: ModelSource;
  status: ModelStatus;

  /** Local-only fields. Undefined for remote models. */
  local?: LocalModelInfo;

  /** Escape hatch for provider-specific data the UI may want to show in an "additional info" panel — never relied upon by core logic. */
  metadata?: Record<string, unknown>;

  lastUpdated: number;
}

export interface LocalModelInfo {
  huggingFaceRepo: string;
  /** "llama-rn-gguf" is the real runtime used on React Native (llama.cpp binding). The web-only runtimes only apply if a future PWA build target is added. */
  runtime: "llama-rn-gguf" | "webgpu" | "wasm" | "webllm" | "transformers-js" | "unsupported";
  quantization?: string;
  fileSizeBytes?: number;
  downloadedBytes?: number;
  ramRequirementBytes?: number;
  gpuRequirementBytes?: number;
  compatible: boolean;
  incompatibleReason?: string;
}

export interface ModelCatalogCacheEntry {
  providerId: ProviderId;
  models: AIModel[];
  fetchedAt: number;
  /** True if this data was served from cache because a live refresh failed. */
  stale: boolean;
}
