# Proposal — SPEC-0063: Store AI provider keys encrypted per provider

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The goal asks for a key setting in the developer cockpit that does not rely on an environment
variable, because environment variables are easily read by an agent. It also asks for one key per
provider.

How it works today (`developer-cockpit`):
- **Anthropic and OpenAI need an environment variable.** Their key comes from the variable named in
  Settings → AI → "API Key Environment Variable" (`src/main/ai/adapters.ts:17`). Any agent or tool
  running in the same shell can read that variable.
- **The only key field shows only for the `local` provider** (`SettingsView.tsx:209`). Yet the key
  saved there is used for *every* provider, because it takes precedence over the environment
  variable.
  - So a vLLM key saved under `local` is silently sent to Anthropic after switching providers.
  - There is no key field for Anthropic or OpenAI.
- **The saved key is plain text** in `~/.developer-cockpit/config.json`, which any agent can read.
  This session showed it: reading the config to diagnose a settings problem exposed the keys.
- **The key reaches the window.** `config:load` sends the whole config, key included, to the
  renderer (`src/main/ipc/config.ipc.ts:7`). The Settings hint that the key "is never sent to the
  renderer" is therefore false.
- **Easy to mistype.** The "API Key Environment Variable" field accepts any text. A key pasted into
  it is stored in plain text as a variable *name*, and nothing warns about it. This also happened in
  this session.
- **The storyboard assists ignore saved keys.** They decide availability from the environment
  variable alone (`src/main/storyboards/ai/AiAdapter.ts:22`).

If nothing changes, the only key option is either an environment variable or a plain-text file,
and agents can read both. A key exposed that way has to be revoked, as happened today.

Related: `oms-knowledge-base/tools/developer-cockpit.md`, SPEC-0042 (the AI provider stack),
SPEC-0062 (the KB chat that uses it).

## What Changes

- **A saved key per provider.** Settings → AI gets one key per provider (`anthropic`, `openai`,
  `local`), available for every provider, not only `local`. A run uses the key of the provider it
  runs with.
- **Encrypted at rest.** Keys are encrypted with Electron `safeStorage` (Windows DPAPI under the
  user's login) and stored outside `config.json`. No file in the cockpit's config directory contains
  a key in plain text.
- **Write-only from the window.** The renderer can set or clear a provider's key and can learn
  whether one is saved, and where the key in use comes from. It never receives a key value.
  `config:load` no longer contains one.
- **Settings saves keep keys.** Saving other settings never changes or removes a saved key.
- **Clear precedence.** A saved key wins, and the environment variable is only a fallback. The AI
  status says which source is in use, and the storyboard assists follow the same rules.
- **Migration.** On first start, a plain-text key in `config.json` is encrypted, stored for the
  configured provider, and removed from `config.json`. So is a key pasted into the env-var-name
  field.
- **The env-var-name field only accepts variable names.** A value that isn't a valid name (such as
  a pasted key) is rejected.
- **Encryption unavailable.** If OS encryption is unavailable, a key cannot be saved, and the user
  is told why. Nothing is written in plain text.
- No breaking change for users who rely on the environment variable. It keeps working as the
  fallback.

## Scope

### In scope

- An encrypted key store per provider in the main process, with IPC to set, clear and get status.
- Removing the key from the config that crosses to the renderer, and keeping it out of
  `config.json`.
- Settings → AI: a key field per provider (write-only, showing "saved" with Replace and Clear),
  validation of the env-var-name field, and corrected help text.
- Key resolution for the assistant, KB chat and storyboard assists: saved key first, environment
  variable second.
- One-time migration of the plain-text key and of a key misplaced in the env-var-name field.
- Updating `oms-knowledge-base/tools/developer-cockpit.md`.

### Out of scope

- Protection against code that runs as the same Windows user and calls DPAPI itself. `safeStorage`
  protects against reading files and the environment, not against a process that decrypts on
  purpose. A separate credential process or hardware-backed store is a later ticket if it is ever
  needed.
- Keys for MCP servers or other services. This ticket covers AI provider keys only.
- Per-endpoint keys for `local`. There is one `local` key, used with the configured base URL.
- Rotating or validating a key against the provider when it is saved.
- Removing the environment-variable fallback.
- Changes to oms-mcp-server or any `oms-*` module.

## Acceptance Criteria

- **AC-1** — Given encryption is available, when the user saves a key for a provider in Settings,
  then the key is stored encrypted, so that it reads back only through `safeStorage` decryption. No
  file in the cockpit's config directory contains the key's plain text.
- **AC-2** — Given saved keys for `anthropic` and `local`, when a run starts with each provider in
  turn, then each run uses its own provider's key, and saving or clearing one provider's key leaves
  the other's unchanged.
- **AC-3** — Given a saved key, when the renderer loads the config or asks for key status, then no
  IPC result contains the key. The status answers only whether a key is saved for each provider and
  which source (`saved`, `env` or `none`) the active provider uses.
- **AC-4** — Given a saved key, when the renderer saves the settings (any `config:save`, including a
  config object that still carries an `apiKey` field), then the saved key is unchanged, and
  `config.json` contains no key afterwards.
- **AC-5** — Given a provider with a saved key and a set environment variable, when a run starts,
  then the saved key is used. The environment variable is used only when no key is saved, and with
  neither the provider is "not configured", with a reason naming both options. The storyboard
  assists' availability check gives the same answer.
- **AC-6** — Given a saved key, when the user clears it, then it is removed from the store, and the
  provider falls back to the environment variable (source `env`) or becomes not configured (source
  `none`).
- **AC-7** — Given a `config.json` holding a plain-text `ai.apiKey`, an `ai.apiKeyEnvVar` that is not
  a valid environment-variable name, or both, when the cockpit starts, then:
  - `ai.apiKey` is stored encrypted as the **`local`** key, because Settings only ever offered that
    field for the `local` provider;
  - an invalid `apiKeyEnvVar` value (a pasted key) is stored encrypted as the **configured
    provider's** key, and `apiKeyEnvVar` is reset to that provider's conventional name
    (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`);
  - a migrated value never overwrites a key already saved for that provider. Such a value, or a
    pasted key while the configured provider is `local` and `ai.apiKey` also exists, is discarded,
    with a logged warning that names the provider but not the value;
  - both plain-text values are removed from `config.json`;
  - running the migration again changes nothing.
- **AC-8** — Given encryption is not available, when the user tries to save a key, then the save is
  refused with a message saying OS encryption is unavailable, and nothing is written. On startup, a
  plain-text key is left where it is, with a logged warning, rather than lost.
- **AC-9** — Given Settings → AI, when the user enters a value that is not a valid environment
  variable name (`[A-Za-z_][A-Za-z0-9_]*`) in the env-var-name field, then the field shows an error,
  and that value is not saved.

## Impact

| Area | Impact |
|---|---|
| Modules | developer-cockpit, plus docs in oms-knowledge-base |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | No database. Cockpit local files: a new encrypted key store in `~/.developer-cockpit/`, and `ai.apiKey` removed from `config.json` by a one-time migration that keeps the key (re-encrypted), so nothing is lost |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | none outside the cockpit. Inside it, the assistant, KB chat and storyboard assists resolve keys through the new store |
| Knowledge base | `tools/developer-cockpit.md`: a section on AI keys (per provider, encrypted, precedence, migration, threat model) |

## Open Questions

- [resolved] Where are the encrypted keys stored? → assumption: a separate file in the cockpit's
  config directory, holding only ciphertext per provider. It is kept out of `config.json`, so
  settings round-trips through the renderer cannot touch it (AC-4). Reversible.
- [resolved] One key for `local`, or one per base URL? → assumption: one `local` key (out of scope
  above). Easy to extend later.
- [resolved] What happens to a plain-text key when encryption is unavailable at migration? →
  assumption: it is left in place and a warning is logged (AC-8), because removing it would lose the
  user's key. On Windows, `safeStorage` is always available, so this is a fallback path.
- [resolved] Keep the environment variable as a fallback? → assumption: yes. It is what existing
  setups use, and the goal is to *not have to* rely on it, not to forbid it. The saved key wins
  (AC-5).
- [resolved] How is a key pasted into the env-var-name field handled? → assumption: migration
  treats any value that is not a valid variable name as a misplaced key (AC-7), and the field
  validates input from now on (AC-9).
- [resolved] Which provider does a migrated plain-text `ai.apiKey` belong to? → `local`. The
  Settings field that writes it has been shown only for the `local` provider since it was added
  (commit 98cc43d). Migrating it to the *configured* provider, as the first version of this
  proposal said, would have turned a vLLM key into an Anthropic key in the requester's own config
  (provider `anthropic`, `ai.apiKey` a 41-character non-Anthropic key).
- [resolved] What if a migrated value collides with a key already saved, or a pasted key competes
  with `ai.apiKey` for `local`? → the saved key, or `ai.apiKey`, wins, and the other value is
  discarded with a warning (AC-7). A discarded pasted key never worked as a key, since the runtime
  read it as a variable *name*. The requester is revoking the exposed key in any case.
- [resolved] How is the per-provider env-var name handled? → assumption: keep the single
  `apiKeyEnvVar` field as it is. Migration only resets it to the provider's conventional name when
  it held a non-name value. Per-provider env-var names are not needed for the goal.
