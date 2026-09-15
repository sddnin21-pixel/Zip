# Security — Qusin AI

Priority order per brief section 36: **Security > Convenience**.

## Secrets

- API keys are written ONLY to `expo-secure-store` (iOS Keychain / Android
  Keystore via `SecureStore.WHEN_UNLOCKED`), never to SQLite, never to
  plain JS state longer than necessary to make one request.
- SQLite (`providers_keys` table) stores only a masked preview
  (`sk-or-...a91f`) and metadata (status, cooldown, timestamps) — never the
  secret itself.
- `KeyManager.revealSecret()` is the only path that returns a plaintext key,
  and it is called only (a) immediately before an outbound request, and (b)
  when the user explicitly taps "reveal" in the UI.
- Keys are never included in `QusinMessage` content, never sent to a model
  as part of a prompt, and `redactForLogging()` in
  `providers/shared/errors.ts` strips the `cause` field (which may echo
  response bodies) before any error is logged.

## Network

- `security/rate-limiter.ts` — a token-bucket limiter per provider ID, applied
  in `ModelRouter` before every outbound chat/stream call. Protects against
  a runaway agent loop or retry bug hammering a provider.
- `security/input-validation.ts#isSafeExternalUrl` — blocks `web-open` /
  `web-extract` from fetching loopback (`127.0.0.1`, `localhost`) or private
  network ranges (`10.x`, `172.16-31.x`, `192.168.x`, `169.254.x`), a
  baseline SSRF guard for any URL a model asks Qusin to open.
- All provider adapters set explicit timeouts (`providers/shared/http.ts`)
  and support `AbortSignal` cancellation end-to-end (chat, stream, agent
  loop, downloads).

## Tool / skill permissions (brief section 37)

- Every skill declares `permissions: PermissionLevel[]` from `READ | WRITE |
  NETWORK | EXECUTE | SYSTEM`.
- `DANGEROUS_PERMISSIONS` = `{ WRITE, EXECUTE, SYSTEM }` — any skill with one
  of these requires the caller (agent loop, or the UI directly) to pass
  `confirmed: true`, obtained from an explicit user confirmation. The agent
  loop's `onConfirmationNeeded` callback is the single integration point for
  this — nothing bypasses it.
- `code-execution` (EXECUTE) never runs full code: see
  `skills/code/code-execution-skill.ts` for why React Native has no real
  OS-level sandbox and how the restricted-expression evaluator is scoped
  (no I/O, no closures over app state, pattern-blocklist + isolated
  `Function` construction as defense in depth).

## File handling (brief section 25/36)

- `security/file-security.ts`: max upload size (100MB), zip entry-count cap,
  zip decompression-bomb ratio check, path-traversal check
  (`isPathTraversalSafe`), executable-extension rejection.
- ZIP files are never auto-extracted — `zip-lister` only lists entries and
  reports the safety verdict; nothing is written to disk from inside an
  archive.
- `security/input-validation.ts#sanitizeFileName` strips path separators and
  control characters from every incoming file name before it touches the
  filesystem or a database row.
- Generated files (docx/pptx/xlsx/pdf) are independently re-verified after
  creation — both by the generating skill itself and again by
  `core/agent/agent-verifier.ts` when produced via the agent loop — checking
  real file signatures (ZIP local-file-header magic bytes for OOXML
  formats, `%PDF-` for PDF), not just "did the write call not throw."

## Local privacy (brief section 38)

- `FileRecord.destination` is `"local" | "remote"`, set explicitly by the
  caller based on which provider is active when the file is attached. The
  UI is expected to surface this (LOCAL badge vs REMOTE badge) — files
  attached while a local GGUF model is selected are marked `"local"` and
  are never included in a request built for a remote provider by the
  context manager.
- Local model inference (`providers/local`) never makes a network call
  during generation — only during model *discovery/download* (Hugging Face
  API + file CDN).

## Input/output validation

- `security/input-validation.ts#validateToolArguments` runs on every
  tool-call argument object before a skill executes, rejecting anything
  that isn't a plain JSON-serializable object.
- `security/input-validation.ts#validateUserMessageText` bounds message
  length before storage.

## Known limitations (declared, not hidden — brief section 72/79)

- `code-execution` is a restricted expression evaluator, not a general
  interpreter — by design, not as an oversight.
- The on-device RAM check in `providers/local/compatibility.ts` is an
  estimate (file size × 1.2) against a conservative floor, not a live
  device-RAM query — Expo's managed workflow doesn't expose that without an
  additional native module.
- `image-generate` / `video-generate` are marked best-effort pending full
  verification of XKIRO's dedicated media-generation response schema (see
  the file-level comments in those skills).
