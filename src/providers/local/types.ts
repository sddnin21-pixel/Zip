/**
 * Local inference subsystem types.
 *
 * IMPORTANT PLATFORM NOTE (do not remove — this governs what the Local
 * provider is allowed to claim, per brief section 72 "NO FAKE FEATURES"):
 *
 * The brief's section 7 describes WebGPU / WASM / WebLLM / Transformers.js
 * as runtimes "for web/PWA". Qusin AI's chosen stack is React Native/Expo
 * targeting a native Android APK, not a browser — so none of those
 * browser-only runtimes exist in this build. There is no general-purpose
 * "run an arbitrary Hugging Face safetensors model" story on-device in
 * React Native without a native inference engine.
 *
 * What we actually ship for `local`:
 *  - GGUF-format models via llama.rn (a React Native binding to llama.cpp),
 *    which is a real, maintained native module capable of on-device GGUF
 *    inference on Android/iOS.
 *  - Hugging Face is used only as a *discovery* surface (search + metadata
 *    via the public HF API) to find GGUF repos/files; "download" means
 *    fetching the .gguf asset directly from huggingface.co's file CDN.
 *  - Any Hugging Face model that is not published in GGUF format is
 *    reported as `incompatible` with a clear reason — never silently
 *    hidden, never shown with a working "Run" button (brief section 9).
 *
 * If a future build target adds a WebView/PWA shell, a second local
 * runtime module (webgpu-runtime.ts) can implement the same
 * LocalRuntime interface using WebLLM — the rest of the app never needs
 * to know which runtime backs `local`.
 */

export type LocalRuntimeKind = "llama-rn-gguf" | "unsupported";

export interface HuggingFaceRepoSummary {
  id: string; // "org/repo"
  author?: string;
  downloads?: number;
  likes?: number;
  tags?: string[];
  pipeline_tag?: string;
  lastModified?: string;
}

export interface HuggingFaceFileInfo {
  path: string; // e.g. "model-Q4_K_M.gguf"
  sizeBytes?: number;
}

export interface GGUFQuantizationVariant {
  fileName: string;
  quantization: string; // e.g. "Q4_K_M", "Q8_0"
  sizeBytes?: number;
  downloadUrl: string;
}

export interface LocalModelCompatibility {
  compatible: boolean;
  runtime: LocalRuntimeKind;
  reason?: string;
  estimatedRamBytes?: number;
}

export interface LocalModelRecord {
  id: string; // "org/repo::quantization"
  repo: string;
  quantization: string;
  displayName: string;
  fileName: string;
  downloadUrl: string;
  fileSizeBytes?: number;
  localPath?: string;
  downloadedBytes: number;
  status:
    | "not_downloaded"
    | "downloading"
    | "paused"
    | "downloaded"
    | "verifying"
    | "loading"
    | "loaded"
    | "unloading"
    | "error"
    | "corrupted"
    | "incompatible";
  compatibility: LocalModelCompatibility;
  contextLength?: number;
  addedAt: number;
  error?: string;
}
