import { errorCodeFromHttpStatus, normalizedError, redactForLogging } from "../../../src/providers/shared/errors";

describe("errorCodeFromHttpStatus", () => {
  it("maps common HTTP statuses to the documented error codes", () => {
    expect(errorCodeFromHttpStatus(401)).toBe("AUTH_FAILED");
    expect(errorCodeFromHttpStatus(403)).toBe("PLAN_REQUIRED");
    expect(errorCodeFromHttpStatus(404)).toBe("MODEL_NOT_FOUND");
    expect(errorCodeFromHttpStatus(429)).toBe("RATE_LIMITED");
    expect(errorCodeFromHttpStatus(500)).toBe("SERVER_ERROR");
    expect(errorCodeFromHttpStatus(503)).toBe("SERVER_ERROR");
  });

  it("falls back to UNKNOWN_ERROR for unmapped statuses rather than guessing", () => {
    expect(errorCodeFromHttpStatus(418)).toBe("UNKNOWN_ERROR");
  });
});

describe("redactForLogging", () => {
  it("strips the cause field so raw response bodies never reach logs", () => {
    const err = normalizedError("AUTH_FAILED", "Invalid key", { cause: { headers: { authorization: "Bearer sk-secret123" } } });
    const redacted = redactForLogging(err);
    expect(redacted).not.toHaveProperty("cause");
    expect(JSON.stringify(redacted)).not.toContain("sk-secret123");
  });

  it("preserves the non-sensitive fields", () => {
    const err = normalizedError("RATE_LIMITED", "Too many requests", { retryAfterMs: 5000, httpStatus: 429 });
    const redacted = redactForLogging(err);
    expect(redacted.code).toBe("RATE_LIMITED");
    expect(redacted.retryAfterMs).toBe(5000);
    expect(redacted.httpStatus).toBe(429);
  });
});
