# Design — SPEC-0020: Add projection framework to the write path

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

**Fill pipeline.** `ExecutionCommandProcessor.buildPipeline()` assembles `ValidateExecutionTask` →
`CalculateOrderQuantitiesTask` → `DetermineOrderStateTask` → `PersistExecutionTask` →
`UpdateOrderTask` → `PublishExecutionEventTask` (`stopOnFailure`), and rolls the transaction back
when the pipeline fails. `PublishExecutionEventTask` calls
`OrderEventAppender.appendExecutionEvent(order, execution, event, command)`, which appends the
`order_events` row (version `v`, put into the context as `"eventVersion"`) and, since SPEC-0019,
stages three outbox rows: `ORDER`, `EXECUTION`, `ORDER_EXECUTION` (both payload columns), all keyed
by `OrderEventAppender.partitionKey(order)`.

**Publication.** `OutboxRelay` drains `outbox` in id order; `MessagePublisher.publish` switches on
`OutboxMessage.AggregateType` and maps `ORDER_EXECUTION` with
`OrderExecutionMessageMapper.toOrderExecutionMessage(execution, order, version, createdAt)`.
`outbox` columns (`003-event-sourcing-and-outbox.yaml`): `aggregate_type VARCHAR(32)`,
`aggregate_id`, `topic`, `aggregate_version`, `order_payload jsonb`, `execution_payload jsonb`,
`created_at`, `attempts`, `last_error`. Latest changelog: `006-order-event-command-id.yaml`.

**Event log.** `order_events` rows carry `event` (`PARTIAL_FILL`/`FILL` for fills), `version`,
`transaction` (the command; for fills an `ExecutionCreateCmd` with `execution.execId`, null for REST
fills before SPEC-0018), `order_snapshot` (the order after the change) and `time_stamp`.
`executions` holds every applied fill, unique on `(order_id, execid)`.

**Query side.** `oms-query-api.yml` has `/search` (tag `Search`) and, since SPEC-0035,
`/orders/{orderId}/events` (tag `Orders`, served by `OrderEventController implements OrdersApi`
under `/api/query`). The hidden `ExecutionController` at `/api/executions` is used by oms-ui.

**Actuator.** `management.endpoints.web.exposure.include: health,info,prometheus,metrics`.

**Closest examples.** `OrderEventController` + `OrderEventDtoMapper` (SPEC-0035) for a contracted
query endpoint; the outbox staging in `OrderEventAppender`; `OrderExecutionPublicationIntegrationTest`
(SPEC-0019) for topic assertions; `006-order-event-command-id.yaml` for a changeset with rollback.

**Read:** the architecture review §5; `oms-framework/task-orchestration-framework_spec.md`,
`testing-patterns.md`; `interfaces/query-api.md`; the policies.

## Approach

```mermaid
sequenceDiagram
    participant P as ExecutionCommandProcessor (tx)
    participant PE as PublishExecutionEventTask
    participant PT as ProjectTask
    participant OEP as OrderExecutionProjection
    participant A as OrderEventAppender
    participant DB as Postgres
    P->>PE: append event v; stage ORDER, EXECUTION
    P->>PT: run projections
    PT->>OEP: project(ProjectionContext{order, execution, v, command, now})
    OEP->>DB: upsert order_execution_view row
    OEP-->>PT: [StagedMessage(OrderExecution record, topic, key, v)]
    PT->>A: stageMessage(...)
    A->>DB: outbox row aggregate_type PROJECTION, payload_type, payload
```

**New package `org.example.oms.projection`:**

- `ProjectionContext` (record): `Order order` (after the change), `Execution execution`,
  `long orderVersion`, `Command command`, `Instant stagedAt`.
- `StagedMessage` (record): `String topic`, `String key`, `long version`,
  `SpecificRecord payload`.
- `Projection` (interface):
  - `String name()` — the table name, e.g. `order_execution_view`; the rebuild selector;
  - `List<StagedMessage> project(ProjectionContext context)` — upserts this projection's rows for
    the change and returns the messages to stage;
  - `void clear()` — deletes all of this projection's rows (rebuild).
- `OrderExecutionProjection implements Projection` (`@Component`): upserts
  `OrderExecutionView` by `(orderId, execId)` from the context, and returns one `StagedMessage` with
  the `OrderExecution` record from `OrderExecutionMessageMapper` (topic
  `kafka.order-execution-topic`, key `OrderEventAppender.partitionKey(order)`).
- `ProjectionRebuilder` (`@Service`): `int rebuild(String name)` (see Events & Messaging).
- `ProjectionsEndpoint` (`@Component @Endpoint(id = "projections")`): `@WriteOperation
  rebuild(@Selector String name, @Selector String action)`; `action` must be `rebuild`
  (else 400); unknown name → `WebEndpointResponse` 404; otherwise 200 with
  `{"projection": name, "rows": n}`. Path: `POST /actuator/projections/{name}/rebuild`.

**Changed:**

- `ProjectTask` (`org.example.oms.service.execution.tasks`, `Task<OrderTaskContext>`): builds the
  `ProjectionContext` from the task context (`order`, `execution`, `"eventVersion"`, `command`,
  `Instant.now()`), calls every `Projection` bean in a stable order (by `name()`), and hands each
  returned message to `OrderEventAppender.stageMessage(...)`. Any exception fails the task, so the
  pipeline fails and the processor rolls the transaction back (AC-2).
- `ExecutionCommandProcessor.buildPipeline()`: `.addTask(projectTask)` after
  `publishExecutionEventTask`. It is still after `UpdateOrderTask` (the Goal); it must follow the
  publish task because that is where the event version is assigned, and staging after it keeps the
  outbox order `ORDER`, `EXECUTION`, `OrderExecution` that SPEC-0019 established.
- `OrderEventAppender`: `appendExecutionEvent` no longer stages the `ORDER_EXECUTION` row; new
  `stageMessage(StagedMessage)` saves an outbox row `aggregateType PROJECTION`, `aggregateId` = key,
  `topic`, `aggregateVersion`, `payloadType` = the record's schema full name, `payload` = the
  record's Avro JSON encoding, `createdAt`, `attempts 0`. Outbox writes stay in the appender (P-06).
- `OutboxMessage`: `AggregateType.PROJECTION`; fields `payloadType` (`payload_type`) and `payload`
  (`payload`, `jsonb`, mapped as `String` with `@JdbcTypeCode(SqlTypes.JSON)`). `ORDER_EXECUTION`
  stays for rows staged before the migration.
- `MessagePublisher`: `case PROJECTION -> payloadCodec.decode(payloadType, payload)`.
- New `org.example.oms.mapper.AvroPayloadCodec` (`@Component`): `String encode(SpecificRecord)` with
  `SpecificDatumWriter(record.getClass())` + `EncoderFactory.jsonEncoder`; `SpecificRecord
  decode(String type, String json)` resolves the class only inside
  `org.example.common.model.msg` (any other type → `IllegalStateException`) and decodes with
  `SpecificDatumReader` + `DecoderFactory.jsonDecoder`. Using the record's own class keeps the
  decimal and date conversions.
- Query: `ExecutionViewController` (`@RestController @RequestMapping("/api/query") implements
  ExecutionsApi`) → `OrderExecutionViewQueryService` (read-only transaction, JPA Specification over
  the filters, sort `transactTime` asc then `id` asc, `limit`) → `ExecutionViewDtoMapper`
  (MapStruct) to `query.ExecutionViewDto`.
- `application.yml`: `management.endpoints.web.exposure.include` gains `projections`.

## Contract Changes

`oms-query-api.yml`, additive (P-04), new tag `Executions` → generated `ExecutionsApi`:

```yaml
  /executions:
    get:
      operationId: getExecutions
      summary: Fills with the order as of each fill
      description: |
        One entry per applied fill from the order-execution projection, oldest first
        (transactTime, then storage order). Filters combine with AND. Returns an empty array when
        nothing matches.
      tags: [Executions]
      parameters:
        - { name: orderId, in: query, required: false, schema: { type: string } }
        - { name: rootOrderId, in: query, required: false, schema: { type: string } }
        - { name: account, in: query, required: false, schema: { type: string } }
        - name: transactTimeFrom
          in: query
          required: false
          schema: { type: string, format: date-time }
          description: Inclusive lower bound on transactTime
        - name: transactTimeTo
          in: query
          required: false
          schema: { type: string, format: date-time }
          description: Exclusive upper bound on transactTime
        - name: limit
          in: query
          required: false
          schema: { type: integer, format: int32, minimum: 1, maximum: 5000, default: 1000 }
      responses:
        '200':
          description: Matching fills, oldest first
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/ExecutionViewDto' }
        '400': { description: Invalid parameter }
components:
  schemas:
    ExecutionViewDto:
      type: object
      description: One applied fill with the order as of that fill (order_execution_view).
      required: [orderId, execId, orderVersion]
      properties:
        orderId: { type: string }
        execId: { type: string }
        rootOrderId: { type: string }
        parentOrderId: { type: string }
        leg: { type: string }
        clOrdId: { type: string }
        sessionId: { type: string }
        account: { type: string }
        side: { type: string }
        symbol: { type: string }
        securityId: { type: string }
        ordType: { type: string }
        price: { type: number }
        orderQty: { type: number }
        settlCurrency: { type: string }
        exDestination: { type: string }
        lastQty: { type: number }
        lastPx: { type: number }
        execType: { type: string }
        lastCapacity: { type: string }
        lastMkt: { type: string }
        transactTime: { type: string, format: date-time }
        cumQty: { type: number }
        leavesQty: { type: number }
        avgPx: { type: number }
        state: { type: string }
        orderVersion: { type: integer, format: int64 }
        tradeDate: { type: string, format: date }
```

Generated: `query.ExecutionViewDto` (oms-contracts), `ExecutionsApi` (oms-core
`openApiGenerateQuery`). No Avro change.

## Data & Persistence

New `oms-core/src/main/resources/db/changelog/007-projections.yaml`, included last from
`db.changelog-master.yaml`; 001–006 untouched (P-07).

- changeset `016-outbox-generic-payload`: `addColumn outbox`: `payload_type VARCHAR(255)` nullable,
  `payload JSONB` nullable. Rollback: drop both columns.
- changeset `017-order-execution-view`: `createSequence order_execution_view_seq`; `createTable
  order_execution_view`: `id BIGINT` PK; `order_id VARCHAR(255) NOT NULL`, `execid VARCHAR(255) NOT
  NULL`, `root_order_id`, `parent_order_id`, `leg`, `cl_ord_id`, `session_id`, `account`, `side`,
  `symbol`, `security_id`, `ord_type`, `settl_currency`, `ex_destination`, `exec_type`,
  `last_capacity`, `last_mkt`, `state` (`VARCHAR(255)`); `price`, `order_qty`, `last_qty`,
  `last_px`, `cum_qty`, `leaves_qty`, `avg_px` (`NUMERIC`); `transact_time TIMESTAMP WITH TIME ZONE`;
  `order_version BIGINT NOT NULL`; `trade_date DATE`; `projected_at TIMESTAMP WITH TIME ZONE NOT
  NULL`. `addUniqueConstraint uq_order_execution_view_order_id_execid (order_id, execid)`; indexes
  `idx_oev_root_order_id`, `idx_oev_account`, `idx_oev_transact_time`. Rollback: drop table and
  sequence.

The changeset ids continue the global numbering (006 used 014/015). Entity
`org.example.oms.model.OrderExecutionView` (`@Entity`, Lombok, sequence generator) matching the
table; `OrderExecutionViewRepository extends JpaRepository, JpaSpecificationExecutor` with
`Optional<OrderExecutionView> findByOrderIdAndExecId(String, String)`. No backfill: the view starts
empty and one rebuild fills it (proposal).

`LiquibaseMigrationIntegrationTest` gains assertions for the two columns, the table and its unique
constraint.

## Events & Messaging

- **`order_events` (P-05):** unchanged. A projection is derived from the event's change, not an
  event.
- **Outbox (P-06):** per applied fill, in id order: `ORDER`, `EXECUTION`, then the
  `PROJECTION` row with `payload_type org.example.common.model.msg.OrderExecution`, all with the
  same key and version. On `oms_order_executions` the record is field-for-field what SPEC-0019
  published: same mapper, same key; `tradeDate`'s fallback uses the projection's `stagedAt`
  (`Instant.now()` in the transaction, as `createdAt` was). `ORDER_EXECUTION` rows staged before
  deployment are still published by the existing case (AC-4).
- **Consumers:** no change; the SPEC-0019 publication tests and streaming tests stay green.
- **Rebuild:** `ProjectionRebuilder.rebuild(name)` in one `@Transactional` method:
  1. `LOCK TABLE <name> IN EXCLUSIVE MODE` (fills block on their insert until the rebuild commits);
  2. `projection.clear()`;
  3. for each `order_id` in `order_events` (ascending), its fill events (`PARTIAL_FILL`, `FILL`)
     by `version` and its `executions` by `id`; each fill event is matched to its execution by
     `execId` from the stored `ExecutionCreateCmd` when present, otherwise positionally (the k-th
     fill event to the k-th execution of that order; both are written in the same transaction in
     the same order). An unmatched fill event fails the rebuild (rollback, 500) with the order id;
  4. `projection.project(new ProjectionContext(snapshot, execution, version, command,
     event.timeStamp))`, discarding the returned messages: nothing is staged or published;
  5. returns the number of rows written.
- **Idempotency (P-08):** the view is unique on `(order_id, execid)`; `project` upserts by that key,
  so re-projecting the same fill rewrites the same row. Duplicate fills are refused before the
  pipeline reaches `ProjectTask` (AC-3).

## Domain, State & Orchestration

- No state machine change. The fill pipeline gains one task, `ProjectTask`, after
  `PublishExecutionEventTask` (P-10: the pipeline stays validate → state → persist → publish, and
  projecting is part of persisting the change's read model).
- Errors: a projection failure fails the pipeline like any task failure; REST answers as for other
  pipeline failures (`CommandResult` FAILED), Kafka follows the existing failed-command handling.
  The query endpoint validates `limit` and the date-times through the generated interface (400 on
  malformed values, P-13).

## Alternatives & Decisions

- **`ProjectTask` after `PublishExecutionEventTask`, not between `UpdateOrderTask` and it.** The
  version a projection records is assigned when the event is appended; running earlier would need
  the version to be computed twice. Still after `UpdateOrderTask`, as the Goal says.
- **Projections stage messages through `OrderEventAppender.stageMessage`.** Rejected: projections
  saving outbox rows themselves (two places writing the outbox; P-06 review harder).
- **Generic payload as the Avro record's JSON encoding in a `jsonb` column**, with the schema's full
  name as `payload_type`. Rejected: Jackson-serialising the Avro record (Avro getters and schema
  fields do not round-trip); `bytea` with binary Avro (exact and compact, but unreadable in the
  database, and the proposal and review name JSONB). Risk: Postgres `jsonb` reorders object keys;
  Avro's JSON decoder accepts record fields in any order. T-3's round-trip test proves it against
  Postgres; if it fails, the fallback is `bytea` with binary encoding, recorded here.
- **Type resolution restricted to `org.example.common.model.msg`.** A tampered `payload_type`
  cannot load arbitrary classes (P-16).
- **Rebuild via an actuator endpoint**, confirmed at proposal approval. Rejected: a startup flag or
  CLI runner (less convenient). The endpoint is unauthenticated like the rest of the management
  surface; noted in the KB.
- **Positional matching for fill events without a command.** Rejected: skipping them (the view
  would miss fills); matching on quantities (ambiguous for equal fills).
- **Query results as an array with `limit`** rather than paging. The filters are selective; paging
  can be added additively.
- **No new dependency or build change** (P-17): Avro encoding is in `org.apache.avro`, already
  on the classpath; actuator is already used.
- **Changed during implementation (T-3): `payload` is `BYTEA` holding the binary Avro encoding, not
  `JSONB` with the JSON encoding**, as the proposal and the decision above said. Avro's JSON
  encoding writes a decimal's bytes as `\u00XX` escapes, and Postgres `jsonb` rejects `\u0000`
  ("unsupported Unicode escape sequence"); `AvroPayloadCodecTest` hit it with 6.5536 (unscaled
  0x010000). Binary is exact and was the fallback named above. Changeset 016 was edited before it
  was applied anywhere but test databases. Consequence, as with JSON: the writer schema is the
  class's schema, so pending `PROJECTION` rows must be published before a deployment that changes
  the record; documented in the KB.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Avro JSON round trip through `jsonb` changes the record | T-3 round-trip test against Postgres; AC-4 compares the published record with SPEC-0019's expectations |
| A projection bug blocks all fills | Intended (consistency first, AC-2); failures are logged with `orderId`, `execId` and the projection name |
| Rebuild locks fills for its duration | Exclusive lock only on the view table; dev-scale data; documented as an operator action |
| Fill path cost: one more row (view) per fill | One insert and one upsert lookup by unique key; measured later with the load harness (SPEC-0024) |
| Pending `ORDER_EXECUTION` rows at deployment | The existing publisher case stays; covered by a test |

## Test Strategy

| AC | Level | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | integration | `ProjectionIntegrationTest#fill_writesOneViewRowMatchingItsOrderExecution` (new) | REST and Kafka fills; one `order_execution_view` row per `(orderId, execId)`; its fill fields, order fields, `orderVersion`, `tradeDate` equal the `OrderExecution` consumed from `oms_order_executions` |
| AC-2 | integration | `ProjectionIntegrationTest#failingProjection_rollsBackTheFill` (new; `@MockitoSpyBean OrderExecutionProjection` throwing) | Fill refused; counts of `executions`, `order_events`, `outbox`, view unchanged; order state, `cumQty`, `txNr` unchanged |
| AC-3 | integration | `ProjectionIntegrationTest#refusedFills_writeNoViewRow` (new) | Duplicate `execId` and overfill refused; view rows of the order unchanged |
| AC-4 | integration + unit | `EventSourcingIntegrationTest#fill_stagesOrderExecutionAsGenericPayload` (new; Kafka and the relay are off in that class, so the staged rows stay: `ORDER`, `EXECUTION`, `PROJECTION` with `payload_type` `OrderExecution` and a payload that decodes to the expected record); `OrderExecutionPublicationIntegrationTest` (SPEC-0019, unchanged, all 6 methods); `AvroPayloadCodecTest#roundTripsThroughPostgresJsonb` (new, Testcontainers) and `#refusesTypesOutsideTheMessagePackage`; `MessagePublisherTest#publish_sendsProjectionPayload` and `#publish_stillSendsLegacyOrderExecutionRows` | Generic staging; unchanged wire output; legacy rows still publish |
| AC-5 | integration | `ExecutionViewQueryIntegrationTest#filtersByOrderRootAccountAndTime` and `#noMatchReturnsEmptyArray` (new, MockMvc); `ExecutionViewContractTest` in oms-contracts (new: path, parameters, schema present) | Each filter returns exactly the matching fills oldest first with AC-1's fields; empty → `200 []`; contract present |
| AC-6 | integration | `ProjectionRebuildIntegrationTest#rebuild_reproducesTheViewWithoutPublishing` and `#unknownProjection_is404` (new, MockMvc on `/actuator/projections/...`) | Snapshot view rows; null one fill event's `transaction` (pre-SPEC-0018 shape); `POST .../order_execution_view/rebuild` → 200; rows equal the snapshot (ids aside); outbox count unchanged and no new record on any topic after a sentinel; unknown name → 404 |

Also: `LiquibaseMigrationIntegrationTest` (columns, table, constraint), `ProjectTaskTest` (unit:
messages handed to the appender in projection order, exception fails the task).

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | comply | The new path and schema are in `oms-contracts/src/main/openapi/oms-query-api.yml` only |
| P-02 | Specification before code, generated models only | comply | Contract first (first tasks); `query.ExecutionViewDto` and `ExecutionsApi` are generated |
| P-03 | Never edit generated code | comply | Regenerated only |
| P-04 | Contracts evolve compatibly | comply | One new path and schema, additive; no Avro change; Kafka output unchanged |
| P-05 | Every state change is recorded in the event log | comply | No new state change; projections derive from the event's change and are rebuildable from the log |
| P-06 | Kafka only through the transactional outbox | comply | Projection messages are staged by `OrderEventAppender.stageMessage` in the command transaction; only the relay publishes; the rebuild stages nothing |
| P-07 | Schema changes through new Liquibase changesets | comply | New `007-projections.yaml` with rollbacks; 001–006 untouched; entities match (`ddl-auto: validate`) |
| P-08 | Concurrency and idempotency are explicit | comply | Unique `(order_id, execid)` on the view; upsert by key; duplicate fills refused before projection; rebuild under an exclusive table lock |
| P-09 | Commands and queries stay separate | comply | The view is written only in the command path or by the rebuild; the query endpoint is read-only (read-only transaction) |
| P-10 | State transitions go through the state machine and task pipeline | comply | Projection runs as a pipeline task; no transition change |
| P-11 | Layering and conventions | comply | Thin controller → service → repository; MapStruct for the DTO; projection package for the framework; constructor injection |
| P-12 | Jackson 3 only | comply | Avro's own JSON encoder; no Jackson usage added |
| P-13 | Errors and validation follow the framework specs | comply | Pipeline failures answer as today; query parameter validation via the generated interface (400 Problem+JSON) |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Every AC has a named test above, written red first in the plan |
| P-15 | Observability | comply | `ProjectTask` logs projection failures with `orderId`, `execId`, projection name; the rebuild logs start, rows written and duration; a `oms.projection.rebuild` timer |
| P-16 | Security | comply | Payload type resolution restricted to the message package; the rebuild endpoint is exposed like the existing management endpoints (unauthenticated, as confirmed at proposal approval), documented in the KB |
| P-17 | Simplicity and dependencies | comply | No new library or service; alternatives above |
| P-18 | Modules build standalone | comply | oms-contracts first; verify builds every consumer |
| P-19 | Documentation follows behaviour | comply | KB pages below |

## Knowledge Base Updates

- `capabilities/event-publication.md`: projections stage messages through the appender; the
  `PROJECTION` outbox type and the generic payload.
- `domain/outbox-message.md`: `payloadType`, `payload`, `PROJECTION`.
- `interfaces/query-api.md`: `GET /api/query/executions`, filters, ordering, limit.
- New `oms-concepts/projections.md` (or a section in `architecture/`): what a projection is, where
  it runs, consistency, rebuild (endpoint, lock, legacy matching, run once after deployment).
- `oms-concepts/booking-integration.md`: reconciliation can read `order_execution_view` /
  `GET /api/query/executions`.
- `oms-concepts/execution-reporting.md` (pipeline list) if it lists the six tasks: add `ProjectTask`.
