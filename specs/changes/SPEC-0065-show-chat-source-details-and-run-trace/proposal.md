# Proposal — SPEC-0065: Show chat source details and run trace

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The Developer Cockpit's knowledge base chat (SPEC-0062) answers questions using search and read
tools. Under each answer it lists the documents the tools touched, as bare paths. The reader cannot
see:
- why a document was cited: which query found it, at which rank and score, and which section and
  lines matched;
- what the run did: what the model wrote between steps, which tools it called with which input and
  what came back, how many tokens it used, how long it took.

The renderer already receives most of this and throws it away:
- **Tool events.** Every `ai:tool-call` (name and input) and `ai:tool-result` (output, up to 4,000
  characters) reaches the `kbChat` store. The store keeps them only for the active run, to extract
  the paths.
- **Usage and model.** `ai:done` carries the model and token usage. The store ignores both.
- **Search results.** The knowledge server's results already carry rank, citation (`path#anchor`),
  section breadcrumb, line range, type, status, trust tier and an excerpt.
- **Scores.** The knowledge server computes a fused score and the keyword and semantic ranks
  (`SearchHit.score`, `keywordRank`, `vectorRank`) but does not print them. The local fallback
  search computes a score and drops it too.

Without this, a reader cannot judge how far to trust an answer, or tell a weak match from a strong
one. They cannot debug a poor answer, or see what a question cost.

The goal asks for quick wins that leave the existing chat largely unchanged. So this ticket shows
data that already exists, in collapsible sections that are closed by default. It adds only the
scores, which are computed already but not printed.

**Amended after the requester tried the first version (2026-11-16).** Two problems:
- **No details appeared.** The knowledge server's tools return their Markdown JSON-encoded: one
  quoted string, with every line break escaped as `\n`. That is Spring AI's default result
  converter. So the "Source details" parser found no hits and the section never appeared, and tool
  results in "Run details" were one unreadable line. The tests had used clean Markdown.
- **A separate section is the wrong place.** The requester wants the details in the source list
  itself.

## What Changes

- **Source details in the source list (amended).** Each entry in the existing "Sources" list under
  an answer keeps its link, which opens the document. Next to the link is a one-line summary of its
  best match:
  - **If a search found it:** the rank, the score (or, for the local search, the distance), the
    section with its lines, and the type and status;
  - **If it was only read:** "read", with the anchor if one was asked for.

  Each entry has a toggle, closed by default, that shows all its matches, each with:
  - the query, rank, score and ranks (keyword and semantic);
  - the section (breadcrumb, `#anchor`, lines);
  - the type, status and trust tier;
  - the excerpt.

  The separate "Source details" section is removed.
- **Readable tool output (amended).** The knowledge server returns its tools' text as written,
  not JSON-encoded. The cockpit also decodes a result that arrives JSON-encoded, from a server not
  yet updated or from any other MCP server. With that, the source details work, and tool results in
  Run details read as text.
- **Run details (collapsible, closed by default).** Under each answer:
  - **Summary line:**
    - provider and model;
    - input, output and total tokens;
    - number of tool calls and duration;
    - outcome: complete, stopped, hit the step limit, or failed.
  - **Steps, in order:**
    - the text the model wrote before each tool call (its working notes);
    - each tool call, with its name and input;
    - its result, expandable and shown as received (bounded at 4,000 characters, as today).
- **Per answer.** Every answer in the conversation keeps its own details, not only the last one.
  Clear removes them along with the conversation.
- **Scores in the search output (additive):**
  - the knowledge server's `searchKnowledgeBase` result line gains the fused score and the keyword
    and semantic ranks;
  - the cockpit's local `search_knowledge_base` result gains each result's `score`.

  Nothing existing in either output changes.

No **BREAKING** change. The answer text, the source links and the chat's behaviour stay as they
are. The knowledge server's tool text loses its JSON quoting; see Impact.

## Scope

### In scope

- `developer-cockpit`:
  - **Store:** the `kbChat` store keeps each answer's tool events, usage, model, outcome and
    timing.
  - **Parser:** reads the search results into source details.
  - **UI:** the details in the source list, and the Run details section, in `KbChatPanel`.
  - **MCP results:** decode tool text that arrives JSON-encoded.
  - **Local search output:** the score is added.
  - **Tests.**
- `oms-mcp-server`:
  - the score and the keyword and semantic ranks on each `searchKnowledgeBase` hit;
  - the three KB tools return their text as written, not JSON-encoded;
  - tests for both.
- `oms-knowledge-base`: `tools/developer-cockpit.md` (KB chat), `tools/knowledge-server.md`
  (search output), and `log.md`.

### Out of scope

- **The model's hidden reasoning ("extended thinking").** Showing it needs thinking switched on per
  provider, which changes cost and requests. The run details show the text the model writes
  between tool calls instead.
- **Per-step token counts.** The providers report usage for the whole run, and that is shown.
- **Other AI features:** the AI assistant view and storyboards keep their own transcripts.
- **Saving traces.** Run details live for the session, like the conversation.
- **Any change to retrieval, ranking, the tools offered, the prompt, or the 4,000-character bound
  on tool output.**

## Acceptance Criteria

Cockpit criteria are proven by the developer-cockpit Vitest suite; AC-4 by an oms-mcp-server test.

- **AC-1** — Given an answer whose run called `searchKnowledgeBase` and got knowledge server
  results, when the answer is shown, then each entry in its "Sources" list shows:
  - its link, which opens the document;
  - a summary of its best match: rank, score, section and lines, type and status.

  When the entry's toggle is opened, every match is listed with:
  - the query and its rank in that search;
  - the score and the keyword and semantic ranks, when the result has them;
  - the section breadcrumb, `#anchor` and line range;
  - type, status and trust tier;
  - the excerpt.

  A document found by several searches or sections lists each match. There is no separate "Source
  details" section.
- **AC-2** — Given an answer whose run used the local fallback (`search_knowledge_base` and
  `read_knowledge_base_document`), when the answer is shown, then:
  - each search result's source entry shows its rank and its distance, marked lower-is-better, and
    its toggle adds the query and category;
  - a document only read shows "read".
- **AC-3** — Given an answer whose run used the knowledge server's `readKnowledgeBase` with a path
  and anchor, when the answer is shown, then that document's source entry shows "read" with the
  anchor.
- **AC-4** — Given the knowledge server's index, when `searchKnowledgeBase` returns hits, then each
  hit's line also shows its fused score and its keyword and semantic ranks, where present. Every
  other part of the output is unchanged.
- **AC-5** — Given a finished run, when the user expands "Run details", then it shows:
  - the provider and model;
  - input, output and total tokens;
  - the number of tool calls and the duration;
  - the outcome;
  - the steps in order: each text segment written before a tool call, then that call's name and
    input.

  Each call's result is collapsed and expands to the output as received. When the run reported no
  usage, the tokens show as "not reported".
- **AC-6** — Given a run that is stopped, hits the step limit, or fails, when "Run details" is
  expanded, then:
  - the outcome says stopped, step limit, or failed (with the error message);
  - the steps up to that point are listed.
- **AC-7** — Given a conversation with several answers, when an earlier answer's details are
  expanded, then they show that answer's run, not the latest one. Clear removes all details.
- **AC-8** — Given the existing chat behaviour (SPEC-0062), when the changed chat runs, then:
  - the existing chat tests pass unchanged: answer text, source links that open documents,
    summarise, fallback notice, stop and error;
  - Run details and each source's toggle are closed by default.
- **AC-10** — Given a knowledge server tool that returns its text JSON-encoded (a quoted string
  with escaped line breaks, as the server did before this change), when the chat runs, then:
  - the cockpit decodes it before the model, the source details and Run details see it;
  - a source entry shows its rank and section from such output;
  - Run details shows the result as multi-line text.

  Given the updated knowledge server, when `searchKnowledgeBase` or `readKnowledgeBase` is called
  over MCP, then the text content is the Markdown itself, not a quoted JSON string.
- **AC-9** — Given the whole change, when the checks run, then all of these pass:
  - the developer-cockpit verify commands (`npm run typecheck`, `npm test`);
  - the oms-mcp-server build with its tests;
  - `okf-check oms-knowledge-base`, with 0 errors.

## Impact

| Area | Impact |
|---|---|
| Modules | developer-cockpit, oms-mcp-server (search output line), oms-knowledge-base (docs) |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | none |
| Events / Kafka topics | none. The cockpit's internal `ai:*` WebSocket events are unchanged; the renderer keeps more of what they already carry |
| Consumers (oms-ui, oms-mcp-server, downstream) | AI clients of the knowledge server (Claude Code, the cockpit) see extra score and rank text on each search hit. The three KB tools' text is no longer wrapped in JSON quotes: clients get the Markdown with real line breaks. This is the same content, easier for a model to read; no client parses the quoted form. The local search tool's JSON gains a `score` field |
| Knowledge base | `tools/developer-cockpit.md` (KB chat), `tools/knowledge-server.md` (search output), `log.md` |

## Open Questions

- [resolved] Which "reasoning" can be shown?
  - Assumption: the text the model writes between tool calls, which the chat already receives.
  - Hidden "extended thinking" needs provider-specific settings, and costs more, so it is out of
    scope. A follow-up ticket can add it.
- [resolved] Where do scores come from?
  - Assumption: the knowledge server prints the fused score and ranks it already computes. The
    local search adds the score it already computes.
  - This touches `oms-mcp-server`, but only appends to a line, so it stays within "quick wins".
  - The alternative, rank only, needs no server change; the score could be cut from the ticket at
    approval.
- [resolved] Show details for every answer, or only the latest? → assumption: every answer. Each
  answer keeps its own trace, so they can be compared. The trace lives for the session.
- [resolved] Open or closed by default? → assumption: closed, as the goal asks, so the chat looks
  as it does today until a section is opened.
- [resolved] **Amended:** where do the source details go? → the requester's decision after trying
  the first version: in the source list itself, a summary line per source with a toggle for the
  rest. The separate section is removed.
- [resolved] **Amended:** fix the JSON-encoded tool text in the server, in the cockpit, or both?
  - Assumption: both.
    - **The server**, because every AI client (Claude Code too) gets escaped text today. A plain
      text result converter on the three KB tools fixes it.
    - **The cockpit**, because a server not yet rebuilt, or another MCP server, may still send it.
  - Order search (`searchOrders`) is left as it is: it is not a KB tool.
- [resolved] How much of a tool result is shown? → assumption: what the chat receives today, at
  most 4,000 characters, behind its own expander. Raising the bound is out of scope.
