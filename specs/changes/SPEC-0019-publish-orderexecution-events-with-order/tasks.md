# Tasks — SPEC-0019: Publish OrderExecution events with order context

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

Shortcuts used in `verify:` lines:
`ct <Class>` = `cd oms-contracts && ./gradlew test --tests '*<Class>'`;
`gt <Class>` = `cd oms-core && ./gradlew test --tests '*<Class>'`;
`st <Class>` = `cd oms-streaming-service && ./gradlew test --tests '*<Class>'`.

- [x] **T-1** Capture the current `Execution` schema as `compat/Execution-baseline.json`; write `ExecutionCompatibilityTest#newSchemaReadsBaselineAndBack` and `OrderExecutionSchemaTest#hasEveryContextFieldNullableWithNullDefault` (red: `OrderExecution` does not exist, `Execution` lacks `rootOrderId`/`orderVersion`) (AC-1)
  - files: oms-contracts/src/test/resources/compat/Execution-baseline.json, oms-contracts/src/test/java/org/example/common/contracts/ExecutionCompatibilityTest.java, oms-contracts/src/test/java/org/example/common/contracts/OrderExecutionSchemaTest.java
  - verify: `ct ExecutionCompatibilityTest` passes (baseline equals current) and `ct OrderExecutionSchemaTest` fails because `OrderExecution` and the two `Execution` fields are missing
- [x] **T-2** Add `rootOrderId` and `orderVersion` to `Execution.avsc`, add `OrderExecution.avsc` as in design.md, add `compat/OrderExecution-baseline.json`, regenerate (AC-1)
  - files: oms-contracts/src/main/avro/Execution.avsc, oms-contracts/src/main/avro/OrderExecution.avsc, oms-contracts/src/test/resources/compat/OrderExecution-baseline.json
  - verify: `cd oms-contracts && ./gradlew build` passes, including `ExecutionCompatibilityTest` and `OrderExecutionSchemaTest`
- [x] **T-3** Write `OrderExecutionMessageMapperTest` (field mapping, `rootOrderId` fallback, `orderVersion`, `tradeDate` from `transactTime` in UTC and fallback to the outbox `createdAt`) red, then add `OrderExecutionMessageMapper` and make `OrderMessageMapper`'s `Side`/`OrdType`/`State` mappings reusable (AC-2)
  - files: oms-core/src/test/java/org/example/oms/mapper/OrderExecutionMessageMapperTest.java, oms-core/src/main/java/org/example/oms/mapper/OrderExecutionMessageMapper.java, oms-core/src/main/java/org/example/oms/mapper/OrderMessageMapper.java
  - verify: `gt OrderExecutionMessageMapperTest` and `gt AvroMessageMapperTest` pass
- [x] **T-4** Extend `AvroMessageMapperTest` for `Execution.rootOrderId`/`orderVersion` (with order; null order falls back to `execution.orderId`) red, then change `ExecutionMessageMapper.toExecutionMessage(execution, order, version)` (AC-3)
  - files: oms-core/src/test/java/org/example/oms/mapper/AvroMessageMapperTest.java, oms-core/src/main/java/org/example/oms/mapper/ExecutionMessageMapper.java
  - verify: `gt AvroMessageMapperTest` passes
- [x] **T-5** Add `ORDER_EXECUTION` to `OutboxMessage.AggregateType`; extend `MessagePublisherTest` with an `ORDER_EXECUTION` row (mapped with both payloads, sent with the row's key) and the `EXECUTION` row passing order and version (red), then update `MessagePublisher` (AC-2, AC-3)
  - files: oms-core/src/main/java/org/example/oms/model/OutboxMessage.java, oms-core/src/test/java/org/example/oms/service/MessagePublisherTest.java, oms-core/src/main/java/org/example/oms/service/MessagePublisher.java
  - verify: `gt MessagePublisherTest` passes
- [x] **T-6** Test wiring: `AbstractKafkaPostgresIntegrationTest` creates `orders`, `oms_executions`, `oms_order_executions` with 3 partitions via `AdminClient` before the context starts and sets `kafka.order-execution-topic`; add `kafka.order-execution-topic: ${ORDER_EXECUTION_TOPIC:oms_order_executions}` to oms-core `application.yml`
  - files: oms-core/src/test/java/org/example/oms/integration/AbstractKafkaPostgresIntegrationTest.java, oms-core/src/main/resources/application.yml
  - verify: `gt ExchangeWorkflowIntegrationTest` and `gt CommandListenerKafkaIntegrationTest` still pass on 3-partition topics
- [x] **T-7** Write `OrderExecutionPublicationIntegrationTest#fillsOverRestAndKafka_publishOneOrderExecutionEach` and `#executionRecords_carryRootOrderIdAndOrderVersion` (red: nothing on `oms_order_executions`), then stage the `ORDER_EXECUTION` row (and `orderPayload` on the `EXECUTION` row) in `OrderEventAppender.appendExecutionEvent` (AC-2, AC-3)
  - files: oms-core/src/test/java/org/example/oms/integration/OrderExecutionPublicationIntegrationTest.java, oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java
  - verify: `gt OrderExecutionPublicationIntegrationTest` passes for both methods
- [x] **T-8** Write `OrderExecutionPublicationIntegrationTest#childOrder_isKeyedByRootOnAllThreeTopics` (red: child records keyed by its own `orderId`), then add `OrderEventAppender.partitionKey` and use it for every staged row (AC-5)
  - files: oms-core/src/test/java/org/example/oms/integration/OrderExecutionPublicationIntegrationTest.java, oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java
  - verify: `gt OrderExecutionPublicationIntegrationTest` and `gt ExchangeWorkflowIntegrationTest` pass
- [x] **T-9** Write `OrderExecutionPublicationIntegrationTest#refusedFills_publishNothing` (duplicate `execId` and overfill, with a sentinel fill on another order to bound the wait). Refusals already roll back, so this is a guard that the new row is staged only for applied fills; it is expected to pass on its first run (AC-4)
  - files: oms-core/src/test/java/org/example/oms/integration/OrderExecutionPublicationIntegrationTest.java
  - verify: `gt OrderExecutionPublicationIntegrationTest` passes
- [x] **T-10** Write `OrderExecutionPublicationIntegrationTest#rootAndChildFills_arriveOnOnePartitionInCommitOrder` (fills alternately on root `R` and child `C`, posted sequentially over REST; consumed from earliest on the 3-partition topic) (AC-6)
  - files: oms-core/src/test/java/org/example/oms/integration/OrderExecutionPublicationIntegrationTest.java
  - verify: `gt OrderExecutionPublicationIntegrationTest` passes
- [x] **T-11** Streaming: write `KafkaEventStreamProviderTest#orderExecutionRedelivery_isEmittedOnce` (red), then switch `KafkaConfig` to an `OrderExecution` receiver on `streaming.kafka.topics.order-executions`, add the streaming `OrderExecutionMapper`, `ExecutionDto.orderVersion`, `ExecutionEvent.order`, and the `(execId, orderVersion)` dedup in `KafkaEventStreamProvider`; adapt the existing provider test to the new receiver type (AC-7)
  - files: oms-streaming-service/src/test/java/org/example/streaming/service/KafkaEventStreamProviderTest.java, oms-streaming-service/src/main/java/org/example/streaming/config/KafkaConfig.java, oms-streaming-service/src/main/java/org/example/streaming/service/KafkaEventStreamProvider.java, oms-streaming-service/src/main/java/org/example/streaming/mapper/OrderExecutionMapper.java, oms-streaming-service/src/main/java/org/example/streaming/model/ExecutionDto.java, oms-streaming-service/src/main/java/org/example/streaming/model/ExecutionEvent.java, oms-streaming-service/src/main/resources/application.yml
  - verify: `st KafkaEventStreamProviderTest` passes
- [x] **T-12** Streaming: write `TradeBlotterExecutionStreamTest#executionsAndAllStreams_carryOrderFields` (real provider with mocked receivers, real controller) red, then set `order`, `eventId` and `EXECUTION_<execType>` in `TradeBlotterController.toOrderEvent` (AC-8)
  - files: oms-streaming-service/src/test/java/org/example/streaming/controller/TradeBlotterExecutionStreamTest.java, oms-streaming-service/src/main/java/org/example/streaming/controller/TradeBlotterController.java
  - verify: `st TradeBlotterExecutionStreamTest` passes, and `cd oms-streaming-service && ./gradlew check` passes
- [x] **T-13** Update the knowledge base: `interfaces/kafka-topics.md`, `interfaces/avro-messages.md`, `oms-concepts/booking-integration.md` (§3.2, §12 E1–E3), `oms-concepts/streaming-architecture.md`, `capabilities/real-time-streaming.md`, `capabilities/event-publication.md` (AC-2, AC-5, AC-7)
  - files: oms-knowledge-base/interfaces/kafka-topics.md, oms-knowledge-base/interfaces/avro-messages.md, oms-knowledge-base/oms-concepts/booking-integration.md, oms-knowledge-base/oms-concepts/streaming-architecture.md, oms-knowledge-base/capabilities/real-time-streaming.md, oms-knowledge-base/capabilities/event-publication.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports 0 errors, and `grep -n oms_order_executions oms-knowledge-base/interfaces/kafka-topics.md` shows the topic row
- [x] **T-14** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0019` exits 0
- [x] **T-15** Streaming: write `KafkaEventStreamProviderTest#sameExecIdOnTwoOrders_isNotARedelivery` (red: B's fill dropped), then key the execution cache and the dedup by `(orderId, execId)`; leave `OrderDto.transactTime` unset in `OrderExecutionMapper` (review findings 1, 4) (AC-7, AC-8)
  - files: oms-streaming-service/src/test/java/org/example/streaming/service/KafkaEventStreamProviderTest.java, oms-streaming-service/src/main/java/org/example/streaming/service/KafkaEventStreamProvider.java, oms-streaming-service/src/main/java/org/example/streaming/mapper/OrderExecutionMapper.java
  - verify: `cd oms-streaming-service && ./gradlew check` passes, and the new test failed before the fix
- [x] **T-16** Add `OrderExecutionCompatibilityTest` against `compat/OrderExecution-baseline.json`, mirroring `ExecutionCompatibilityTest` (review finding 2) (AC-1)
  - files: oms-contracts/src/test/java/org/example/common/contracts/OrderExecutionCompatibilityTest.java
  - verify: `ct OrderExecutionCompatibilityTest` passes
- [x] **T-17** oms-core: bound `refusedFills_publishNothing` with a later fill on the same order (same partition); add `OrderExecutionPublicationIntegrationTest#relayRedelivery_carriesTheSameDedupKey`: republish a fill's `ORDER_EXECUTION` outbox row through `MessagePublisher`, as a relay crash between send and delete would, and assert the real topic then holds two records with the same `(orderId, execId, orderVersion)` that a consumer collapses to one (review finding 3, Goal: consumer-side test of deduplication) (AC-4, AC-7)
  - files: oms-core/src/test/java/org/example/oms/integration/OrderExecutionPublicationIntegrationTest.java
  - verify: `gt OrderExecutionPublicationIntegrationTest` passes
- [x] **T-18** Run spec verify again
  - verify: `node specs/tools/spec.mjs verify SPEC-0019` exits 0

## Notes

- T-1 before T-2: the baseline must be the schema as it stands before the change, or the
  compatibility test compares the new schema with itself.
- T-6 before T-7: the publication tests assume 3-partition topics; existing tests must keep passing
  on them before new behaviour is added.
- T-7 before T-8: the key test reads all three topics, which needs the `ORDER_EXECUTION` row.
- T-9 is a guard, not a red-first test: the refusals it covers already roll back today. It is still
  written before T-10 so the publication test class is complete in AC order.
- T-11 and T-12 can run only after T-2 (the streaming service compiles against `msg.OrderExecution`).
- Implementation notes:
  - T-3: the root rule (`rootOrderId ?? orderId`) is defined once, as
    `OrderMessageMapper.rootOrderIdOf`, where `OrderMessage` already applied it;
    `OrderEventAppender.partitionKey` delegates to it, so the mappers do not depend on a service.
  - T-4 also changed the `EXECUTION` call in `MessagePublisher` and its test stub, because the
    mapper's signature changed; T-5 then added the `ORDER_EXECUTION` case.
  - T-10 was written after T-8 put the root key in place, so it was never observed red; T-8's key
    test is the red-first proof of the key, and T-10 proves what a consumer sees on 3 partitions.
  - T-11: the order rides on `ExecutionDto.order` (and `ExecutionEvent.order` copies it), not only
    on the event as design.md says, so execution snapshots from the cache carry it too. The test
    sets `maxCacheSize`, which `@Value` leaves at 0 outside Spring and which then evicts every put.
- T-15 to T-18 were added after the independent review (round 1): the streaming dedup and cache
  were keyed by `execId` alone, which is unique per order only; the `OrderExecution` baseline had no
  test; the Goal's consumer-side Testcontainers test covered ordering but not deduplication; the
  AC-4 sentinel was on another order's partition; blotter fill events overwrote the order's
  `transactTime`. T-16 and the AC-4 change are guards and were not red; T-15 was red first.
