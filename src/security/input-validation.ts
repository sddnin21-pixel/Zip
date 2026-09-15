/**
 * Centralized input validation helpers (brief section 36: "input
 * validation, output validation"). Used at trust boundaries: user text
 * before it's stored, tool arguments a model produced before they're
 * executed, and file names before they touch the filesystem.
 */

const MAX_MESSAGE_LENGTH = 100_000; // generous ceiling; context manager truncates for the model separately
const MAX_FILENAME_LENGTH = 255;

export function validateUserMessageText(text: string): { valid: boolean; reason?: string } {
  if (text.length === 0) return { valid: false, reason: "Message is empty." };
  if (text.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, reason: `Message exceeds the ${MAX_MESSAGE_LENGTH}-character limit.` };
  }
  return { valid: true };
}

/** Strips characters that are invalid across common filesystems and clamps length. Never allows a path separator through — prevents accidental/malicious path traversal via a "file name" field. */
export function sanitizeFileName(name: string): string {
  const withoutSeparators = name.replace(/[/\\]/g, "_");
  const withoutControlChars = withoutSeparators.replace(/[\u0000-\u001f]/g, "");
  // Trim whitespace AND leftover separator-replacement underscores from the
  // ends — an input that was entirely separators (e.g. "///") should fall
  // through to the "unnamed" default, not become a string of underscores.
  const trimmed = withoutControlChars.trim().replace(/^_+|_+$/g, "");
  return trimmed.slice(0, MAX_FILENAME_LENGTH) || "unnamed";
}

/**
 * Validates that a model-produced tool-call argument object is a plain,
 * JSON-serializable object before it's ever passed to a skill's execute().
 * This does not replace each skill's own inputSchema validation — it's a
 * first line of defense against a malformed/malicious tool_call payload
 * containing something unexpected (functions, circular refs, etc).
 */
export function validateToolArguments(args: unknown): { valid: boolean; reason?: string } {
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    return { valid: false, reason: "Tool arguments must be a JSON object." };
  }
  try {
    JSON.stringify(args);
  } catch {
    return { valid: false, reason: "Tool arguments are not JSON-serializable." };
  }
  return { valid: true };
}

/** Basic SSRF-lite guard: rejects obviously-local/loopback/link-local targets for any URL a skill is about to fetch on the model's behalf (web-open, image/video download URLs from a provider response, etc). */
export function isSafeExternalUrl(url: string): { safe: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: "Not a valid URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { safe: false, reason: `Unsupported protocol "${parsed.protocol}" — only http/https are allowed.` };
  }
  const hostname = parsed.hostname.toLowerCase();
  const blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];
  if (blockedHosts.includes(hostname)) {
    return { safe: false, reason: "Requests to loopback addresses are not allowed." };
  }
  if (/^10\.|^172\.(1[6-9]|2\d|3[0-1])\.|^192\.168\.|^169\.254\./.test(hostname)) {
    return { safe: false, reason: "Requests to private/link-local network ranges are not allowed." };
  }
  return { safe: true };
}
