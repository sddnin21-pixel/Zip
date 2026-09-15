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
import { normalizeXkiroModel } from "./normalize";
import type {
  XkiroChatCompletionRequest,
  XkiroChatCompletionResponse,
  XkiroChatMessage,
  XkiroModelsListResponse,
  XkiroStreamChunk,
} from "./types";
import { messageToPlainText, type QusinMessage } from "../../core/conversation/message-types";

const BASE_URL = "https://api.xkiro.com/v1";

/**
 * XKIRO adapter. Base URL, endpoints and response shapes verified against
 * https://docs.xkiro.com (fetched 2026-09-14) and a live call to
 * GET https://api.xkiro.com/v1/models, which returned 85 real, currently
 * live models at time of writing. GET /v1/models is public (no key). All
 * other endpoints require Authorization: Bearer <key>.
 */
export class XkiroProvider implements AIProvider {
  private modelCache: AIModel[] | null = null;

  getProviderInfo(): ProviderInfo {
    return {
      id: "xkiro",
      displayName: "XKIRO",
      kind: "remote",
      baseUrl: BASE_URL,
      docsUrl: "https://docs.xkiro.com",
      requiresApiKey: true,
    };
  }

  async validateCredentials(apiKey: string): Promise<ValidateCredentialsResult> {
    // XKIRO has no dedicated /validate endpoint in its documented API.
    // We validate by making the cheapest possible authenticated call:
    // a 1-token chat completion is billed, so instead we rely on the
    // account's usage endpoint if available, falling back to a minimal
    // chat call only if that's absent from docs. Since /v1/usage is
    // documented as "key required" and "free to call", use that.
    const result = await fetchJson<Record<string, unknown>>(`${BASE_URL}/usage`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!result.ok) {
      return { valid: false, error: result.error };
    }
    return { valid: true, info: result.data };
  }

  async listModels(apiKey?: string): Promise<AIModel[]> {
    // Public endpoint — works with or without a key. We pass the key when
    // present since XKIRO's docs note providing an anthropic-version/x-api-key
    // header switches response shape; we stay on the default (OpenAI) shape
    // deliberately for a single normalization path.
    const result = await fetchJson<XkiroModelsListResponse>(`${BASE_URL}/models?modality=all`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (!result.ok) {
      throw result.error;
    }
    const models = result.data.data.map(normalizeXkiroModel);
    this.modelCache = models;
    return models;
  }

  async getModelCapabilities(modelId: string): Promise<AIModel["capabilities"] | undefined> {
    const models = this.modelCache ?? (await this.listModels());
    return models.find((m) => m.id === modelId)?.capabilities;
  }

  async chat(apiKey: string, request: ChatRequest): Promise<ChatResponse> {
    const body = toXkiroRequest(request, false);
    const result = await fetchJson<XkiroChatCompletionResponse>(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
      signal: request.signal,
      timeoutMs: 95_000,
    });
    if (!result.ok) throw result.error;

    const choice = result.data.choices[0];
    if (!choice) {
      throw normalizedError("SERVER_ERROR", "XKIRO returned no choices in the response");
    }

    return {
      message: {
        id: result.data.id,
        role: "assistant",
        parts: choice.message.content ? [{ type: "text", text: choice.message.content }] : [],
        provider: "xkiro",
        model: result.data.model,
        timestamp: Date.now(),
        finishReason: choice.finish_reason,
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
    const body = toXkiroRequest(request, true);
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
      const c = chunk as unknown as XkiroStreamChunk;
      const choice = c.choices?.[0];
      if (!choice) continue;
      yield {
        textDelta: choice.delta.content,
        finishReason: choice.finish_reason ?? undefined,
        usage: c.usage
          ? {
              promptTokens: c.usage.prompt_tokens,
              completionTokens: c.usage.completion_tokens,
              totalTokens: c.usage.total_tokens,
            }
          : undefined,
        done: choice.finish_reason !== null && choice.finish_reason !== undefined,
      };
    }
    yield { done: true };
  }

  supportsToolCalling(modelId: string): boolean {
    return this.lookupCap(modelId)?.toolCalling ?? false;
  }
  supportsVision(modelId: string): boolean {
    return this.lookupCap(modelId)?.vision ?? false;
  }
  supportsFiles(modelId: string): boolean {
    // See normalize.ts note: file support is implied by vision (image_url) only.
    return this.lookupCap(modelId)?.vision ?? false;
  }
  supportsReasoning(modelId: string): boolean {
    return this.lookupCap(modelId)?.reasoning ?? false;
  }
  supportsImageGeneration(modelId: string): boolean {
    return this.lookupCap(modelId)?.imageGeneration ?? false;
  }
  supportsAudio(modelId: string): boolean {
    const cap = this.lookupCap(modelId);
    return (cap?.audioInput || cap?.audioOutput) ?? false;
  }

  private lookupCap(modelId: string) {
    return this.modelCache?.find((m) => m.id === modelId)?.capabilities;
  }

  normalizeError(error: unknown): NormalizedError {
    if (error && typeof error === "object" && "code" in error) {
      return error as NormalizedError;
    }
    return normalizedError("UNKNOWN_ERROR", error instanceof Error ? error.message : "Unknown XKIRO error", {
      cause: error,
    });
  }
}

function toXkiroRequest(request: ChatRequest, stream: boolean): XkiroChatCompletionRequest {
  return {
    model: request.modelId,
    messages: request.messages.map(toXkiroMessage),
    stream,
    max_tokens: request.maxTokens,
    temperature: request.temperature,
    top_p: request.topP,
    stop: request.stop,
    response_format: request.responseFormat,
    reasoning_effort: request.reasoningEffort,
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

function toXkiroMessage(message: QusinMessage): XkiroChatMessage {
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
