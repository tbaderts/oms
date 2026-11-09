# Tasks — SPEC-0049: Add event metadata, change diffs and reconciliation

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

- [x] **T-1** Add correlationId, causationId, principal, source and changes to `OrderEventDto` in oms-query-api.yml and regenerate (AC-5)
  - files: oms-contracts/src/main/openapi/oms-query-api.yml
  - verify: `cd oms-contracts && ./gradlew build` passes and the generated `OrderEventDto` has `getCorrelationId`, `getSource` and `getChanges`
- [x] **T-2** Add changelog 016 (order_events metadata and changes, outbox payload_schema_id) and the entity fields on `OrderEvent` and `OutboxMessage` (AC-1, AC-3, AC-8)
  - files: oms-core/src/main/resources/db/changelog/016-event-metadata-and-writer-schema.yaml, oms-core/src/main/resources/db/changelog/db.changelog-master.yaml, oms-core/src/main/java/org/example/oms/model/OrderEvent.java, oms-core/src/main/java/org/example/oms/model/OutboxMessage.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.EventSourcingIntegrationTest'` passes (the schema validates)
- [x] **T-3** Write `OrderChangesTest` (changed fields only, numbers by value, first event from null, only txNr), then `OrderChanges.diff` (AC-3, AC-4)
  - files: oms-core/src/main/java/org/example/oms/service/OrderChanges.java, oms-core/src/test/java/org/example/oms/service/OrderChangesTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.OrderChangesTest'` passes
- [x] **T-4** Write `EventMetadataIntegrationTest` (AC-1 to AC-4, red), then `CommandContext` bound in `CommandDispatcher.dispatch`, `LoadedOrders.remember` in `LoadOrderTask` and `ExecutionCommandProcessor.loadOrder`, and the appender filling the metadata and `changes` (AC-1, AC-2, AC-3, AC-4)
  - files: oms-core/src/main/java/org/example/oms/service/command/CommandContext.java, oms-core/src/main/java/org/example/oms/service/command/LoadedOrders.java, oms-core/src/main/java/org/example/oms/service/command/CommandDispatcher.java, oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/LoadOrderTask.java, oms-core/src/main/java/org/example/oms/service/execution/ExecutionCommandProcessor.java, oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java, oms-core/src/test/java/org/example/oms/integration/EventMetadataIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.EventMetadataIntegrationTest' --tests 'org.example.oms.service.OrderEventAppenderTest'` passes
- [x] **T-5** Map the five fields in `OrderEventDtoMapper` (changes parsed to an object), test first with `EventMetadataIntegrationTest#theEventsEndpointReturnsMetadataAndChanges` (AC-5)
  - files: oms-core/src/main/java/org/example/oms/mapper/OrderEventDtoMapper.java, oms-core/src/test/java/org/example/oms/integration/EventMetadataIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.EventMetadataIntegrationTest'` passes
- [x] **T-6** Write `EventLogReconcilerTest` (sample bound) and `EventLogReconcilerIntegrationTest` (AC-6, red), then `EventLogReconciler` with its gauges, counter, WARN logs and `oms.reconciliation.*` settings; turn it off in the shared test configuration (AC-6, AC-7)
  - files: oms-core/src/main/java/org/example/oms/service/reconciliation/EventLogReconciler.java, oms-core/src/main/resources/application.yml, oms-core/src/test/java/org/example/oms/integration/AbstractKafkaPostgresIntegrationTest.java, oms-core/src/test/java/org/example/oms/service/reconciliation/EventLogReconcilerTest.java, oms-core/src/test/java/org/example/oms/integration/EventLogReconcilerIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.reconciliation.EventLogReconcilerTest' --tests 'org.example.oms.integration.EventLogReconcilerIntegrationTest'` passes
- [x] **T-7** Add `TwoInstanceIntegrationTest#reconcilerRunsOnTheLeaderOnly` (AC-7)
  - files: oms-core/src/test/java/org/example/oms/integration/TwoInstanceIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.TwoInstanceIntegrationTest'` passes
- [x] **T-8** Write `AvroPayloadCodecTest#decodesWithWriterAndReaderSchemas` and `ProjectionSchemaEvolutionIntegrationTest` (red), then `WriterSchemaIds`, `payload_schema_id` at staging, and writer/reader decoding in `AvroPayloadCodec` and `OutboxRecordMapper` (AC-8)
  - files: oms-core/src/main/java/org/example/oms/service/WriterSchemaIds.java, oms-core/src/main/java/org/example/oms/mapper/AvroPayloadCodec.java, oms-core/src/main/java/org/example/oms/mapper/OutboxRecordMapper.java, oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java, oms-core/src/test/java/org/example/oms/mapper/AvroPayloadCodecTest.java, oms-core/src/test/java/org/example/oms/integration/ProjectionSchemaEvolutionIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.mapper.AvroPayloadCodecTest' --tests 'org.example.oms.integration.ProjectionSchemaEvolutionIntegrationTest' --tests 'org.example.oms.integration.PointerOutboxIntegrationTest'` passes
- [x] **T-9** Update the knowledge base: order-event, oms-state-store, event-sourcing-and-replay, projections, event-publication (AC-5, AC-6, AC-8)
  - files: oms-knowledge-base/domain/order-event.md, oms-knowledge-base/oms-framework/oms-state-store.md, oms-knowledge-base/capabilities/event-sourcing-and-replay.md, oms-knowledge-base/oms-concepts/projections.md, oms-knowledge-base/capabilities/event-publication.md
  - verify: grep finds `correlation_id` in order-event.md, `oms.event_log.inconsistent` in event-sourcing-and-replay.md and `payload_schema_id` in projections.md
- [x] **T-10** Run spec verify (agree a quiet window with other sessions in the tree first)
  - verify: `node specs/tools/spec.mjs verify SPEC-0049` exits 0

- [x] **T-11** From the independent review: return `changes` with exact decimals (finding 1, test with an 8-decimal quantity); sample recent orders through a new `order_events.time_stamp` index (finding 2); registry 5xx is transient (3); back off schema-id lookups after a failure (4); a second scheduling thread (5); query API version 2.4.0 and the KB field list (7, 8); imports instead of inline class names (9) (AC-5, AC-6, AC-8)
  - files: oms-core/src/main/java/org/example/oms/mapper/CommandJsonConverter.java, oms-core/src/main/java/org/example/oms/service/reconciliation/EventLogReconciler.java, oms-core/src/main/resources/db/changelog/016-event-metadata-and-writer-schema.yaml, oms-core/src/main/java/org/example/oms/service/WriterSchemaIds.java, oms-core/src/main/resources/application.yml, oms-contracts/src/main/openapi/oms-query-api.yml, oms-knowledge-base/interfaces/query-api.md, oms-core/src/test/java/org/example/oms/integration/EventMetadataIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.EventMetadataIntegrationTest' --tests 'org.example.oms.integration.EventLogReconcilerIntegrationTest' --tests 'org.example.oms.integration.ProjectionSchemaEvolutionIntegrationTest'` passes
- [x] **T-12** Rerun spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0049` exits 0

## Notes

- T-1 comes first: oms-core compiles against the regenerated `OrderEventDto`.
- T-2 adds the columns before any code writes them, so every later test boots against the final schema.
- Other sessions share this working tree; T-10 needs them to pause edits and Gradle in oms-core, oms-contracts and oms-knowledge-base.
- T-6: the sample bound (AC-7) is tested as `EventLogReconcilerIntegrationTest#samplesAtMostTheConfiguredOrders`, not a unit `EventLogReconcilerTest`: the bound is enforced by the SQL limits, which a unit test with a mocked JdbcTemplate could not exercise. The reconciler bean always exists; `oms.reconciliation.enabled` gates only the schedule, so tests call `reconcile()` directly.
- T-10 first run: oms-contracts and the three consumer modules passed; oms-core had 1 failure in 641 tests: OrderEventQueryIntegrationTest#responseHasOnlyContractedProperties pins the response's property set and did not yet list the five SPEC-0049 properties. Added them, as the contract test in oms-contracts already does.
