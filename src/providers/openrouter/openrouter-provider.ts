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
import { normalizeOpenRouterModel } from "./normalize";
import type {
  OpenRouterChatCompletionRequest,
  OpenRouterChatCompletionResponse,
  OpenRouterChatMessage,
  OpenRouterModelsListResponse,
  OpenRouterStreamChunk,
} from "./types";
import { messageToPlainText, type QusinMessage } from "../../core/conversation/message-types";

const BASE_URL = "https://openrouter.ai/api/v1";

/**
 * OpenRouter adapter. GET /api/v1/models is public, no key required, and
 * reflects OpenRouter's live catalog (hundreds of models across dozens of
 * upstream providers) — this is the reference implementation of "never
 * hard-code the model list" from brief section 2/64.
 */
export class OpenRouterProvider implements AIProvider {
  private modelCache: AIModel[] | null = null;

  getProviderInfo(): ProviderInfo {
    return {
      id: "openrouter",
      displayName: "OpenRouter",
      kind: "remote",
      baseUrl: BASE_URL,
      docsUrl: "https://openrouter.ai/docs",
      requiresApiKey: true,
    };
  }

  async validateCredentials(apiKey: string): Promise<ValidateCredentialsResult> {
    const result = await fetchJson<Record<string, unknown>>(`${BASE_URL}/auth/key`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!result.ok) return { valid: false, error: result.error };
    return { valid: true, info: result.data };
  }

  async listModels(apiKey?: string): Promise<AIModel[]> {
    const result = await fetchJson<OpenRouterModelsListResponse>(`${BASE_URL}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (!result.ok) throw result.error;
    const models = result.data.data.map(normalizeOpenRouterModel);
    this.modelCache = models;
    return models;
  }

  async getModelCapabilities(modelId: string): Promise<AIModel["capabilities"] | undefined> {
    return this.modelCache?.find((m) => m.id === modelId)?.capabilities;
  }

  async chat(apiKey: string, request: ChatRequest): Promise<ChatResponse> {
    const body = toOpenRouterRequest(request, false);
    const result = await fetchJson<OpenRouterChatCompletionResponse>(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://qusin.vn",
        "X-Title": "Qusin AI",
      },
      body,
      signal: request.signal,
    });
    if (!result.ok) throw result.error;

    const choice = result.data.choices[0];
    if (!choice) throw normalizedError("SERVER_ERROR", "OpenRouter returned no choices");

    return {
      message: {
        id: result.data.id,
        role: "assistant",
        parts: choice.message.content ? [{ type: "text", text: choice.message.content }] : [],
        provider: "openrouter",
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
    const body = toOpenRouterRequest(request, true);
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://qusin.vn",
          "X-Title": "Qusin AI",
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
      const c = chunk as unknown as OpenRouterStreamChunk;
      const choice = c.choices?.[0];
      if (!choice) continue;
      yield {
        textDelta: choice.delta.content,
        finishReason: normalizeFinishReason(choice.finish_reason),
        usage: c.usage
          ? {
              promptTokens: c.usage.prompt_tokens,
              completionTokens: c.usage.completion_tokens,
              totalTokens: c.usage.total_tokens,
            }
          : undefined,
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
  supportsImageGeneration(): boolean {
    // OpenRouter is text-generation focused; it does not document a
    // standalone image-generation endpoint the way XKIRO/KiraAI do.
    return false;
  }
  supportsAudio(modelId: string): boolean {
    return this.modelCache?.find((m) => m.id === modelId)?.capabilities.audioInput ?? false;
  }

  normalizeError(error: unknown): NormalizedError {
    if (error && typeof error === "object" && "code" in error) {
      return error as NormalizedError;
    }
    return normalizedError("UNKNOWN_ERROR", error instanceof Error ? error.message : "Unknown OpenRouter error", {
      cause: error,
    });
  }
}

function normalizeFinishReason(reason: string | null): QusinMessage["finishReason"] {
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

function toOpenRouterRequest(request: ChatRequest, stream: boolean): OpenRouterChatCompletionRequest {
  return {
    model: request.modelId,
    messages: request.messages.map(toOpenRouterMessage),
    stream,
    max_tokens: request.maxTokens,
    temperature: request.temperature,
    top_p: request.topP,
    stop: request.stop,
    response_format: request.responseFormat,
    reasoning: request.reasoningEffort
      ? { effort: request.reasoningEffort as "low" | "medium" | "high" }
      : undefined,
    tools: request.tools?.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    })),
    tool_choice:
      typeof request.toolChoice === "object"
        ? { type: "function" as const, function: { name: request.toolChoice.name } }
        : request.toolChoice,
  };
}

function toOpenRouterMessage(message: QusinMessage): OpenRouterChatMessage {
  const imageParts = message.parts.filter((p) => p.type === "image");
  const toolCallParts = message.parts.filter((p) => p.type === "tool_call");
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

  return {
    role: message.role,
    content,
    tool_calls:
      toolCallParts.length > 0
        ? toolCallParts
            .filter((p): p is Extract<typeof p, { type: "tool_call" }> => p.type === "tool_call")
            .map((p) => ({
              id: p.id,
              type: "function" as const,
              function: { name: p.name, arguments: JSON.stringify(p.arguments) },
            }))
        : undefined,
  };
}
