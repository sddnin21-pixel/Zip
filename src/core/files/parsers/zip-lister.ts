import * as FileSystem from "expo-file-system";
import { checkZipSafety, type ZipEntrySummary } from "../../../security/file-security";

/**
 * Lists ZIP contents WITHOUT extracting anything to disk (brief section 25:
 * "ZIP files must not be blindly extracted"). Runs the decompression-bomb /
 * path-traversal checks from security/file-security.ts against the entry
 * list before returning, and reports the safety verdict in the summary text
 * so the UI/agent can see it without a second pass.
 */
export async function listZipEntriesAsText(localUri: string): Promise<{ text: string; truncated: boolean }> {
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(base64, { base64: true });

  const entries: ZipEntrySummary[] = Object.values(zip.files).map((f) => ({
    path: f.name,
    compressedSize: (f as unknown as { _data?: { compressedSize?: number } })._data?.compressedSize ?? 0,
    uncompressedSize: (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0,
  }));

  const safety = checkZipSafety(entries);

  const MAX_ENTRIES_SHOWN = 200;
  const shown = entries.slice(0, MAX_ENTRIES_SHOWN);
  const listing = shown.map((e) => `${e.path} (${e.uncompressedSize} bytes)`).join("\n");

  const header = safety.safe
    ? `Archive contains ${entries.length} entries. Not auto-extracted — use file-read on a specific entry if needed.\n`
    : `⚠️ Archive failed safety checks: ${safety.reason}\nListing entries only; extraction is blocked.\n`;

  return {
    text: header + listing,
    truncated: entries.length > MAX_ENTRIES_SHOWN,
  };
}
