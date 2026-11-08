# Tasks — SPEC-0046: Add command log and refuse duplicates everywhere

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

- [x] **T-1** Add `getOrderCommands` with `CommandLogEntryDto`, `CommandSource` and `CommandOutcome` to the query contract (2.3.0), and the 409 response to `/execute` in the command contract (3.3.0). Regenerate, and extend the contract tests (AC-10, AC-6)
  - files: oms-contracts/src/main/openapi/oms-query-api.yml, oms-contracts/src/main/openapi/oms-cmd-api.yml, oms-contracts/src/test/java/org/example/common/contracts/*
  - verify: `cd oms-contracts && ./gradlew build` passes, and after `cd oms-core && ./gradlew openApiGenerateCmd openApiGenerateQuery` the generated `OrdersApi` declares `getOrderCommands(String orderId)`
- [x] **T-2** Write the `command_log` migration check in `LiquibaseMigrationIntegrationTest` (red). Then add `013-command-log.yaml`, the `CommandLogEntry` entity, `CommandSource` and `CommandOutcome`, and `CommandLogRepository` (AC-1)
  - files: oms-core/src/main/resources/db/changelog/013-command-log.yaml, oms-core/src/main/resources/db/changelog/db.changelog-master.yaml, oms-core/src/main/java/org/example/oms/model/CommandLogEntry.java, oms-core/src/main/java/org/example/oms/model/CommandSource.java, oms-core/src/main/java/org/example/oms/model/CommandOutcome.java, oms-core/src/main/java/org/example/oms/repository/CommandLogRepository.java, oms-core/src/test/java/org/example/oms/integration/LiquibaseMigrationIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.LiquibaseMigrationIntegrationTest'` passes
- [x] **T-3** Write the ACCEPT cases in `OrderLifecycleCommandProcessorTest` (red). Add `LifecycleAction.ACCEPT`, accept `OrderAcceptCmd` in the lifecycle processor, validate `state == UNACK`, and stamp the market ack in `ApplyLifecycleActionTask` (AC-8)
  - files: oms-core/src/main/java/org/example/oms/service/lifecycle/LifecycleAction.java, oms-core/src/main/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessor.java, oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/ValidateLifecycleActionTask.java, oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/ApplyLifecycleActionTask.java, oms-core/src/test/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessorTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.lifecycle.*'` passes
- [x] **T-4** Add the duplicate machinery, test first (`OrderEventAppenderTest#commandIdConstraintBecomesDuplicateCommand`, an `ExecutionCommandProcessor` duplicate case, red):
  - `DuplicateCommandException`, with `OrderEventAppender` mapping the commandId constraint to it;
  - `OrderTaskContext.markDuplicate` and its use in `DeduplicateCommandTask`;
  - `PipelineResults.isDuplicate`;
  - `duplicate` and `eventVersion` on the create, fill and lifecycle results;
  - `DeduplicateCommandTask` in the fill pipeline (AC-6, AC-7)
  - files: oms-core/src/main/java/org/example/oms/service/DuplicateCommandException.java, oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java, oms-core/src/main/java/org/example/oms/model/OrderTaskContext.java, oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/DeduplicateCommandTask.java, oms-core/src/main/java/org/example/oms/service/PipelineResults.java, oms-core/src/main/java/org/example/oms/service/execution/ExecutionCommandProcessor.java, oms-core/src/main/java/org/example/oms/service/command/OrderCreateCommandProcessor.java, oms-core/src/main/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessor.java, oms-core/src/test/java/org/example/oms/service/OrderEventAppenderTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.*'` passes
- [x] **T-5** Write `CommandDispatcherTest` (red). Add `CommandOrigin`, `CommandDispatch`, `CommandDispatcher` and `CommandLogWriter`, with `oms.command_log.write_failures`. Take an `ExecutionCreateCmd` in `ExecutionCommandProcessor` and delete the `process(Execution)` overload (AC-1, AC-2, AC-9, AC-11)
  - files: oms-core/src/main/java/org/example/oms/service/command/CommandOrigin.java, oms-core/src/main/java/org/example/oms/service/command/CommandDispatch.java, oms-core/src/main/java/org/example/oms/service/command/CommandDispatcher.java, oms-core/src/main/java/org/example/oms/service/commandlog/CommandLogWriter.java, oms-core/src/main/java/org/example/oms/service/execution/ExecutionCommandProcessor.java, oms-core/src/test/java/org/example/oms/service/command/CommandDispatcherTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.command.CommandDispatcherTest'` passes
- [x] **T-6** Route every entry point through the dispatcher:
  - `CommandController`, with `DuplicateCommandException` → 409 in `GlobalExceptionHandler`;
  - `CommandListener`, with the Kafka origin and the producer;
  - `EndOfDayService` and `OrderExpiryService`, with the scheduler origin.

  Delete `OrderAcceptCommandProcessor` and its test. Rework `CommandControllerWebMvcTest` and
  `CommandListenerTest` onto the dispatcher. Move every test caller of the removed classes and
  overloads (`TestCommands.fill(Execution)`) (AC-3, AC-5, AC-6, AC-7, AC-8, AC-9)
  - files: oms-core/src/main/java/org/example/oms/api/CommandController.java, oms-core/src/main/java/org/example/oms/api/GlobalExceptionHandler.java, oms-core/src/main/java/org/example/oms/config/CommandListener.java, oms-core/src/main/java/org/example/oms/service/endofday/EndOfDayService.java, oms-core/src/main/java/org/example/oms/service/endofday/OrderExpiryService.java, oms-core/src/main/java/org/example/oms/service/command/OrderAcceptCommandProcessor.java (deleted), oms-core/src/test/java/**
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.api.*' --tests 'org.example.oms.config.*' --tests 'org.example.oms.service.*' --tests 'org.example.oms.integration.OrderLifecycleIntegrationTest' --tests 'org.example.oms.integration.EventSourcingIntegrationTest' --tests 'org.example.oms.integration.EndOfDayIntegrationTest'` passes
- [x] **T-7** Write `CommandLogIntegrationTest` (applied, refused surviving the rollback, and write failure) and `DuplicateCommandIntegrationTest` (fill 409, lifecycle 409, accept), red first. Fix what they reveal (AC-1, AC-2, AC-6, AC-7, AC-8, AC-11)
  - files: oms-core/src/test/java/org/example/oms/integration/CommandLogIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/DuplicateCommandIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.CommandLogIntegrationTest' --tests 'org.example.oms.integration.DuplicateCommandIntegrationTest'` passes
- [x] **T-8** Write `CommandLogKafkaIntegrationTest`: accept with the producer, a refused command acknowledged, an unknown-order fill dead-lettered and FAILED, a duplicate fill acknowledged, and every fill storing its command. Add `EndOfDayIntegrationTest#scheduledCommandsAreLoggedAsScheduler`. Red first, then fix (AC-3, AC-4, AC-5, AC-6, AC-9)
  - files: oms-core/src/test/java/org/example/oms/integration/CommandLogKafkaIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/EndOfDayIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.CommandLogKafkaIntegrationTest' --tests 'org.example.oms.integration.EndOfDayIntegrationTest'` passes
- [x] **T-9** Write `OrderCommandQueryIntegrationTest` (red). Add `CommandLogReadService`, `CommandLogEntryDtoMapper` and `getOrderCommands` on `OrderEventController` (AC-10)
  - files: oms-core/src/main/java/org/example/oms/service/CommandLogReadService.java, oms-core/src/main/java/org/example/oms/mapper/CommandLogEntryDtoMapper.java, oms-core/src/main/java/org/example/oms/api/OrderEventController.java, oms-core/src/test/java/org/example/oms/integration/OrderCommandQueryIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.OrderCommandQueryIntegrationTest' --tests 'org.example.oms.integration.OrderEventQueryIntegrationTest'` passes
- [x] **T-10** Update the knowledge base: new `domain/command-log.md`; `order-lifecycle.md`, `execution-processing.md`, `error-handling.md`, `query-api.md`, FR-010 (AC-1, AC-6, AC-8, AC-10)
  - files: oms-knowledge-base/domain/command-log.md, oms-knowledge-base/oms-concepts/order-lifecycle.md, oms-knowledge-base/capabilities/execution-processing.md, oms-knowledge-base/oms-framework/error-handling.md, oms-knowledge-base/interfaces/query-api.md, oms-knowledge-base/functional-requirements/FR-010-deduplicate-lifecycle-commands.md
  - verify: `domain/command-log.md` exists; each of the other five pages mentions `command_log`, `duplicate-command`, `ACCEPT` or `getOrderCommands` (grep)
- [x] **T-11** Run the full oms-core suite
  - verify: `cd oms-core && ./gradlew check` passes
- [x] **T-12** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0046` exits 0

- [x] **T-13** Test first, then fix: a refused create answers `id: ""` and is logged with a null `order_id`; a failure while writing the APPLIED row or flushing the command's writes is logged FAILED (AC-1, AC-2)
  - files: oms-core/src/main/java/org/example/oms/service/command/CommandDispatcher.java, oms-core/src/test/java/org/example/oms/integration/CommandLogIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.CommandLogIntegrationTest' --tests 'org.example.oms.service.command.CommandDispatcherTest'` passes
- [x] **T-14** Strengthen the tests the review found weak: the Kafka duplicate writes no event or outbox row and nothing is dead-lettered; the end-of-day rows carry the CLOSE and EXP versions; the commandId constraint race over REST answers 409 against Postgres (AC-5, AC-6)
  - files: oms-core/src/test/java/org/example/oms/integration/CommandLogKafkaIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/EndOfDayIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/DuplicateCommandIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.CommandLogKafkaIntegrationTest' --tests 'org.example.oms.integration.EndOfDayIntegrationTest' --tests 'org.example.oms.integration.DuplicateCommandIntegrationTest'` passes
- [x] **T-15** Update every knowledge-base page that still describes `OrderAcceptCommandProcessor` or the command-less fill call, and add them to design.md's Knowledge Base Updates (AC-8)
  - files: oms-knowledge-base/capabilities/order-acceptance.md, oms-knowledge-base/capabilities/order-sla-monitoring.md, oms-knowledge-base/domain/order-state.md, oms-knowledge-base/functional-requirements/FR-005-acknowledge-orders.md, oms-knowledge-base/functional-requirements/FR-006-refuse-invalid-acceptance.md, oms-knowledge-base/non-functional-requirements/NFR-007-observability.md, oms-knowledge-base/oms-concepts/execution-reporting.md, oms-knowledge-base/oms-framework/testing-patterns.md
  - verify: grep for `OrderAcceptCommandProcessor` and `process(execution)` in `oms-knowledge-base/**/*.md` finds only history notes
- [x] **T-16** Rerun the full suite and spec verify
  - verify: `cd oms-core && ./gradlew check` passes and `node specs/tools/spec.mjs verify SPEC-0046` exits 0

## Notes

- T-5 and T-6 are ordered so that each compiles. The dispatcher arrives first, beside the old
  routing. T-6 then switches the entry points and removes the old classes in one step, because
  removing `OrderAcceptCommandProcessor` breaks its callers.
- T-7 to T-9 are the end-to-end acceptance tests. Behaviour they reveal as missing is fixed inside
  the same task, test first.
- T-7: the acceptance tests passed on their first run, because T-4 to T-6 had built the behaviour. Each class was checked by disabling the code it covers: the refused-row write and the write-failure catch for `CommandLogIntegrationTest`, the REST 409 branch for `DuplicateCommandIntegrationTest`. Every targeted test then failed.
- T-8: the Kafka tests passed on their first run, because the listener had been routed through the dispatcher in T-6. Passing a null principal instead of the header's producer made `kafkaAcceptIsLoggedWithProducer` fail. T-1 also added a placeholder `getOrderCommands` (501), so oms-core compiled against the regenerated `OrdersApi` until T-9.
- T-11: the full run found one more test pinning the old 400 for a repeated commandId (`OrderExpiryCloseIntegrationTest#expireOverRestAndKafka`). It was updated to the approved 409.
- T-13 to T-16 come from the independent review in the verify stage. Implement was reopened for them.
- T-14: the new constraint-race test showed the race was answered 409 but logged with the generic reason "Failed to record order event". `PipelineResults.refusalReason` now prefers the `DuplicateCommandException` message, in all three processors.
