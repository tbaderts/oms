# Tasks — SPEC-0044: Record execution lifecycle in the order event log

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

- [x] **T-1** Add the `execId` query parameter to `getOrderEvents` and `EXEC_BUST`, `EXEC_CORRECT`, `EXEC_WHACK` to `OrderEventType`; regenerate (AC-10)
  - files: oms-contracts/src/main/openapi/oms-query-api.yml
  - verify: `cd oms-contracts && ./gradlew build` passes, and after `cd oms-core && ./gradlew openApiGenerateQuery` the generated `OrdersApi.getOrderEvents` takes `(String orderId, String execId)`
- [x] **T-2** Add `Event.EXEC_BUST/EXEC_CORRECT/EXEC_WHACK` and pass `execId` through `OrderEventController` to `OrderEventReadService` so oms-core compiles against the new contract (AC-10)
  - files: oms-core/src/main/java/org/example/oms/model/Event.java, oms-core/src/main/java/org/example/oms/api/OrderEventController.java, oms-core/src/main/java/org/example/oms/service/OrderEventReadService.java
  - verify: `cd oms-core && ./gradlew compileJava compileTestJava` passes
- [x] **T-3** Write `ExecutionLifecycleMigrationIntegrationTest#legacyFillsAreBackfilled` (red), then add `011-execution-lifecycle.yaml` to the master changelog: changesets 023 (tag), 024 (`order_events.exec_id`) and 025 (executions columns), with backfills, indexes and rollbacks. Add the matching fields on `OrderEvent` and `Execution` and the new `ExecutionStatus` enum (AC-1)
  - files: oms-core/src/main/resources/db/changelog/011-execution-lifecycle.yaml, oms-core/src/main/resources/db/changelog/db.changelog-master.yaml, oms-core/src/main/java/org/example/common/model/ExecutionStatus.java, oms-core/src/main/java/org/example/common/model/Execution.java, oms-core/src/main/java/org/example/oms/model/OrderEvent.java, oms-core/src/test/java/org/example/oms/integration/ExecutionLifecycleMigrationIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ExecutionLifecycleMigrationIntegrationTest' --tests 'org.example.oms.integration.LiquibaseMigrationIntegrationTest'` passes
- [x] **T-4** Add `FILLED → LIVE` to the product order machine and the new `ExecutionStatusMachineConfig`, tests first (AC-7)
  - files: oms-core/src/main/java/org/example/common/state/OrderStateMachineConfig.java, oms-core/src/main/java/org/example/common/state/ExecutionStatusMachineConfig.java, oms-core/src/test/java/org/example/common/state/OrderStateMachineConfigTest.java, oms-core/src/test/java/org/example/common/state/ExecutionStatusMachineConfigTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.common.state.*'` passes
- [x] **T-4a** Refuse an ACK on a FILLED order in `OrderAcceptCommandProcessor`, test first, so `FILLED → LIVE` stays reserved for a bust (AC-7)
  - files: oms-core/src/main/java/org/example/oms/service/command/OrderAcceptCommandProcessor.java, oms-core/src/test/java/org/example/oms/service/command/OrderAcceptCommandProcessorTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.command.OrderAcceptCommandProcessorTest'` passes
- [x] **T-5** Add `CancelStateMachineConfig`, with an internal `Node` enum that includes NONE, and make `ValidateLifecycleActionTask` consult it. Tests first: `CancelStateMachineConfigTest`, and `ValidateLifecycleActionTaskTest#cancelRulesMatchThePreviousPreconditions` with expected values from the old expressions (AC-11)
  - files: oms-core/src/main/java/org/example/common/state/CancelStateMachineConfig.java, oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/ValidateLifecycleActionTask.java, oms-core/src/test/java/org/example/common/state/CancelStateMachineConfigTest.java, oms-core/src/test/java/org/example/oms/service/lifecycle/tasks/ValidateLifecycleActionTaskTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.common.state.CancelStateMachineConfigTest' --tests 'org.example.oms.service.lifecycle.*' --tests 'org.example.oms.integration.OrderLifecycleIntegrationTest'` passes
- [x] **T-6** Write `ExecutionLifecycleIntegrationTest#fillRecordsExecIdStatusVersionAndRoot` (red). Set `exec_id` on fill events and call `Execution.recordApplied(version, rootOrderId)` in `appendExecutionEvent` (AC-2)
  - files: oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java, oms-core/src/main/java/org/example/common/model/Execution.java, oms-core/src/test/java/org/example/oms/integration/ExecutionLifecycleIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ExecutionLifecycleIntegrationTest.fillRecordsExecIdStatusVersionAndRoot' --tests 'org.example.oms.service.OrderEventAppenderTest' --tests 'org.example.oms.integration.EventSourcingIntegrationTest'` passes
- [x] **T-7** Write the bust, correction and whack tests (red). Then add `appendExecutionLifecycleEvent` with `ExecutionLifecycleEffect`, `ExecutionRepository.findByOrderIdAndExecId` and `Execution.recordReversal` (AC-3, AC-4)
  - files: oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java, oms-core/src/main/java/org/example/oms/service/ExecutionLifecycleEffect.java, oms-core/src/main/java/org/example/oms/repository/ExecutionRepository.java, oms-core/src/main/java/org/example/common/model/Execution.java, oms-core/src/test/java/org/example/oms/integration/ExecutionLifecycleIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ExecutionLifecycleIntegrationTest.bustRecordsEventStatusAndStagesReversal' --tests 'org.example.oms.integration.ExecutionLifecycleIntegrationTest.correctionMarksCorrectedAndStagesG' --tests 'org.example.oms.integration.ExecutionLifecycleIntegrationTest.whackMarksBustedAndStagesH'` passes
- [x] **T-8** Write the refusal and concurrency tests (red). Then add the unknown-execution and status-transition checks, which run before any write (AC-5, AC-6)
  - files: oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java, oms-core/src/test/java/org/example/oms/integration/ExecutionLifecycleIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ExecutionLifecycleIntegrationTest.bustOfBustedOrUnknownExecutionIsRefusedAndWritesNothing' --tests 'org.example.oms.integration.ExecutionLifecycleIntegrationTest.concurrentLifecycleEventsFromSameVersionOneWins'` passes
- [x] **T-9** Write `ExecutionLifecycleIntegrationTest#bustedFillIsExcludedFromAvgPx` (red). Filter `sumNotionalByOrderId` on `status = APPLIED` (AC-8)
  - files: oms-core/src/main/java/org/example/oms/repository/ExecutionRepository.java, oms-core/src/test/java/org/example/oms/integration/ExecutionLifecycleIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ExecutionLifecycleIntegrationTest.bustedFillIsExcludedFromAvgPx' --tests 'org.example.oms.service.execution.tasks.CalculateOrderQuantitiesTaskTest'` passes
- [x] **T-10** Write `ExecutionLifecycleIntegrationTest#executionsAtReturnsExecutionsInForce` (red). Add `ExecutionRepository.findInForceAt` and `OrderReplayService.executionsAt` (AC-9)
  - files: oms-core/src/main/java/org/example/oms/repository/ExecutionRepository.java, oms-core/src/main/java/org/example/oms/service/OrderReplayService.java, oms-core/src/test/java/org/example/oms/integration/ExecutionLifecycleIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ExecutionLifecycleIntegrationTest.executionsAtReturnsExecutionsInForce' --tests 'org.example.oms.service.OrderReplayServiceTest'` passes
- [x] **T-11** Write `OrderEventQueryIntegrationTest#execIdFilterReturnsOnlyThatExecutionsEvents` and `#unknownExecIdReturnsEmptyArray` (red). Add `OrderEventRepository.findByOrderIdAndExecIdOrderByVersionAsc`, used by `OrderEventReadService` when `execId` is given (AC-10)
  - files: oms-core/src/main/java/org/example/oms/repository/OrderEventRepository.java, oms-core/src/main/java/org/example/oms/service/OrderEventReadService.java, oms-core/src/test/java/org/example/oms/integration/OrderEventQueryIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.OrderEventQueryIntegrationTest' --tests 'org.example.oms.mapper.OrderEventDtoMapperTest'` passes
- [x] **T-12** Write `ProjectionRebuildIntegrationTest#fillEventWithoutExecId_failsNamingOrderAndVersion` (red). Match fill events by `OrderEvent.getExecId()` only, and delete `execIdOf` and the positional branch (AC-12)
  - files: oms-core/src/main/java/org/example/oms/projection/ProjectionRebuilder.java, oms-core/src/test/java/org/example/oms/integration/ProjectionRebuildIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ProjectionRebuildIntegrationTest'` passes
- [x] **T-13** Add the INFO log line with orderId, execId, event and version for each lifecycle event, and confirm `oms_order_events{event}` counts the new events (AC-3)
  - files: oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java, oms-core/src/test/java/org/example/oms/service/metrics/OrderFlowMetricsTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.metrics.OrderFlowMetricsTest'` passes, with a case asserting that `recordEvent(Event.EXEC_BUST)` increments `oms_order_events{event="EXEC_BUST"}` after commit
- [x] **T-14** Update the knowledge base: execution, order-event, order-state, order-lifecycle, execution-reporting, projections, FR-015 and FR-016 (AC-1, AC-3, AC-7, AC-10, AC-12)
  - files: oms-knowledge-base/domain/execution.md, oms-knowledge-base/domain/order-event.md, oms-knowledge-base/domain/order-state.md, oms-knowledge-base/oms-concepts/order-lifecycle.md, oms-knowledge-base/oms-concepts/execution-reporting.md, oms-knowledge-base/oms-concepts/projections.md, oms-knowledge-base/functional-requirements/FR-015-bust-executions.md, oms-knowledge-base/functional-requirements/FR-016-whack-executions.md
  - verify: each of the six domain and concept pages mentions `exec_id`, `EXEC_BUST` or `FILLED → LIVE` (checked with grep), and FR-015 and FR-016 mention SPEC-0044
- [x] **T-15** Run the full oms-core suite
  - verify: `cd oms-core && ./gradlew check` passes
- [x] **T-16** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0044` exits 0

- [x] **T-17** Make the positional exec_id backfill match only unmatched fill events to unclaimed executions, and only when their counts agree per order. Extend the migration test with an order that has an orphan execution, and an execution whose version can only come from the projection (AC-1)
  - files: oms-core/src/main/resources/db/changelog/011-execution-lifecycle.yaml, oms-core/src/test/java/org/example/oms/integration/ExecutionLifecycleMigrationIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ExecutionLifecycleMigrationIntegrationTest'` passes
- [x] **T-18** Prove the backfill JSON path against a fill stored by the application: `ExecutionLifecycleIntegrationTest#storedFillCommandMatchesTheBackfillPath` (AC-1)
  - files: oms-core/src/test/java/org/example/oms/integration/ExecutionLifecycleIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ExecutionLifecycleIntegrationTest'` passes
- [x] **T-19** Restore the corrupted em dash in `OrderAcceptCommandProcessorTest`, then rerun spec verify with fresh test execution
  - files: oms-core/src/test/java/org/example/oms/service/command/OrderAcceptCommandProcessorTest.java
  - verify: `git diff` of that file shows only the added test, and `node specs/tools/spec.mjs verify SPEC-0044` exits 0

## Notes

- T-1 and T-2 go first. The generated mapper fails to compile until `Event` and `OrderEventType` agree, and the controller must implement the new `OrdersApi` signature.
- T-3 checks whether SPEC-0045 has already renamed the projection table. If it has, the changelog is numbered after SPEC-0045's, and backfill (3) reads `order_execution_projection`.
- T-6 to T-10 share one new test class. Each task adds its own methods and runs only those.
- T-2 also added `OrderEventRepository.findByOrderIdAndExecIdOrderByVersionAsc` and the read-service overload, planned for T-11, because the controller needed them to compile. T-11 keeps its test-first check of the behaviour.
- T-4a was added during implementation: with `FILLED → LIVE` in the machine, the accept processor's transition check would have let an ACK reopen a filled order (design, Alternatives & Decisions).
- T-8: the checks were written with the method in T-7, as the design specified, so the T-8 tests passed on their first run. The refusal test was confirmed to fail with the status check disabled.
- T-9: `Order` has no avgPx column. The order's average price is carried on each fill (`executions.avg_px`, `OrderExecution.avgPx`), so AC-8's "the order's and EX-3's avgPx" is asserted on EX-3's row and its published record.
- T-11: the existing `apiDocsDeclareEventLogOperation` asserted a single parameter. It now expects the optional `execId` too, because the contract changed. The new filter tests passed at once, since T-2 had wired the filter, and were confirmed to fail with the filter bypassed.
- T-14 also updated `interfaces/query-api.md`, which documents the events endpoint, and bumped `oms-query-api.yml` `info.version` from 2.1.0 to 2.2.0. That follows the convention of the additive 2.1.0 change.
- T-17 to T-19 come from the independent review in the verify stage (findings 1 to 4). The implement stage was reopened for them.
