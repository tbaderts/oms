# Proposal — SPEC-0062: Add knowledge base chat to developer cockpit

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The ticket goal asks for a chat in the developer cockpit's Knowledge Base view that finds content
in the knowledge base and summarises it, using the cockpit's built-in AI and connecting to the
knowledge server over MCP.

How it works today:
- The Knowledge Base view (`developer-cockpit/src/renderer/views/knowledge-base/`) offers only a
  category tree and a fuzzy title search (`KbSearchBar`). There is no way to ask a question in
  natural language or get a summary.
- The separate AI Assistant view (SPEC-0042, `views/assistant/AssistantView.tsx`) is single-turn.
  Its only built-in KB tool, `search_knowledge_base`, returns titles and paths but not the
  documents' content, so the model cannot read what it found and cannot summarise it.
- The assistant connects to MCP servers only when someone adds one to `ai.mcpServers`, which is
  empty by default. When one is configured, the assistant exposes all of that server's tools,
  including the order tools (`searchOrders`).
- The knowledge server (oms-mcp-server, `http://localhost:8091/mcp`, streamable HTTP) already
  exposes `searchKnowledgeBase`, `readKnowledgeBase` and `getKnowledgeBaseOverview`
  (`oms-mcp-server/.../kb/KnowledgeBaseTools.java`), but nothing in the cockpit uses them by default.
- Answers do not link back to documents, so a reader cannot check a claim against its source.

If nothing changes, developers keep searching the 100+ KB pages by hand, or switch to another tool
to ask questions about them.

Related: `oms-knowledge-base/tools/developer-cockpit.md`, `tools/knowledge-server.md`,
`capabilities/use-cases/UC-016-browse-knowledge.md`.

## What Changes

- A **KB Chat panel** in the Knowledge Base view. It is a multi-turn conversation that streams
  answers from the configured AI provider.
- The chat uses **knowledge-server tools over MCP**. The cockpit connects to the knowledge server's
  MCP endpoint and gives the model only its read-only KB tools.
  - The endpoint is a new setting, `ai.knowledgeServerUrl`, with the default
    `http://localhost:8091/mcp`.
  - When the knowledge server is unreachable, the chat falls back to local KB tools: the existing
    search tool plus a new local read-document tool. The panel shows that it is in fallback mode.
- **Source links.** The panel lists every KB document that a tool returned or read during the
  answer as a link. Clicking a link opens that document in the KB document viewer.
- A **"Summarise this document" action.** It summarises the document open in the viewer through the
  chat, which reads the document with a read tool.
- **Usage tracking.** KB chat runs are recorded in the AI usage log under the feature `kb-chat`.
- No breaking changes. The AI Assistant view and its IPC keep their current behaviour.

## Scope

### In scope

- The chat panel in the Knowledge Base view: multi-turn within the session, Stop, Clear, and
  states for "not configured" and errors.
- Wiring the KB chat to the knowledge server's MCP tools, with a local fallback and a setting for
  the endpoint.
- Source links that open in the KB document viewer.
- Summarising the open document.
- Updating `oms-knowledge-base/tools/developer-cockpit.md` to describe the feature.

### Out of scope

- Persisting chat history across app restarts.
- Embeddings or vector search (RAG indexing). The chat relies on the existing search tools.
- Changes to oms-mcp-server's tools or index. The existing tools are used as they are.
- Writing to the knowledge base from the chat (editing documents, creating pages).
- Order and other non-KB MCP tools in the KB chat.
- Changes to the AI Assistant view.
- New AI providers. The chat uses the provider configured under Settings → AI.

## Acceptance Criteria

- **AC-1** — Given the Knowledge Base view is open and the AI provider is available, when the user
  types a question in the KB Chat panel and sends it, then a run starts with feature `kb-chat`, the
  answer streamed by the (scripted) model appears in the panel as an assistant message, and the
  input is enabled again after `ai:done`.
- **AC-2** — Given the knowledge server's MCP endpoint is reachable and exposes
  `searchKnowledgeBase`, `readKnowledgeBase`, `getKnowledgeBaseOverview` and `searchOrders`, when a
  KB chat run is built, then the tool set contains exactly the three KB tools (no `searchOrders`,
  no other non-KB tools), and a tool call made by the model reaches the MCP server's `tools/call`.
- **AC-3** — Given the knowledge server's MCP endpoint is unreachable, when the user sends a
  question, then the run still completes using local KB search and read-document tools. The local
  read tool returns the content of a KB document by path and refuses a path outside the KB root.
  The panel shows a "knowledge server unavailable — using local search" notice.
- **AC-4** — Given a KB chat run in which a tool returned or read KB documents, when the answer is
  shown, then the panel lists each such document once as a source link. Clicking a link opens that
  document in the KB document viewer.
- **AC-5** — Given a document is open in the KB document viewer, when the user clicks "Summarise
  this document", then a KB chat run starts whose prompt names that document's path, and the
  model's summary appears in the panel.
- **AC-6** — Given the panel already holds at least one question and answer, when the user sends a
  follow-up, then the run's messages include the earlier turns in order, bounded to the last 10
  turns. After Clear, the next run contains only the new question.
- **AC-7** — Given the AI provider is not configured, when the KB Chat panel is shown, then its
  input and send button are disabled, it shows a hint pointing to Settings → AI, and no run is
  started.
- **AC-8** — Given a KB chat run is in progress, when the provider fails or the user presses Stop,
  then the panel shows the error (or stops streaming), the run ends with `ai:done`, the input is
  enabled again, and a completed run is recorded once in the usage log with feature `kb-chat`.

## Impact

| Area | Impact |
|---|---|
| Modules | developer-cockpit, plus a docs update in oms-knowledge-base |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | none. Adds one optional cockpit config field, `ai.knowledgeServerUrl`, with a default |
| Events / Kafka topics | none. Reuses the cockpit's in-process `ai:*` WebSocket events |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-mcp-server is called through its existing KB tools, with no change. The AI Assistant view is unchanged |
| Knowledge base | `tools/developer-cockpit.md` (new KB Chat section); possibly `capabilities/use-cases/UC-016-browse-knowledge.md` |

## Open Questions

- [resolved] Should the KB chat expose all tools of the knowledge server, or only the KB ones? →
  assumption: only the read-only KB tools. The chat's purpose is the knowledge base, and leaving out
  `searchOrders` keeps it from reaching order data. This is easy to widen later.
- [resolved] How does the cockpit find the knowledge server? → assumption: a new setting,
  `ai.knowledgeServerUrl`, defaulting to `http://localhost:8091/mcp` (the URL `.mcp.json` uses).
  The existing `ai.mcpServers` list stays for the Assistant.
- [resolved] What happens when the knowledge server is down? → assumption: the chat falls back to
  local KB search and read tools, so it keeps working offline, and the panel says so (AC-3).
- [resolved] Should chat history persist? → assumption: no, it lasts for the session only (out of
  scope). This is reversible.
- [resolved] Where does the chat live, in the KB view or as a separate view? → assumption: a
  collapsible panel in the Knowledge Base view, so that source links and "Summarise this document"
  work with the open document.
