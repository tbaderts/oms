# Tasks — SPEC-0042: Add AI agentic capabilities via Vercel AI SDK

## Tasks

> One focused change per task, ~one red→green cycle, test-first where a behaviour is involved.
> Every `verify:` is a command (or objective observation). ACs traced in parentheses.
> All commands run from the `developer-cockpit/` directory unless stated. `branchPerTicket` is off
> in `specs/config.json`, so no branch is created.

- [x] **T-1** Add the AI dependencies and the shared AI types (AC-1, AC-8, AC-9)
  - files: `package.json`, `src/shared/types/ai.ts` (new), `src/shared/types/events.ts`
  - deps: `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible`, `zod`
  - `src/shared/types/ai.ts` defines: the `AiEvent` union
    (`ai:message`, `ai:tool-call`, `ai:tool-result`, `ai:done`, `ai:error`) each carrying `runId`,
    the `AiUsageEntry` shape `{ timestamp, provider, model, feature, inputTokens, outputTokens }`,
    `AiRunOptions { maxSteps }`, `AiStatus { available, provider, model, reason? }`, and `zod`
    schemas for a tool input/output (e.g. `kbSearchInput`, `toolResult`) used as the boundary types.
  - `events.ts`: add the five `ai:*` members to `EventType`.
  - verify: `npm install` exits 0; `npm run typecheck` passes with the new `ai.ts` and the widened `EventType`.

- [x] **T-2** Extend `AiConfig` with `baseUrl?` and `mcpServers?` (AC-1, AC-3, AC-9)
  - files: `src/shared/types/config.ts`
  - add `baseUrl?: string` (local/OpenAI-compatible endpoint) and `mcpServers?: { name: string; url: string }[]`
    to `AiConfig`; keep all existing fields; `DEFAULT_CONFIG.ai` gains `mcpServers: []` and no `baseUrl`
    (backward-compatible; a saved config without them merges fine through `ConfigService.merge`).
  - verify: `npm run typecheck` passes; `npm test` (existing `test/main/ConfigService.test.ts`) still green.

- [x] **T-3** Write the `ai/adapters.ts` factory tests, then implement the provider factory (AC-1, AC-2, AC-3)
  - files: `test/main/aiAdapters.test.ts` (new), `src/main/ai/adapters.ts` (new)
  - `adapters.forConfig(config, env): LanguageModel | null` — `anthropic` → `createAnthropic({apiKey}).model(model)`;
    `openai` → `createOpenAI({apiKey}).chatModels[model]`; `local` → `createOpenAICompatible({baseURL: config.baseUrl}).model(model)`.
    Returns `null` when the key (anthropic/openai) or `baseUrl` (local) is missing — this is the AC-3 gate.
  - **Test first**: `test/main/aiAdapters.test.ts` asserts (a) each provider maps to the right model
    object shape for a configured key/URL, and (b) a missing key / missing `baseUrl` returns `null`.
    These do not hit the network (they only build the provider object); they import the real `@ai-sdk/*` factories.
  - implement until green.
  - verify: `npx vitest run test/main/aiAdapters.test.ts` passes.

- [x] **T-4** Write `AiUsageTracker` tests, then implement (AC-7)
  - files: `test/main/AiUsageTracker.test.ts` (new), `src/main/ai/AiUsageTracker.test.ts`'s impl `src/main/ai/AiUsageTracker.ts` (new)
  - `AiUsageTracker(configDir)`: `record(entry: AiUsageEntry)` appends to `<configDir>/ai-usage.json`
    (atomic temp+rename, capped 1000 FIFO, unreadable file reads empty); `summary()` returns
    `{ entries, totalInput, totalOutput }`.
  - **Test first**: with a temp `configDir`, record two fixed entries → file has both, `summary()` totals match;
    a pre-seeded 1001-entry file truncates to 1000; a corrupt file is treated as empty (no throw).
  - verify: `npx vitest run test/main/AiUsageTracker.test.ts` passes.

- [x] **T-5** Write `McpToolRegistry` tests, then implement (AC-4, AC-8)
  - files: `test/main/McpToolRegistry.test.ts` (new), `src/main/ai/McpToolRegistry.ts` (new)
  - `McpToolRegistry`: `build(kb: KbService, mcpServers: {name,url}[]): tools[]` — always adds a local
    `search_knowledge_base` tool (input `{ query }`, output `KbSearchResult[]`, executed against
    `kb.search`); for each configured MCP server, uses the `ai` package's MCP client to convert its tools
    into `ai`-SDK `tool()` objects. Returns `[]`-plus-KB when no servers are configured; a server that fails
    to connect is skipped (logged), not fatal.
  - **Test first**: with a fixture `KbService`, `build()` returns a tool named `search_knowledge_base` whose
    `execute({query})` returns the fixture KB results; with a stub in-process MCP server, one of its tools appears
    and is callable; a bad MCP URL is skipped without throwing.
  - verify: `npx vitest run test/main/McpToolRegistry.test.ts` passes.

- [x] **T-6** Write `AiService` core tests (one-shot + not-configured), then implement `complete()` (AC-1, AC-2, AC-3, AC-9)
  - files: `test/main/AiService.test.ts` (new), `src/main/ai/AiService.ts` (new)
  - `AiService { constructor(config, env, deps: { tools?, broadcast, usage, model? }) }`.
    `complete({ prompt, runId })`: resolves `model = model ?? adapters.forConfig(config, env)`; if `null`
    → `broadcast(ai:error{ runId, reason: config })` and return (no model call); else `generateText({ model,
    system, messages, abortSignal })`, stream `text-delta` → `broadcast(ai:message{ runId, delta })`, on
    `finish` → `usage.record(...)` + `broadcast(ai:done{ runId, aborted:false, incomplete:false })`.
  - **Test first**: (a) AC-1 — a mocked model streaming two deltas → events are `ai:message`,`ai:message`,`ai:done`
    with no `ai:*` before the first `ai:message`; (b) AC-3 — `env` with empty key → `ai:error` config reason and the
    injected model is never called; (c) AC-2 — `openai` and `local` configs resolve through `adapters.forConfig`
    to the right model and `complete()` reaches `ai:done`.
  - `deps.model` is an injectable seam: tests pass a fake `LanguageModel`; production passes `adapters.forConfig`.
  - verify: `npx vitest run test/main/AiService.test.ts` passes (the three cases above).

- [x] **T-7** Implement `AiService.runAgent()` — the multi-step tool loop (AC-4, AC-5, AC-6, AC-8)
  - files: `src/main/ai/AiService.ts` (extend), `test/main/AiService.test.ts` (extend)
  - `runAgent({ prompt, runId, maxSteps })`: `generateText({ model, system, messages, tools: deps.tools,
    maxSteps, abortSignal })`; iterate `result.fullStream` and broadcast `ai:tool-call` / `ai:tool-result`
    (summarized) / `ai:message`; keep `abortRegistry.set(runId, AbortController)`; on completion `ai:done{
    aborted: signal.aborted, incomplete: (steps reached === maxSteps) }`; `stop(runId)` aborts.
  - **Test first (extend `AiService.test.ts`)**:
    - AC-4 — a scripted model that calls `search_knowledge_base` → events `ai:tool-call`(name+input), `ai:tool-result`,
      final `ai:message` containing the stub KB content, then `ai:done`.
    - AC-5 — mid-run `stop(runId)` → no events after abort, terminal `ai:done{aborted:true}`.
    - AC-6 — a model that always calls a tool, `maxSteps:3` → exactly 3 tool calls then `ai:done{incomplete:true}`,
      no 4th call.
    - AC-8 — a tool whose output fails its `zod` schema → `ai:error`/safe fallback, broadcast payload always schema-valid.
  - verify: `npx vitest run test/main/AiService.test.ts` passes (all cases).

- [x] **T-8** Add the `ai` IPC module and wire it in `index.ts` + `preload.ts` (AC-1, AC-3, AC-4, AC-5)
  - files: `src/main/ai/ai.ipc.ts` (new), `src/shared/types/ipc.ts`, `src/main/preload.ts`, `src/main/index.ts`
  - `registerAiIpc(ipcMain, configService, kbService, usageTracker, broadcast)`: handlers
    `ai:available` → `AiStatus` (provider configured?); `ai:run` → build `AiService` from current config,
    start `runAgent`/`complete` keyed by `runId`, return immediately (events flow over WS); `ai:stop` →
    `aiService.stop(runId)`; `ai:usage` → `usageTracker.summary()`. Non-throwing (returns `{ ok:false, code,
    message }` on bad input), mirroring `storyboards.ipc.ts`.
  - `index.ts`: instantiate the KB-backed registry + `AiUsageTracker(configService.getConfigDir())`, call
    `registerAiIpc` with the `wsServer.broadcast` callback (sibling of the existing registrations).
  - `ipc.ts`/`preload.ts`: add the `ai: { available, run, stop, usage }` namespace.
  - verify: `npm run typecheck` passes; `npm test` green (existing IPC tests unaffected); a new
    `test/main/ai.ipc.test.ts` asserts `ai:available` reflects config and `ai:stop` on an unknown `runId`
    is a no-op, not a throw.
  - verify: `npx vitest run test/main/ai.ipc.test.ts` passes.

- [x] **T-9** Build the AI Assistant view (renderer) (AC-1, AC-4, AC-5, AC-9)
  - files: `src/renderer/views/assistant/AssistantView.tsx` (new), nav/App wiring, a small Zustand store
    `src/renderer/stores/assistant.ts` (new)
  - The view: a prompt input + Send; a transcript list that appends as `ai:*` events for the current
    `runId` arrive over the WebSocket (filter by `runId`); a Stop button (enabled while running) that calls
    `window.cockpit.ai.stop(runId)`; the final answer rendered as Markdown via the existing `MarkdownContent`;
    tool calls rendered as collapsed, labeled steps. No `window.cockpit` AI call may ever receive or display
    an API key.
  - **Test first**: `test/renderer/AssistantView.test.tsx` (jsdom) — submitting a prompt calls
    `window.cockpit.ai.run` with a `runId`; feeding the store a scripted sequence of `ai:message`/`ai:tool-call`/
    `ai:tool-result`/`ai:done` events renders them in order; clicking Stop calls `window.cockpit.ai.stop` with
    the same `runId`.
  - verify: `npx vitest run test/renderer/AssistantView.test.tsx` passes; `npm run typecheck` passes.

- [x] **T-10** Re-route the storyboard `AnthropicAdapter` onto the new provider stack (D5; keeps AC-9)
  - files: `src/main/storyboards/ai/AiAdapter.ts` (refactor), `src/main/storyboards/StoryboardAiService.ts`,
    `test/main/StoryboardAiService.test.ts` (update the two assertions that named the old adapter)
  - Make the storyboard's `anthropic` one-shot path use `adapters.forConfig` (via `AiService.complete()` or a
    thin `AiAdapter` backed by it) so there is **one provider stack**; extend `aiAvailable` to recognize
    `openai`/`local` (key or `baseUrl`). **Preserve** the `AiAdapter` interface, the `StoryboardAiService`
    parsing / `bounded()` / non-throwing contract, and the no-`fs` rule.
  - **Update** `test/main/StoryboardAiService.test.ts`: the `aiAvailable` case now expects `openai` (key) and
    `local` (baseUrl) to be available; the "posts one request" assertion is re-pointed at the new adapter but
    still asserts one provider call for a one-shot and no `fs` import.
  - verify: `npx vitest run test/main/StoryboardAiService.test.ts` passes (all existing behaviours preserved).

- [x] **T-11** Add the Settings AI-usage summary and confirm the CSP is unchanged (AC-7, AC-9)
  - files: `src/renderer/views/settings/SettingsView.tsx` (extend), `test/renderer/SettingsView.test.tsx` (extend or new)
  - Settings shows an "AI usage" block (total tokens in/out, entry count) from `window.cockpit.ai.usage()`.
  - **Confirm** `src/renderer/index.html` CSP is byte-for-byte unchanged by this ticket (the AI events use the
    existing WS origin; no new `connect-src`/`script-src` needed) — add a small test or rely on the diff being empty.
  - **Test first**: feeding the settings store a usage summary renders the totals.
  - verify: `npx vitest run test/renderer/SettingsView.test.tsx` passes; `git diff --unified=0 src/renderer/index.html` is empty.

- [x] **T-12** Update the cockpit spec docs for the delivered vs. deferred scope (P-19; AC-9)
  - files: `developer-cockpit/spec/10-implementation-guide.md`, `developer-cockpit/spec/09-tech-stack-options.md`,
    `developer-cockpit/spec/07-ai-integration.md`
  - `10-implementation-guide.md`: tick the AI items this ticket delivers (provider abstraction, assistant,
    streaming, usage); `09-tech-stack-options.md`: AI row → Vercel AI SDK + MCP (note it supersedes the
    `@anthropic-ai/sdk`/`openai` naming); `07-ai-integration.md`: add a short "Delivered by SPEC-0042 vs. deferred
    (Investigator, per-view single-turn buttons, CLI sessions)" note.
  - verify: the three files contain the stated updates (objective text check); `npm run typecheck` unaffected.

- [x] **T-13** Run the full module verification and the spec gate
  - files: (no code)
  - Run the developer-cockpit verify commands, then the ticket verification.
  - verify: `cd developer-cockpit && npm run typecheck && npm test && npm run build` all exit 0
    (the one `checkStoryboards` failure is pre-existing on a clean checkout);
    `node specs/tools/spec.mjs verify SPEC-0042` exits 0.
