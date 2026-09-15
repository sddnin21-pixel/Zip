# Providers

Verified against live docs and, where noted, a live API call, during
development (2026-09-14). Provider APIs can change — if something here
stops matching reality, only the relevant adapter needs updating
(`src/providers/<name>/`), per the isolation principle in brief section 80.

## XKIRO

- Base URL: `https://api.xkiro.com/v1`
- Docs: `https://docs.xkiro.com`
- Compatible with both OpenAI (`/chat/completions`) and Anthropic
  (`/messages`) request shapes; this app uses the OpenAI-compatible shape
  for a single normalization path.
- `GET /v1/models` is **public — no API key required**. Verified live: this
  endpoint returned 85 real, currently-active models spanning several
  vendors (Anthropic, OpenAI, Google, Zhipu, Moonshot, xAI, DeepSeek,
  Alibaba, and others), each with `id`, `display_name`, `owned_by`,
  `modality`, `access_tier`, `pricing`, `capabilities` (vision/tools/
  reasoning), `context_length`, `max_output_tokens`, and for gated models
  `min_plan_usd`/`min_plan_names`.
- Chat completions require `Authorization: Bearer <key>`.
- Streaming via SSE, OpenAI-compatible chunk format.
- **Not verified**: a dedicated image/video generation endpoint's exact
  response shape. The catalog includes `modality: "image"` and
  `modality: "video"` entries confirming such models exist, but the docs
  pages read during development did not show a distinct
  `/v1/images/generations`-style endpoint. `image-generation-skill.ts` and
  `video-generation-skill.ts` submit through `/chat/completions`
  defensively and parse either an images-style or chat-style response —
  see those files' headers for the exact fallback logic and what happens
  if neither shape matches.

## KiraAI

- Base URL: `https://kiraai.vn/api/v1`
- Docs: `https://kiraai.vn/documents/` (a JavaScript-rendered single-page
  app; not indexed by general web search, so re-verifying details requires
  fetching it directly rather than searching for it)
- OpenAI-compatible chat completions.
- `GET /api/v1/models` **requires** `Authorization: Bearer <key>` — unlike
  XKIRO this is not public, so it could not be called live without an
  account key during development. `kiraai-provider.ts#listModels` throws a
  clear `AUTH_FAILED`-coded error (not a silent empty list) when no key is
  configured.
- The exact `/models` response envelope (bare array vs. `{ data: [...] }`
  wrapper) is not explicitly documented at the field level the way
  XKIRO's is — `kiraai/normalize.ts` accepts either shape defensively.
- Free-tier models use a `kira-` ID prefix per the docs' pricing page.
- Has TTS/image/video generation endpoints per the docs, but exact request/
  response schemas for those were not fully retained from the one page
  read during development — anything in this app referencing KiraAI's
  media generation should be re-verified against `kiraai.vn/documents/`
  before being relied on in production.

## OpenRouter

- Base URL: `https://openrouter.ai/api/v1`
- Docs: `https://openrouter.ai/docs`
- `GET /api/v1/models` is fully public — confirmed via `curl` with no
  headers in OpenRouter's own documentation examples.
- `GET /api/v1/auth/key` with `Authorization: Bearer <key>` validates a
  key and returns its metadata — used as `validateCredentials()`.
- Pricing in the raw API is USD-per-token as decimal strings;
  `openrouter/normalize.ts` converts to USD-per-1M-tokens to match the
  unit XKIRO/KiraAI use elsewhere in the app.
- Capabilities (`vision`, `toolCalling`, `reasoning`, `structuredOutput`)
  are derived from `architecture.input_modalities` and
  `supported_parameters` on each model entry — never a hard-coded list.
- No standalone image/video-generation endpoint is documented; OpenRouter
  is treated as text-generation-only in this app
  (`supportsImageGeneration()` always returns `false`).

## Local

Not a remote API — see `docs/LOCAL-MODELS.md` for the full local-inference
story (discovery via Hugging Face, download, GGUF-only compatibility,
`llama.rn` runtime).

## Model discovery guarantee

Per brief sections 2 and 64: none of the four providers' model lists are
hard-coded. `listModels()` on each remote adapter makes a real network
call every time it's invoked; `core/models/catalog-cache.ts` caches the
result (in-memory + SQLite) with a 5-minute TTL and always reports whether
a given read is fresh or stale — it never presents cached data as
guaranteed-current.
