# Local Models

## What "Local" actually means in this app

The brief's section 7 describes WebGPU, WASM, WebLLM, and Transformers.js
as the local runtimes "for web/PWA." This app is a native React
Native/Expo Android build, not a browser — none of those runtimes exist
here. There is no general-purpose "run any Hugging Face model on-device"
capability without a real native inference engine.

What this app actually ships:

- **Discovery**: Hugging Face's public Hub API
  (`https://huggingface.co/api/models`) is used to search for and inspect
  repositories — this is read-only metadata, not inference.
- **Format**: only **GGUF**-format models are supported. GGUF is what
  `llama.cpp` (and therefore `llama.rn`) can load. A repository without
  `.gguf` files is reported as incompatible with a specific reason —
  never hidden, never shown with a working "Run" button (brief section 9).
- **Runtime**: `llama.rn` (github.com/mybigday/llama.rn), a maintained
  React Native binding to `llama.cpp`, does the actual on-device inference
  (`initLlama`, `LlamaContext.completion`).
- **Download**: `.gguf` files are fetched directly from Hugging Face's
  file CDN (`huggingface.co/<repo>/resolve/main/<file>`) via
  `expo-file-system`'s resumable-download API — real pause/resume/cancel,
  not simulated.

## Compatibility checking

`providers/local/compatibility.ts#checkGGUFCompatibility` runs before a
download is offered:

1. Rejects non-`.gguf` files outright.
2. Estimates RAM requirement as `fileSize x 1.2` (file size plus KV-cache
   overhead headroom) against a conservative floor. This is a heuristic
   shown to the user as guidance — Expo's managed workflow doesn't expose
   a reliable cross-platform "total device RAM" query without an
   additional native module, so we don't claim a hard verified yes/no
   we can't actually back up.
3. Flags anything estimating above ~12GB RAM as likely incompatible with
   typical mobile hardware.

## Verification after download

`LocalModelManager.verify()` checks the downloaded file exists, is
non-empty, and (when the HF API reported an expected size) is within 1% of
that size. It does **not** claim cryptographic checksum verification — GGUF
files don't universally ship a published hash via the HF API, and claiming
a check we can't perform would violate brief section 72.

## Lifecycle

Search → select a quantization variant → compatibility check → download
(with progress, pause/resume/cancel) → verify → the model becomes
selectable in the model picker (`status: "downloaded"`) → load (via
`llama.rn`'s `initLlama`, lazily on first use) → chat → unload → delete.
All of this is implemented in `providers/local/local-model-manager.ts`
(file lifecycle) and `providers/local/local-provider.ts` (the `AIProvider`
adapter, including the `LlamaContext` caching/release logic).

## What local models can't do (yet) in this app

- **Vision, tools, reasoning, image/audio generation**: all report `false`
  from the corresponding `LocalProvider` capability methods. Vision would
  require managing an `mmproj` projector file per model; tool-calling
  reliability depends entirely on the specific GGUF model's own chat
  template, which isn't verified per-model here.
- **Streaming is real**, bridged from `llama.rn`'s token-callback API into
  the same `AsyncGenerator<StreamChunk>` contract every other provider
  uses (see `local-provider.ts#streamChat`).

## Native-build requirement

`llama.rn` is a native module — local inference works in
`expo run:android` / an EAS build, but **not** in Expo Go or the web
preview. `local-provider.ts#getLlamaRn()` throws a clear
`LOCAL_MODEL_ERROR` explaining this if it's attempted somewhere the native
module isn't linked, rather than crashing opaquely.
