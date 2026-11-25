# Tasks — SPEC-0075: Add outbox and dead-letter screens to oms-ui

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

- [x] **T-1** Contract: add the five `Admin` paths and the schemas (`OutboxState`, `OutboxSummaryDto`, `OutboxMessageDto`, `OutboxMessageDetailDto`, `PagedOutboxMessageDto`, `DeadLetterTopicDto`, `DeadLetterRecordDto`) to oms-query-api.yml (v2.7.0); regenerate the contracts and oms-core's API interfaces (AC-1, AC-2, AC-3, AC-5, AC-6, AC-7, AC-9)
  - files: oms-contracts/src/main/openapi/oms-query-api.yml
  - verify: `cd oms-contracts && ./gradlew build` passes, and `cd oms-core && ./gradlew openApiGenerateQuery compileJava` generates `AdminApi` and compiles
- [x] **T-2** Write the failing `OutboxInspectorIntegrationTest` (states like the relay, summary vs the gauges, state filter and paging, detail of payload and pointer rows, unknown id), then implement `OutboxInspector` (AC-1, AC-2, AC-3, AC-5)
  - files: oms-core/src/test/java/org/example/oms/integration/OutboxInspectorIntegrationTest.java, oms-core/src/main/java/org/example/oms/admin/OutboxInspector.java
  - verify: `cd oms-core && ./gradlew test --tests '*OutboxInspectorIntegrationTest'` passes
- [x] **T-3** Write the failing `DeadLetterReaderTest` (unreachable broker within the bound) and `DeadLetterReaderIntegrationTest` (topics with counts; records with failure details and AVRO, TEXT or BINARY payloads, newest first, limit; idempotent reads with no group commit), then implement `DeadLetterReader` and `DeadLetterUnavailableException` (AC-6, AC-7, AC-8, AC-9)
  - files: oms-core/src/test/java/org/example/oms/admin/DeadLetterReaderTest.java, oms-core/src/test/java/org/example/oms/integration/DeadLetterReaderIntegrationTest.java, oms-core/src/main/java/org/example/oms/admin/DeadLetterReader.java, oms-core/src/main/java/org/example/oms/admin/DeadLetterUnavailableException.java
  - verify: `cd oms-core && ./gradlew test --tests '*DeadLetterReaderTest' --tests '*DeadLetterReaderIntegrationTest'` passes
- [x] **T-4** Write the failing `AdminControllerWebMvcTest` (the delegations, 400 for an invalid state, page, size, limit or a non-DLT topic, 404, 503 problem), then implement `AdminController`, `AdminDtoMapper` and the `GlobalExceptionHandler` mappings (AC-3, AC-5, AC-9)
  - files: oms-core/src/test/java/org/example/oms/api/AdminControllerWebMvcTest.java, oms-core/src/main/java/org/example/oms/api/AdminController.java, oms-core/src/main/java/org/example/oms/mapper/AdminDtoMapper.java, oms-core/src/main/java/org/example/oms/api/GlobalExceptionHandler.java
  - verify: `cd oms-core && ./gradlew test --tests '*AdminControllerWebMvcTest'` passes
- [x] **T-5** oms-ui: failing `OMSApiService.test.ts` cases for the five endpoints, then the types and service methods (AC-1, AC-3, AC-5, AC-6, AC-7)
  - files: oms-ui/frontend/src/services/OMSApiService.test.ts, oms-ui/frontend/src/services/OMSApiService.ts, oms-ui/frontend/src/types/types.ts
  - verify: `cd oms-ui/frontend && npm test -- --watchAll=false src/services/OMSApiService.test.ts` passes
- [x] **T-6** Write the failing `OutboxView.test.tsx` (summary, filter, paging, empty state, detail with payload or pointer, error and Retry, Refresh), then implement `OutboxView` and its styles (AC-1, AC-3, AC-4, AC-5)
  - files: oms-ui/frontend/src/components/OutboxView.test.tsx, oms-ui/frontend/src/components/OutboxView.tsx, oms-ui/frontend/src/components/OutboxView.scss
  - verify: `cd oms-ui/frontend && npm test -- --watchAll=false src/components/OutboxView.test.tsx` passes
- [x] **T-7** Write the failing `DeadLetterView.test.tsx` (topics with counts, records of a topic, record detail with payload and headers, error and Retry, empty states, Refresh), then implement `DeadLetterView` and its styles (AC-6, AC-7, AC-9, AC-10)
  - files: oms-ui/frontend/src/components/DeadLetterView.test.tsx, oms-ui/frontend/src/components/DeadLetterView.tsx, oms-ui/frontend/src/components/DeadLetterView.scss
  - verify: `cd oms-ui/frontend && npm test -- --watchAll=false src/components/DeadLetterView.test.tsx` passes
- [x] **T-8** Write a failing App test (the Outbox and Dead letters tabs, mounted on demand; the Outbox tab works while dead letters fail), then add the tabs to `App.tsx` (AC-9)
  - files: oms-ui/frontend/src/App.operations.test.tsx, oms-ui/frontend/src/App.tsx
  - verify: `cd oms-ui/frontend && npm test -- --watchAll=false src/App` passes
- [x] **T-9** Knowledge base: outbox-message, FR-024, event-publication, event-streaming, ui/admin-ui and the query API reference (AC-11)
  - files: oms-knowledge-base/domain/model/outbox-message.md, oms-knowledge-base/capabilities/functional-requirements/FR-024-retry-failed-publication.md, oms-knowledge-base/capabilities/event-publication.md, oms-knowledge-base/architecture/concepts/event-streaming.md, oms-knowledge-base/ui/admin-ui.md, oms-knowledge-base/domain/interfaces/query-api.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports no errors
- [x] **T-11** Review fixes:
  - **Registry decoding bounded:** client timeouts and the request deadline.
  - **`AdminNotFoundException`** instead of a global `NoSuchElementException` 404.
  - **The inspector's detail race** answers 404.
  - **Outbox table:** an Exec column and the message type.
  - **A stale-detail guard.**
  - **Tests:** `Decoder` branches; exact original offsets and the exception class.
  - **Docs:** a note on `oms.outbox.pending`.

  (AC-2, AC-5, AC-7, AC-9, AC-11)
  - files: oms-core/src/main/java/org/example/oms/admin/{DeadLetterReader,OutboxInspector,AdminNotFoundException}.java, oms-core/src/main/java/org/example/oms/api/{AdminController,GlobalExceptionHandler}.java, oms-core/src/test/java/org/example/oms/{admin/DeadLetterReaderTest,api/AdminControllerWebMvcTest,integration/DeadLetterReaderIntegrationTest}.java, oms-ui/frontend/src/components/OutboxView.{tsx,scss,test.tsx}, oms-knowledge-base/domain/model/outbox-message.md, oms-knowledge-base/domain/interfaces/query-api.md
  - verify: the backend admin tests and `npm test` in oms-ui/frontend pass

- [x] **T-10** Run spec verify (all ACs)
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0075` exits 0

## Notes

<!-- Optional: sequencing constraints, tasks added during implementation and why. -->
- **Added in T-2:** `AvroJson` and `AvroJsonTest` (design, Changed during implementation).
- **T-9:** `architecture/patterns/kafka-messaging.md` instead of `architecture/concepts/event-streaming.md` (design).
- **SPEC-0074's files** (`JsonTree.tsx`, `FieldValue.tsx`, `OrderHistory.tsx`), uncommitted in the same tree, are used by the new views. Commit SPEC-0074 first or together.
