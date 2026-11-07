# Proposal — SPEC-0042: Add AI agentic capabilities via Vercel AI SDK

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The requester: *"Add AI agentic capabilities to developer-cockpit using Vercel AI SDK."*

developer-cockpit is a TypeScript Electron + React app, and its own specification already plans AI
as first-class: `spec/07-ai-integration.md` specifies single-turn features (message-bus explainer,
query analyzer, NL→SQL, lifecycle narrator, team briefing) and an **Investigator** — an autonomous
multi-turn agent that calls tools (query the database, read logs, inspect messages, search the KB),
reasons, and iterates to a root-cause conclusion. Yet nothing of it exists in code:

- `AiConfig` (`src/shared/types/config.ts`) exists with `provider: 'anthropic' | 'openai' | 'local'`
  and Settings lets you save it, but **no service consumes it** — there is no AI client anywhere in
  `src/main`, and the cockpit has no `@anthropic-ai/sdk`, `openai`, or `ai` dependency.
- `EventType` (`src/shared/types/events.ts`) has no AI event type; the WebSocket bus
  (`src/main/websocket/server.ts`) carries only file/config/KB/git/specs/storyboards events.
- Every view the spec wires AI into (Message Bus, Database, Flight Deck, Investigations) is either
  absent or has no AI affordance today.

The repo already contains the two building blocks an agentic system needs: `oms-mcp-server`
(Java, exposes KB content as MCP tools) and the MCP protocol itself, which is the industry-standard
way agents discover tools. Doing nothing leaves the cockpit's flagship spec feature
(07-ai-integration.md) unimplemented and the cockpit permanently split from the AI tooling the team
already uses.

The goal names the technology — **Vercel AI SDK** (the `ai` package) — because it is the only
open-source library that covers all three capability levels the spec needs in one: single-turn
completions, structured outputs, and a built-in multi-step tool-calling loop
(`generateText({ tools, maxSteps })`), with provider-agnostic adapters (Anthropic, OpenAI, and any
OpenAI-compatible endpoint such as Ollama or vLLM for the `local` provider).

## What Changes

In developer-cockpit (no other module is touched; nothing is **BREAKING**):

- **New runtime dependencies in developer-cockpit only**: the Vercel AI SDK (`ai`), its provider
  packages (Anthropic, OpenAI, OpenAI-compatible for local models), `zod` for structured outputs, and
  an MCP client (MCP is now a core dependency of the `ai` package, so no separate MCP SDK dependency
  is needed — this is decided in design).
- **Provider abstraction in the main process**: an `AIAdapter` (per spec 07 §1) implemented on top of
  the AI SDK with three adapters — `anthropic`, `openai`, `local` (OpenAI-compatible endpoint, e.g.
  Ollama/vLLM) — selected by the existing `ai.provider` config value. A missing or invalid API key
  degrades to a clear "not configured" state; the rest of the app is unaffected.
- **AI event streaming over the existing cockpit WebSocket**: new `CockpitEvent` types (e.g.
  `ai:message`, `ai:tool-call`, `ai:tool-result`, `ai:done` / `ai:error`) broadcast from main so any
  renderer view can render a running AI feature incrementally.
- **First agentic feature: an AI Assistant view** with a chat input. Given a prompt and the configured
  provider, it runs a **multi-step tool-calling loop**: the model can call tools exposed to it (at
  minimum, knowledge-base search wired to the existing `KbService`), receives the results, and
  iterates up to a bounded number of steps until it answers. The user sees streaming reasoning text,
  each tool call (name + input) and tool result, and the final answer — all in real time over the
  WebSocket. The user can stop the run at any time.
- **Tool registry**: a main-process `McpToolRegistry` that collects tools from (a) local tool
  definitions and (b) any MCP server the user configures (the existing `oms-mcp-server` qualifies).
  Tools are passed to the AI SDK's agent loop as a single, provider-normalized tool set.
- **Structured, typed outputs**: the final answer and any tool results crossing to the renderer are
  typed in `src/shared/types/ai.ts` (shared main/renderer), validated with `zod` at the main-process
  boundary.
- **Cost tracking**: each run appends a usage entry (provider, model, tokens in/out, timestamp) to
  `~/.developer-cockpit/ai-usage.json` and a Settings summary shows the accumulated usage.
- **Single-turn feature**: the assistant also supports plain one-shot prompts (no tools) through the
  same `AIAdapter`, so the "explain this" style features of spec 07 §2 have a working foundation.
- Settings UI: the existing `ai` config fields stay; no new config surface is required beyond
  optionally listing MCP server endpoints (design decides the minimal form).

## Scope

### In scope

- Vercel AI SDK integration in the **main process** (`src/main/services/`): `AiService` implementing
  the `AIAdapter`, three provider adapters, the multi-step agent loop, tool execution, and a stop
  signal (AbortController).
- The `McpToolRegistry` (MCP client + local tools) and tool→AI-SDK bridge.
- New shared AI types (`src/shared/types/ai.ts`) and new `EventType` members for AI streaming.
- The **AI Assistant view** (renderer): prompt input, streaming transcript (text / tool call /
  tool result), stop button, and a structured final answer rendered as Markdown.
- Cost tracking to `~/.developer-cockpit/ai-usage.json` and a Settings usage summary.
- Automated tests for every AC (unit tests with a mocked provider; an integration test of the tool
  loop against a stub MCP server).
- Ticking the matching items in `developer-cockpit/spec/10-implementation-guide.md` and correcting
  `09-tech-stack-options.md` where it names the AI stack.

### Out of scope

- The **Investigator** as specified in spec 07 §3 (playbooks, environment detection of
  database/message bus/containers/k8s, the infrastructure tool set, correlation timeline UI). That is
  a follow-up ticket; this ticket delivers the *agentic foundation* (multi-step tool loop, MCP tools,
  streaming, structured outputs) that the Investigator will build on.
- The other single-turn features of spec 07 §2 (per-view explain/analyze/narrate/briefing buttons
  and their specific prompts) — the shared `AIAdapter` single-turn path is delivered; wiring each
  view's button is deferred.
- CLI AI sessions (Claude Code / Aider over a PTY, spec 07 §4) — a separate feature, separate
  transport (node-pty); not part of this ticket.
- Any changes to `oms-*` modules (including `oms-mcp-server`); the cockpit consumes MCP servers, it
  does not modify them.
- Prompt-engineering of playbooks or domain-specific RAG beyond KB keyword search.

## Acceptance Criteria

- **AC-1** — Given the cockpit is configured with `ai.provider: 'anthropic'` and a valid
  `ANTHROPIC_API_KEY` in the environment, when the user submits a one-shot prompt in the AI
  Assistant, then the response text streams to the UI incrementally over the cockpit WebSocket
  (`ai:*` events) and ends with an `ai:done` event; no response body is shown before the first
  `ai:message` event arrives.
- **AC-2** — Given `ai.provider: 'openai'` with a valid key and `ai.provider: 'local'` pointing
  (via the configured OpenAI-compatible base URL) at a reachable model server, when the user submits
  a one-shot prompt, then each case streams a response and ends with `ai:done` (three cases, same
  contract as AC-1; provider is selected purely from config).
- **AC-3** — Given `ai.provider: 'anthropic'` but the API key environment variable is missing or
  empty, when the user submits a prompt, then the UI shows an explicit "AI not configured" error
  state (an `ai:error` event with a configuration message), no network request is made to the
  provider, and no exception is thrown in the main process.
- **AC-4** — Given at least one MCP tool is registered (e.g. a KB search tool from a configured MCP
  server), when the user submits a prompt whose answer requires that tool, then the assistant runs a
  tool-calling loop: the UI receives an `ai:tool-call` event naming the tool and its input, then an
  `ai:tool-result` event with the (summarized) result, then continues to a final answer; the final
  answer reflects the tool's output (verified against the stub MCP server's known response).
- **AC-5** — Given a tool-calling run in progress (AC-4), when the user clicks Stop, then the run is
  aborted (AbortController), no further `ai:message` / `ai:tool-call` events are emitted, and an
  `ai:done` event with `aborted: true` (or an equivalent terminal state) is received by the UI.
- **AC-6** — Given a prompt that would require more than the configured maximum number of agent
  steps, when the assistant runs, then it stops at exactly the max-step bound, emits the terminal
  event with an "incomplete" indication, and does not loop beyond it.
- **AC-7** — Given a completed AI run (one-shot or tool-calling), when the run ends, then a usage
  entry (`{ timestamp, provider, model, feature, inputTokens, outputTokens }`) is appended to
  `~/.developer-cockpit/ai-usage.json` and the Settings usage summary reflects the new totals
  (deterministic with a mocked provider that reports fixed token counts).
- **AC-8** — Given a tool result (or final answer) that is not valid against its `zod` schema, when
  it crosses the main-process boundary, then the main process logs the validation failure, emits an
  `ai:error` (or degrades to a safe representation), and the renderer never receives an unvalidated,
  malformed payload (no crash in the UI).
- **AC-9** — Given this change, when `npm run typecheck`, `npm test`, and `npm run build` are run in
  developer-cockpit, then all pass; the existing suite (specs view, API explorer, storyboards)
  remains green; the renderer's Content-Security-Policy in `src/renderer/index.html` is unchanged.

## Impact

| Area | Impact |
|---|---|
| Modules | developer-cockpit (also `spec set SPEC-0042 modules developer-cockpit` — already set) |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | none (local JSON files only: `~/.developer-cockpit/ai-usage.json`) |
| Events / Kafka topics | none (new cockpit-internal WebSocket `ai:*` event types only) |
| Consumers (oms-ui, oms-mcp-server, downstream) | none; oms-mcp-server is consumed as an MCP server if configured, but is not modified |
| Knowledge base | none in `oms-knowledge-base/`; cockpit spec pages updated: `developer-cockpit/spec/10-implementation-guide.md` (tick items), `09-tech-stack-options.md` (AI row: Vercel AI SDK + MCP), `07-ai-integration.md` (note which parts this ticket delivers vs. defers) |

## Open Questions

- [resolved] Which MCP client to use? → assumption: the MCP client built into the Vercel AI SDK
  (`ai` package's MCP support) rather than a separate `@modelcontextprotocol/sdk` dependency;
  cheaper to reverse (a thin adapter over the official MCP SDK is a drop-in replacement) and keeps
  the dependency list to one new library. Recorded for the design.
- [resolved] Which UI surface hosts the agent? → assumption: a new **AI Assistant** view (chat)
  rather than embedding the agent into an existing view; it is the natural home for a free-form
  multi-step agent and matches the "Investigations" area of the spec's information architecture.
  Reversible (the `AIAdapter` and streaming are view-agnostic).
- [resolved] Which tools are available in the first cut? → assumption: knowledge-base search only
  (bridging the existing `KbService`), plus whatever a configured MCP server exposes; the
  infrastructure tools of spec 07 §3.3 (DB, containers, k8s, message bus) are deferred.
- [resolved] Default local endpoint? → assumption: configurable base URL (OpenAI-compatible) so it
  can point at Ollama (`:11434/v1`) or a vLLM server; no default is forced, a missing URL is a
  configuration error surfaced in the UI.
- [deferred] Investigator playbooks, environment detection and the correlation-timeline UI →
  follow-up ticket built on this foundation; safe to defer because the agent loop and tool registry
  are delivered and tested here.
- [deferred] Per-view single-turn buttons (explain / analyze / narrate / brief) → follow-up; the
  shared single-turn path is delivered and tested here, so they are additive.
