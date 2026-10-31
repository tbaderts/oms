# Tasks — SPEC-0020: Add projection framework to the write path

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
`gt <Class>` = `cd oms-core && ./gradlew test --tests '*<Class>'`.

- [x] **T-1** Write `ExecutionViewContractTest` (red: no `/executions` path), then add `GET /executions` (tag `Executions`) and `ExecutionViewDto` to `oms-query-api.yml` as in design.md, rebuild oms-contracts and regenerate the oms-core query interfaces (AC-5)
  - files: oms-contracts/src/test/java/org/example/common/contracts/ExecutionViewContractTest.java, oms-contracts/src/main/openapi/oms-query-api.yml
  - verify: `ct ExecutionViewContractTest` passes, `cd oms-contracts && ./gradlew build` passes, and `cd oms-core && ./gradlew openApiGenerateQuery` produces `ExecutionsApi#getExecutions`
- [x] **T-2** Extend `LiquibaseMigrationIntegrationTest` (red: no `payload`/`payload_type`, no `order_execution_view`), then add `007-projections.yaml` (changesets 016, 017 with rollbacks), include it last, and add `OrderExecutionView` + `OrderExecutionViewRepository` and the two `OutboxMessage` fields and `PROJECTION` (AC-1, AC-4)
  - files: oms-core/src/test/java/org/example/oms/integration/LiquibaseMigrationIntegrationTest.java, oms-core/src/main/resources/db/changelog/007-projections.yaml, oms-core/src/main/resources/db/changelog/db.changelog-master.yaml, oms-core/src/main/java/org/example/oms/model/OrderExecutionView.java, oms-core/src/main/java/org/example/oms/repository/OrderExecutionViewRepository.java, oms-core/src/main/java/org/example/oms/model/OutboxMessage.java
  - verify: `gt LiquibaseMigrationIntegrationTest` passes (entities validate against the schema)
- [x] **T-3** Write `AvroPayloadCodecTest` (`roundTripsThroughPostgresJsonb` against Testcontainers Postgres, `refusesTypesOutsideTheMessagePackage`) red, then add `AvroPayloadCodec`; if the jsonb round trip cannot be made to hold, switch to `bytea` + binary Avro and record it in design.md (AC-4)
  - files: oms-core/src/test/java/org/example/oms/mapper/AvroPayloadCodecTest.java, oms-core/src/main/java/org/example/oms/mapper/AvroPayloadCodec.java
  - verify: `gt AvroPayloadCodecTest` passes
- [x] **T-4** Extend `MessagePublisherTest` with `publish_sendsProjectionPayload` and `publish_stillSendsLegacyOrderExecutionRows` (red), then add the `PROJECTION` case to `MessagePublisher` (AC-4)
  - files: oms-core/src/test/java/org/example/oms/service/MessagePublisherTest.java, oms-core/src/main/java/org/example/oms/service/MessagePublisher.java
  - verify: `gt MessagePublisherTest` passes
- [x] **T-5** Write `ProjectTaskTest` (messages handed to the appender in projection-name order; a projection exception fails the task) red, then add the `projection` package (`ProjectionContext`, `StagedMessage`, `Projection`), `ProjectTask` and `OrderEventAppender.stageMessage` (AC-2, AC-4)
  - files: oms-core/src/test/java/org/example/oms/service/execution/tasks/ProjectTaskTest.java, oms-core/src/main/java/org/example/oms/projection/ProjectionContext.java, oms-core/src/main/java/org/example/oms/projection/StagedMessage.java, oms-core/src/main/java/org/example/oms/projection/Projection.java, oms-core/src/main/java/org/example/oms/service/execution/tasks/ProjectTask.java, oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java
  - verify: `gt ProjectTaskTest` passes
- [x] **T-6** Write `EventSourcingIntegrationTest#fill_stagesOrderExecutionAsGenericPayload` and `ProjectionIntegrationTest#fill_writesOneViewRowMatchingItsOrderExecution` (red), then add `OrderExecutionProjection`, wire `ProjectTask` after `PublishExecutionEventTask`, and remove the `ORDER_EXECUTION` staging from `appendExecutionEvent`; adjust `EventSourcingIntegrationTest`'s outbox expectations to the new row type (AC-1, AC-4)
  - files: oms-core/src/test/java/org/example/oms/integration/EventSourcingIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/ProjectionIntegrationTest.java, oms-core/src/main/java/org/example/oms/projection/OrderExecutionProjection.java, oms-core/src/main/java/org/example/oms/service/execution/ExecutionCommandProcessor.java, oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java
  - verify: `gt EventSourcingIntegrationTest`, `gt ProjectionIntegrationTest` and `gt OrderExecutionPublicationIntegrationTest` (SPEC-0019, unchanged) pass
- [x] **T-7** Write `ProjectionIntegrationTest#failingProjection_rollsBackTheFill` (spy throwing) and `#refusedFills_writeNoViewRow`; the rollback and refusal paths exist, so these are expected to pass once T-6 is in; confirm the spy test fails if `ProjectTask` swallows the exception (AC-2, AC-3)
  - files: oms-core/src/test/java/org/example/oms/integration/ProjectionIntegrationTest.java
  - verify: `gt ProjectionIntegrationTest` passes
- [x] **T-8** Write `ExecutionViewQueryIntegrationTest` (`filtersByOrderRootAccountAndTime`, `noMatchReturnsEmptyArray`) red, then add `OrderExecutionViewQueryService`, `ExecutionViewDtoMapper` and `ExecutionViewController implements ExecutionsApi` (AC-5)
  - files: oms-core/src/test/java/org/example/oms/integration/ExecutionViewQueryIntegrationTest.java, oms-core/src/main/java/org/example/oms/service/OrderExecutionViewQueryService.java, oms-core/src/main/java/org/example/oms/mapper/ExecutionViewDtoMapper.java, oms-core/src/main/java/org/example/oms/api/ExecutionViewController.java
  - verify: `gt ExecutionViewQueryIntegrationTest` passes
- [x] **T-9** Write `ProjectionRebuildIntegrationTest` (`rebuild_reproducesTheViewWithoutPublishing` with one fill event's `transaction` nulled, `unknownProjection_is404`) red, then add `ProjectionRebuilder`, `ProjectionsEndpoint` and expose `projections` in `application.yml` (AC-6)
  - files: oms-core/src/test/java/org/example/oms/integration/ProjectionRebuildIntegrationTest.java, oms-core/src/main/java/org/example/oms/projection/ProjectionRebuilder.java, oms-core/src/main/java/org/example/oms/projection/ProjectionsEndpoint.java, oms-core/src/main/resources/application.yml
  - verify: `gt ProjectionRebuildIntegrationTest` passes
- [x] **T-10** Observability: projection failure log with `orderId`, `execId`, projection name; rebuild start/finish logs and the `oms.projection.rebuild` timer
  - files: oms-core/src/main/java/org/example/oms/service/execution/tasks/ProjectTask.java, oms-core/src/main/java/org/example/oms/projection/ProjectionRebuilder.java
  - verify: `gt ProjectTaskTest` and `gt ProjectionRebuildIntegrationTest` pass, and `node specs/tools/spec.mjs check` reports no R08 finding
- [x] **T-11** Update the knowledge base: `capabilities/event-publication.md`, `domain/outbox-message.md`, `interfaces/query-api.md`, new `oms-concepts/projections.md`, `oms-concepts/booking-integration.md`, `oms-concepts/execution-reporting.md` (AC-1, AC-5, AC-6)
  - files: oms-knowledge-base/capabilities/event-publication.md, oms-knowledge-base/domain/outbox-message.md, oms-knowledge-base/interfaces/query-api.md, oms-knowledge-base/oms-concepts/projections.md, oms-knowledge-base/oms-concepts/booking-integration.md, oms-knowledge-base/oms-concepts/execution-reporting.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports 0 errors
- [x] **T-12** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0020` exits 0

## Notes

- T-1 first: the contract and the generated interface come before any controller (P-02).
- T-2 before anything that saves an entity: `ddl-auto: validate` fails the context otherwise.
- T-3 decides the payload storage; if it falls back to `bytea`, T-2's changeset is amended before
  it is ever applied outside test databases (it is new in this ticket).
- T-6 moves the `OrderExecution` staging; SPEC-0019's publication tests must stay green unchanged.
- T-7 is mostly a guard on existing rollback and refusal behaviour; the spy test proves the new task
  does not swallow failures.

<!-- Optional: sequencing constraints, tasks added during implementation and why. -->
- Implementation notes:
  - T-2: the new `PROJECTION` enum value made `MessagePublisher`'s switch non-exhaustive; a
    throwing placeholder case kept oms-core compiling until T-4 replaced it, test-first.
  - T-3 took the planned fallback: `payload` is `BYTEA` with binary Avro (design.md → Alternatives &
    Decisions), because jsonb rejects the `\u0000` escapes Avro's JSON encoding writes for decimals.
  - T-6 also changed SPEC-0019's `relayRedelivery_carriesTheSameDedupKey`: it republished an
    `ORDER_EXECUTION` row, which still passed through the legacy path but no longer modelled what the
    relay redelivers; it now republishes a `PROJECTION` row built as the projection stages it.
  - T-7: the rollback test was checked by mutation (with `ProjectTask` swallowing the failure, it
    failed with a 201); the code was restored.
  - T-8: `AbstractFillFlowIntegrationTest` holds the order and fill helpers the three projection
    test classes share, instead of a third copy.
