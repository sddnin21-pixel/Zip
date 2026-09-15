# Tools (Skills)

All registered via `src/skills/index.ts` into the single
`skillRegistry` (`core/tools/skill-registry.ts`).

| Skill | Permissions | Status |
|---|---|---|
| `web-search` | NETWORK | Requires a configured SearXNG instance (`REQUIRES CONFIGURATION` if unset) |
| `web-open` | NETWORK | SSRF-guarded (blocks loopback/private ranges) |
| `web-extract` | READ | Pure text extraction from provided HTML |
| `file-read` | READ | Reads a previously-uploaded file's extracted text |
| `file-write` | WRITE | Writes text to a new local file |
| `file-upload` | READ, WRITE | Full pipeline: validate -> scan -> parse |
| `file-download` | READ | Returns a shareable local URI |
| `file-convert` | READ, WRITE | Text-level conversion only (no layout-preserving conversion) |
| `image-generate` | NETWORK, WRITE | Best-effort — see PROVIDERS.md |
| `video-generate` | NETWORK, WRITE | Best-effort — see PROVIDERS.md |
| `image-analyze` | NETWORK | Routes to a vision-capable model via ModelRouter |
| `slide-generate` | WRITE | Real .pptx via pptxgenjs, self-validated |
| `document-generate` | WRITE | Real docx/pdf/xlsx/csv/json/txt/md, each self-validated |
| `memory-search` | READ | Keyword-overlap search over stored memory |
| `memory-save` | WRITE | Adds a memory entry |
| `memory-update` | WRITE | Updates an existing memory entry |
| `calculator` | READ | Safe expression evaluator, no `eval` |
| `code-execution` | EXECUTE | Restricted — no-I/O JS expressions only, see below |

## Permission levels

`READ | WRITE | NETWORK | EXECUTE | SYSTEM`
(`core/tools/skill-types.ts`). `WRITE`, `EXECUTE`, and `SYSTEM` require
explicit user confirmation before the agent loop will run them
(`DANGEROUS_PERMISSIONS`).

## `code-execution`'s real scope

React Native has no OS-level sandbox (no container, no separate process).
Rather than fake a general code interpreter or run untrusted code with the
app's own privileges, this skill only evaluates side-effect-free JS
expressions (arithmetic, string/array/object manipulation) through a
pattern-blocklist plus an isolated `Function` construction with zero
closure access to app state. Anything else — imports, loops, network,
file access, any language besides this restricted JS subset — is reported
as `UNSUPPORTED` with a specific reason. Full rationale in the file's
header comment (`skills/code/code-execution-skill.ts`).

## Format support

See `core/files/format-registry.ts` for the authoritative
extension/MIME-type -> parseable mapping. Legacy binary `.doc`/`.ppt` are
explicitly `parseable: false` with a stated reason (convert to
docx/pptx first) rather than silently mishandled.

## Adding a new skill

1. Define input/output types and a JSON-schema `inputSchema`.
2. Call `skillRegistry.register({...})` with the right `permissions`.
3. Import the new module (for its registration side effect) from
   `src/skills/index.ts`.
4. If it needs external configuration (an API key, a service URL), make
   `isAvailable()` reflect that honestly rather than always returning
   `true`.
