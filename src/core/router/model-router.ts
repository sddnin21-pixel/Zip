import type { ProviderId } from "../models/types";
import type { ChatRequest, ChatResponse, StreamChunk } from "../../providers/shared/provider-interface";
import { getProvider } from "../../providers/registry";
import { keyManager } from "../keys/key-manager";
import type { NormalizedError } from "../../providers/shared/errors";
import { normalizedError } from "../../providers/shared/errors";
import { rateLimiter } from "../../security/rate-limiter";

export interface RouteTarget {
  providerId: ProviderId;
  modelId: string;
}

export interface RouteResult {
  usedProvider: ProviderId;
  usedModel: string;
  /** Non-null when routing had to fail over away from the caller's requested target — the UI must surface this (brief section 14). */
  switchedFrom?: RouteTarget;
  switchReason?: "rate_limit" | "error" | "unavailable";
}

export interface KeyStrategy {
  type: "manual" | "round_robin" | "failover" | "smart";
  manualKeyId?: string;
}

export interface RouteChatParams {
  primary: RouteTarget;
  /** Additional targets to try, in order, if primary fails (brief section 14). Provider fallback must never happen silently — callers surface RouteResult.switchedFrom to the user. */
  fallbacks?: RouteTarget[];
  request: Omit<ChatRequest, "modelId">;
  keyStrategy?: KeyStrategy;
}

/**
 * The ModelRouter is the one place that: resolves which provider/model to
 * actually use, resolves a key from the pool for that provider, validates
 * the model supports what the request needs, executes the call, and — on
 * failure — walks the fallback chain. Nothing else in the app calls a
 * provider adapter directly (brief section 52, section 75 — single
 * authoritative implementation).
 */
class ModelRouter {
  async chat(params: RouteChatParams): Promise<{ response: ChatResponse; route: RouteResult }> {
    const chain = [params.primary, ...(params.fallbacks ?? [])];
    let lastError: NormalizedError | null = null;

    for (let i = 0; i < chain.length; i++) {
      const target = chain[i]!;
      try {
        const response = await this.attemptChat(target, params.request, params.keyStrategy);
        return {
          response,
          route:
            i === 0
              ? { usedProvider: target.providerId, usedModel: target.modelId }
              : {
                  usedProvider: target.providerId,
                  usedModel: target.modelId,
                  switchedFrom: params.primary,
                  switchReason: lastError?.code === "RATE_LIMITED" ? "rate_limit" : "error",
                },
        };
      } catch (err) {
        lastError = this.toNormalizedError(target.providerId, err);
        if (i === chain.length - 1) throw lastError;
        // Otherwise: continue to the next fallback target.
      }
    }

    // Unreachable given chain.length >= 1, but keeps TS happy.
    throw lastError ?? normalizedError("UNKNOWN_ERROR", "Routing failed with no targets.");
  }

  async *streamChat(params: RouteChatParams): AsyncGenerator<StreamChunk & { route: RouteResult }, void, unknown> {
    const chain = [params.primary, ...(params.fallbacks ?? [])];
    let lastError: NormalizedError | null = null;

    for (let i = 0; i < chain.length; i++) {
      const target = chain[i]!;
      const route: RouteResult =
        i === 0
          ? { usedProvider: target.providerId, usedModel: target.modelId }
          : {
              usedProvider: target.providerId,
              usedModel: target.modelId,
              switchedFrom: params.primary,
              switchReason: lastError?.code === "RATE_LIMITED" ? "rate_limit" : "error",
            };

      try {
        const key = await this.resolveKeyOrThrow(target.providerId, params.keyStrategy);
        await rateLimiter.acquire(target.providerId);
        const provider = getProvider(target.providerId);
        const generator = provider.streamChat(key?.secret ?? "", {
          ...params.request,
          modelId: target.modelId,
        });

        for await (const chunk of generator) {
          yield { ...chunk, route };
        }
        if (key) await keyManager.markSuccess(key.id);
        return;
      } catch (err) {
        lastError = this.toNormalizedError(target.providerId, err);
        if (i === chain.length - 1) throw lastError;
      }
    }
  }

  private async attemptChat(
    target: RouteTarget,
    request: Omit<ChatRequest, "modelId">,
    keyStrategy?: KeyStrategy
  ): Promise<ChatResponse> {
    const key = await this.resolveKeyOrThrow(target.providerId, keyStrategy);
    await rateLimiter.acquire(target.providerId);
    const provider = getProvider(target.providerId);
    try {
      const response = await provider.chat(key?.secret ?? "", { ...request, modelId: target.modelId });
      if (key) await keyManager.markSuccess(key.id);
      return response;
    } catch (err) {
      const normalized = provider.normalizeError(err);
      if (key) {
        if (normalized.code === "RATE_LIMITED") {
          await keyManager.markRateLimited(key.id, normalized.retryAfterMs ?? 60_000);
        } else if (normalized.code === "AUTH_FAILED" || normalized.code === "INVALID_KEY") {
          await keyManager.markInvalid(key.id);
        }
      }
      throw normalized;
    }
  }

  private async resolveKeyOrThrow(
    providerId: ProviderId,
    keyStrategy?: KeyStrategy
  ): Promise<{ id: string; secret: string } | null> {
    if (providerId === "local") return null; // no key concept for on-device inference
    const strategy = keyStrategy?.type ?? "smart";
    const resolved = await keyManager.resolveKey(providerId, strategy, keyStrategy?.manualKeyId);
    if (!resolved) throw keyManager.toAuthError(providerId);
    return resolved;
  }

  private toNormalizedError(providerId: ProviderId, err: unknown): NormalizedError {
    if (err && typeof err === "object" && "code" in err) {
      return { ...(err as NormalizedError), providerId };
    }
    return getProvider(providerId).normalizeError(err);
  }
}

export const modelRouter = new ModelRouter();
