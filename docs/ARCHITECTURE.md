# Architecture

## Layering

```
app/                    Expo Router screens (thin — delegate to src/ui)
src/ui/                 Screens, components, theme, Zustand-connected views
src/state/               Zustand stores (chat, models, conversations)
src/core/                Provider-agnostic engine
  conversation/           Conversation/message types, store, engine
  context/                Token estimation, context packing/truncation
  memory/                 Memory store (short-term/conversation/user/project/file/task)
  router/                 ModelRouter — the only thing that calls a provider adapter
  keys/                   KeyManager — SecureStore-backed key pool per provider
  models/                 AIModel type, catalog cache
  files/                  File pipeline, format registry, parsers
  agent/                  Agent loop, task store, verifier
  tools/                  Skill registry, permission types
src/providers/           One adapter per AI source + the shared interface
  shared/                  AIProvider interface, error taxonomy, HTTP helpers
  xkiro/ kiraai/ openrouter/ local/
src/skills/               Tool implementations (web search, files, image/video,
                           slides, documents, memory, calculator, code-exec)
src/security/             Rate limiter, file/zip safety, input validation
src/storage/               SQLite (expo-sqlite) — schema + settings store
```

## Data flow: sending a message

```
ChatScreen
  -> useChatStore.sendMessage()
    -> conversationEngine.sendMessage()
        1. persist the user message (conversationStore)
        2. record a ModelSwitchEvent if the target differs from the
           conversation's last-used provider/model
        3. contextManager.pack() -- build the actual request messages,
           bounded to the TARGET model's real context window, injecting
           relevant memory and the rolling summary if truncation is needed
        4. modelRouter.streamChat() -- resolve a key (keyManager), rate-limit
           (security/rate-limiter), call the provider adapter's streamChat(),
           walk the fallback chain on failure
        5. persist the assistant message
```

Nothing outside `ModelRouter` ever calls a provider adapter directly. This
is what keeps model switching correct: every message send re-resolves
provider/model/key freshly, so switching providers mid-conversation is just
a different `RouteTarget` passed into the same pipeline -- not a special
code path.

## Data flow: agent tool use

```
AgentLoop.run()
  -> builds a system+user message pair, calls modelRouter.chat() with
     skillRegistry.toToolDefinitions() as the tools list
  -> for each tool_call the model produces:
      - validate arguments (security/input-validation)
      - check skillRegistry.requiresConfirmation() -- WRITE/EXECUTE/SYSTEM
        permission skills require the caller to confirm before executing
      - skillRegistry.execute()
      - if the result has a localUri, independently re-verify the file
        (agent-verifier.ts -- real signature checks, not just "did write()
        not throw")
      - append a tool-role message with the (possibly verification-
        overridden) result and loop
  -> stops on: no more tool calls, maxSteps, maxToolCalls, timeoutMs, or
     maxTokenBudget -- whichever comes first
```

## Why React Native/Expo, and what that rules out

The brief's section 7 describes WebGPU/WASM/WebLLM/Transformers.js as local
runtimes "for web/PWA." This app targets a native Android APK, not a
browser, so none of those exist here. The real local-inference path is
`llama.rn` (a maintained React Native binding to llama.cpp) running
GGUF-format models downloaded from Hugging Face. See
`docs/LOCAL-MODELS.md` for the full explanation and what that means for
model compatibility.

Similarly, there is no OS-level sandbox available for a `code-execution`
skill on a mobile app the way a server-side agent runtime would have one.
`skills/code/code-execution-skill.ts` is deliberately scoped to a
restricted, no-I/O expression evaluator rather than faking a general
interpreter -- see that file's header comment for the full reasoning.

## Provider adapter contract

Every adapter in `src/providers/*/` implements `AIProvider`
(`src/providers/shared/provider-interface.ts`): `listModels`, `chat`,
`streamChat`, capability-detection methods, and `normalizeError`. Adapters
are the only place a provider's raw response shape is allowed to exist --
`normalize.ts` in each adapter folder maps it into the shared `AIModel`
type, and nothing downstream of that ever sees provider-specific fields.

## Verified vs. best-effort

Everything in `src/providers/xkiro/`, `src/providers/openrouter/`, and the
chat/model-list paths of `src/providers/kiraai/` was verified against live
documentation and/or a live API call during development (see
`docs/PROVIDERS.md`). The image/video generation skills
(`src/skills/image/image-generation-skill.ts`,
`src/skills/video/video-generation-skill.ts`) are marked best-effort in
their file headers -- they use the one confirmed-working request path
(chat/completions) defensively, and fail with a specific error rather than
returning a fabricated result if the account's actual response shape
differs.
