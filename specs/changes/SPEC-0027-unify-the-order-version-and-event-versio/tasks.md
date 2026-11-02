# Tasks — SPEC-0027: Unify the order version and event version

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

Shortcut used in `verify:` lines: `gt <Class>` = `cd oms-core && ./gradlew test --tests '*<Class>'`.

- [x] **T-1** Write `UnifiedOrderVersionMigrationIntegrationTest#migrationSetsTxNrToTheLatestEventVersion` red, then add `010-unify-order-version.yaml` (021 tag, 022 update) and include it (AC-4)
  - files: oms-core/src/test/java/org/example/oms/integration/UnifiedOrderVersionMigrationIntegrationTest.java, oms-core/src/main/resources/db/changelog/010-unify-order-version.yaml, oms-core/src/main/resources/db/changelog/db.changelog-master.yaml
  - verify: `gt UnifiedOrderVersionMigrationIntegrationTest` passes
- [x] **T-2** Write `OrderEventAppenderTest` (`appendsTheOrdersNextVersionWithoutQuerying`, `versionConflictBecomesOptimisticLockingFailure`, `otherConstraintViolationsPropagate`) red. Then: drop `@Version` from `Order#txNr` and add a setter; the appender uses `txNr + 1`, `saveAndFlush`es the event and translates the version conflict; delete `findMaxVersionByOrderId` (AC-2, AC-3)
  - files: oms-core/src/test/java/org/example/oms/service/OrderEventAppenderTest.java, oms-core/src/main/java/org/example/common/model/Order.java, oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java, oms-core/src/main/java/org/example/oms/repository/OrderEventRepository.java
  - verify: `gt OrderEventAppenderTest` passes, and `gt OrderLifecycleCommandProcessorTest` and `gt CommandControllerWebMvcTest` still pass
- [x] **T-3** Write `OrderReplayServiceTest#replaySetsTheVersionFromTheEvent` red, then set the snapshot's `txNr` from the event in `replayAt` (AC-6)
  - files: oms-core/src/test/java/org/example/oms/service/OrderReplayServiceTest.java, oms-core/src/main/java/org/example/oms/service/OrderReplayService.java
  - verify: `gt OrderReplayServiceTest` passes
- [x] **T-4** Write `OrderVersionIntegrationTest` (`txNrIsTheLatestEventVersionAfterEveryCommand`, `concurrentWritersAppliedOnceThenRetried`, `queryApiReportsTxNrEqualToEventVersion`, `replayMatchesTheStoredOrderIncludingVersion`); fix what it shows. Then fill `eventVersion` from the row in `OrderQueryService` and delete `findLatestVersions`/`OrderVersion` (AC-1, AC-3, AC-5, AC-6)
  - files: oms-core/src/test/java/org/example/oms/integration/OrderVersionIntegrationTest.java, oms-core/src/main/java/org/example/oms/service/OrderQueryService.java, oms-core/src/main/java/org/example/oms/repository/OrderEventRepository.java
  - verify: `gt OrderVersionIntegrationTest` passes; `gt ExchangeWorkflowIntegrationTest`, `gt EventSourcingIntegrationTest`, `gt OrderLifecycleIntegrationTest` and `gt ProjectionIntegrationTest` pass
- [x] **T-4b** (added during implementation) Write `OrderVersionIntegrationTest#fillConflictingWithAConcurrentWriterIsRethrownNotRefused` and `PipelineResultsTest` red, then add `PipelineResults.rethrowConcurrencyConflict` (unwraps causes) and call it from `ExecutionCommandProcessor` and `OrderLifecycleCommandProcessor` (AC-3)
  - files: oms-core/src/test/java/org/example/oms/integration/OrderVersionIntegrationTest.java, oms-core/src/test/java/org/example/oms/service/PipelineResultsTest.java, oms-core/src/main/java/org/example/oms/service/PipelineResults.java, oms-core/src/main/java/org/example/oms/service/execution/ExecutionCommandProcessor.java, oms-core/src/main/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessor.java
  - verify: `gt OrderVersionIntegrationTest`, `gt PipelineResultsTest` and `gt OrderLifecycleCommandProcessorTest` pass
- [x] **T-5** Update comments and the knowledge base: the `OutboxMessage.aggregateVersion` Javadoc, the `SaveOrderTask` Javadoc; `domain/order.md`, `capabilities/event-sourcing-and-replay.md`, `interfaces/query-api.md`, `domain/outbox-message.md`, and `architecture/event-sourcing.md` if it applies (AC-1, AC-5)
  - files: oms-core/src/main/java/org/example/oms/model/OutboxMessage.java, oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/SaveOrderTask.java, oms-knowledge-base/domain/order.md, oms-knowledge-base/capabilities/event-sourcing-and-replay.md, oms-knowledge-base/interfaces/query-api.md, oms-knowledge-base/domain/outbox-message.md, oms-knowledge-base/architecture/event-sourcing.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports 0 errors
- [x] **T-6** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0027` exits 0

- [x] **T-7** Review fixes, test first. Tests: `PipelineResultsTest#lockFailureWrappedByATaskIsRethrown`, `CommandControllerWebMvcTest#lifecycleCommand_lockFailure_returns409Retryable`, `OrderVersionIntegrationTest#concurrentFillsThroughThePipelineOneWaitsThenFails` and `#kafkaFillRetriedAfterAConflict`, and a gapped log in `UnifiedOrderVersionMigrationIntegrationTest`. Then: `PipelineResults.rethrowConcurrencyFailure` (any `ConcurrencyFailureException`), the 409 handler on `ConcurrencyFailureException`, the constraint name from Hibernate in the appender, the upgrade rule (changelog comment, `domain/order.md`), `oms-core/docs/architecture-specification.md`, NFR-002 and `error-handling.md` (AC-3, AC-4)
  - files: oms-core/src/main/java/org/example/oms/service/PipelineResults.java, oms-core/src/main/java/org/example/oms/api/GlobalExceptionHandler.java, oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java, oms-core/src/main/java/org/example/oms/service/execution/ExecutionCommandProcessor.java, oms-core/src/main/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessor.java, oms-core/src/main/resources/db/changelog/010-unify-order-version.yaml, oms-core/src/test/java (the tests named), oms-core/docs/architecture-specification.md, oms-knowledge-base/domain/order.md, oms-knowledge-base/non-functional-requirements/NFR-002-optimistic-concurrency.md, oms-knowledge-base/oms-framework/error-handling.md
  - verify: the named tests pass; then `node specs/tools/spec.mjs verify SPEC-0027` exits 0

## Notes

- T-4b was added when implementing showed that a conflict raised inside the fill pipeline came back as a refusal (400, or a Kafka acknowledgement that loses the fill); design.md records the change.

- T-2 changes how a conflict is detected for every command path; the full oms-core suite in T-6 is
  the regression check.
- T-1's last assertion (the row's txNr after appending) only passes with the appender of T-2; both were verified after T-2.
- T-4 also replaced `QuerySearchIsolationIntegrationTest` (SPEC-0018: the version and the order read in one REPEATABLE_READ snapshot) with `QuerySearchVersionIntegrationTest`. The version now comes from the order row in the same read, so the isolation it pinned is no longer needed; the new test asserts the event log is not queried and `eventVersion` equals `txNr` (AC-5).
- The first verify (T-6) failed two tests on shared test data, each fixed in the test. (1) `CommandListenerKafkaIntegrationTest` recreates its order at version 0 before each test; its earlier events now have to go too, or the next accept conflicts with version 1. (2) `ProjectionRebuildIntegrationTest` rebuilds from every fill event in the shared database; the race test now appends non-fill events (`text` changes), and the conflict test deletes its planted event.
