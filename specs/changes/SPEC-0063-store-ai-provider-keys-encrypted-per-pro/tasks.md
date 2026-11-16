# Tasks — SPEC-0063: Store AI provider keys encrypted per provider

> **Stage 3 of 3 — the executable plan.** The implement stage works top to bottom and ticks each
> box only when its `verify:` check passes. Keep tasks small (one focused change, about one
> red→green cycle) and in dependency order:
>
> 1. Contracts (oms-contracts) and regeneration
> 2. Migration (new Liquibase changelog)
> 3. Behaviour, one task per AC or slice: write the failing test, implement, make it green
> 4. Wiring: API, messaging, configuration
> 5. Observability (logs, metrics)
> 6. Knowledge base and docs
> 7. Full verification (`spec verify`)
>
> Format, which the gate parses:
>
> ```
> - [ ] **T-1** Imperative summary (AC-1, AC-2)
>   - files: path/one.java, path/two.yaml
>   - verify: `./gradlew test --tests 'org.example.oms…SomeTest'` passes
> ```
>
> Every AC must be covered by at least one task, and every task needs a `verify:` line. Tasks may
> be added during implementation; record why under Notes.

## Tasks

- [x] **T-1** Add shared types (`AiProviderId`, `AiKeySource`, `AiKeyStatus`, `AiKeySetResult`) and the `ai.keys` IPC typing (AC-3)
  - files: developer-cockpit/src/shared/types/ai.ts, developer-cockpit/src/shared/types/ipc.ts, developer-cockpit/src/main/preload.ts
  - verify: `cd developer-cockpit && npm run typecheck` passes
- [x] **T-2** Write the failing `KeyStore.test.ts` (encrypted at rest, per-provider independence, clear, refusal when encryption is unavailable, undecryptable entry), then implement `src/main/ai/KeyStore.ts` with the `KeyCrypto` seam and `electronKeyCrypto` (AC-1, AC-2, AC-6, AC-8)
  - files: developer-cockpit/test/main/KeyStore.test.ts, developer-cockpit/src/main/ai/KeyStore.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/KeyStore.test.ts` passes
- [x] **T-3** Write the failing `aiKeyResolution.test.ts`, then implement `src/main/ai/keys.ts` (`resolveApiKey`, `isValidEnvVarName`, `CONVENTIONAL_ENV_VAR`, `NO_SAVED_KEYS`) and route `forConfig`, `notConfiguredReason`, `isConfigured`, `aiAvailable` and `SdkAdapter` through it (AC-2, AC-5, AC-6)
  - files: developer-cockpit/test/main/aiKeyResolution.test.ts, developer-cockpit/src/main/ai/keys.ts, developer-cockpit/src/main/ai/adapters.ts, developer-cockpit/src/main/ai/AiService.ts, developer-cockpit/src/main/storyboards/ai/AiAdapter.ts, developer-cockpit/src/main/storyboards/StoryboardAiService.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/aiKeyResolution.test.ts test/main/aiAdapters.test.ts test/main/AiService.test.ts test/main/StoryboardAiService.test.ts` passes
- [x] **T-4** Write the failing `keyMigration.test.ts`, then implement `src/main/ai/keyMigration.ts` (`migrateAiKeys`) (AC-7, AC-8)
  - files: developer-cockpit/test/main/keyMigration.test.ts, developer-cockpit/src/main/ai/keyMigration.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/keyMigration.test.ts` passes
- [x] **T-5** Extend `ConfigService.test.ts` (key migration runs before the save), then add the `migrateKeys` hook to `ConfigService.load` (AC-7)
  - files: developer-cockpit/test/main/ConfigService.test.ts, developer-cockpit/src/main/services/ConfigService.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/ConfigService.test.ts` passes
- [x] **T-6** Write the failing `aiKeys.ipc.test.ts` (no key in any IPC result, `config:save` keeps keys, invalid variable name rejected, set refused when encryption is unavailable), then implement `src/main/ipc/aiKeys.ipc.ts` and the `config.ipc.ts` changes (AC-3, AC-4, AC-8, AC-9)
  - files: developer-cockpit/test/main/aiKeys.ipc.test.ts, developer-cockpit/src/main/ipc/aiKeys.ipc.ts, developer-cockpit/src/main/ipc/config.ipc.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/aiKeys.ipc.test.ts` passes
- [x] **T-7** Wire it: create the `KeyStore` in `initServices()`, pass the `migrateKeys` hook to `load`, and pass `keys` to `registerAiIpc`, `registerStoryboardsIpc` and `registerAiKeysIpc` (AC-2, AC-5, AC-7)
  - files: developer-cockpit/src/main/index.ts, developer-cockpit/src/main/ipc/ai.ipc.ts, developer-cockpit/src/main/ipc/storyboards.ipc.ts
  - verify: `cd developer-cockpit && npm run typecheck` passes and `npx vitest run test/main/ai.ipc.test.ts test/main/kbChat.ipc.test.ts` passes
- [x] **T-8** Write the failing `SettingsAiKeys.test.tsx`, then implement the "API keys" block, the `stores/aiKeys.ts` hook and the env-var-name validation in `SettingsView.tsx`, removing the old local-only key field (AC-3, AC-6, AC-8, AC-9)
  - files: developer-cockpit/test/renderer/SettingsAiKeys.test.tsx, developer-cockpit/src/renderer/stores/aiKeys.ts, developer-cockpit/src/renderer/views/settings/SettingsView.tsx
  - verify: `cd developer-cockpit && npx vitest run test/renderer/SettingsAiKeys.test.tsx` passes
- [x] **T-9** Update the knowledge base: an "AI provider keys" section in `tools/developer-cockpit.md`
  - files: oms-knowledge-base/tools/developer-cockpit.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports no errors
- [x] **T-10** Run the full module checks and spec verify (all ACs)
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0063` exits 0
- [x] **T-11** No cross-provider env fallback: a provider never reads another provider's conventional variable (`local` never reads `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`, and so on), and the migration resets the name to `''` for `local`. Also prove the resolved key reaches the provider client (AC-2, AC-5)
  - files: developer-cockpit/src/main/ai/keys.ts, developer-cockpit/src/main/ai/keyMigration.ts, developer-cockpit/test/main/aiKeyResolution.test.ts, developer-cockpit/test/main/keyMigration.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/aiKeyResolution.test.ts test/main/keyMigration.test.ts` passes
- [x] **T-12** Key store fails safe: an unreadable or corrupt `ai-keys.json` (other than missing) is never overwritten, and `set`/`clear` refuse with `storage-failed`; write errors are caught, so `set`/`clear` never throw (AC-2, AC-8)
  - files: developer-cockpit/src/main/ai/KeyStore.ts, developer-cockpit/src/shared/types/ai.ts, developer-cockpit/test/main/KeyStore.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/KeyStore.test.ts` passes
- [x] **T-13** Migration never loses a key: when `set` fails, the plain-text value stays in config.json (for both `ai.apiKey` and a pasted key); the collision check uses a decryptable saved key, not just a present entry; add the `openai` and `local` pasted-key cases (AC-7, AC-8)
  - files: developer-cockpit/src/main/ai/keyMigration.ts, developer-cockpit/test/main/keyMigration.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/keyMigration.test.ts` passes
- [x] **T-14** A pasted key in `apiKeyEnvVar` never crosses to the renderer: redact an invalid name in `config:load`, `ai:keys:status` and `notConfiguredReason` (AC-3)
  - files: developer-cockpit/src/main/ipc/config.ipc.ts, developer-cockpit/src/main/ipc/aiKeys.ipc.ts, developer-cockpit/src/main/ai/AiService.ts, developer-cockpit/test/main/aiKeys.ipc.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/aiKeys.ipc.test.ts` passes
- [x] **T-15** The renderer's key store catches IPC rejections and shows them as the row's error (AC-8)
  - files: developer-cockpit/src/renderer/stores/aiKeys.ts, developer-cockpit/test/renderer/SettingsAiKeys.test.tsx
  - verify: `cd developer-cockpit && npx vitest run test/renderer/SettingsAiKeys.test.tsx` passes
- [x] **T-16** Re-run the full module checks and spec verify after the review fixes
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0063` exits 0
- [x] **T-17** A redacted pasted key survives settings saves: `config:save` keeps the current invalid `apiKeyEnvVar` when the renderer sends back `''`; and `notConfiguredReason` says when the named variable belongs to another provider (AC-4, AC-8, AC-5)
  - files: developer-cockpit/src/main/ipc/config.ipc.ts, developer-cockpit/src/main/ai/AiService.ts, developer-cockpit/test/main/aiKeys.ipc.test.ts, developer-cockpit/test/main/aiKeyResolution.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/aiKeys.ipc.test.ts test/main/aiKeyResolution.test.ts` passes, then `node specs/tools/spec.mjs verify SPEC-0063` exits 0

## Notes

- **T-17 was added after the delta re-review.** The T-14 redaction made the renderer send `''` back
  on every save, and that overwrote a pasted key the migration had deliberately kept (AC-8). The
  task also fixes a misleading not-configured reason.

- **Tasks T-11 to T-16 were added after the independent review in verify** (implement reopened)
  to fix review findings 1–8:
  - T-11: finding 1, plus the weak AC-2 evidence;
  - T-12: findings 2 and 5;
  - T-13: findings 3, 6 and 8;
  - T-14: finding 4;
  - T-15: finding 7.
