import * as FileSystem from "expo-file-system";
import * as Crypto from "expo-crypto";
import { lookupFormat } from "./format-registry";
import { checkFileSize, isExecutableFile } from "../../security/file-security";
import { sanitizeFileName } from "../../security/input-validation";
import { fileStore } from "./file-store";
import type { FileRecord } from "./file-types";
import { normalizedError, type NormalizedError } from "../../providers/shared/errors";

export interface UploadFileInput {
  localUri: string;
  fileName: string;
  mimeType?: string;
  conversationId?: string;
  projectId?: string;
  /** Whether this file is destined for a local-only model (never leaves the device) or a remote provider. Drives the section-38 "LOCAL / REMOTE" UI indicator. */
  destination: "local" | "remote";
}

export type UploadResult =
  | { ok: true; record: FileRecord; extractedText?: string; truncated: boolean }
  | { ok: false; error: NormalizedError };

/**
 * The pipeline from brief section 25. Each stage can reject the upload with
 * a clear reason — nothing here silently passes a file through that failed
 * a check.
 */
export async function uploadFile(input: UploadFileInput): Promise<UploadResult> {
  const fileName = sanitizeFileName(input.fileName);

  // 1. Validate existence
  const info = await FileSystem.getInfoAsync(input.localUri, { size: true });
  if (!info.exists) {
    return { ok: false, error: normalizedError("UNKNOWN_ERROR", "Selected file could not be found on disk.") };
  }

  // 2. Security: size + executable check
  const sizeCheck = checkFileSize(info.size ?? 0);
  if (!sizeCheck.safe) {
    return { ok: false, error: normalizedError("CONTEXT_TOO_LARGE", sizeCheck.reason!) };
  }
  if (isExecutableFile(fileName)) {
    return {
      ok: false,
      error: normalizedError(
        "UNSUPPORTED_CAPABILITY",
        `"${fileName}" looks like an executable file. Qusin AI never executes uploaded files automatically and does not accept this type.`
      ),
    };
  }

  // 3. Detect format / MIME
  const format = lookupFormat(fileName, input.mimeType);
  if (!format) {
    return {
      ok: false,
      error: normalizedError(
        "UNSUPPORTED_CAPABILITY",
        `Unsupported format: "${fileName}" has no recognized/supported extension. No conversion is available for this type.`
      ),
    };
  }
  if (!format.parseable) {
    return {
      ok: false,
      error: normalizedError(
        "UNSUPPORTED_CAPABILITY",
        `Unsupported format: ${format.notes ?? `.${fileName.split(".").pop()} is not currently parseable.`}`
      ),
    };
  }

  // 4. Parse (best-effort; a parse failure still lets the raw file attach,
  // it just won't have an extracted-text preview for the model to read).
  let extractedText: string | undefined;
  let truncated = false;
  try {
    const parsed = await parseByModule(format.parserModule!, input.localUri, input.mimeType ?? "");
    extractedText = parsed.text;
    truncated = parsed.truncated;
  } catch {
    // Parsing is best-effort — leave extractedText undefined rather than failing the whole upload.
  }

  const record: FileRecord = {
    id: Crypto.randomUUID(),
    conversationId: input.conversationId,
    projectId: input.projectId,
    fileName,
    mimeType: input.mimeType ?? "application/octet-stream",
    sizeBytes: info.size ?? 0,
    localUri: input.localUri,
    extractedTextPreview: extractedText?.slice(0, 2000),
    destination: input.destination,
    createdAt: Date.now(),
  };

  await fileStore.create(record);
  return { ok: true, record, extractedText, truncated };
}

async function parseByModule(
  moduleName: string,
  uri: string,
  mimeType: string
): Promise<{ text: string; truncated: boolean }> {
  switch (moduleName) {
    case "text-passthrough": {
      const text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
      return { text, truncated: false };
    }
    case "pdf-parser": {
      const { parsePdf } = await import("./parsers/pdf-parser");
      return parsePdf(uri);
    }
    case "docx-parser": {
      const { parseDocx } = await import("./parsers/docx-parser");
      return parseDocx(uri);
    }
    case "xlsx-parser": {
      const { parseXlsx } = await import("./parsers/xlsx-parser");
      return parseXlsx(uri, mimeType);
    }
    case "pptx-parser": {
      const { parsePptx } = await import("./parsers/pptx-parser");
      return parsePptx(uri);
    }
    case "zip-lister": {
      const { listZipEntriesAsText } = await import("./parsers/zip-lister");
      return listZipEntriesAsText(uri);
    }
    case "image-passthrough":
    case "media-metadata":
      // No text extraction — these are handled as binary attachments
      // (vision input for images; metadata display for audio/video).
      return { text: "", truncated: false };
    default:
      return { text: "", truncated: false };
  }
}
