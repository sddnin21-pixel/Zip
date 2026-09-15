import { errorCodeFromHttpStatus, normalizedError, type NormalizedError } from "./errors";

export interface FetchJsonOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Never blocking-timeout past what the provider itself allows — XKIRO
 * documents 95s for non-streaming calls; we cut slightly earlier so we can
 * surface a clean TIMEOUT instead of the provider killing the socket.
 */
export async function fetchJson<T>(
  url: string,
  opts: FetchJsonOptions = {}
): Promise<{ ok: true; data: T; status: number } | { ok: false; error: NormalizedError }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  // Chain caller-provided abort (e.g. user hit "stop generating") with our timeout abort.
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const text = await res.text();
    let parsed: unknown = undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      // Non-JSON body (e.g. raw audio, or an HTML error page from a proxy).
    }

    if (!res.ok) {
      const retryAfterHeader = res.headers.get("retry-after");
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
      const bodyMessage =
        (parsed && typeof parsed === "object" && parsed !== null && "error" in parsed
          ? extractErrorMessage((parsed as Record<string, unknown>).error)
          : undefined) ?? `HTTP ${res.status}`;
      return {
        ok: false,
        error: normalizedError(errorCodeFromHttpStatus(res.status), bodyMessage, {
          httpStatus: res.status,
          retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : undefined,
          cause: parsed,
        }),
      };
    }

    return { ok: true, data: parsed as T, status: res.status };
  } catch (err) {
    clearTimeout(timeout);
    if (controller.signal.aborted && opts.signal?.aborted) {
      return { ok: false, error: normalizedError("UNKNOWN_ERROR", "Request cancelled by user", { cause: err }) };
    }
    if (controller.signal.aborted) {
      return { ok: false, error: normalizedError("TIMEOUT", "Request timed out", { cause: err }) };
    }
    return {
      ok: false,
      error: normalizedError("NETWORK_ERROR", err instanceof Error ? err.message : "Network error", {
        cause: err,
      }),
    };
  }
}

function extractErrorMessage(err: unknown): string | undefined {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as Record<string, unknown>).message;
    return typeof m === "string" ? m : undefined;
  }
  return undefined;
}

/**
 * Parse an SSE (server-sent events) response body into a stream of JSON
 * chunks, the format both XKIRO/KiraAI (OpenAI-style `data: {...}`) and
 * OpenRouter use for `stream: true`.
 */
export async function* parseSSEStream(
  response: Response
): AsyncGenerator<Record<string, unknown>, void, unknown> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;
        if (!payload) continue;
        try {
          yield JSON.parse(payload);
        } catch {
          // Skip malformed chunk rather than crashing the whole stream.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
