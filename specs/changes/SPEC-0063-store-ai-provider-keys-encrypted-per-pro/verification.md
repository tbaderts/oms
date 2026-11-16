# Verification — SPEC-0063: Store AI provider keys encrypted per provider

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests below ran and passed in the latest `spec verify` (`evidence/developer-cockpit-2.log`,
2026-11-15T17:43Z). Per-file results:
- `KeyStore.test.ts` 10/10
- `aiKeyResolution.test.ts` 9/9
- `keyMigration.test.ts` 13/13
- `ConfigService.test.ts` 13/13
- `aiKeys.ipc.test.ts` 9/9
- `SettingsAiKeys.test.tsx` 6/6

The regression files `AiService`, `ai.ipc`, `kbChat.ipc`, `aiAdapters` and `StoryboardAiService`
are all green. None of the ticket's tests is skipped. The suite's 2 skips are pre-existing
storyboard symlink tests.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Key stored encrypted; no plain text in any file in the config dir | `KeyStore.test.ts#stores keys encrypted, never in plain text (AC-1)` scans every file for the key and decrypts the stored ciphertext back. **Real OS check:** `KeyStore` with Electron's real `safeStorage` on this Windows machine. Encryption is available, set returns `ok`, the key round-trips, a fresh instance reads it, `ai-keys.json` does **not** contain the plain text, and clear works. Script and output: session scratchpad `keystore-dpapi-check.cjs` / `.out`, dummy key and a temp directory | PASS |
| AC-2 | Each run uses its own provider's key; setting or clearing one leaves the others | `KeyStore.test.ts#keys are independent per provider (AC-2)`. `aiKeyResolution.test.ts#each provider resolves its own saved key (AC-2)`, `#a legacy plain-text ai.apiKey is used only for local…`. `#the resolved key is the one the provider client sends (AC-2)` asserts the real AI SDK client headers: Anthropic `x-api-key`, OpenAI and Local `Bearer`. `#a provider never reads another provider's conventional variable` | PASS |
| AC-3 | No IPC result contains a key; status gives only saved flags and the active source | `aiKeys.ipc.test.ts#no IPC result contains a key (AC-3)` (set, status, `config:load`, clear; with a saved key *and* a plain-text leftover; exact status shape) and `#a pasted key left in the variable-name field never crosses to the renderer`. `SettingsAiKeys.test.tsx#key inputs are write-only (AC-3)` | PASS |
| AC-4 | `config:save` (even with an `apiKey` field) never changes a saved key; `config.json` has no key | `aiKeys.ipc.test.ts#config:save never changes saved keys (AC-4)`, `#config:save keeps a leftover key the renderer cannot see, and cannot remove it (AC-4, AC-8)` and `#a kept pasted key survives a settings round trip from the renderer` | PASS |
| AC-5 | Saved wins over env; env is the fallback; neither means not configured, with a reason naming both; storyboards agree | `aiKeyResolution.test.ts#saved key wins over env, env is the fallback, none is not configured (AC-5)` (covers `resolveApiKey`, `forConfig`, `isConfigured`, `aiAvailable` and `notConfiguredReason`) and `#an invalid variable name is never used as a lookup` | PASS |
| AC-6 | Clear removes the key; falls back to `env` or `none` | `KeyStore.test.ts#clear removes the key (AC-6)`. `aiKeyResolution.test.ts#after clear the source is env or none (AC-6)`. `aiKeys.ipc.test.ts#status reports the env fallback and none`. `SettingsAiKeys.test.tsx#save and clear call the key channels (AC-6)` | PASS |
| AC-7 | Migration: `ai.apiKey` → local, pasted key → configured provider, no overwrite, discards logged without values, plain text removed, idempotent | `keyMigration.test.ts` (13 tests): local attribution, configured-provider attribution for anthropic, openai and local, the requester's own config shape (both values), no overwrite with no values in logs, pasted key loses to `ai.apiKey` for local, a failed store keeps the value, a multi-line legacy value is kept, an undecryptable saved key doesn't block, idempotent, clean config unchanged. `ConfigService.test.ts#load runs the key migration before saving`, `#a key migration alone also saves` | PASS |
| AC-8 | No OS encryption → save refused with a clear message, nothing written; plain-text key left in place with a warning | `KeyStore.test.ts#refuses to save when encryption is unavailable (AC-8)`. `keyMigration.test.ts#leaves a plain-text key when encryption is unavailable (AC-8)`. `aiKeys.ipc.test.ts#set reports encryption-unavailable (AC-8)`. `SettingsAiKeys.test.tsx#shows a refusal message (AC-8)`. Linux `basic_text` counts as unavailable: `KeyStore.test.ts#electronKeyCrypto treats the Linux basic_text backend as unavailable` | PASS |
| AC-9 | An invalid env-var name shows an error and is not saved | `aiKeys.ipc.test.ts#config:save rejects an invalid variable name (AC-9)` (server-side; a valid name and empty are accepted). `SettingsAiKeys.test.tsx#flags an invalid variable name and blocks save (AC-9)` and `SettingsView Save … is disabled from any tab while the draft holds an invalid name` | PASS |

## Goal Assessment

Goal: *"I was looking for a key setting without relying on env variable, as env is easily
compromised when agent reads it. A key per provider is a good idea."*

- **A key setting without relying on an environment variable.** Met. Settings → AI → *API keys*
  saves a key per provider. The cockpit uses it without any environment variable, and the variable
  is now only an optional fallback.
- **Not easily read by an agent.**
  - Met for the threats in scope. Keys are encrypted with the OS account (DPAPI, checked on this
    machine), and the key file holds only ciphertext.
  - Neither `config.json` nor the environment carries a key, and the window can never read one
    back.
  - Today's two real exposures are closed. Reading `config.json` no longer reveals keys, and a key
    pasted into the variable-name field is refused, migrated or redacted.
- **A key per provider.** Met. Each provider has its own key, used only for that provider. The
  cross-provider leaks are closed too: the old local key was used for Anthropic, and a shared
  variable name could send the Anthropic key to a vLLM host.

**Stated limit** (proposal → out of scope, and the KB page): code that runs as the same Windows
user can deliberately ask DPAPI to decrypt `ai-keys.json`. This stops casual exposure, not a
determined local process. The requester was told this before the ticket was created.

**What the requester should do after updating:**
- Revoke the key exposed earlier in this session, if not done yet.
- Restart the cockpit. On first start, the migration moves the plain-text keys out of
  `config.json`: the old vLLM key becomes the Local key, the pasted Anthropic key becomes the
  Anthropic key, and the variable name is reset to `ANTHROPIC_API_KEY`.
- Then save the new Anthropic key in Settings → AI.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No OpenAPI or Avro. The diff is `developer-cockpit/` plus one KB page |
| P-02 | Specification before code, generated models only | N/A | No API or message models. The cockpit IPC types are hand-written (SPEC-0042 pattern) |
| P-03 | Never edit generated code | PASS | No generated files in the diff |
| P-04 | Contracts evolve compatibly | N/A | No OMS contracts. The cockpit IPC is additive (`ai:keys:*`; `config:save` now returns a result). `config:load` no longer carries `ai.apiKey`, and its only consumer (the old field) is removed |
| P-05 | Every state change is recorded in the event log | N/A | No order state |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database. The local config migration is one-time, idempotent, tested and does not lose keys (failures keep the plain value) |
| P-08 | Concurrency and idempotency are explicit | PASS | The migration is idempotent (tested). Key-file writes are atomic (temp file plus rename) and serialised in the single main process. An unreadable file is never overwritten |
| P-09 | Commands and queries stay separate | N/A | No OMS API |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No order state |
| P-11 | Layering and conventions | PASS | Main-process `ai/` (`KeyStore`, `keys`, `keyMigration`) and `ipc/aiKeys.ipc.ts`, shared types, and the renderer `stores/aiKeys.ts` and `views/settings/AiKeysSection.tsx`, following the existing `ai.ipc`, `AiUsageTracker` and `migrateConfig` patterns |
| P-12 | Jackson 3 only | N/A | TypeScript |
| P-13 | Errors and validation follow the framework specs | PASS | Every `ai:keys:*` channel and `config:save` answers with `{ok, code, message}`. `KeyStore` never throws: write and read failures become `storage-failed`, with a `[keys]` log. The renderer catches IPC rejections. Nothing is swallowed silently |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC maps to passing tests (table above). Tests were written first and seen red for each task, including the review fixes. The exception is the AC-2 header test, which passed first time because the behaviour was already correct |
| P-15 | Observability | PASS | `[keys]` log lines for migration, discards, store failures, unavailable encryption and decryption failures. None contains a key value (asserted in the KeyStore and migration tests). Metrics don't apply to the dev tool |
| P-16 | Security | PASS | This ticket implements P-16 for the cockpit. No secret is in code or config, and keys are encrypted at rest. No key crosses IPC or appears in logs or error messages (including pasted keys). Input is validated, and there are no cross-provider key leaks. The policy's "use environment variables" is deliberately relaxed to "an OS-encrypted store, environment as fallback", as the requester's goal asks and the proposal records. Residual same-user DPAPI risk is documented |
| P-17 | Simplicity and dependencies | PASS | No new dependency (`safeStorage` ships with `electron`; `package.json` unchanged). Decisions D1–D7 and the in-implementation and verification changes are recorded in design.md |
| P-18 | Modules build standalone | PASS | `npm run typecheck` and `npm test` in developer-cockpit pass (`evidence/last-run.json`). `okf-check` reports 0 errors and 0 warnings |
| P-19 | Documentation follows behaviour | PASS | `oms-knowledge-base/tools/developer-cockpit.md` has a new "AI provider keys" section: per provider, encrypted, write-only, precedence and the no-cross-provider rule, migration, failure behaviour, threat model |

## Independent Review

**First pass** (spec-reviewer): verdict **MET**, no blocking findings, AC-2 rated WEAK, and eight
findings. All were fixed in T-11 to T-15, each test-first:

1. **[major] The env fallback was shared across providers.** `local` could read
   `ANTHROPIC_API_KEY`, and the migration wrote that name for local. Fixed: a provider never reads
   another provider's conventional variable, and the migration resets the name to `''` for local.
2. **[major] An unguarded key-file write could throw during migration,** after which
   `ConfigService` fell back to defaults and the next save dropped the plain-text key. Fixed:
   `KeyStore.write` catches and returns `storage-failed`, and the migration keeps any value it
   could not store.
3. **[minor] A failed `set` discarded the key and still removed it from config.json.** Fixed: the
   value stays.
4. **[minor] A pasted key in `apiKeyEnvVar` reached the renderer and broadcasts** when encryption
   was unavailable. Fixed: redacted in `config:load`, the status channel and
   `notConfiguredReason`.
5. **[minor] An unreadable or corrupt key file read as empty,** and the next write dropped the
   other keys. Fixed: only a missing file is empty, and otherwise `set` / `clear` refuse.
6. **[minor] An undecryptable saved key blocked migrating a working plain-text key.** Fixed: the
   collision check uses `get`.
7. **[minor] Renderer key actions had unhandled rejections.** Fixed: caught and shown on the row.
8. **[minor] Missing openai and local pasted-key tests.** Added.

The weak AC-2 evidence is now proven by asserting the real AI SDK client headers.

**Found during implementation, outside the review:** the Settings validity callback didn't run
while the AI tab was closed, because Radix unmounts inactive tabs. Fixed: Settings checks the
draft directly.

**Second pass on the delta** (spec-reviewer):
- It re-ran the 6 ticket test files (58/58) and confirmed fixes 1–3 and 5–8, including the
  migration's `changed` logic, the `get`-based collision check, and the fail-safe store.
- It found **one major issue introduced by fix 4**: the window received the redacted `''` and sent
  it back on every save, even a theme toggle. That would have erased a pasted key the migration
  had deliberately kept (no OS encryption, or a failed store), which is the loss AC-8 forbids.
  - Fixed in T-17: `config:save` keeps the current invalid value when `''` comes back, mirroring
    how `ai.apiKey` is protected.
  - New test: `aiKeys.ipc.test.ts#a kept pasted key survives a settings round trip from the
    renderer`.
- It also noted a misleading reason when the named variable belongs to another provider. Fixed:
  `aiKeyResolution.test.ts#the not-configured reason says when the named variable belongs to
  another provider`.

No open findings remain.

## Automated Evidence

`evidence/last-run.json`: ran 2026-11-15T17:43:23Z, result **pass**, fingerprint `e4ae0a10ad5aba8e`.
- **Modules:** developer-cockpit, oms-knowledge-base.
- **Policy check** (changes since main, merge-base 199c36e3): PASS.
- **`npm run typecheck`** (developer-cockpit): exit 0, `evidence/developer-cockpit-1.log`.
- **`npm test`** (developer-cockpit): exit 0, 704 passed and 2 skipped (pre-existing),
  `evidence/developer-cockpit-2.log`.
- **`okf-check`**: 204 concepts, 0 errors, 0 warnings.
- **Manual check:** the real-`safeStorage` (DPAPI) round trip. See AC-1.

## Follow-ups

- **Per-provider environment-variable names.** The fallback is still one shared name.
  Cross-provider misuse is now blocked, but a separate name per provider (defaulting to the
  conventional one) would be clearer. This is deliberately out of scope per the proposal.
- **Stronger isolation.** A separate credential process or an OS-prompted unlock would protect
  against same-user processes that call DPAPI, if that threat ever matters. Out of scope.
- **Electron launch hygiene.** A cockpit started from a shell with `ELECTRON_RUN_AS_NODE=1` set
  (the VS Code extension host sets it) runs as plain Node and fails at startup. This was noticed
  while running the manual check and is unrelated to this ticket. A note in the cockpit README or
  the `dev` script would help.

## Verdict

Verdict: GOAL MET
