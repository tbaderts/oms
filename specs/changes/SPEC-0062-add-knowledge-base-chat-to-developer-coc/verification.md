# Verification — SPEC-0062: Add knowledge base chat to developer cockpit

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests below ran and passed in the latest `spec verify` (`evidence/developer-cockpit-2.log`,
2026-11-15T12:06Z). Per-file results:
- `kbChat.ipc.test.ts` 9/9
- `KbChatTools.test.ts` 8/8
- `kbChatStore.test.ts` 6/6
- `KbChatPanel.test.tsx` 6/6
- `kbChatSources.test.ts` 3/3
- `AiService.test.ts` 9/9
- `ai.ipc.test.ts` 5/5

None of these tests is skipped. The suite's 2 skips are pre-existing storyboard symlink tests
(`skipIf(!FILE_SYMLINKS)` on Windows).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Question → streamed answer in the panel, feature `kb-chat`, input re-enabled after `ai:done` | `kbChat.ipc.test.ts#starts a kb-chat run and streams the answer (AC-1)`: scripted text arrives as `ai:message`, followed by exactly one `ai:done`. `KbChatPanel.test.tsx#sends a question and shows the streamed answer (AC-1)`: `ai.kbChat` is called with the question, the input is disabled while running, the answer renders, and the input is enabled after `ai:done`. Feature `kb-chat`: `kbChat.ipc.test.ts#provider failure ends the run and records usage once` | PASS |
| AC-2 | Only the three KB tools (no `searchOrders`); a model tool call reaches `tools/call` | `KbChatTools.test.ts#keeps only the knowledge-server KB tools`: the stub lists 4 tools and the set holds exactly the 3 KB tools. `kbChat.ipc.test.ts#a tool call made by the model reaches the knowledge server (AC-2)`: a scripted model calls `readKnowledgeBase`, the stub records `tools/call`, the result reaches the model's second step, and the answer streams. The stub now uses oms-mcp-server's real schemas | PASS |
| AC-3 | Server unreachable → run completes with local search + read; read refuses paths outside the KB; fallback notice | `KbChatTools.test.ts#falls back to local tools…` (unreachable URL, invalid URL, server without KB tools), `#local read returns document content`, `#local read refuses paths outside the KB` (`../`, `a/../../`, `C:/`, `/etc`). `kbChat.ipc.test.ts#with the server down, the model reads a document through the local read tool (AC-3)`: `source: 'local'`, the model's `read_knowledge_base_document` call returns the content, and the run ends with `ai:done`. `KbChatPanel.test.tsx#shows the fallback notice (AC-3)` | PASS |
| AC-4 | Each document a tool returned or read appears once as a source link; clicking opens it in the viewer | `kbChatSources.test.ts` (3 tests: search citations, `path` inputs, local JSON, de-duplication, non-`.md` ignored). `kbChatStore.test.ts#collects sources from tool events of the active run`. `KbChatPanel.test.tsx#lists sources and opens one in the viewer (AC-4)`: two citations of one document give one link, and the click calls `kb.getDocument(path)` and sets `selectedDocument` | PASS |
| AC-5 | "Summarise this document" starts a run whose prompt names the open document's path; summary renders | `KbChatPanel.test.tsx#summarises the open document (AC-5)`: the last message contains `oms-knowledge-base/<relativePath>` and the scripted summary renders. `kbChatStore.test.ts#summarise names the document path…` | PASS |
| AC-6 | Follow-up includes earlier turns in order, bounded to 10; Clear → only the new question | `kbChatStore.test.ts#follow-up carries earlier turns, bounded to 10`: [q1,a1,q2], then 21 messages with q1/a2 dropped after 12 turns. `#clear starts fresh`. `kbChat.ipc.test.ts#passes the conversation to the model in order (AC-6)`, asserted at the model's prompt. `#rejects malformed messages (AC-6)` (empty, wrong role, last message not user, oversized, more than 21) | PASS |
| AC-7 | Not configured → input and Send disabled, hint to Settings → AI, no run | `KbChatPanel.test.tsx#is disabled when AI is not configured (AC-7)` | PASS |
| AC-8 | Provider failure or Stop → error shown / streaming stops, `ai:done`, input re-enabled, usage recorded once (`kb-chat`) | `kbChat.ipc.test.ts#provider failure ends the run and records usage once (AC-8)` (`ai:error` before a single `ai:done`; one usage entry with `feature: 'kb-chat'`). `#stop aborts a kb-chat run (AC-8)` (`aborted: true`). `#a stop that arrives while the tools are being built…` (model never called). `KbChatPanel.test.tsx#shows an error and re-enables input; Stop stops the run (AC-8)`. `kbChatStore.test.ts#a run finishes even when no panel is mounted…`. `AiService.test.ts#an error stream part in an Assistant run yields ai:error{provider} then exactly one ai:done` | PASS |

**Manual check against the real knowledge server** (design → Risks). This was run with no LLM:
the compiled `KbChatTools` called the running oms-mcp-server (`docker` container
`oms-mcp-server`, `http://localhost:8091/mcp`) exactly as a model would, using only `query` and
then only `path`.
- **Before the T-18 fix,** the server refused the search with "required property 'category' not
  found …". `limit: 0` returned 0 characters of a document.
- **After the fix:**
  - the tool set is `source: knowledge-server` with exactly the 3 KB tools;
  - the search returned "5 of 77 matching sections" in hybrid mode;
  - source extraction (the same regex as `kbChatSources.ts`) found `domain/concepts/order-lifecycle.md`,
    `domain/model/order-state.md`, `domain/concepts/execution-reporting.md` and
    `framework/state-machine.md`, and the first exists in the cockpit's KB;
  - `readKnowledgeBase` returned the document, bounded by T-20: "characters 0-20000 of 24486" for
    the 24 486-character `order-lifecycle.md`.

An end-to-end question through a live LLM provider was not run; it needs an API key, which this
session does not use. The model-driven tests above cover that path with a scripted model.

## Goal Assessment

Goal: *"for developer-cockpit knowledge base feature, I would like to have a chat feature that lets
me chat with the knowledge base to find content or give me a summary. we can use the built in AI
capabilities and use mcp to connect to the knowledge server."*

- **Chat in the KB feature.** Met. A Chat toggle in the Knowledge Base view opens a multi-turn chat
  panel.
- **Find content.** Met. The model searches through the knowledge server's hybrid search, and the
  answer lists the documents used as links that open in the viewer. This was shown against the
  real server.
- **Summary.** Met. "Summarise this document" summarises the open document, and the chat can be
  asked to summarise a topic. Reads against the real server work only because of the T-18
  parameter filling, which the manual check found.
  - Reads are bounded to 20 000 characters per call (T-20). A summary of a longer document relies
    on the model paging with `offset`, which the server prompts for.
- **Built-in AI capabilities.** Met. The chat reuses the cockpit's `AiService` and the provider
  configured under Settings → AI. No new provider or dependency was added.
- **MCP to the knowledge server.** Met. The chat connects over streamable-HTTP MCP to
  `ai.knowledgeServerUrl` (default `http://localhost:8091/mcp`). It also falls back to local tools
  when the server is down, which goes beyond the request but keeps the chat usable without Docker.

Gaps and deliberate exclusions:
- Chat history is not persisted (out of scope).
- Answer quality depends on the model. Grounding is encouraged by `KB_CHAT_SYSTEM` and is made
  visible by the source links, but no AC can assert it.
- One scope deviation is disclosed: the shared `AiService.pump()` now reports provider stream
  errors as `ai:error`. That also changes the AI Assistant view, which the proposal said would stay
  unchanged. It is a bug fix (previously a provider failure ended silently) and is covered by
  `AiService.test.ts`.

The requester would recognise this as the feature they asked for.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No OpenAPI or Avro touched. The diff is limited to `developer-cockpit/` and two KB pages |
| P-02 | Specification before code, generated models only | N/A | No API or message models. The cockpit IPC types are hand-written by design (SPEC-0042) |
| P-03 | Never edit generated code | PASS | No generated files in the diff |
| P-04 | Contracts evolve compatibly | N/A | No OMS contracts. The cockpit IPC is additive (new `ai:kbChat` channel; optional `ai.knowledgeServerUrl` with a default). Existing channels are unchanged |
| P-05 | Every state change is recorded in the event log | N/A | No order state |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database |
| P-08 | Concurrency and idempotency are explicit | PASS | Runs are keyed by `runId`. A duplicate is rejected, including while starting (`runtime.starting`). Stop is idempotent and honoured while starting. Exactly one terminal `ai:done` per run. Events of other runs are ignored by `runId` in the store |
| P-09 | Commands and queries stay separate | N/A | No OMS command or query API. The chat is read-only over the KB |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No order state transitions |
| P-11 | Layering and conventions | PASS | Main process `ai/` and `ipc/`, shared types, renderer `stores/`, `lib/` and `views/`. A sibling of the SPEC-0042 assistant (same IPC result shape, event flow and store pattern) |
| P-12 | Jackson 3 only | N/A | TypeScript module |
| P-13 | Errors and validation follow the framework specs | PASS | `ai:kbChat` validates input and answers `{ok:false, code:'invalid', message}`, never a rejection. Run failures are `ai:error` plus `ai:done`. The fallback is logged (`[kb-chat] … unavailable, using local tools: <reason>`). The previously dropped `error` stream part is now surfaced instead of swallowed |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC maps to passing tests (table above). Not strictly test-first in two places, recorded in tasks.md Notes: `KbChatPanel` was written in the same step as its test, and the T-16/T-17 tests were added over already-fixed behaviour. The Chat toggle in `KnowledgeBaseView` and the Settings field have no dedicated test; they are thin wiring, and typecheck covers the field binding |
| P-15 | Observability | PASS | `[kb-chat]` and `[ai]` log lines for the fallback and provider failures; usage entries with `feature: 'kb-chat'`. Micrometer and Kafka trace propagation don't apply to the Electron dev tool |
| P-16 | Security | PASS | No secrets added; the API key stays in the main process. IPC input is validated (roles, sizes, count). The local read tool rejects absolute and `..` paths and resolves only indexed KB documents (tested). The MCP allowlist excludes `searchOrders` (tested) |
| P-17 | Simplicity and dependencies | PASS | No new dependency (`package.json` unchanged). Reuses `AiService`, `McpToolRegistry` and `KbService`. Decisions D1–D6 and the during-implementation changes are recorded in design.md |
| P-18 | Modules build standalone | PASS | `npm run typecheck` and `npm test` in developer-cockpit pass (`evidence/last-run.json`). oms-knowledge-base: `okf-check` reports 0 errors and 0 warnings |
| P-19 | Documentation follows behaviour | PASS | `oms-knowledge-base/tools/developer-cockpit.md` has a new "KB Chat" section (tools, fallback, sources, summarise, history, usage, code). `tools/knowledge-server.md` names the KB chat as a consumer of the three tools. The KB pages describe the parameter filling only implicitly ("uses only the three KB tools"); no further page needs it |

## Independent Review

The spec-reviewer agent (first pass) gave the verdict **MET**: no blocking findings, AC-2 and AC-3
rated WEAK, and six findings:

1. **[major] verification.md unfilled.** Resolved: this document, including the planned manual
   check against the real server.
2. **[minor] A Stop during the tool build was lost.** Fixed in T-15 (`runtime.starting` /
   `stoppedWhileStarting`), with a new test.
3. **[minor] A URL change closes the MCP client an in-flight run may use; concurrent builds can
   leak a client.** Deferred to Follow-ups. The panel serialises runs, and the URL changes only
   through Settings.
4. **[minor] The shared `pump()` change also affects the Assistant.** Kept: it is a bug fix. It is
   disclosed in the Goal Assessment and design.md, and a regression test was added (T-17).
5. **[minor] No model-driven tool-call test.** Fixed in T-16. AC-2 and AC-3 are now proven end to
   end with a scripted model.
6. **[minor] A source link can name a document that doesn't exist.** Accepted, as in the design:
   the viewer's "not found" handling covers it. Listed in Follow-ups.

Found during verify outside the review and fixed:
- **Self-review:** the run's state was lost when the panel unmounted mid-run. Fixed in T-14.
- **Real-server check:** the knowledge server's all-required tool schemas. Fixed in T-18.

**Second pass on the delta: MET, with no blocking or major findings.** The reviewer confirmed the
following fixes and checks:
- the Stop-while-starting fix and its test;
- the model-driven AC-2 and AC-3 tests, which turn both into PROVEN;
- the Assistant regression test;
- the store-level subscription: no double handling, and it survives `eventBus.disconnect()`;
- every T-18 neutral value against `KnowledgeBaseTools.java` and `KnowledgeIndexService`:
  - `topK <= 0` gives the server default;
  - a blank `category` / `type` / `tag` adds no filter;
  - a blank `status` keeps the default exclusion of deprecated documents;
  - a blank `anchor` returns the whole document.

It raised two minor points, both fixed in T-20:
- the whole-document `limit` made server reads unbounded; the default `limit` is now 20 000;
- an explicit `limit: 0` from the model returned an empty body; it now counts as unset.

New test: `KbChatTools.test.ts#bounds a read…`.

## Automated Evidence

`evidence/last-run.json`: ran 2026-11-15T12:06:36Z, result **pass**, fingerprint `0a7cabed6f58aa3f`.
- **Modules:** developer-cockpit, oms-knowledge-base.
- **Policy check** (changes since main, merge-base 03bc12da): PASS, with no errors or warnings.
- **`npm run typecheck`** (developer-cockpit): exit 0, `evidence/developer-cockpit-1.log`.
- **`npm test`** (developer-cockpit): exit 0, 108 files, 655 passed and 2 skipped (pre-existing),
  `evidence/developer-cockpit-2.log`.
- **`okf-check`** (run manually for T-11): 204 concepts, 0 errors, 0 warnings.

## Follow-ups

- **oms-mcp-server.** Mark the optional tool parameters `@ToolParam(required = false)`: `topK`,
  `category`, `status`, `type` and `tag` on `searchKnowledgeBase`, and `anchor`, `offset` and
  `limit` on `readKnowledgeBase`. Every MCP client (Claude Code, Copilot) currently sees them as
  required, and `limit: 0` silently returns nothing. The cockpit's filling (T-18/T-20) stays
  harmless after that change.
- **oms-mcp-server returns its Markdown JSON-quoted.** The text arrives as `"## …\n…"` with
  escaped newlines. Citations and reading still work, but unwrapping JSON-string results in the
  cockpit's MCP wrapper, or returning plain text from the server, would make results easier for
  the model to read.
- **KB chat tool cache (review finding 3).** Don't close the client an in-flight run uses when
  the URL changes; serialise concurrent builds.
- **Source links (review finding 6).** Optionally drop source paths the cockpit's KB index does not
  know.
- **`KbChatPanel` tests.** They print React `act(...)` warnings from the async `loadStatus` on
  mount. The tests pass, but the noise could be removed.

## Verdict

Verdict: GOAL MET
