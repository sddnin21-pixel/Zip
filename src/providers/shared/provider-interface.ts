import type { AIModel, ProviderId } from "../../core/models/types";
import type { QusinMessage } from "../../core/conversation/message-types";
import type { NormalizedError } from "./errors";

export interface ChatRequest {
  modelId: string;
  messages: QusinMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  reasoningEffort?: string;
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "none" | "required" | { name: string };
  responseFormat?: { type: "json_object" } | { type: "text" };
  signal?: AbortSignal;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
}

export interface ChatResponse {
  message: QusinMessage;
  raw?: unknown;
}

export interface StreamChunk {
  /** Incremental text delta, if any. */
  textDelta?: string;
  /** Emitted once, when the model begins/completes a tool call. */
  toolCallDelta?: {
    id: string;
    name?: string;
    argumentsDelta?: string;
  };
  finishReason?: QusinMessage["finishReason"];
  usage?: QusinMessage["usage"];
  done: boolean;
}

export interface ValidateCredentialsResult {
  valid: boolean;
  error?: NormalizedError;
  /** Non-fatal info the UI can show, e.g. remaining free quota. */
  info?: Record<string, unknown>;
}

export interface ProviderInfo {
  id: ProviderId;
  displayName: string;
  /** Whether this provider is a remote HTTP API vs an on-device runtime. */
  kind: "remote" | "local";
  baseUrl?: string;
  docsUrl?: string;
  requiresApiKey: boolean;
}

/**
 * The contract every provider adapter must implement.
 * Brief section 3 — capabilities must be detected dynamically, never assumed.
 */
export interface AIProvider {
  getProviderInfo(): ProviderInfo;

  validateCredentials(apiKey: string): Promise<ValidateCredentialsResult>;

  /**
   * Fetch the live model catalog from the provider. Must NEVER return a
   * hard-coded list — always a real network call (or, for `local`, a real
   * on-device scan). Callers are responsible for caching (see
   * src/core/models/catalog-cache.ts).
   */
  listModels(apiKey?: string): Promise<AIModel[]>;

  getModelCapabilities(modelId: string): Promise<AIModel["capabilities"] | undefined>;

  chat(apiKey: string, request: ChatRequest): Promise<ChatResponse>;

  streamChat(
    apiKey: string,
    request: ChatRequest
  ): AsyncGenerator<StreamChunk, void, unknown>;

  supportsToolCalling(modelId: string): boolean;
  supportsVision(modelId: string): boolean;
  supportsFiles(modelId: string): boolean;
  supportsReasoning(modelId: string): boolean;
  supportsImageGeneration(modelId: string): boolean;
  supportsAudio(modelId: string): boolean;

  normalizeError(error: unknown): NormalizedError;
}
