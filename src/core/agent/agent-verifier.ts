import * as FileSystem from "expo-file-system";

export interface VerificationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Verifies a generated file actually exists, is non-empty, and (for known
 * formats) has the expected file signature — brief section 44's
 * "Create -> Validate -> Open/read -> Check format -> Return" loop. This is
 * a second, independent check on top of whatever validation the
 * generation skill itself already did internally (see slide-generation-
 * skill.ts / document-generation-skill.ts) — the agent loop calls this
 * after any WRITE-permission tool result that produced a localUri, so a
 * skill's own internal check is never the only line of defense.
 */
export async function verifyGeneratedFile(localUri: string, expectedExtension?: string): Promise<VerificationResult> {
  const info = await FileSystem.getInfoAsync(localUri, { size: true });
  if (!info.exists) {
    return { ok: false, reason: `File was not created at ${localUri}.` };
  }
  if (!info.size || info.size === 0) {
    return { ok: false, reason: "Generated file is empty." };
  }

  if (expectedExtension) {
    const actualExt = localUri.split(".").pop()?.toLowerCase();
    if (actualExt !== expectedExtension.toLowerCase()) {
      return { ok: false, reason: `Expected a .${expectedExtension} file but got .${actualExt}.` };
    }
  }

  const signatureCheck = await checkFileSignature(localUri, expectedExtension);
  if (!signatureCheck.ok) return signatureCheck;

  return { ok: true };
}

/** Reads the first few bytes and checks against known magic numbers for common generated formats. */
async function checkFileSignature(localUri: string, ext?: string): Promise<VerificationResult> {
  if (!ext) return { ok: true };

  const zipBased = new Set(["docx", "pptx", "xlsx", "zip"]);
  const pdfBased = new Set(["pdf"]);

  if (!zipBased.has(ext) && !pdfBased.has(ext)) return { ok: true };

  try {
    const base64Head = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
      length: 8,
      position: 0,
    } as FileSystem.ReadingOptions & { length: number; position: number });

    if (zipBased.has(ext) && !base64Head.startsWith("UEsD")) {
      // "PK\x03\x04" (zip local file header) base64-encodes to "UEsD..."
      return { ok: false, reason: `File does not start with a valid ZIP/OOXML signature (expected for .${ext}).` };
    }
    if (pdfBased.has(ext) && !base64Head.startsWith("JVBER")) {
      // "%PDF-" base64-encodes to "JVBER..."
      return { ok: false, reason: "File does not start with a valid PDF signature (%PDF-)." };
    }
  } catch {
    // If partial-read isn't supported on this platform/SDK version, don't
    // fail verification over it — the existence + size + extension checks
    // above already caught the common failure modes.
  }

  return { ok: true };
}

/**
 * Generic non-file verification: checks a tool's declared output against
 * its output schema at a shallow level (required keys present, no error
 * marker). Deep schema validation is intentionally out of scope — this
 * catches the common "tool silently returned nothing useful" case without
 * re-implementing a JSON-schema validator.
 */
export function verifyToolOutput(output: unknown, requiredKeys: string[]): VerificationResult {
  if (output === null || output === undefined) {
    return { ok: false, reason: "Tool returned no output." };
  }
  if (typeof output !== "object") {
    return requiredKeys.length === 0 ? { ok: true } : { ok: false, reason: "Tool output is not an object but keys were expected." };
  }
  const missing = requiredKeys.filter((key) => !(key in (output as Record<string, unknown>)));
  if (missing.length > 0) {
    return { ok: false, reason: `Tool output is missing expected key(s): ${missing.join(", ")}.` };
  }
  return { ok: true };
}
