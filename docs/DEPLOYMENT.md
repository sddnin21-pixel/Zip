# Deployment

## Prerequisites

- An Expo account and the EAS CLI (`npm install -g eas-cli`) for cloud
  builds, or a local Android SDK setup for `expo run:android`.
- No provider API keys are required at build time — users add their own
  XKIRO/KiraAI/OpenRouter keys in-app (Settings -> Keys), stored in
  `expo-secure-store` on-device. Nothing is compiled into the app binary.


## GitHub Actions APK build

The repository contains `.github/workflows/build-apk.yml`. A manual workflow run or a push to `main`/`master` will:

1. install the locked npm dependencies;
2. run TypeScript, ESLint, and Jest checks;
3. run Expo prebuild to generate the Android native project;
4. build `assembleRelease`;
5. zipalign and sign the APK for CI installation; and
6. upload `Qusin-AI-<run-number>.apk` as a GitHub Actions artifact.

The workflow uses Node 24, Java 17, Android API 35, Build Tools 35.0.0, and NDK 27.1.12297006. The CI signing key is generated at build time. Set the optional repository secret `QUSIN_CI_KEYSTORE_PASSWORD` to control the CI-only key password. This signing key is not intended for Play Store release/update continuity.

## Local development build

```bash
npm install
npx expo run:android
```

This produces a debug APK with the native `llama.rn` module linked, so
local on-device inference actually works. `expo start` (without
`run:android`) launches the Metro dev server for use with Expo Go, but
Expo Go does not include `llama.rn` — local models will report a clear
`LOCAL_MODEL_ERROR` there rather than crash.

## EAS builds

Three profiles in `eas.json`:

| Profile | Output | Distribution |
|---|---|---|
| `development` | Dev-client APK | Internal |
| `preview` | Release APK | Internal (for testing before a store release) |
| `production` | App Bundle (.aab) | For Play Store submission |
| `production-apk` | Release APK | Internal (a direct-install APK from a production build) |

```bash
eas build --profile preview --platform android
```

The original request was specifically for an APK to upload to GitHub —
`preview` or `production-apk` are the relevant profiles for that;
`production` produces a `.aab` bundle instead, which is what Play Store
submission expects but is not directly installable as an APK.

## Environment variables

None are required for the app to build or run — see brief section 74's
principle "do not require provider API keys to be compiled into the
application." If a future version adds a bundled SearXNG instance or
similar backend-service default, that would go through `app.config.js`'s
`extra` field or EAS's environment-variable support, documented here at
that point.

## Signing

Not yet configured in this repository — `eas build` will prompt to
generate/manage an Android keystore on first run if one isn't already
configured for the project. This is intentionally left to the developer
running the build rather than committed to the repo.

## Known gaps at deployment time

- The app has been verified via `tsc`, `eslint`, and `jest` (see
  TESTING.md) but has **not** been run on a physical device or emulator
  during this development session — the first `expo run:android` or EAS
  build is also the first real end-to-end run of the compiled native
  bundle, and may surface native-linking issues (particularly around
  `llama.rn`, which has platform-specific build requirements) that static
  analysis can't catch.
- `llama.rn`'s exact current npm version/API should be re-confirmed before
  a production build — it was verified to exist and have the general
  shape used in `local-provider.ts` during development, but its own
  release cadence is independent of this app's.
