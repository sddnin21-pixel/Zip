# Qusin AI

A unified multi-provider AI workspace for Android, built with React Native
+ Expo. Chat across four AI sources — **XKIRO**, **KiraAI**, **OpenRouter**,
and **Local** (on-device GGUF models) — in a single conversation, switching
providers mid-chat without losing context.

## Quick start

```bash
npm install
npx expo start        # dev server (Expo Go won't run llama.rn — see below)
npx expo run:android  # native build with the full local-model runtime
```

Local on-device inference (`llama.rn`) requires a native build — it does
not work in Expo Go. Everything else (remote providers, files, skills,
agent) works in Expo Go / `expo start`.

### Building an APK

For GitHub, the repository includes a complete Actions workflow at `.github/workflows/build-apk.yml`. It verifies TypeScript, ESLint, and Jest, generates the native Android project, builds a release APK, signs it for CI installation, verifies the signature, and uploads the APK as a workflow artifact.

In GitHub, open **Actions → Build Qusin AI APK → Run workflow**. After the job finishes, download the `qusin-ai-apk-*` artifact.

Local/EAS builds are also supported:

```bash
npx eas build --profile preview --platform android   # internal-distribution APK
npx eas build --profile production-apk --platform android
```

See `eas.json` and `.github/workflows/build-apk.yml` for the build profiles. The GitHub CI key is intentionally ephemeral unless `QUSIN_CI_KEYSTORE_PASSWORD` is supplied as a repository secret; use a persistent release keystore for production distribution.

### Running checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # jest — unit + integration suites
```

All three are verified clean/passing as of the last commit in this
codebase (0 TypeScript errors, 0 ESLint errors, 88/88 tests passing).

## What's here

- `app/` — Expo Router screens/navigation
- `src/core/` — provider-agnostic engine: conversation, context management,
  memory, model router, key manager, agent loop, file pipeline
- `src/providers/` — one adapter per AI source (`xkiro/`, `kiraai/`,
  `openrouter/`, `local/`), each translating to/from the shared
  `AIProvider` interface in `providers/shared/`
- `src/skills/` — the agent's tool registry: web search, file
  read/write/convert, image/video generation, slide/document generation,
  memory, calculator, restricted code execution
- `src/security/` — rate limiting, file/zip safety checks, input validation
- `src/ui/` — screens, components, theme
- `src/state/` — Zustand stores
- `__tests__/` — unit + integration test suites
- `docs/` — this file plus `ARCHITECTURE.md`, `PROVIDERS.md`,
  `LOCAL-MODELS.md`, `AGENTS.md`, `TOOLS.md`, `SECURITY.md`,
  `TESTING.md`, `DEPLOYMENT.md`

## Providers at a glance

| Provider | Type | Model discovery | Auth |
|---|---|---|---|
| XKIRO | Remote gateway | `GET /v1/models`, public, verified live (85 models at time of writing) | Bearer key, required for chat |
| KiraAI | Remote gateway (Vietnamese) | `GET /api/v1/models`, requires key | Bearer key |
| OpenRouter | Remote gateway | `GET /api/v1/models`, fully public | Bearer key, required for chat |
| Local | On-device | Hugging Face search (discovery only) → GGUF download → `llama.rn` | None |

Full details, verified endpoint behavior, and known limitations are in
`docs/PROVIDERS.md`.

## Design principles this codebase follows

1. **No fake model lists.** Every remote provider's model catalog comes
   from a real, verified API call — never a hard-coded array.
2. **No fake tool execution.** A skill that can't actually do something
   (an unverified endpoint, an unsupported file format, a missing sandbox)
   says so explicitly (`UNSUPPORTED`, `REQUIRES CONFIGURATION`,
   `NOT IMPLEMENTED`) rather than pretending.
3. **Context survives provider switches.** Qusin owns the conversation,
   memory, and files — not the provider. Switching from XKIRO to a local
   GGUF model mid-conversation re-packs the same conversation state into
   whatever context window the new model actually has.
4. **One authoritative implementation per responsibility.** No duplicate
   provider systems, no duplicate model pickers, no legacy code paths left
   behind after a refactor.
