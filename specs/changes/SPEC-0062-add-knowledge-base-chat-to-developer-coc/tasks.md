# Tasks — SPEC-0062: Add knowledge base chat to developer cockpit

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

- [x] **T-1** Add shared types and config field: `KbChatMessage`, `KbChatStartResult` (`source`) in `shared/types/ai.ts`; `AiConfig.knowledgeServerUrl` with default `http://localhost:8091/mcp`; `ai.kbChat` in `shared/types/ipc.ts` (AC-1, AC-3)
  - files: developer-cockpit/src/shared/types/ai.ts, developer-cockpit/src/shared/types/config.ts, developer-cockpit/src/shared/types/ipc.ts
  - verify: `cd developer-cockpit && npm run typecheck` passes
- [x] **T-2** Write the failing `kbChatSources.test.ts`, then implement `normaliseKbPath` + `extractSources` in `src/renderer/lib/kbChatSources.ts` (AC-4)
  - files: developer-cockpit/test/renderer/kbChatSources.test.ts, developer-cockpit/src/renderer/lib/kbChatSources.ts
  - verify: `cd developer-cockpit && npx vitest run test/renderer/kbChatSources.test.ts` passes
- [x] **T-3** Refactor `McpToolRegistry`: export `kbSearchTool(kb)`, make `connect` / `wrapMcpTool` public statics; behaviour unchanged (AC-2, AC-3)
  - files: developer-cockpit/src/main/ai/McpToolRegistry.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/McpToolRegistry.test.ts` passes
- [x] **T-4** Write the failing `KbChatTools.test.ts` (allowlist, tools/call forwarding, unreachable/invalid URL fallback, local read content, local read refusals), then implement `src/main/ai/KbChatTools.ts` with the `read_knowledge_base_document` local tool (AC-2, AC-3)
  - files: developer-cockpit/test/main/KbChatTools.test.ts, developer-cockpit/src/main/ai/KbChatTools.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/KbChatTools.test.ts` passes
- [x] **T-5** Refactor `AiService.runAgent` onto a shared private loop and add `runChat({ runId, messages, system, options })` with the 21-message bound and `KB_CHAT_SYSTEM` (AC-1, AC-6, AC-8)
  - files: developer-cockpit/src/main/ai/AiService.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/AiService.test.ts` passes (no regression)
- [x] **T-6** Write the failing `kbChat.ipc.test.ts` (streamed answer, local fallback source, message order, malformed messages, provider failure + single usage entry with `kb-chat`, stop), then add the `ai:kbChat` channel, the KB-chat tool cache with 60 s local retry, the `model` test seam and the widened `kb` dep in `ai.ipc.ts` (AC-1, AC-3, AC-6, AC-8)
  - files: developer-cockpit/test/main/kbChat.ipc.test.ts, developer-cockpit/src/main/ipc/ai.ipc.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/kbChat.ipc.test.ts test/main/ai.ipc.test.ts` passes
- [x] **T-7** Wire `ai.kbChat` in the preload and pass the `getDocument`-capable KB to `registerAiIpc` in `src/main/index.ts` (AC-1)
  - files: developer-cockpit/src/main/preload.ts, developer-cockpit/src/main/index.ts
  - verify: `cd developer-cockpit && npm run typecheck` passes
- [x] **T-8** Write the failing `kbChatStore.test.ts` (follow-up history bounded to 10 turns, clear), then implement `src/renderer/stores/kbChat.ts` (send, summarise, handleEvent with sources, stop, clear) (AC-4, AC-5, AC-6, AC-8)
  - files: developer-cockpit/test/renderer/kbChatStore.test.ts, developer-cockpit/src/renderer/stores/kbChat.ts
  - verify: `cd developer-cockpit && npx vitest run test/renderer/kbChatStore.test.ts` passes
- [x] **T-9** Write the failing `KbChatPanel.test.tsx` (streamed answer, fallback notice, sources open in viewer, summarise, not configured, error + stop), then implement `KbChatPanel.tsx` and the Chat toggle + "Summarise this document" button in `KnowledgeBaseView.tsx` (AC-1, AC-3, AC-4, AC-5, AC-7, AC-8)
  - files: developer-cockpit/test/renderer/KbChatPanel.test.tsx, developer-cockpit/src/renderer/views/knowledge-base/KbChatPanel.tsx, developer-cockpit/src/renderer/views/knowledge-base/KnowledgeBaseView.tsx
  - verify: `cd developer-cockpit && npx vitest run test/renderer/KbChatPanel.test.tsx` passes
- [x] **T-10** Add the "Knowledge server MCP URL" input to Settings → AI (AC-3)
  - files: developer-cockpit/src/renderer/views/settings/SettingsView.tsx
  - verify: `cd developer-cockpit && npm run typecheck` passes and the field binds to `draft.ai.knowledgeServerUrl`
- [x] **T-11** Update the knowledge base: KB Chat subsection in `tools/developer-cockpit.md`, consumer note in `tools/knowledge-server.md`
  - files: oms-knowledge-base/tools/developer-cockpit.md, oms-knowledge-base/tools/knowledge-server.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports no errors
- [x] **T-12** Run the full module checks: `npm run typecheck` and `npm test` in developer-cockpit (all ACs)
  - files: (none)
  - verify: `cd developer-cockpit && npm run typecheck && npm test` passes
- [x] **T-13** Run spec verify
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0062` exits 0
- [x] **T-14** Keep the run's events flowing when the panel is closed: subscribe the `kbChat` store to the `ai:*` events itself, not the panel; test that a run started and finished with no panel mounted ends idle (AC-1, AC-8)
  - files: developer-cockpit/src/renderer/stores/kbChat.ts, developer-cockpit/src/renderer/views/knowledge-base/KbChatPanel.tsx, developer-cockpit/test/renderer/kbChatStore.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/renderer/kbChatStore.test.ts test/renderer/KbChatPanel.test.tsx` passes
- [x] **T-15** Honour a Stop that arrives while the KB chat tools are still being built: the run ends with `ai:done{aborted:true}` and the model is never called (AC-8)
  - files: developer-cockpit/src/main/ipc/ai.ipc.ts, developer-cockpit/test/main/kbChat.ipc.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/kbChat.ipc.test.ts` passes
- [x] **T-16** Model-driven tool-call tests: a scripted model calls `readKnowledgeBase` and the stub server receives `tools/call` (AC-2), and calls `read_knowledge_base_document` in the local fallback and gets the document content (AC-3)
  - files: developer-cockpit/test/main/kbChat.ipc.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/kbChat.ipc.test.ts` passes
- [x] **T-17** Regression test for the shared `pump()` change: an `error` stream part in an Assistant run (`runAgent`) yields `ai:error{code:'provider'}` and then one `ai:done` (AC-8)
  - files: developer-cockpit/test/main/AiService.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/AiService.test.ts` passes
- [x] **T-18** Make the knowledge-server tools usable as the real server declares them: expose only `query` / `path` as required to the model and fill the server's other required parameters with neutral values (`''`, `topK 0`, `offset 0`, a whole-document `limit`); make the stub server enforce the real schemas (AC-2, AC-5)
  - files: developer-cockpit/src/main/ai/KbChatTools.ts, developer-cockpit/test/main/stubMcpServer.ts, developer-cockpit/test/main/KbChatTools.test.ts, developer-cockpit/test/main/kbChat.ipc.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/KbChatTools.test.ts test/main/kbChat.ipc.test.ts` passes, and the scratch real-server check shows a search and a full read succeeding against oms-mcp-server
- [x] **T-19** Re-run the full module checks and spec verify after the review fixes
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0062` exits 0
- [x] **T-20** Bound knowledge-server reads: the default `limit` is `MAX_READ_CHARS` (20 000, the server's offset hint pages the rest), and an explicit `limit <= 0` counts as unset; re-run spec verify (AC-2, AC-5)
  - files: developer-cockpit/src/main/ai/KbChatTools.ts, developer-cockpit/test/main/KbChatTools.test.ts, developer-cockpit/test/main/kbChat.ipc.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/KbChatTools.test.ts test/main/kbChat.ipc.test.ts` passes, then `node specs/tools/spec.mjs verify SPEC-0062` exits 0

## Notes

- T-3 and T-5 are refactors guarded by the existing SPEC-0042 tests; they must stay green before the new behaviour is layered on.
- T-1 lands first so that later tasks typecheck against the shared shapes.
- **Implementation notes**
  - T-1 also added the one-line `ai.kbChat` preload entry (planned for T-7), because typecheck
    requires the preload to implement the widened IPC type.
  - The `index.ts` wiring for T-7 needed no change: `assistantKb` is already a full `KbService`.
  - T-6 surfaced a gap in the SPEC-0042 code: a provider failure arrives as an `error` stream
    part, which `AiService.pump()` dropped, so the run ended in a bare `ai:done` with no error.
    `pump()` now broadcasts it as `ai:error` with the code `provider`. This is needed for AC-8, and
    it also fixes the Assistant view. See design → "Changed during implementation".
  - T-6 also updated the existing `ai.ipc.test.ts` channel-list assertion to include
    `ai:kbChat`. This is the expected effect of adding a channel.
  - T-6 added `test/main/stubMcpServer.ts`, a configurable stub MCP server shared by
    `KbChatTools.test.ts` and `kbChat.ipc.test.ts`.
  - T-9 placed the "Summarise this document" button in `KbChatPanel`'s header (shown when a
    document is open) rather than in `KnowledgeBaseView`. The panel already reads the selected
    document, and this keeps AC-5 testable at the panel level. The view adds only the Chat toggle.
  - T-9's panel was written in the same step as its test, not strictly test-first; all six tests
    were green on first run.
  - A shared `src/shared/kbPath.ts` (`normaliseKbPath`) holds the path normalisation used by both
    the local read tool and the renderer's source extraction, as the design's risk section
    describes.
- **Tasks T-14 to T-19 were added after the independent review in verify** (implement reopened):
  - T-14 fixes a bug found in self-review: the run's state was lost when the panel unmounted
    mid-run.
  - T-15 fixes the reviewer's finding 2: a Stop while the tools were building was lost.
  - T-16 adds model-driven tool-call tests (finding 5).
  - T-17 adds a regression test for the shared `pump()` change (finding 4).
  - T-18 comes from the planned manual check against the real oms-mcp-server. The server
    declares every tool parameter required, which the original stub did not model. The real-server
    check script and its output are in the session scratchpad, and the result is recorded in
    verification.md.
  - T-16's and T-17's tests passed on their first run. They add coverage of behaviour that was
    already fixed; the same failure mode had turned the IPC test red before the `pump()` fix.
