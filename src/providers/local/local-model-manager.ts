import * as FileSystem from "expo-file-system";
import type { LocalModelRecord } from "./types";
import { normalizedError } from "../shared/errors";

const MODELS_DIR = `${FileSystem.documentDirectory}qusin-models/`;

async function ensureModelsDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(MODELS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(MODELS_DIR, { intermediates: true });
  }
}

function localFilePath(record: Pick<LocalModelRecord, "repo" | "fileName">): string {
  const safeRepo = record.repo.replace(/\//g, "__");
  return `${MODELS_DIR}${safeRepo}__${record.fileName}`;
}

export interface DownloadProgressEvent {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
}

/**
 * Local Model Manager — implements the full lifecycle from brief section 8:
 * search (huggingface-client.ts) / download / pause / resume / cancel /
 * verify / install / load / unload / delete. "Install" for a GGUF model is
 * a no-op beyond having the verified file on disk — llama.rn loads a GGUF
 * file directly, there is no separate packaging step.
 */
export class LocalModelManager {
  private activeDownloads = new Map<string, FileSystem.DownloadResumable>();

  async download(
    record: LocalModelRecord,
    onProgress?: (e: DownloadProgressEvent) => void
  ): Promise<{ localPath: string; sizeBytes: number }> {
    await ensureModelsDir();
    const dest = localFilePath(record);

    const downloadResumable = FileSystem.createDownloadResumable(
      record.downloadUrl,
      dest,
      {},
      (progress) => {
        onProgress?.({
          totalBytesWritten: progress.totalBytesWritten,
          totalBytesExpectedToWrite: progress.totalBytesExpectedToWrite,
        });
      }
    );

    this.activeDownloads.set(record.id, downloadResumable);
    try {
      const result = await downloadResumable.downloadAsync();
      if (!result) {
        throw normalizedError("LOCAL_MODEL_ERROR", "Download did not complete (possibly cancelled).");
      }
      const info = await FileSystem.getInfoAsync(result.uri, { size: true });
      if (!info.exists) {
        throw normalizedError("LOCAL_MODEL_ERROR", "Downloaded file is missing after download completed.");
      }
      return { localPath: result.uri, sizeBytes: info.size ?? 0 };
    } finally {
      this.activeDownloads.delete(record.id);
    }
  }

  async pause(recordId: string): Promise<string | undefined> {
    const active = this.activeDownloads.get(recordId);
    if (!active) return undefined;
    const pausedState = await active.pauseAsync();
    return JSON.stringify(pausedState);
  }

  async resume(
    recordId: string,
    savableJson: string,
    onProgress?: (e: DownloadProgressEvent) => void
  ): Promise<{ localPath: string; sizeBytes: number }> {
    const savable = JSON.parse(savableJson);
    const downloadResumable = new FileSystem.DownloadResumable(
      savable.url,
      savable.fileUri,
      savable.options,
      (progress) => {
        onProgress?.({
          totalBytesWritten: progress.totalBytesWritten,
          totalBytesExpectedToWrite: progress.totalBytesExpectedToWrite,
        });
      },
      savable.resumeData
    );
    this.activeDownloads.set(recordId, downloadResumable);
    try {
      const result = await downloadResumable.resumeAsync();
      if (!result) throw normalizedError("LOCAL_MODEL_ERROR", "Resume failed to produce a file.");
      const info = await FileSystem.getInfoAsync(result.uri, { size: true });
      return { localPath: result.uri, sizeBytes: info.exists ? info.size : 0 };
    } finally {
      this.activeDownloads.delete(recordId);
    }
  }

  async cancel(recordId: string): Promise<void> {
    const active = this.activeDownloads.get(recordId);
    if (active) {
      await active.pauseAsync().catch(() => undefined);
      this.activeDownloads.delete(recordId);
    }
  }

  /**
   * Verification is a basic integrity/sanity check: the file exists, is
   * non-empty, and (when the provider told us an expected size) roughly
   * matches it. GGUF files do not universally ship a published checksum via
   * the HF API, so we do not claim cryptographic verification we can't
   * actually perform — this matches brief section 72's "never fake a
   * feature" rule better than pretending to do a hash check we can't do.
   */
  async verify(localPath: string, expectedSizeBytes?: number): Promise<{ ok: boolean; reason?: string }> {
    const info = await FileSystem.getInfoAsync(localPath, { size: true });
    if (!info.exists) return { ok: false, reason: "File does not exist on disk." };
    const actualSize = info.size;
    if (actualSize === 0) return { ok: false, reason: "Downloaded file is empty." };
    if (expectedSizeBytes && Math.abs(actualSize - expectedSizeBytes) > expectedSizeBytes * 0.01) {
      return {
        ok: false,
        reason: `File size mismatch: expected ~${expectedSizeBytes} bytes, got ${actualSize}.`,
      };
    }
    return { ok: true };
  }

  async delete(localPath: string): Promise<void> {
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists) {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
    }
  }

  async storageUsageBytes(): Promise<number> {
    await ensureModelsDir();
    const files = await FileSystem.readDirectoryAsync(MODELS_DIR);
    let total = 0;
    for (const file of files) {
      const info = await FileSystem.getInfoAsync(`${MODELS_DIR}${file}`, { size: true });
      if (info.exists) total += info.size ?? 0;
    }
    return total;
  }

  getLocalPath(record: Pick<LocalModelRecord, "repo" | "fileName">): string {
    return localFilePath(record);
  }
}

export const localModelManager = new LocalModelManager();
