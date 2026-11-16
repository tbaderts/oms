# Tasks — SPEC-0065: Show chat source details and run trace

> **Stage 3 of 3 — the executable plan.** The implement stage works top to bottom and ticks each
> box only when its `verify:` check passes. Keep tasks small (one focused change, about one
> red→green cycle) and in dependency order:
>
> 1. Contracts (oms-contracts) and regeneration
> 2. Migration (new Liquibase changelog)
> 3. Behaviour, one task per AC or slice: write the failing test, implement, make it green
> 4. Wiring: API, messaging, configuration
> 5. Observability (logs, metrics)
> 6. Knowledge base and docs
> 7. Full verification (`spec verify`)
>
> Format, which the gate parses:
>
> ```
> - [ ] **T-1** Imperative summary (AC-1, AC-2)
>   - files: path/one.java, path/two.yaml
>   - verify: `./gradlew test --tests 'org.example.oms…SomeTest'` passes
> ```
>
> Every AC must be covered by at least one task, and every task needs a `verify:` line. Tasks may
> be added during implementation; record why under Notes.

## Tasks

- [x] **T-1** Knowledge server: append the score and keyword/semantic ranks to each search hit, test first (AC-4)
  - files: oms-mcp-server/src/test/java/org/example/mcp/kb/KnowledgeBaseToolsTest.java, oms-mcp-server/src/main/java/org/example/mcp/kb/KnowledgeBaseTools.java
  - verify: `cd oms-mcp-server && ./gradlew test --tests 'org.example.mcp.kb.KnowledgeBaseToolsTest'` passes, including the new `searchHitsShowScoreAndRanks`
- [x] **T-2** Local search: add `score` to each `search_knowledge_base` result, test first (AC-2, AC-4)
  - files: developer-cockpit/test/main/McpToolRegistry.test.ts, developer-cockpit/src/main/ai/McpToolRegistry.ts, developer-cockpit/src/shared/types/ai.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/McpToolRegistry.test.ts` passes
- [x] **T-3** Parser `kbChatTrace.ts`: server and local search hits, reads, `sourceDetails` and `summarise`, test first (AC-1, AC-2, AC-3, AC-5)
  - files: developer-cockpit/test/renderer/kbChatTrace.test.ts, developer-cockpit/src/renderer/lib/kbChatTrace.ts
  - verify: `cd developer-cockpit && npx vitest run test/renderer/kbChatTrace.test.ts` passes
- [x] **T-4** Store: keep a trace per assistant turn (steps, model, usage, outcome, times), test first (AC-5, AC-6, AC-7)
  - files: developer-cockpit/test/renderer/kbChatStore.test.ts, developer-cockpit/src/renderer/stores/kbChat.ts
  - verify: `cd developer-cockpit && npx vitest run test/renderer/kbChatStore.test.ts test/renderer/kbChatSources.test.ts` passes, with the existing tests unedited
- [x] **T-5** UI: `KbChatDetails.tsx` (Source details, Run details) under each answer, closed by default, test first (AC-1, AC-2, AC-5, AC-6, AC-7, AC-8)
  - files: developer-cockpit/test/renderer/KbChatPanel.test.tsx, developer-cockpit/src/renderer/views/knowledge-base/KbChatDetails.tsx, developer-cockpit/src/renderer/views/knowledge-base/KbChatPanel.tsx
  - verify: `cd developer-cockpit && npx vitest run test/renderer/KbChatPanel.test.tsx` passes, with the SPEC-0062 tests unedited
- [x] **T-6** Knowledge base: document the details sections and the score in the search output; add a log entry (AC-9)
  - files: oms-knowledge-base/tools/developer-cockpit.md, oms-knowledge-base/tools/knowledge-server.md, oms-knowledge-base/log.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports 0 errors
- [x] **T-7** Run spec verify (AC-9)
  - verify: `node specs/tools/spec.mjs verify SPEC-0065` exits 0
- [x] **T-8** Knowledge server: the KB tools return plain text through `PlainTextResultConverter`, test first (AC-10)
  - files: oms-mcp-server/src/test/java/org/example/mcp/kb/PlainTextResultConverterTest.java, oms-mcp-server/src/main/java/org/example/mcp/kb/PlainTextResultConverter.java, oms-mcp-server/src/main/java/org/example/mcp/kb/KnowledgeBaseTools.java
  - verify: `cd oms-mcp-server && ./gradlew test --tests 'org.example.mcp.kb.*'` passes
- [x] **T-9** Cockpit: `decodeToolText` in `shared/mcpText.ts`, used by `wrapMcpTool` and `parseServerSearch`, test first (AC-10)
  - files: developer-cockpit/test/shared/mcpText.test.ts, developer-cockpit/src/shared/mcpText.ts, developer-cockpit/test/main/McpToolRegistry.test.ts, developer-cockpit/src/main/ai/McpToolRegistry.ts, developer-cockpit/src/renderer/lib/kbChatTrace.ts
  - verify: `cd developer-cockpit && npx vitest run test/shared/mcpText.test.ts test/main/McpToolRegistry.test.ts test/renderer/kbChatTrace.test.ts` passes
- [x] **T-10** UI: details in the Sources list (`SourceEntry`), the separate section removed, test first (AC-1, AC-2, AC-3, AC-8, AC-10)
  - files: developer-cockpit/test/renderer/KbChatPanel.test.tsx, developer-cockpit/src/renderer/views/knowledge-base/KbChatDetails.tsx, developer-cockpit/src/renderer/views/knowledge-base/KbChatPanel.tsx
  - verify: `cd developer-cockpit && npx vitest run test/renderer/KbChatPanel.test.tsx` passes, with the SPEC-0062 tests unedited
- [x] **T-11** Knowledge base: the inline source details and the plain-text tool output (AC-9)
  - files: oms-knowledge-base/tools/developer-cockpit.md, oms-knowledge-base/tools/knowledge-server.md, oms-knowledge-base/log.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports 0 errors
- [x] **T-12** Run spec verify (AC-9)
  - verify: `node specs/tools/spec.mjs verify SPEC-0065` exits 0

## Notes

T-1 (server) and T-2 to T-5 (cockpit) are independent. T-5 needs T-3 and T-4.

T-8 to T-12 were added after the requester tried the first version and the proposal was amended
and re-approved (2026-11-16): JSON-encoded tool text, and the details moved into the Sources list.
