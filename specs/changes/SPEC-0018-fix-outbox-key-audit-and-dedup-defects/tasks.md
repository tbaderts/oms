# Tasks — SPEC-0018: Fix outbox key, audit and dedup defects

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

`gt <Class>` means `cd oms-core && ./gradlew test --tests '*<Class>'`.

Abbreviations:
- `core/…` = `oms-core/src/main/java/org/example/oms/…`
- `coretest/…` = `oms-core/src/test/java/org/example/oms/…`

- [x] **T-1** Add optional `eventVersion` (int64) to `OrderDto` in the query API spec and regenerate the models (AC-3)
  - files: oms-contracts/src/main/openapi/oms-query-api.yml
  - verify: `cd oms-contracts && ./gradlew build` passes and the generated `org.example.common.model.query.OrderDto` has `getEventVersion()`
- [x] **T-2** Add the `command_id` migration and map it on the entity (AC-6, AC-8)
  - First check that a stored lifecycle `transaction` JSON has `commandId` at its top level.
  - Add `006-order-event-command-id.yaml`: the tag, a nullable `command_id`, the backfill from `transaction ->> 'commandId'`, and a unique `(order_id, command_id)` constraint. Include it from the master changelog.
  - Map `OrderEvent.commandId`, and assert the new constraint in `LiquibaseMigrationIntegrationTest`.
  - files: oms-core/src/main/resources/db/changelog/006-order-event-command-id.yaml, oms-core/src/main/resources/db/changelog/db.changelog-master.yaml, core/model/OrderEvent.java, coretest/integration/LiquibaseMigrationIntegrationTest.java
  - verify: `gt LiquibaseMigrationIntegrationTest` passes
- [x] **T-3** Write `ExchangeWorkflowIntegrationTest#fills_areKeyedByOrderIdOnBothTopics` (red), then stage the execution outbox row with `aggregateId = orderId` and note the key in `MessagePublisher`'s Javadoc (AC-1)
  - files: coretest/integration/ExchangeWorkflowIntegrationTest.java, core/service/OrderEventAppender.java, core/service/MessagePublisher.java
  - verify: `gt ExchangeWorkflowIntegrationTest` passes
- [x] **T-4** Write `ExchangeWorkflowIntegrationTest#restFill_recordsItsCommandInTheEventLog` (red), then pass the `ExecutionCreateCmd` from `CommandController`, keep `CommandControllerWebMvcTest` (which mocks `ExecutionCommandProcessor`) passing, and update the overload's Javadoc (AC-2; the REST path's two-argument call is proven by the integration test, not by a WebMvc test)
  - files: coretest/integration/ExchangeWorkflowIntegrationTest.java, core/api/CommandController.java, core/service/execution/ExecutionCommandProcessor.java, coretest/api/CommandControllerWebMvcTest.java
  - verify: `gt ExchangeWorkflowIntegrationTest` and `gt CommandControllerWebMvcTest` pass
- [x] **T-5** Write `ExchangeWorkflowIntegrationTest#queryApi_reportsTheLatestEventVersion` (red), then add the event version to the query path (AC-3)
  - Add `OrderEventRepository.findLatestVersions` and the `OrderSearchResult` record.
  - Make `OrderQueryService.search` REPEATABLE_READ and have it return `OrderSearchResult`.
  - Set `eventVersion` in the mapper, and adapt `QueryController`.
  - files: coretest/integration/ExchangeWorkflowIntegrationTest.java, core/repository/OrderEventRepository.java, core/service/OrderSearchResult.java, core/service/OrderQueryService.java, core/mapper/QueryOrderDtoMapper.java, core/api/QueryController.java
  - verify: `gt ExchangeWorkflowIntegrationTest` passes and `cd oms-core && ./gradlew test --tests '*Query*'` passes
- [x] **T-6** Write `KafkaEventStreamProviderTest#snapshotDeduplicatesLiveEventsPerOrderByVersion` (red), then map `eventVersion` to `eventId` and drop live events at or below the snapshot's version for the same order (AC-4)
  - files: oms-streaming-service/src/test/java/org/example/streaming/service/KafkaEventStreamProviderTest.java, oms-streaming-service/src/main/java/org/example/streaming/service/KafkaEventStreamProvider.java, oms-streaming-service/src/main/java/org/example/streaming/mapper/OrderMessageMapper.java
  - verify: `cd oms-streaming-service && ./gradlew test --tests '*KafkaEventStreamProviderTest'` passes
- [x] **T-7** Write `OrderLifecycleIntegrationTest#lifecycleEvent_storesCommandId_andCommandWithoutIdIsStillApplied` (red), then move `commandIdOf` to `OrderEventAppender` and set `OrderEvent.commandId` when appending (AC-6)
  - files: coretest/integration/OrderLifecycleIntegrationTest.java, core/service/OrderEventAppender.java, core/service/lifecycle/tasks/DeduplicateCommandTask.java
  - verify: `gt OrderLifecycleIntegrationTest` passes
- [x] **T-8** Write the AC-5 tests, then replace the history scan (AC-5)
  - Tests: `OrderLifecycleIntegrationTest#duplicateCommandId_isRefusedOverRestAndLeavesOrderUnchanged` and `ExchangeWorkflowIntegrationTest#duplicateCommandId_overKafka_isAcknowledgedNotDeadLettered`. They are red where the expected behaviour differs from today's.
  - Replace the history scan in `DeduplicateCommandTask` with `existsByOrderIdAndCommandId`, and update the `OrderLifecycleCommandProcessorTest` mocks.
  - files: coretest/integration/OrderLifecycleIntegrationTest.java, coretest/integration/ExchangeWorkflowIntegrationTest.java, core/repository/OrderEventRepository.java, core/service/lifecycle/tasks/DeduplicateCommandTask.java, coretest/service/lifecycle/OrderLifecycleCommandProcessorTest.java
  - verify: `gt OrderLifecycleIntegrationTest`, `gt ExchangeWorkflowIntegrationTest` and `gt OrderLifecycleCommandProcessorTest` pass
- [x] **T-9** Write `OrderLifecycleIntegrationTest#concurrentDuplicates_exactlyOneApplied` (red), then add `OrderRepository.findLockedByOrderId` (`PESSIMISTIC_WRITE`) and use it in `LoadOrderTask` (AC-7)
  - files: coretest/integration/OrderLifecycleIntegrationTest.java, core/repository/OrderRepository.java, core/service/lifecycle/tasks/LoadOrderTask.java, coretest/service/lifecycle/OrderLifecycleCommandProcessorTest.java
  - verify: `gt OrderLifecycleIntegrationTest` passes three runs in a row, and `gt OrderLifecycleCommandProcessorTest` passes
- [x] **T-10** Write `CommandIdBackfillMigrationIntegrationTest#legacyEventsAreBackfilled_andRedeliveryIsRefused` and make it green (AC-8)
  - Migrate with Liquibase to the tag `before-006-command-id`, seed legacy rows, then start Spring.
  - Assert the backfill, and that a redelivery is refused.
  - files: coretest/integration/CommandIdBackfillMigrationIntegrationTest.java
  - verify: `gt CommandIdBackfillMigrationIntegrationTest` passes
- [x] **T-11** Write `OrderRepositoryTreeIntegrationTest#rootAndParentFinders_returnLists` (red), then make `findByRootOrderId` return `List<Order>` and add `findByParentOrderId` (AC-9)
  - files: coretest/integration/OrderRepositoryTreeIntegrationTest.java, core/repository/OrderRepository.java
  - verify: `gt OrderRepositoryTreeIntegrationTest` passes
- [x] **T-12** Update the knowledge base (P-19)
  - `interfaces/kafka-topics.md` (keys);
  - `oms-concepts/booking-integration.md` §3.2;
  - `functional-requirements/FR-010-…`;
  - `non-functional-requirements/NFR-001-…`;
  - `domain/order-event.md`;
  - `oms-concepts/streaming-architecture.md`;
  - the query API interface page, if it lists `OrderDto` fields.
  - files: oms-knowledge-base/interfaces/kafka-topics.md, oms-knowledge-base/oms-concepts/booking-integration.md, oms-knowledge-base/functional-requirements/FR-010-deduplicate-lifecycle-commands.md, oms-knowledge-base/non-functional-requirements/NFR-001-idempotent-command-handling.md, oms-knowledge-base/domain/order-event.md, oms-knowledge-base/oms-concepts/streaming-architecture.md
  - verify: `grep -n "Key" oms-knowledge-base/interfaces/kafka-topics.md` shows the key column, and `grep -rn "command_id" oms-knowledge-base` hits FR-010 and order-event.md
- [x] **T-13** Run spec verify
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0018` exits 0

- [x] **T-14** Write `QuerySearchIsolationIntegrationTest#search_readsOrdersAndVersionsUnderRepeatableRead` (red), then remove the class-level `@Transactional` from `QueryController` so `OrderQueryService.search` opens its own REPEATABLE_READ transaction (AC-3, AC-4)
  - files: coretest/integration/QuerySearchIsolationIntegrationTest.java, core/api/QueryController.java
  - verify: `gt QuerySearchIsolationIntegrationTest` and `gt ExchangeWorkflowIntegrationTest` pass

## Notes

- T-1 and T-2 come first:
  - T-5 needs the regenerated `OrderDto`;
  - T-7, T-8 and T-10 need the `command_id` column.
- T-7 comes before T-8, because the dedup query reads the column the appender fills.
- T-5: oms-core has no test class with "Query" in its name; `--tests '*Query*'` matches the
  `ExchangeWorkflowIntegrationTest` methods `queryApi_reportsTheLatestEventVersion` and
  `reject_reasonReachesOrdersTopicAndQueryApi`.
- While running T-5, the existing `replayedCancelRequestAndReject_afterProcessing_haveNoSecondEffect`
  failed once (all three replayed commands applied) and passed on the next two runs. This matches
  the check-then-act race in the history-scan dedup that AC-5/AC-7 fix (T-8, T-9). Re-check its
  stability after T-9.
- T-8 found the real cause of that failure: the local oms-contracts build had a stale generated
  `msg/CommandMessage.java` (from before `commandId` was added to the lifecycle commands). Its
  embedded union schema lacked `commandId`, and the Avro serializer writes with that schema, so
  every Kafka lifecycle command arrived with `commandId = null` and Kafka-side dedup never ran. The
  replay test passed only by timing: its wait for PCXL returned right after the wrongly applied
  replay. Fixed by `cd oms-contracts && ./gradlew clean build`; no source change was needed. Follow-ups
  for verification.md: the Avro generation is not rebuilt when only a referenced `.avsc` changes, and
  the replay test should wait on a sentinel rather than on PCXL.
- T-12 also updated three pages whose text the change made wrong:
  - `capabilities/execution-processing.md` (the REST-fill known gap is closed);
  - `capabilities/real-time-streaming.md` (snapshot dedup; the test-coverage gap narrowed);
  - `interfaces/query-api.md` (`eventVersion`; it lists no `OrderDto` fields otherwise).
- T-6 also changed the streaming `OrderMessageMapper`: live events never carried `eventId` (see design, Alternatives & Decisions).
