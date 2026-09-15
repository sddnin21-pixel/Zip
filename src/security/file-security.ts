/**
 * File security checks (brief section 25: "Prevent path traversal,
 * malicious archive extraction, oversized files, decompression bombs,
 * unsafe scripts" and section 36: "validate uploaded files").
 */

export const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_ZIP_ENTRY_COUNT = 2000;
export const MAX_ZIP_UNCOMPRESSED_BYTES = 500 * 1024 * 1024; // 500 MB decompressed ceiling

export interface SecurityCheckResult {
  safe: boolean;
  reason?: string;
}

export function checkFileSize(sizeBytes: number): SecurityCheckResult {
  if (sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    return {
      safe: false,
      reason: `File is ${(sizeBytes / 1e6).toFixed(1)} MB, which exceeds the ${MAX_UPLOAD_SIZE_BYTES / 1e6} MB upload limit.`,
    };
  }
  return { safe: true };
}

/** Rejects any zip entry path that would escape the extraction directory. */
export function isPathTraversalSafe(entryPath: string): boolean {
  if (entryPath.startsWith("/") || entryPath.startsWith("\\")) return false;
  const normalized = entryPath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  let depth = 0;
  for (const segment of segments) {
    if (segment === "..") {
      depth -= 1;
      if (depth < 0) return false;
    } else if (segment !== "." && segment !== "") {
      depth += 1;
    }
  }
  return true;
}

export interface ZipEntrySummary {
  path: string;
  compressedSize: number;
  uncompressedSize: number;
}

/**
 * Section 25 explicitly says ZIP files "must not be blindly extracted."
 * This checks a listed set of entries (from a zip-reading library, wired
 * in at the call site — kept separate here so this module has zero binary
 * parsing dependencies and stays trivially unit-testable) for bomb/traversal
 * risk before the UI ever offers to extract anything.
 */
export function checkZipSafety(entries: ZipEntrySummary[]): SecurityCheckResult {
  if (entries.length > MAX_ZIP_ENTRY_COUNT) {
    return { safe: false, reason: `Archive has ${entries.length} entries, exceeding the ${MAX_ZIP_ENTRY_COUNT} limit.` };
  }

  const totalUncompressed = entries.reduce((sum, e) => sum + e.uncompressedSize, 0);
  if (totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) {
    return {
      safe: false,
      reason: `Archive would decompress to ${(totalUncompressed / 1e6).toFixed(0)} MB, exceeding the ${MAX_ZIP_UNCOMPRESSED_BYTES / 1e6} MB limit (possible decompression bomb).`,
    };
  }

  for (const entry of entries) {
    if (!isPathTraversalSafe(entry.path)) {
      return { safe: false, reason: `Archive entry "${entry.path}" attempts to escape the extraction directory.` };
    }
    // A single entry with a suspiciously high compression ratio is a classic
    // zip-bomb signature even if the archive-wide total looks fine.
    if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > 1000) {
      return { safe: false, reason: `Archive entry "${entry.path}" has a suspicious compression ratio (possible decompression bomb).` };
    }
  }

  return { safe: true };
}

const EXECUTABLE_EXTENSIONS = new Set(["exe", "bat", "sh", "cmd", "msi", "apk", "dmg", "app", "scr", "com", "jar"]);

export function isExecutableFile(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return !!ext && EXECUTABLE_EXTENSIONS.has(ext);
}
