# Testing

## Status (verified, not just declared)

As of the last commit in this codebase:

```
npx tsc --noEmit    ->  0 errors
npx eslint .         ->  0 errors, 0 warnings
npx jest             ->  12/12 suites, 88/88 tests passing
```

These were actually run during development, not assumed. Several real bugs
were found and fixed this way — see `docs/ARCHITECTURE.md`'s "Verified vs.
best-effort" section for specifics (a doc-comment that prematurely closed
itself and cascaded ~50 fake TS errors, a `sanitizeFileName` edge case, a
context-manager summary-budget design gap, missing `expo-asset` transitive
dependency, wrong `pdfjs-dist` import path for the actually-installed
version).

## Structure

```
__tests__/
  unit/
    core/        Pure-logic modules: security checks, calculator,
                  format registry, skill registry, error normalization,
                  token estimator, local-model compatibility
    providers/    normalize.ts unit tests per provider — verifies
                  capability/pricing/id mapping without hitting the network
  integration/
    model-router-failover.test.ts   Mocked-provider failover chain
                                      (brief sections 14, 66, 71)
    context-switching.test.ts        Context packing across different
                                      target-model context windows
                                      (brief section 65's core scenario)
```

## What's covered vs. not

Covered by the current suite:
- Model normalization for XKIRO and OpenRouter (KiraAI's schema is
  partially unverified — see PROVIDERS.md — so its normalize tests would
  be testing an assumed shape rather than a confirmed one; not included
  for that reason rather than skipped by oversight)
- File/zip security checks (path traversal, decompression-bomb ratio,
  size limits, executable rejection)
- Input validation (SSRF guard, filename sanitization, tool-argument
  validation)
- Skill registry permission/confirmation gating
- The safe calculator expression evaluator
- Error code normalization
- ModelRouter's fallback chain behavior and its "never call a provider
  with no key available" guarantee (brief section 66)
- ContextManager's behavior packing a conversation for models with very
  different context windows, including the summary-injection path

Not yet covered (brief section 63 also calls for these; genuinely not
done, not silently skipped):
- UI component tests (React Testing Library) — `jest.config.js` excludes
  `src/ui/**` from coverage collection for this reason
- End-to-end tests (brief section 63's "UI tests": provider selection,
  chat, upload, settings flows through the actual rendered app)
- Live integration tests against the real XKIRO/OpenRouter APIs (the unit
  tests mock the network layer; nothing in this suite makes a real network
  call, so a provider API drifting from what's documented wouldn't be
  caught by `npm test` alone — only by the manual re-verification process
  described in PROVIDERS.md)
- KeyManager multi-key rotation/cooldown tests (brief section 66's
  scenario is covered at the ModelRouter level via mocks, but
  `key-manager.ts` itself — which touches `expo-secure-store` — isn't
  unit-tested directly, since SecureStore has no in-memory Jest mock
  wired up in this codebase yet)

## Running

```bash
npm test               # all suites
npm run test:watch     # watch mode
npm run test:coverage  # with coverage report
```
