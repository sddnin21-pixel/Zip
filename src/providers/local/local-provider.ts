import type {
  AIProvider,
  ChatRequest,
  ChatResponse,
  ProviderInfo,
  StreamChunk,
  ValidateCredentialsResult,
} from "../shared/provider-interface";
import type { AIModel } from "../../core/models/types";
import { normalizedError, type NormalizedError } from "../shared/errors";
import { messageToPlainText } from "../../core/conversation/message-types";
import type { LocalModelRecord } from "./types";
import { localModelStore } from "./local-model-store";

/**
 * llama.rn's real exported API (verified against mybigday/llama.rn docs,
 * 2026-09-14): initLlama(params) -> LlamaContext, context.completion(params,
 * onToken), context.stopCompletion(), context.release(). We keep the import
 * lazy/typed loosely because llama.rn's native module is only linked in a
 * real native build (`expo run:android` / EAS build) — it is not available
 * inside a plain JS bundler check, so importing it eagerly at module scope
 * would break `expo start --web` and unit tests that don't need it.
 */
type LlamaContext = {
  completion: (
    params: { messages: { role: string; content: string }[]; n_predict?: number; temperature?: number; stop?: string[] },
    onToken?: (data: { token: string }) => void
  ) => Promise<{ text: string; timings?: unknown }>;
  stopCompletion: () => Promise<void>;
  release: () => Promise<void>;
};

let cachedContext: { modelId: string; context: LlamaContext } | null = null;

async function getLlamaRn(): Promise<typeof import("llama.rn")> {
  try {
    return await import("llama.rn");
  } catch (err) {
    throw normalizedError(
      "LOCAL_MODEL_ERROR",
      "llama.rn native module is not available in this build. Local inference requires a native build (expo run:android or an EAS build) — it does not work in Expo Go or the web preview.",
      { cause: err }
    );
  }
}

async function ensureContext(record: LocalModelRecord): Promise<LlamaContext> {
  if (cachedContext?.modelId === record.id) return cachedContext.context;
  if (cachedContext) {
    await cachedContext.context.release().catch(() => undefined);
    cachedContext = null;
  }
  if (!record.localPath) {
    throw normalizedError("LOCAL_MODEL_ERROR", `${record.displayName} is not downloaded yet.`);
  }
  const { initLlama } = await getLlamaRn();
  const context = (await initLlama({
    model: record.localPath,
    use_mlock: true,
    n_ctx: record.contextLength ?? 4096,
  })) as unknown as LlamaContext;
  cachedContext = { modelId: record.id, context };
  return context;
}

/**
 * Local provider. Unlike the remote adapters, `listModels` does not hit a
 * network model-discovery endpoint — the "catalog" is whatever the user has
 * actually downloaded via the Local Model Manager (brief section 7/8),
 * normalized from local-model-store.ts. Discovery of *new* models to
 * download is a separate flow (huggingface-client.ts + the Local Models
 * settings screen), not part of AIProvider#listModels, because an
 * undownloaded HF model isn't yet a usable AIModel.
 */
export class LocalProvider implements AIProvider {
  getProviderInfo(): ProviderInfo {
    return {
      id: "local",
      displayName: "Local",
      kind: "local",
      requiresApiKey: false,
    };
  }

  async validateCredentials(): Promise<ValidateCredentialsResult> {
    // No credentials concept for local inference.
    return { valid: true };
  }

  async listModels(): Promise<AIModel[]> {
    const records = await localModelStore.list();
    return records
      .filter((r) => r.status === "loaded" || r.status === "downloaded")
      .map(recordToAIModel);
  }

  async getModelCapabilities(modelId: string): Promise<AIModel["capabilities"] | undefined> {
    const record = await localModelStore.get(modelId);
    return record ? recordToAIModel(record).capabilities : undefined;
  }

  async chat(_apiKey: string, request: ChatRequest): Promise<ChatResponse> {
    const record = await localModelStore.get(request.modelId);
    if (!record) throw normalizedError("MODEL_NOT_FOUND", `Local model ${request.modelId} is not downloaded.`);

    const context = await ensureContext(record);
    const result = await context.completion({
      messages: request.messages.map((m) => ({ role: m.role, content: messageToPlainText(m) })),
      n_predict: request.maxTokens ?? 512,
      temperature: request.temperature,
      stop: request.stop,
    });

    return {
      message: {
        id: crypto.randomUUID(),
        role: "assistant",
        parts: [{ type: "text", text: result.text }],
        provider: "local",
        model: request.modelId,
        timestamp: Date.now(),
        finishReason: "stop",
      },
      raw: result,
    };
  }

  async *streamChat(_apiKey: string, request: ChatRequest): AsyncGenerator<StreamChunk, void, unknown> {
    const record = await localModelStore.get(request.modelId);
    if (!record) throw normalizedError("MODEL_NOT_FOUND", `Local model ${request.modelId} is not downloaded.`);

    const context = await ensureContext(record);

    // llama.rn's completion() takes a token callback rather than returning
    // an async iterator natively, so we bridge it into one with a small
    // queue. This keeps the AIProvider#streamChat contract identical across
    // every adapter (brief section 3/53).
    const queue: string[] = [];
    let finished = false;
    let resolveWait: (() => void) | null = null;

    const completionPromise = context
      .completion(
        {
          messages: request.messages.map((m) => ({ role: m.role, content: messageToPlainText(m) })),
          n_predict: request.maxTokens ?? 512,
          temperature: request.temperature,
          stop: request.stop,
        },
        (data) => {
          queue.push(data.token);
          resolveWait?.();
        }
      )
      .finally(() => {
        finished = true;
        resolveWait?.();
      });

    request.signal?.addEventListener("abort", () => {
      context.stopCompletion().catch(() => undefined);
    });

    while (!finished || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          resolveWait = resolve;
        });
        resolveWait = null;
        continue;
      }
      const token = queue.shift();
      if (token !== undefined) {
        yield { textDelta: token, done: false };
      }
    }

    await completionPromise;
    yield { done: true, finishReason: "stop" };
  }

  supportsToolCalling(): boolean {
    // llama.rn documents universal tool calling via Jinja templates, but
    // whether a given GGUF model actually follows tool-call output format
    // depends on that model's own chat template — we don't claim this
    // works for every downloaded model without per-model verification.
    return false;
  }
  supportsVision(): boolean {
    return false; // requires an mmproj projector file we don't manage yet
  }
  supportsFiles(): boolean {
    return false;
  }
  supportsReasoning(): boolean {
    return false;
  }
  supportsImageGeneration(): boolean {
    return false;
  }
  supportsAudio(): boolean {
    return false;
  }

  normalizeError(error: unknown): NormalizedError {
    if (error && typeof error === "object" && "code" in error) {
      return error as NormalizedError;
    }
    return normalizedError("LOCAL_MODEL_ERROR", error instanceof Error ? error.message : "Unknown local model error", {
      cause: error,
    });
  }

  async unload(): Promise<void> {
    if (cachedContext) {
      await cachedContext.context.release().catch(() => undefined);
      cachedContext = null;
    }
  }
}

function recordToAIModel(record: LocalModelRecord): AIModel {
  return {
    id: record.id,
    providerId: "local",
    displayName: record.displayName,
    modality: "chat",
    capabilities: {
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
      streaming: true,
    },
    contextWindow: record.contextLength,
    source: "local",
    status: record.status === "loaded" ? "loaded" : "downloaded",
    local: {
      huggingFaceRepo: record.repo,
      runtime: record.compatibility.runtime,
      quantization: record.quantization,
      fileSizeBytes: record.fileSizeBytes,
      downloadedBytes: record.downloadedBytes,
      compatible: record.compatibility.compatible,
      incompatibleReason: record.compatibility.reason,
    },
    lastUpdated: record.addedAt,
  };
}
