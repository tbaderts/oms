# Verification — SPEC-0065: Show chat source details and run trace

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

This verification covers the amended proposal, re-approved on 2026-11-16 after the requester tried
the first version.

Cockpit tests: `evidence/developer-cockpit-2.log`, 759 passed and 2 skipped. oms-mcp-server:
`evidence/oms-mcp-server-1.log` and the test results. That is 139 tests, including
`KnowledgeBaseToolsTest` 19/19 and `PlainTextResultConverterTest` 3/3.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Each source in the Sources list shows its link, unchanged, and a summary of its best match: rank, score, section and lines, type and status. Its toggle lists every match with query, score and ranks, section, anchor, lines, facets and excerpt. There is no separate section | `KbChatPanel.test.tsx`: "each source shows its best match, and its toggle lists every match (AC-1)" (two matches in one document), "details are closed by default (AC-8)" (no "Source details" button). `kbChatTrace.test.ts`: "parses knowledge server hits", "source details per document from searches (AC-1)" | PASS |
| AC-2 | Local fallback: rank and distance, marked lower-is-better; the toggle adds query and category; a read document shows "read" | `KbChatPanel.test.tsx`: "local sources show rank and distance, and a read document shows read (AC-2)". `kbChatTrace.test.ts`: "parses local search results", "local search and read matches (AC-2)" | PASS |
| AC-3 | `readKnowledgeBase` with an anchor gives the entry `read #anchor` | `kbChatTrace.test.ts`: "a knowledge server read is a read match with its anchor (AC-3)". In the panel, `read #states` in "each answer keeps its own run details; clear removes them (AC-7)" | PASS |
| AC-4 | Search hits state the fused score and the keyword and semantic ranks; the rest of the output is unchanged | `KnowledgeBaseToolsTest#searchHitsShowScoreAndRanks` (` — score 0.0164 · keyword #1`, no semantic rank without embeddings). The existing assertions in `#searchHitsShowTypeStatusAndTrust` and `#searchReturnsMarkdownWithCitationsAndHint` pass unchanged. For the local search: `McpToolRegistry.test.ts#local search results carry their score` | PASS |
| AC-5 | Run details: provider and model, in/out/total tokens, tool calls, duration, outcome, steps in order; results collapsed; "not reported" without usage | `KbChatPanel.test.tsx`: "run details show model, tokens, tool calls, duration and steps (AC-5)", "run details without usage say not reported (AC-5)". `kbChatStore.test.ts`: "keeps text and tool steps in order, with model, usage and timing (AC-5)". `kbChatTrace.test.ts`: "steps keep text and tool calls in order; …" | PASS |
| AC-6 | Stopped, step limit and failed (with message) outcomes, with the steps up to then | `KbChatPanel.test.tsx`: "run details show stopped, step limit and failed outcomes (AC-6)" checks the steps for all three. `kbChatStore.test.ts`: "records stopped, step-limit and failed outcomes (AC-6)", "a run that cannot start is failed with its reason (AC-6)" | PASS |
| AC-7 | Each answer keeps its own details; Clear removes them | `KbChatPanel.test.tsx`: "each answer keeps its own run details; clear removes them (AC-7)". `kbChatStore.test.ts`: "each answer keeps its own trace, and clear removes them (AC-7)" | PASS |
| AC-8 | Existing chat tests unchanged; Run details and each source toggle closed by default | The SPEC-0062 tests in `KbChatPanel.test.tsx`, `kbChatStore.test.ts` and `kbChatSources.test.ts` pass with no edits (the only change is `within` added to an import). "details are closed by default (AC-8)": `aria-expanded="false"` on Run details and the source toggle, no content rendered, the link text unchanged | PASS |
| AC-9 | Cockpit typecheck and tests, the oms-mcp-server build with tests, `okf-check` with 0 errors | `evidence/last-run.json`: pass. `okf-check oms-knowledge-base`: 204 concepts, 0 errors and 12 warnings, all OMS-DRIFT (see Follow-ups) | PASS |
| AC-10 | JSON-encoded tool text is decoded before the model, the source details and Run details see it; the updated server returns plain Markdown | **Cockpit:** `mcpText.test.ts#decodes a JSON-encoded tool text, leaves other text alone`; `McpToolRegistry.test.ts#an MCP tool returning JSON-encoded text is decoded` (through a stub MCP server over HTTP); `kbChatTrace.test.ts#parses the running server output, which arrived JSON-encoded (AC-10)`; `KbChatPanel.test.tsx#details from the server text as it was JSON-encoded (AC-10)` (real ` > ` breadcrumb; summary rank and section; Run details result on several lines). **Server:** `KnowledgeBaseToolsTest#toolCallbacksReturnMarkdownNotAJsonString`, which calls all three KB tools through Spring AI tool callbacks; `PlainTextResultConverterTest` (3). **Live:** after rebuilding the `mcp-server` container, a `tools/call searchKnowledgeBase` over `/mcp` returned `## Knowledge base search: "cancel order"` with real line breaks and `— score 0.0311 · keyword #2 · semantic #7`. Before, the same call returned a quoted string with escaped `\n` | PASS |

## Goal Assessment

The goal asked for:
- more detail on the sources the chat cites: citations, matching score, rank;
- the agent's reasoning, tool calls and tokens used;
- both collapsible;
- quick wins that leave the existing chat largely unchanged.

All four are delivered.
- **Source details** are in the Sources list, where the requester looked for them after trying the
  first version:
  - each source shows its best match (rank, score, section) next to its link;
  - a toggle shows every match with its query, ranks, section, facets and excerpt.
- **Run details** give the model, tokens, tool calls with inputs and results, duration, outcome,
  and the text the model wrote between steps.
- **Both are collapsible** and closed by default.
- **They work against the real knowledge server.** In the first version they did not: the server's
  tool text arrived JSON-encoded. The server now returns plain Markdown, the cockpit decodes encoded
  text from any server, and a live call confirmed it.
- **Quick wins:** the answer, the source links and every existing chat test are unchanged. The
  server changes are small: it prints the scores it already computed, and returns its text as
  written.

**Interpretation.** As approved in the proposal, "reasoning" is the model's visible text between
tool calls. Hidden "extended thinking" is left out of scope.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No OpenAPI or Avro change |
| P-02 | Specification before code, generated models only | PASS | Proposal and design first. The cockpit's types are hand-written in `shared/types` (no generated model covers them) |
| P-03 | Never edit generated code | PASS | None edited |
| P-04 | Contracts evolve compatibly | PASS | Additive: a trailing fragment on the MCP hit line (the text before it is unchanged, tested) and a `score` field in the local JSON. The KB tools' text is no longer JSON-quoted; the content is the same, as approved in the proposal's Impact. `searchOrders` keeps the default converter. The `ai:*` events are unchanged |
| P-05 | Every state change is recorded in the event log | N/A | No order state |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database |
| P-08 | Concurrency and idempotency are explicit | PASS | Events are filtered by `activeRunId`; a result is matched to its call by `toolCallId`; a result without a call gets its own step (tested) |
| P-09 | Commands and queries stay separate | N/A | No OMS command or query API |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No order state |
| P-11 | Layering and conventions | PASS | Pure parser in `renderer/lib` (sibling of `kbChatSources.ts`), state in the store, display in `KbChatDetails.tsx`, and decoding in `shared/mcpText.ts`, used by both processes. On the server: a helper inside `KnowledgeBaseTools`, and `PlainTextResultConverter` through Spring AI's own `@Tool(resultConverter)` hook |
| P-12 | Jackson 3 only | N/A | No JSON mapping in Java |
| P-13 | Errors and validation follow the framework specs | PASS | Truncated or unparseable tool output gives fewer fields, never an exception (tested). Run errors show as the failed outcome |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Each task wrote its test first. T-1 to T-4, T-8 and T-9 were seen failing before the code. Every AC is mapped above |
| P-15 | Observability | N/A | No service metrics or logs change |
| P-16 | Security | PASS | Tool output is rendered as React text or `<pre>`, never as HTML or Markdown. No secrets reach the renderer |
| P-17 | Simplicity and dependencies | PASS | No new dependencies. Reuses data already received |
| P-18 | Modules build standalone | PASS | The cockpit and oms-mcp-server checks each pass on their own |
| P-19 | Documentation follows behaviour | PASS | `tools/developer-cockpit.md` (KB chat details, the local distance), `tools/knowledge-server.md` (score and ranks on each hit), `log.md` |

## Independent Review

The spec-reviewer agent reviewed the ticket twice.

**Second review, of the amended ticket: MET, with no blocking findings.**
1. **[minor] The component tests used `›` breadcrumbs, but the real server writes ` > `.** Fixed:
   the AC-10 panel test uses the real separator.
2. **[minor] `readKnowledgeBase` and `getKnowledgeBaseOverview` were proven plain-text only by
   their annotation.** Fixed: `toolCallbacksReturnMarkdownNotAJsonString` now calls all three tools
   through their Spring AI callbacks.
3. **[note] Decoding applies to every MCP server's text.** A tool whose whole text is a JSON
   string literal reaches the model unquoted. Accepted: the proposal intends this, and
   `tools/developer-cockpit.md` documents it.
4. **[note] Other sessions' changes in the touched files.** The same as the first review's
   finding 5.

**First review, of the first version: MET, with no blocking findings.** It re-ran the related
tests: 42 of 42 passed.

1. **[major, non-blocking] The local score means the opposite of the server score.** The cockpit's
   local search returns a Fuse.js distance, where 0 is an exact match and lower is better. The
   knowledge server's fused score is higher-is-better. The UI showed both as "score".
   **Fixed:**
   - the local value now shows as `distance 0.123 (lower is better)`;
   - the local tool's description tells the model what it means;
   - the `KbSearchToolResult` type documents it;
   - `tools/developer-cockpit.md` explains it;
   - the tests use real 0–1 values (`McpToolRegistry.test.ts`, `KbChatPanel.test.tsx` AC-2).
2. **[minor] Scores were printed unrounded.** Fixed: scores are rounded to 3 significant digits.
3. **[minor] The new Java helper split `facets()` from its Javadoc.** Fixed: `scoreAndRanks` now
   sits above the `facets()` Javadoc.
4. **[minor] The AC-6 test checked the steps only for the failed run.** Fixed: it now checks the
   stopped and step-limit runs too.
5. **[note] Changes in the touched files that belong to other work.** These are:
   - the hand-written search input schema in `McpToolRegistry.ts`;
   - the title on the Summarise button;
   - the `AiKey*` types.

   They come from other sessions' and tickets' work. They are not part of SPEC-0065 and should be
   committed with their own changes.

No findings remain unresolved.

## Automated Evidence

`evidence/last-run.json` was written on 2026-11-16 at 16:32:57 UTC, after both reviews' fixes.
Result: pass.
- Policy check: PASS.
- `npm run typecheck` (developer-cockpit): exit 0.
- `npm test` (developer-cockpit): exit 0, with 759 passed and 2 skipped.
- `.\gradlew.bat check` (oms-mcp-server): exit 0, with 139 tests. That includes
  `KnowledgeBaseToolsTest` 19/19 and `PlainTextResultConverterTest` 3/3.

Outside the gate:
- `node tools/okf-check/okf-check.mjs oms-knowledge-base` gives 204 concepts, 0 errors and 12
  warnings.
- The live `/mcp` call after the container rebuild is described under AC-10.

## Follow-ups

- **Optional:** show the model's hidden "extended thinking" in Run details. It needs per-provider
  settings and costs more; this ticket left it out on purpose.
- **Commit with care:** the touched files also hold other sessions' changes (finding 5). When
  committing, stage SPEC-0065's changes separately.
- **Review 11 requirement and capability pages flagged by OMS-DRIFT.** Commit `3bf1e3b` ("knowledge
  search improvements", 2026-11-16 14:10) included this ticket's server code and the KB explorer
  table fix, so the pages that cite those files now look older than their code:
  - FR-033, FR-045 and FR-047 (`KnowledgeBaseTools.java` and its test);
  - FR-035 and FR-046 (KB explorer);
  - `capabilities/knowledge-services.md`;
  - `semantic-layer/knowledge-graph.md`.

  Their requirements are unchanged by this ticket, and only a review should move their `updated`
  dates. The `oms-ui.md` warning was there before.
- **Rebuilding `mcp-server`:** run `./gradlew bootJar` first. The image copies a ready-built jar.
  A plain `docker compose up --build` asked for an extra file permission and did not rebuild;
  `COMPOSE_BAKE=false` avoids that.

## Verdict

Verdict: GOAL MET
