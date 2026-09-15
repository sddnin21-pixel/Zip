import type {
  AIProvider,
  ChatRequest,
  ChatResponse,
  ProviderInfo,
  StreamChunk,
  ValidateCredentialsResult,
} from "../shared/provider-interface";
import type { AIModel } from "../../core/models/types";
import { fetchJson, parseSSEStream } from "../shared/http";
import { errorCodeFromHttpStatus, normalizedError, type NormalizedError } from "../shared/errors";
import { normalizeKiraAiModel } from "./normalize";
import type {
  KiraAiChatCompletionRequest,
  KiraAiChatCompletionResponse,
  KiraAiChatMessage,
  KiraAiModelsListResponse,
  KiraAiStreamChunk,
  KiraAiUserProfile,
} from "./types";
import { messageToPlainText, type QusinMessage } from "../../core/conversation/message-types";

const BASE_URL = "https://kiraai.vn/api/v1";

/**
 * KiraAI adapter. Endpoints verified against https://kiraai.vn/documents/
 * (fetched 2026-09-14). Unlike XKIRO, GET /models requires a Bearer key —
 * we were not able to call it live without an account key, so
 * parseModelsResponse() is defensive about the exact response envelope
 * (see types.ts). If KiraAI's actual shape turns out to differ once a real
 * key is available, only this file + types.ts + normalize.ts need updating —
 * nothing outside the adapter depends on KiraAI's raw shape.
 */
export class KiraAiProvider implements AIProvider {
  private modelCache: AIModel[] | null = null;

  getProviderInfo(): ProviderInfo {
    return {
      id: "kiraai",
      displayName: "KiraAI",
      kind: "remote",
      baseUrl: BASE_URL,
      docsUrl: "https://kiraai.vn/documents/",
      requiresApiKey: true,
    };
  }

  async validateCredentials(apiKey: string): Promise<ValidateCredentialsResult> {
    const result = await fetchJson<KiraAiUserProfile>(`${BASE_URL}/user/profile`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!result.ok) return { valid: false, error: result.error };
    return { valid: true, info: result.data as unknown as Record<string, unknown> };
  }

  async listModels(apiKey?: string): Promise<AIModel[]> {
    if (!apiKey) {
      // KiraAI's /models endpoint requires a key per the docs — unlike
      // XKIRO this is not public. Surface that clearly instead of
      // pretending we fetched something.
      throw normalizedError(
        "AUTH_FAILED",
        "KiraAI's model catalog requires an API key — add a KiraAI key in Settings to load its models."
      );
    }
    const result = await fetchJson<KiraAiModelsListResponse>(`${BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!result.ok) throw result.error;

    const entries = Array.isArray(result.data) ? result.data : result.data.data;
    const models = entries.map(normalizeKiraAiModel);
    this.modelCache = models;
    return models;
  }

  async getModelCapabilities(modelId: string): Promise<AIModel["capabilities"] | undefined> {
    return this.modelCache?.find((m) => m.id === modelId)?.capabilities;
  }

  async chat(apiKey: string, request: ChatRequest): Promise<ChatResponse> {
    const body = toKiraRequest(request, false);
    const result = await fetchJson<KiraAiChatCompletionResponse>(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
      signal: request.signal,
    });
    if (!result.ok) throw result.error;

    const choice = result.data.choices[0];
    if (!choice) {
      throw normalizedError("SERVER_ERROR", "KiraAI returned no choices in the response");
    }

    return {
      message: {
        id: result.data.id ?? crypto.randomUUID(),
        role: "assistant",
        parts: [{ type: "text", text: choice.message.content }],
        provider: "kiraai",
        model: result.data.model,
        timestamp: Date.now(),
        finishReason: normalizeFinishReason(choice.finish_reason),
        usage: result.data.usage
          ? {
              promptTokens: result.data.usage.prompt_tokens,
              completionTokens: result.data.usage.completion_tokens,
              totalTokens: result.data.usage.total_tokens,
            }
          : undefined,
      },
      raw: result.data,
    };
  }

  async *streamChat(
    apiKey: string,
    request: ChatRequest
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const body = toKiraRequest(request, true);
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: request.signal,
      });
    } catch (err) {
      throw normalizedError("NETWORK_ERROR", err instanceof Error ? err.message : "Network error", {
        cause: err,
      });
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw normalizedError(errorCodeFromHttpStatus(response.status), text || `HTTP ${response.status}`, {
        httpStatus: response.status,
      });
    }

    for await (const chunk of parseSSEStream(response)) {
      const c = chunk as unknown as KiraAiStreamChunk;
      const choice = c.choices?.[0];
      if (!choice) continue;
      yield {
        textDelta: choice.delta.content,
        finishReason: normalizeFinishReason(choice.finish_reason ?? undefined),
        done: choice.finish_reason != null,
      };
    }
    yield { done: true };
  }

  supportsToolCalling(modelId: string): boolean {
    return this.modelCache?.find((m) => m.id === modelId)?.capabilities.toolCalling ?? false;
  }
  supportsVision(modelId: string): boolean {
    return this.modelCache?.find((m) => m.id === modelId)?.capabilities.vision ?? false;
  }
  supportsFiles(modelId: string): boolean {
    return this.supportsVision(modelId);
  }
  supportsReasoning(modelId: string): boolean {
    return this.modelCache?.find((m) => m.id === modelId)?.capabilities.reasoning ?? false;
  }
  supportsImageGeneration(modelId: string): boolean {
    return this.modelCache?.find((m) => m.id === modelId)?.capabilities.imageGeneration ?? false;
  }
  supportsAudio(modelId: string): boolean {
    const cap = this.modelCache?.find((m) => m.id === modelId)?.capabilities;
    return (cap?.audioInput || cap?.audioOutput) ?? false;
  }

  normalizeError(error: unknown): NormalizedError {
    if (error && typeof error === "object" && "code" in error) {
      return error as NormalizedError;
    }
    return normalizedError("UNKNOWN_ERROR", error instanceof Error ? error.message : "Unknown KiraAI error", {
      cause: error,
    });
  }
}

function normalizeFinishReason(reason: string | undefined): QusinMessage["finishReason"] {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "tool_calls":
      return "tool_calls";
    case "content_filter":
      return "content_filter";
    default:
      return undefined;
  }
}

function toKiraRequest(request: ChatRequest, stream: boolean): KiraAiChatCompletionRequest {
  return {
    model: request.modelId,
    messages: request.messages.map(toKiraMessage),
    stream,
    max_tokens: request.maxTokens,
    temperature: request.temperature,
  };
}

function toKiraMessage(message: QusinMessage): KiraAiChatMessage {
  const imageParts = message.parts.filter((p) => p.type === "image");
  const toolResultPart = message.parts.find((p) => p.type === "tool_result");

  if (message.role === "tool" && toolResultPart?.type === "tool_result") {
    return {
      role: "tool",
      tool_call_id: toolResultPart.toolCallId,
      content: JSON.stringify(toolResultPart.result),
    };
  }

  const content =
    imageParts.length > 0
      ? [
          ...message.parts
            .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
            .map((p) => ({ type: "text" as const, text: p.text })),
          ...imageParts
            .filter((p): p is Extract<typeof p, { type: "image" }> => p.type === "image")
            .map((p) => ({ type: "image_url" as const, image_url: { url: p.url } })),
        ]
      : messageToPlainText(message);

  return { role: message.role, content };
}
