/**
 * Normalized error codes every provider adapter must map into.
 * Brief section 39 — never surface a bare "Something went wrong."
 */
export type ErrorCode =
  | "INVALID_KEY"
  | "AUTH_FAILED"
  | "RATE_LIMITED"
  | "MODEL_NOT_FOUND"
  | "MODEL_UNAVAILABLE"
  | "CONTEXT_TOO_LARGE"
  | "CONTENT_POLICY"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "SERVER_ERROR"
  | "UNSUPPORTED_CAPABILITY"
  | "LOCAL_MODEL_ERROR"
  | "INSUFFICIENT_BALANCE"
  | "PLAN_REQUIRED"
  | "UNKNOWN_ERROR";

export interface NormalizedError {
  code: ErrorCode;
  message: string;
  /** Set for RATE_LIMITED when the provider tells us how long to back off. */
  retryAfterMs?: number;
  providerId?: string;
  /** Original error/response for debugging — never shown raw to the user, never logged with secrets inside it. */
  cause?: unknown;
  httpStatus?: number;
}

export function normalizedError(
  code: ErrorCode,
  message: string,
  extra?: Partial<NormalizedError>
): NormalizedError {
  return { code, message, ...extra };
}

/**
 * Shared HTTP-status -> ErrorCode mapping used by remote adapters as a
 * starting point. Adapters should override with provider-specific body
 * parsing where the API gives a more specific reason.
 */
export function errorCodeFromHttpStatus(status: number): ErrorCode {
  switch (status) {
    case 401:
      return "AUTH_FAILED";
    case 403:
      return "PLAN_REQUIRED";
    case 404:
      return "MODEL_NOT_FOUND";
    case 408:
      return "TIMEOUT";
    case 413:
      return "CONTEXT_TOO_LARGE";
    case 429:
      return "RATE_LIMITED";
    case 500:
    case 502:
    case 503:
    case 504:
      return "SERVER_ERROR";
    default:
      return "UNKNOWN_ERROR";
  }
}

/** Never let a raw error object (which may contain a key in a header echo) escape to logs. */
export function redactForLogging(error: NormalizedError): Omit<NormalizedError, "cause"> {
  const { cause: _cause, ...safe } = error;
  return safe;
}
