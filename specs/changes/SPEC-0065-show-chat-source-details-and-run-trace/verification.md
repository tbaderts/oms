# Verification — SPEC-0065: Show chat source details and run trace

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

Cockpit tests: `evidence/developer-cockpit-2.log`, 755 passed and 2 skipped. oms-mcp-server:
`evidence/oms-mcp-server-1.log`; `KnowledgeBaseToolsTest` 18/18, and 135 tests in the module.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Expanding "Source details" on a knowledge server search shows query, rank, score, keyword and semantic ranks, breadcrumb, anchor, lines, facets and excerpt. Several matches per document are listed; before expanding, only the links show | `kbChatTrace.test.ts`: "parses knowledge server hits", "source details per document from searches (AC-1)" (two matches, rank 1 and 3). `KbChatPanel.test.tsx`: "source details show rank, score, section and excerpt (AC-1)", "details are closed by default (AC-8)" | PASS |
| AC-2 | Local fallback: query, rank, score and category per search result; a read document shows "read" | `kbChatTrace.test.ts`: "parses local search results", "local search and read matches (AC-2)". `KbChatPanel.test.tsx`: "local source details show query, rank, score and a read document (AC-2)". The score shows as `distance 0.123 (lower is better)`, see review finding 1 | PASS |
| AC-3 | `readKnowledgeBase` with an anchor shows read with the anchor | `kbChatTrace.test.ts`: "a knowledge server read is a read match with its anchor (AC-3)". In the panel, `read #states` in "each answer keeps its own run details; clear removes them (AC-7)" | PASS |
| AC-4 | Search hits state the fused score and the keyword and semantic ranks; the rest of the output is unchanged | `KnowledgeBaseToolsTest#searchHitsShowScoreAndRanks` (` — score 0.0164 · keyword #1`, no semantic rank without embeddings). The existing assertions in `#searchHitsShowTypeStatusAndTrust` and `#searchReturnsMarkdownWithCitationsAndHint` pass unchanged. For the local search: `McpToolRegistry.test.ts#local search results carry their score` | PASS |
| AC-5 | Run details: provider and model, in/out/total tokens, tool calls, duration, outcome, steps in order; results collapsed; "not reported" without usage | `KbChatPanel.test.tsx`: "run details show model, tokens, tool calls, duration and steps (AC-5)", "run details without usage say not reported (AC-5)". `kbChatStore.test.ts`: "keeps text and tool steps in order, with model, usage and timing (AC-5)". `kbChatTrace.test.ts`: "steps keep text and tool calls in order; …" | PASS |
| AC-6 | Stopped, step limit and failed (with message) outcomes, with the steps up to then | `KbChatPanel.test.tsx`: "run details show stopped, step limit and failed outcomes (AC-6)" checks the steps for all three. `kbChatStore.test.ts`: "records stopped, step-limit and failed outcomes (AC-6)", "a run that cannot start is failed with its reason (AC-6)" | PASS |
| AC-7 | Each answer keeps its own details; Clear removes them | `KbChatPanel.test.tsx`: "each answer keeps its own run details; clear removes them (AC-7)". `kbChatStore.test.ts`: "each answer keeps its own trace, and clear removes them (AC-7)" | PASS |
| AC-8 | Existing chat tests unchanged; both sections closed by default | The SPEC-0062 tests in `KbChatPanel.test.tsx`, `kbChatStore.test.ts` and `kbChatSources.test.ts` pass with no edits (the only change is `within` added to an import). "details are closed by default (AC-8)": `aria-expanded="false"`, no content rendered, the existing source link still there | PASS |
| AC-9 | Cockpit typecheck and tests, the oms-mcp-server build with tests, `okf-check` with 0 errors | `evidence/last-run.json`: pass. `okf-check oms-knowledge-base`: 204 concepts, 0 errors, 1 warning, from before this ticket (OMS-DRIFT on `architecture/context/oms-ui.md`) | PASS |

## Goal Assessment

The goal asked for:
- more detail on the sources the chat cites: citations, matching score, rank;
- the agent's reasoning, tool calls and tokens used;
- both collapsible;
- quick wins that leave the existing chat largely unchanged.

All four are delivered.
- **Source details** give each document's query, rank, score and ranks, section, lines, facets and
  excerpt.
- **Run details** give the model, tokens, tool calls with inputs and results, duration, outcome,
  and the text the model wrote between steps.
- **Both are collapsible** and closed by default.
- **Quick wins:** the answer, the source links and every existing chat test are unchanged. Only
  one server-side change was needed: the knowledge server prints the scores it already computed.

**Interpretation.** As approved in the proposal, "reasoning" is the model's visible text between
tool calls. Hidden "extended thinking" is left out of scope.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No OpenAPI or Avro change |
| P-02 | Specification before code, generated models only | PASS | Proposal and design first. The cockpit's types are hand-written in `shared/types` (no generated model covers them) |
| P-03 | Never edit generated code | PASS | None edited |
| P-04 | Contracts evolve compatibly | PASS | Additive only: a trailing fragment on the MCP hit line (the text before it is unchanged, tested) and a `score` field in the local JSON. The `ai:*` events are unchanged |
| P-05 | Every state change is recorded in the event log | N/A | No order state |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database |
| P-08 | Concurrency and idempotency are explicit | PASS | Events are filtered by `activeRunId`; a result is matched to its call by `toolCallId`; a result without a call gets its own step (tested) |
| P-09 | Commands and queries stay separate | N/A | No OMS command or query API |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No order state |
| P-11 | Layering and conventions | PASS | Pure parser in `renderer/lib` (sibling of `kbChatSources.ts`), state in the store, display in `KbChatDetails.tsx`. The server change is a helper inside `KnowledgeBaseTools` |
| P-12 | Jackson 3 only | N/A | No JSON mapping in Java |
| P-13 | Errors and validation follow the framework specs | PASS | Truncated or unparseable tool output gives fewer fields, never an exception (tested). Run errors show as the failed outcome |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Each task wrote its test first. T-1, T-2, T-3 and T-4 were seen failing before the code. Every AC is mapped above |
| P-15 | Observability | N/A | No service metrics or logs change |
| P-16 | Security | PASS | Tool output is rendered as React text or `<pre>`, never as HTML or Markdown. No secrets reach the renderer |
| P-17 | Simplicity and dependencies | PASS | No new dependencies. Reuses data already received |
| P-18 | Modules build standalone | PASS | The cockpit and oms-mcp-server checks each pass on their own |
| P-19 | Documentation follows behaviour | PASS | `tools/developer-cockpit.md` (KB chat details, the local distance), `tools/knowledge-server.md` (score and ranks on each hit), `log.md` |

## Independent Review

The spec-reviewer agent's verdict was MET, with no blocking findings. It re-ran the related tests:
42 of 42 passed.

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

`evidence/last-run.json` was written on 2026-11-16 at 11:10:56 UTC, after the review fixes.
Result: pass.
- Policy check (changes since main, merge-base 199c36e3): PASS.
- `npm run typecheck` (developer-cockpit): exit 0.
- `npm test` (developer-cockpit): exit 0, with 755 passed and 2 skipped.
- `.\gradlew.bat check` (oms-mcp-server): exit 0. `KnowledgeBaseToolsTest` 18/18, including
  `searchHitsShowScoreAndRanks`.

Outside the gate: `node tools/okf-check/okf-check.mjs oms-knowledge-base` gives 204 concepts, 0
errors and 1 warning, which was there before this ticket.

## Follow-ups

- **Optional:** show the model's hidden "extended thinking" in Run details. It needs per-provider
  settings and costs more; this ticket left it out on purpose.
- **Commit with care:** the touched files also hold other sessions' changes (finding 5). When
  committing, stage SPEC-0065's changes separately.

## Verdict

Verdict: GOAL MET
