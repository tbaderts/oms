# Design — SPEC-0042: Add AI agentic capabilities via Vercel AI SDK

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

**What exists today (developer-cockpit, Electron + React + TS):**

- `src/shared/types/config.ts` — `AiConfig { provider: 'anthropic'|'openai'|'local', model, apiKeyEnvVar, maxTokens, temperature }`. Defaults: `anthropic` / `claude-sonnet-4-6` / `ANTHROPIC_API_KEY`. No `baseUrl`, no `mcpServers` fields yet.
- `src/main/storyboards/ai/AiAdapter.ts` — the **only** AI client in the app today. `AiAdapter { complete({system,user,maxTokens}) → Promise<string> }` implemented by `AnthropicAdapter`, a single hand-rolled `fetch` to `https://api.anthropic.com/v1/messages`. **Single-turn, no tools, no streaming.** It is consumed only by `StoryboardAiService`.
- `src/main/storyboards/StoryboardAiService.ts` — `aiAvailable(config, env)` returns true only when `provider==='anthropic' && env[apiKeyEnvVar]`. The three assists (`draftProse`, `reviewExtensions`, `suggestLinks`) build a bounded prompt, call `adapter.complete`, and parse the reply (JSON / markdown). It has **no `fs` import** (enforced by a test).
- `src/main/services/KbService.ts` — `scan()` + Fuse-powered `search(query) → KbSearchResult[]` over the OKF bundle. Instantiated in `src/main/ipc/kb.ipc.ts` (`getKbService`), rebuilt on config change.
- `src/main/websocket/server.ts` — `WebSocketServer.broadcast(CockpitEvent)`, loopback-only (`127.0.0.1`). Event types in `src/shared/types/events.ts` (`EventType` union, `CockpitEvent<T>`).
- `src/main/index.ts` — wires `ConfigService`, `WebSocketServer`, and every `register*Ipc(ipcMain, …)`; services that need to push events take a `broadcast` callback. `src/main/preload.ts` exposes the typed `CockpitAPI` to the renderer via `contextBridge` (renderer is `sandbox: true`, no Node).
- **No `ai`/`@ai-sdk/*`/`zod` dependency exists** in `package.json`. No AI event types exist. No AI view exists.

**Closest existing example to follow:** `StoryboardAiService` + `AnthropicAdapter` + `storyboards.ipc.ts` is the reference pattern — a service that owns an `AiAdapter`, an `aiAvailable` guard, and IPC handlers that never throw to the renderer (they return `{ ok:false, code, message }`). The new `AiService` and the assistant IPC follow that shape (P-11). For the streaming push, `StoryboardService`'s `broadcast?: (event) => void` injection (wired in `index.ts`) is the pattern the new service adopts.

**Knowledge-base specs read:** `developer-cockpit/spec/07-ai-integration.md` (the `AIAdapter` interface, the Investigator loop, the `ai-usage.json` shape — the spec this ticket partially delivers), `spec/09-tech-stack-options.md` (names `@anthropic-ai/sdk`/`openai` as "the AI" stack), `spec/08-extension-points.md` (adapter philosophy). The Java `oms-framework` specs (state machine, task pipeline, outbox, validation, error handling) are **not applicable** — this ticket touches no `oms-*` module, no database, no Kafka, no order domain.

## Approach

Add an agentic AI layer to the **main process** built on the Vercel AI SDK, exposing a new
**AI Assistant** chat view, streaming over the existing cockpit WebSocket, with a bounded
multi-step tool-calling loop. Everything renderer-facing stays typed and validated; the renderer
remains `sandbox: true` and never sees an API key.

**New/changed components (all in developer-cockpit):**

| File | Layer | What it does |
|---|---|---|
| `src/main/ai/AiService.ts` (new) | main service | The provider abstraction + agent loop. `complete()` (one-shot, streams text) and `runAgent()` (multi-step tool loop, streams `AiEvent`s). Owns an `AbortController` per run. Built from `AiConfig` + `env` + a `McpToolRegistry`. |
| `src/main/ai/adapters.ts` (new) | main service | Thin factory mapping `AiConfig.provider` → an `ai`-SDK language model: `createAnthropic` / `createOpenAI` / `createOpenAICompatible` (local). Reads the key from `env[apiKeyEnvVar]` (Anthropic/OpenAI) or the base URL (local). Returns `null` when not configured (AC-3). |
| `src/main/ai/McpToolRegistry.ts` (new) | main service | Collects the tool set for a run: (a) a local `search_knowledge_base` tool backed by `KbService`, (b) any MCP server from `config.ai.mcpServers`. Uses the `ai` package's MCP client to convert MCP tools into `ai`-SDK `tool()` objects. Returns `[]` when nothing is configured. |
| `src/main/ai/AiUsageTracker.ts` (new) | main service | Appends `{ timestamp, provider, model, feature, inputTokens, outputTokens }` to `~/.developer-cockpit/ai-usage.json`; `summary()` returns totals for Settings. Atomic write (temp+rename), capped (e.g. 1000 entries, FIFO) to bound file size. |
| `src/main/ai/ai.ipc.ts` (new) | main IPC | `ai:available`, `ai:run` (starts an agent run, keyed by `runId`), `ai:stop` (aborts a `runId`), `ai:usage`. Follows the `StoryboardAiService`/`storyboards.ipc.ts` non-throwing shape. |
| `src/shared/types/ai.ts` (new) | shared | `AiEvent` union (`ai:message`, `ai:tool-call`, `ai:tool-result`, `ai:done`, `ai:error`) + `AiUsageEntry` + `AiRunOptions`. `zod` schemas for tool inputs/outputs and the final answer. |
| `src/shared/types/events.ts` (changed) | shared | Add the `ai:*` members to `EventType`. |
| `src/shared/types/config.ts` (changed) | shared | Extend `AiConfig` with `baseUrl?` (local provider) and `mcpServers?: { name, url }[]`. Backward-compatible (all new fields optional); `DEFAULT_CONFIG.ai` unchanged in required fields. |
| `src/shared/types/ipc.ts` (changed) + `src/main/preload.ts` (changed) | main/preload | Add the `ai: { available, run, stop, usage }` namespace to `CockpitAPI` and the preload bridge. |
| `src/renderer/views/assistant/AssistantView.tsx` (new) | renderer | Chat view: prompt input, streaming transcript (text / tool-call / tool-result), Stop button, structured final answer rendered as Markdown via the existing `MarkdownContent`. Subscribes to the WebSocket `ai:*` events filtered by `runId`. |
| `src/renderer/…` nav (changed) | renderer | Register the Assistant view in the existing view/nav mechanism (sibling of the other views). |
| `src/main/index.ts` (changed) | main | Wire the `KbService`-backed tool registry, the `AiUsageTracker` (with `ConfigService.getConfigDir()`), and `registerAiIpc` with the `broadcast` callback. |
| `src/main/storyboards/StoryboardAiService.ts` (changed) | main | Re-route the `anthropic` single-turn path through the new SDK-backed adapter (one provider stack); `openai`/`local` now also become available. `aiAvailable` updated to reflect the new providers. **The `AiAdapter` interface and the storyboard parsing/`bounded()`/no-`fs` behaviour are preserved.** |

**Agent loop (mirrors spec 07 §3.5, but on the AI SDK):**

```
runAgent(prompt, { tools, maxSteps, runId }):
  model = adapters.forConfig(config, env)        // null → emit ai:error(config) and stop (AC-3)
  abort = new AbortController()
  abortRegistry.set(runId, abort)
  try:
    result = await generateText({
      model,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      tools: tools,            // from McpToolRegistry
      maxSteps,                // the hard bound (AC-6)
      abortSignal: abort.signal,
    })
    for (const part of result.fullStream):
      switch part.type:
        'text-delta'     → broadcast ai:message{ runId, delta }
        'tool-call'      → broadcast ai:tool-call{ runId, toolCallId, name, input }
        'tool-result'    → broadcast ai:tool-result{ runId, toolCallId, name, output(summarized) }
        'finish'         → (usage captured here)
  finally:
    broadcast ai:done{ runId, aborted: abort.signal.aborted, incomplete: steps===maxSteps }
    usageTracker.record(usage)                  // AC-7
    abortRegistry.delete(runId)
```

`complete()` (one-shot) is the same pipeline without `tools`/`maxSteps` — it streams `text-delta`
and ends on `finish`, and is the path `StoryboardAiService` uses.

**Sequence sketch:**

```mermaid
sequenceDiagram
  participant R as Renderer (AssistantView)
  participant P as Preload (CockpitAPI.ai)
  participant M as Main (ai.ipc → AiService)
  participant A as AI SDK (generateText)
  participant T as McpToolRegistry (KB / MCP)

  R->>P: ai.run(runId, prompt)
  P->>M: ipc 'ai:run'
  M->>M: model = adapters.forConfig()  (null? → ai:error)
  M->>A: generateText({model, tools, maxSteps, abortSignal})
  loop each stream part
    A-->>M: part (text / tool-call / tool-result / finish)
    M->>T: (on tool-call) execute tool
    T-->>M: result
    M-->>R: broadcast ai:* (filtered by runId)
  end
  M-->>R: ai:done { aborted, incomplete }
  M->>M: usageTracker.record(usage)
  R->>P: ai.stop(runId)   (aborts; M emits ai:done{aborted:true})
```

**Mapping proposal What-Changes → where it happens:**
- "Provider abstraction + 3 adapters" → `ai/adapters.ts` + `AiService`.
- "AI event streaming over WebSocket" → `shared/types/ai.ts` + `events.ts` + `AiService` broadcasts + `AssistantView`.
- "McpToolRegistry (MCP + local KB tools)" → `ai/McpToolRegistry.ts`.
- "Assistant view" → `assistant/AssistantView.tsx` + nav + `ai.ipc.ts`.
- "Structured/typed outputs, zod at the boundary" → `shared/types/ai.ts` + `AiService` validation.
- "Cost tracking + Settings summary" → `ai/AiUsageTracker.ts` + Settings view.
- "Single-turn feature / shared path" → `AiService.complete()`.
- "No BREAKING, other modules untouched" → all files above are inside `developer-cockpit/`.

## Contract Changes

None. This ticket touches no `oms-contracts` OpenAPI/Avro spec and no generated model. The
cockpit's IPC surface (`CockpitAPI`) is an internal Electron bridge, not a published contract; the
new `ai.*` namespace is **additive** (nothing existing is removed or renamed) and the `EventType`
union grows additively. Compatibility (P-04): n/a — no OpenAPI/Avro change.

## Data & Persistence

None in any database. The only persisted artifact is `~/.developer-cockpit/ai-usage.json` (new local
JSON file, written by `AiUsageTracker` with temp+rename atomic writes, capped at 1000 entries FIFO,
unreadable file reads as empty — mirroring `ApiHistoryService`). No Liquibase, no migrations, no
optimistic locking. P-07/P-08: n/a (no DB, no Kafka, no concurrent-write surface; the file is
single-writer, main-process only).

## Events & Messaging

None to Kafka / the transactional outbox / `order_events` — no `oms-*` module is touched.
The only "events" are the new **cockpit-internal WebSocket** `CockpitEvent` types
(`ai:message`, `ai:tool-call`, `ai:tool-result`, `ai:done`, `ai:error`), broadcast to the already-
connected renderer via the existing loopback `WebSocketServer.broadcast`. There is no producer/consumer
idempotency concern: the events are transient UI state for a run keyed by `runId`; a disconnected
client simply misses them (the run result is not persisted beyond the usage entry). P-05/P-06: n/a.

## Domain, State & Orchestration

None. No order state machine, no task pipeline, no command/query separation — this is a UI tooling
module with no order domain. The only "state" is the transient per-run state in `AiService`
(`abortRegistry: Map<runId, AbortController>`) and the assistant transcript in the renderer (Zustand).
Validation (P-13): user input is bounded (prompt max length, tool input via `zod` schema, `maxSteps`
cap); provider errors and schema-validation failures are surfaced as `ai:error` / degraded output,
never thrown to the renderer (consistent with the `StoryboardAiService` non-throwing contract).

## Alternatives & Decisions

**D1 — Provider stack: Vercel AI SDK (`ai`) + its provider packages, vs. official SDKs
(`@anthropic-ai/sdk`, `openai`), vs. hand-rolled `fetch`.**
Chosen: **Vercel AI SDK** — it is what the goal names, and it is the only major open-source option
that covers single-turn, structured output (`zod`), *and* a built-in multi-step tool-calling loop
(`generateText({ tools, maxSteps })`) in one, with provider-agnostic adapters including
`createOpenAICompatible` (→ Ollama/vLLM for the `local` provider).
Rejected: (a) the official `@anthropic-ai/sdk`/`openai` — each would need a hand-written tool loop
per provider and no shared structured-output story; (b) keeping/extending the existing hand-rolled
`fetch` adapter — it cannot express the multi-step loop, streaming tool parts, or provider
normalization without becoming a mini-framework (exactly what P-17 warns against).
New dependencies added: `ai` (which bundles MCP client support), `@ai-sdk/anthropic`,
`@ai-sdk/openai`, `@ai-sdk/openai-compatible`, `zod`.

**D2 — MCP client: a separate `@modelcontextprotocol/sdk` (revised during implementation).**
Original assumption was that the `ai` package ships an MCP client. In the installed version it does
**not** (v7.0.163 has no `MCPClient`/`mcpTool`/`createMCPClient` export), so the MCP bridge uses the
official `@modelcontextprotocol/sdk` (`Client` + `StreamableHTTPClientTransport`) to list a configured
server's tools and wrap each as an `ai`-SDK `tool()`. The local KB tool does not depend on MCP, so the
agentic ACs are proven independently of the MCP path. The registry stays a thin seam, so swapping MCP
transport (stdio vs HTTP) is localised.

**Changed during implementation (v7 API mapping — the plan's v4-era notes are superseded):**
The installed AI SDK is **v7** (`ai@7.0.163`), whose API differs from the v4 notes in the plan/tasks:
- **Streaming uses `streamText`, not `generateText`.** In v7 `generateText` returns only the final
  result (no `fullStream`); `streamText` returns the stream *and* auto-executes tool calls and runs the
  multi-step loop automatically. `AiService` therefore drives `streamText` (it is the streaming entry
  for the feature) and only iterates `fullStream` + awaits the final result — it never hand-rolls the
  tool loop. `maxSteps` still bounds the loop and `abortSignal` still stops it.
- **The agent loop's bound is `stopWhen: isStepCount(maxSteps)`, not the `maxSteps` option.** A probe
  showed `generateText`/`streamText` with `maxSteps: N` does **not** re-invoke the model when a single
  returned stream contains multiple inline steps (a scripted/fake model returning both a tool-calling
  step and a final step in one `doStream` makes 1 call, not N). `stopWhen: isStepCount(N)` re-invokes
  the model per step and is the correct hard bound (AC-6). `runAgent` therefore passes
  `stopWhen: isStepCount(clampedMaxSteps)`; `complete()` (one-shot, no tools) needs no bound.
- **`fullStream` part shapes:** `text-delta` carries the text in `part.text` (not `delta`); `tool-call`
  carries the parsed object input in `part.input` plus `toolName`/`toolCallId`; `tool-result` carries
  `part.output`; `finish` carries `finishReason`. `AiService` maps these to the `ai:*` events.
- **Tests use a hand-rolled fake v4 `LanguageModel`** (no mock model is shipped in this install):
  own enumerable props `specificationVersion:'v4'`, `provider`, `modelId`, `supportedUrls:{}`, plus
  `doStream`/`doGenerate`. In the *model* stream, a tool call's `input` is a **JSON string** (the SDK
  `safeParseJSON`s it); text uses `text-start`/`text-delta{id,delta}`/`text-end`. This is verified by
  a throwaway probe before each AC's test is written.
- **Provider factories** resolve to: `createAnthropic({apiKey}).languageModel(model)`,
  `createOpenAI({apiKey}).chatModel(model)`, `createOpenAICompatible({baseURL}).chatModel(model)`.
- New dependency added vs. D1's list: `@modelcontextprotocol/sdk` (see D2). `zod` stays at the
  installed major (v4, via `zod@4.6.7`).

**D3 — UI surface: a new AI Assistant (chat) view, vs. embedding the agent into an existing view.**
Chosen: **a new Assistant view** — a free-form multi-step agent has a natural home, matches the
spec's "Investigations" area of the IA, and keeps the `AIAdapter`/streaming view-agnostic for later
per-view buttons. Rejected: wiring the agent into, e.g., the Database or Message Bus view first —
those are the *deferred* single-turn buttons; starting there would force the agent into a
constrained context before the foundation is proven.

**D4 — First-cut tool set: knowledge-base search (local) + configured MCP servers, vs. the full
spec 07 §3.3 infrastructure tool set.**
Chosen: **KB search + MCP only.** The KB tool reuses the existing, well-tested `KbService.search`;
MCP gives the extension point (the existing `oms-mcp-server` qualifies as a configured server).
Rejected: implementing DB/container/k8s/message-bus tools now — that is the deferred Investigator;
adding five untested infra tools would violate "smallest change that meets the ACs" (P-17) and
would make the loop's ACs depend on live infrastructure.

**D5 — Relationship to the existing storyboard `AnthropicAdapter`: re-route it onto the new
SDK-backed adapter, vs. leave it 100% untouched.**
Chosen: **re-route the `anthropic` path onto the new `ai`-SDK adapter** (one provider stack;
`openai`/`local` then work for storyboards too), while **preserving the `AiAdapter` interface, the
`StoryboardAiService` parsing, `bounded()`, the non-throwing IPC contract, and the no-`fs` rule**
so the existing `StoryboardAiService.test.ts` stays green.
Rejected: leaving the hand-rolled `fetch` adapter as-is and keeping a *second* parallel provider
stack — two ways to talk to Anthropic (one with tools/streaming, one without) is the drift P-17
flags, and it means `aiAvailable` stays stuck on `anthropic`-only while the rest of the app supports
three providers. (If this re-route turns out to be risky during implementation, the fallback is to
keep the storyboard adapter untouched and accept the two-stack cost — but that would be a design
change requiring a note here.)

**D6 — Where AI logic runs: main process, vs. renderer.**
Chosen: **main process** — it has Node APIs, holds the API key (which must never reach the
`sandbox: true` renderer), and already owns `KbService`/`WebSocketServer`. This matches the existing
`AnthropicAdapter` (which already runs in main). Rejected: renderer-side — no Node, and it would
leak the key.

## Risks & Mitigations

- **Bundling size / build**: the `ai` SDK + provider packages add to the main-process bundle.
  Mitigation: they are main-process only (not the renderer), and `vite`/`tsc` build them as normal
  Node deps; AC-9 gates `npm run build`. If bundle size becomes a problem, provider packages are
  lazy-imported at adapter-creation time.
- **`ai` SDK MCP client maturity**: the MCP bridge is new. Mitigation: D2 keeps a thin registry
  seam; the local KB tool does *not* depend on MCP, so the agentic loop (AC-4/5/6) is proven with a
  local tool and a stub MCP server independently of the SDK's MCP path.
- **Existing storyboard tests breaking on D5 re-route**: the re-route keeps the `AiAdapter`
  interface and the storyboard service's behaviour; the test that asserts "no `fs` import" and
  "one Messages request" applies to the *old* `AnthropicAdapter` — if D5 deletes that class, that
  specific test is updated to target the new adapter's equivalent contract (still no `fs`, still one
  provider call for a one-shot). This is a contained test change, not a weakened assertion.
- **Unbounded agent loop / cost**: `maxSteps` hard cap (AC-6) + `AbortController` stop (AC-5) +
  usage tracking (AC-7) bound both turns and spend.
- **Malformed tool/model output to the renderer**: `zod` validation at the main boundary (AC-8);
  failures degrade to a safe representation / `ai:error`, never a crash.
- **API key handling**: key is read from `env[apiKeyEnvVar]` in main only (P-16); the renderer is
  told "available: true/false" but never the key.
- **`local` provider has no key**: `aiAvailable`/`ai:available` for `local` checks the base URL is
  configured and (best-effort) reachable; a missing URL is a surfaced configuration error (AC-3
  analogue), not a crash.

## Test Strategy

Level `unit` = vitest in `test/` (no network; provider and MCP stubbed). `integration` = a stub MCP
server over stdio/HTTP in-process. `e2e` = the existing Playwright build (AC-9 runtime check).
Existing pattern: `test/main/StoryboardAiService.test.ts` (FakeAdapter / fakeFetch),
`test/main/websocket-server.test.ts` (real `ws` on a test port).

| AC | Level | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | unit | `test/main/AiService.test.ts` `#one-shot streams text then ai:done` | `complete()` with a mocked `ai` model emits `ai:message` deltas then a terminal `ai:done`; no `ai:*` before the first `ai:message`; provider resolved from `config.provider==='anthropic'`. |
| AC-2 | unit | `test/main/AiService.test.ts` `#openai and local resolve to the right model from config` | `adapters.forConfig` returns an OpenAI model for `openai` and an OpenAI-compatible model (base URL from config) for `local`; `complete()` streams to `ai:done` in each case (three cases, same contract as AC-1). |
| AC-3 | unit | `test/main/AiService.test.ts` `#not configured emits ai:error and makes no network call` | With `env[apiKeyEnvVar]` empty, `forConfig` returns `null`; `runAgent`/`complete` emit `ai:error` (config message) and the injected `fetch`/model is never invoked; no exception escapes. |
| AC-4 | integration | `test/main/AiService.test.ts` `#agent loop calls the KB tool and reflects its result` | With a registered KB tool (backed by a fixture KB) and a model scripted to call it, the run emits `ai:tool-call` (name+input) then `ai:tool-result` then a final answer that contains the stub tool's known content; also a variant against a stub MCP server. |
| AC-5 | unit | `test/main/AiService.test.ts` `#stop aborts the run and emits ai:done{aborted:true}` | Mid-run `stop(runId)` sets the `AbortController`; no further `ai:message`/`ai:tool-call` after abort; terminal `ai:done` carries `aborted:true`. |
| AC-6 | unit | `test/main/AiService.test.ts` `#stops at maxSteps and marks incomplete` | A model that always calls a tool runs until exactly `maxSteps`, then terminates with the terminal event marked `incomplete` and makes no `maxSteps+1`-th call. |
| AC-7 | unit | `test/main/AiUsageTracker.test.ts` `#records usage to ai-usage.json and summary reflects it` | After a run with a mocked fixed token usage, `ai-usage.json` gains one entry `{timestamp,provider,model,feature,inputTokens,outputTokens}`; `summary()` totals match; file write is atomic and capped. |
| AC-8 | unit | `test/main/AiService.test.ts` `#invalid tool output is caught by zod and degrades` | A tool result failing its `zod` schema is logged, produces an `ai:error`/safe fallback, and the broadcast payload is always schema-valid (no malformed object reaches the renderer). |
| AC-9 | e2e | `npm run typecheck && npm test && npm run build` in developer-cockpit (run as the gate) + a Playwright smoke that the Assistant view mounts and the existing spec/API-explorer/storyboards suites pass | The whole existing suite stays green; the new Assistant view renders; the renderer CSP in `src/renderer/index.html` is unchanged (asserted by a diff/snapshot check). |

The D5 re-route is covered by the **existing** `test/main/StoryboardAiService.test.ts`, which must
remain green: its `aiAvailable` and "adapter posts one request" assertions are updated to the new
adapter but assert the same observable contract (no `fs`, one provider call for a one-shot).

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | No OpenAPI/Avro change; no contract folder touched. |
| P-02 | Specification before code, generated models only | n/a | No contract change, so no generated models involved. |
| P-03 | Never edit generated code | n/a | No `build/generated*` touched. |
| P-04 | Contracts evolve compatibly | n/a | No OpenAPI/Avro; the internal IPC/`EventType` additions are additive (nothing removed/renamed). |
| P-05 | Every state change recorded in the event log | n/a | No order state; nothing lands in `order_events`. |
| P-06 | Kafka only through the transactional outbox | n/a | No Kafka produced or consumed. |
| P-07 | Schema changes through new Liquibase changesets | n/a | No database schema change; the only file is a local JSON. |
| P-08 | Concurrency and idempotency are explicit | n/a | No DB writes, no command/execution redelivery surface; the usage file is single-writer (main process). |
| P-09 | Commands and queries stay separate | n/a | No command/query API; this is a UI tooling module. |
| P-10 | State transitions go through the state machine and task pipeline | n/a | No order state machine or task pipeline involved. |
| P-11 | Layering and conventions | comply | New code follows the cockpit's existing pattern: `services/`-style classes in `src/main/ai/`, an `ipc/*.ipc.ts` module registered in `index.ts`, a typed `CockpitAPI` namespace in `preload.ts`, renderer view as a sibling of existing views; `AiService` mirrors `StoryboardAiService` (adapter + non-throwing IPC). |
| P-12 | Jackson 3 only | n/a | No Java; this is a TypeScript module. |
| P-13 | Errors and validation follow the framework specs | comply | User input bounded (prompt length, `zod` tool schemas, `maxSteps`); provider and validation failures surface as `ai:error`/degraded output and are never thrown to the renderer, matching the cockpit's existing non-throwing IPC contract (RFC 7807 Problem+JSON is a Java/oms-core convention and does not apply to the Electron IPC). |
| P-14 | Test first, every AC proven by an automated test | comply | Test Strategy maps all 9 ACs to named vitest tests (unit/integration) plus the build/e2e gate; tests are written before implementation completes. |
| P-15 | Observability | comply | Each run logs one structured line (`[ai] run <runId> provider=… model=… steps=… tokens=…ms`) to the main-process console (the cockpit's existing logging convention); no `console.log` in the renderer. |
| P-16 | Security | comply | API key read from `env[apiKeyEnvVar]` in main only, never serialized to the renderer; renderer is `sandbox: true` and receives only `available: bool` and results; no secrets in code/config. |
| P-17 | Simplicity and dependencies | comply | The only new deps are the named `ai`/`@ai-sdk/*`/`zod` set, justified in D1/D2 with rejected alternatives; the change is the smallest that delivers the ACs (KB + MCP tools only, D4); the existing storyboard path is re-routed, not duplicated. |
| P-18 | Modules build standalone | comply | developer-cockpit is the only module touched; it must pass `npm run typecheck` and `npm test` (its `specs/config.json` verify commands) on its own. |
| P-19 | Documentation follows behaviour | comply | `developer-cockpit/spec/` pages updated: `10-implementation-guide.md` (tick the AI items delivered), `09-tech-stack-options.md` (AI row → Vercel AI SDK + MCP), `07-ai-integration.md` (note which parts this ticket delivers vs. defers). No `oms-knowledge-base/` page changes (this is a cockpit-internal tooling feature, not an OMS domain concept). |

## Knowledge Base Updates

None in `oms-knowledge-base/` — this ticket adds a cockpit-internal developer tooling feature and
changes no OMS domain concept, order lifecycle, or message flow. The documentation updates are
confined to `developer-cockpit/spec/` (see P-19): `10-implementation-guide.md` (tick delivered AI
items), `09-tech-stack-options.md` (AI stack → Vercel AI SDK + MCP), `07-ai-integration.md`
(mark delivered vs. deferred scope).
