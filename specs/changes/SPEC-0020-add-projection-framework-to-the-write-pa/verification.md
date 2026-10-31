# Verification — SPEC-0020: Add projection framework to the write path

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

The final `spec verify` (19:13Z) executed oms-core's tests (46 classes, 225 tests, 0 failures,
0 skipped, 19:11–19:13Z). oms-contracts' tests were up to date: they last ran in T-1
(`ExecutionViewContractTest` 2/2) and the module has not changed since. Each method below is in
`<module>/build/test-results/test/TEST-*.xml` with no `<failure>` or `<skipped>`, and each was read
against its AC.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | One view row per applied fill (REST and Kafka), equal to its `OrderExecution` | `ProjectionIntegrationTest#fill_writesOneViewRowMatchingItsOrderExecution`: a REST fill (near-midnight `transactTime`) and a Kafka fill; the two `OrderExecution` records consumed from `oms_order_executions`; for each, exactly one row by `(orderId, execId)` whose 20 checked columns (identity, account, side, symbol, ordType, price, quantities, fill fields, `transactTime`, state, `orderVersion`, `tradeDate`) equal the record. Red before T-6 (no row) | PASS |
| AC-2 | A failing projection refuses the fill and stores nothing | `ProjectionIntegrationTest#failingProjection_rollsBackTheFill`: spy throws once; fill not 201; order state, `cumQty`, `txNr` unchanged; no `executions` row, no view row, event versions still [1, 2]; the next fill gets version 3, so the failed fill committed no event and no outbox row (both share its transaction and version). Mutation-checked: with `ProjectTask` swallowing the exception the test fails (tasks.md Notes) | PASS |
| AC-3 | Refused fills (duplicate `execId`, overfill) leave the view unchanged | `ProjectionIntegrationTest#refusedFills_writeNoViewRow`: both refused; still one row for the order, same id, same `lastQty` and `orderVersion` | PASS |
| AC-4 | `OrderExecution` staged as generic payload; published record unchanged; pre-migration `ORDER_EXECUTION` rows still publish | `EventSourcingIntegrationTest#fill_stagesOrderExecutionAsGenericPayload` (relay off): staged rows `ORDER, ORDER, EXECUTION, PROJECTION`; `payload_type` `org.example.common.model.msg.OrderExecution`; the payload decodes to the expected record (version 2, cumQty, account). `OrderExecutionPublicationIntegrationTest` (SPEC-0019, all 6 methods) passes with the projection publishing: same key, field values, ordering, refusals. `AvroPayloadCodecTest#roundTripsThroughPostgresBytea` (real Postgres, decimal with zero bytes) and `#refusesTypesOutsideTheMessagePackage`. `MessagePublisherTest#publish_sendsProjectionPayload` and `#publish_stillSendsLegacyOrderExecutionRows` | PASS |
| AC-5 | `GET /api/query/executions` filters, ordering, fields, empty result, contract | `ExecutionViewQueryIntegrationTest#filtersByOrderRootAccountAndTime`: by `orderId` (oldest first), `rootOrderId` (child under a root, and a root-less order as its own root), `account`, time range (from inclusive, to exclusive, both checked); the fields of AC-1 asserted on the JSON. `#noMatchReturnsEmptyArray`: `200 []`. oms-contracts `ExecutionViewContractTest` (path, operationId, six parameters; 28 DTO properties). Red before T-8 (404) and T-1 | PASS |
| AC-6 | Rebuild reproduces the rows, including a fill without stored command; publishes nothing; unknown → 404 | `ProjectionRebuildIntegrationTest#rebuild_reproducesTheViewWithoutPublishing`: three fills on two orders; one fill event's `transaction` set to null (the pre-SPEC-0018 REST shape); `POST /actuator/projections/order_execution_view/rebuild` → 200 with `rows` = table count; the orders' rows equal before and after (every column but the surrogate id and `projected_at`); after a later fill on each order, exactly the three fills and the two sentinels are on `oms_order_executions`. `#unknownProjection_is404` | PASS |

## Goal Assessment

The Goal (roadmap ticket C, review §5 items 2–4):

- **A `Projection` interface and a `ProjectTask` that runs every projection bean in the command
  transaction after `UpdateOrderTask`.** Done (AC-1, AC-2). `ProjectTask` runs after
  `PublishExecutionEventTask`, still after `UpdateOrderTask`, because the event version a
  projection records is assigned there (design.md).
- **A generic outbox payload column and a `payload_type` discriminator in a new changeset.** Done
  (AC-4): `007-projections.yaml`, changeset 016. `payload` is `BYTEA` with binary Avro, not the
  `JSONB` the proposal named: Postgres `jsonb` rejects the `\u0000` escapes Avro's JSON encoding
  writes for decimals, which `AvroPayloadCodecTest` demonstrated; recorded in design.md. The
  column is generic as the Goal asks; only its storage type differs from the proposal's wording.
- **The `order_execution_view` projection table and `GET /api/query/executions` served from it.**
  Done (AC-1, AC-5), contract-first.
- **A `ProjectionRebuilder` that rebuilds any projection from `order_events` and `executions`.**
  Done (AC-6), triggered by the actuator endpoint confirmed at proposal approval; it works for any
  registered projection by name.

Out of scope as agreed: projections on other pipelines, republishing during a rebuild, `ORDER` and
`EXECUTION` on the generic payload, the hidden `/api/executions`, the read replica, trees.

No material gap between the Goal and what was delivered.

## Policy Review

Reviewed against the diff of the SPEC-0020 files (tasks.md lists them). The working tree also
holds uncommitted work of earlier, finished tickets; not judged here.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | `/executions` and `ExecutionViewDto` only in `oms-contracts/src/main/openapi/oms-query-api.yml` |
| P-02 | Specification before code, generated models only | PASS | Contract first (T-1); `query.ExecutionViewDto` and `ExecutionsApi` generated |
| P-03 | Never edit generated code | PASS | Regenerated only |
| P-04 | Contracts evolve compatibly | PASS | One additive path and schema; no Avro change; Kafka output unchanged (AC-4) |
| P-05 | Every state change is recorded in the event log | PASS | No new state change; projections derive from the event's change and rebuild from the log (AC-6) |
| P-06 | Kafka only through the transactional outbox | PASS | Projection messages staged by `OrderEventAppender.stageMessage` in the command transaction; only the relay publishes; the rebuild stages nothing (AC-6); `spec check` R04 clean |
| P-07 | Schema changes through new Liquibase changesets | PASS | New `007-projections.yaml` (016, 017) with rollbacks, included last; 001–006 untouched; `LiquibaseMigrationIntegrationTest#projectionSchemaIsApplied`; entities validate. Changeset 016 was amended (JSONB → BYTEA) during T-3, before it was applied anywhere but test databases |
| P-08 | Concurrency and idempotency are explicit | PASS | Unique `(order_id, execid)`; upsert by key; duplicate fills refused before projection (AC-3); rebuild under an exclusive table lock |
| P-09 | Commands and queries stay separate | PASS | The view is written in the command path or by the rebuild only; `OrderExecutionViewQueryService` is `@Transactional(readOnly = true)` |
| P-10 | State transitions go through the state machine and task pipeline | PASS | Projections run as a pipeline task; no transition change |
| P-11 | Layering and conventions | PASS | Controller → service → repository; MapStruct `ExecutionViewDtoMapper`; `projection` package; constructor injection; follows `OrderEventController` |
| P-12 | Jackson 3 only | PASS | No Jackson usage added |
| P-13 | Errors and validation follow the framework specs | PASS | Pipeline failures answer as other pipeline failures; query parameters validated by the generated interface (`limit` 1–5000, ISO date-times) |
| P-14 | Test first, every AC proven by an automated test | PASS | Every AC has a test above, each seen red first except AC-2/AC-3 (guards on rollback and refusal paths; AC-2 mutation-checked) |
| P-15 | Observability | PASS | `ProjectTask` logs a projection failure with projection, `orderId`, `execId`, version; the rebuild logs start and rows/orders/duration and records `oms.projection.rebuild`; `spec check` R08 clean |
| P-16 | Security | PASS | Payload type resolution restricted to `org.example.common.model.msg`; rebuild endpoint unauthenticated like the other management endpoints, accepted at proposal approval and documented in `oms-concepts/projections.md`; the table name in the lock statement comes from a registered bean, not the request |
| P-17 | Simplicity and dependencies | PASS | No new library or service; `spec check` no warnings |
| P-18 | Modules build standalone | PASS | `spec verify` ran oms-core, oms-contracts, oms-streaming-service, oms-mcp-server, oms-exchange-simulator, all exit 0 |
| P-19 | Documentation follows behaviour | PASS | New `oms-concepts/projections.md` (+ index); `interfaces/query-api.md`; `domain/outbox-message.md`; `capabilities/event-publication.md`; `oms-concepts/execution-reporting.md` (7-task pipeline); `oms-concepts/booking-integration.md` (reconciliation source); `okf-check` 0 errors, 0 warnings |

## Independent Review

<!-- PENDING: spec-reviewer findings -->

## Automated Evidence

`evidence/last-run.json`, ran 2026-10-31T19:13:50Z, result **pass**, fingerprint
`1c11446b8ac20ad8`. Policy check: PASS, no errors, no warnings.

| Module | Command | Exit | Log |
|---|---|---|---|
| oms-core | `./gradlew check` | 0 (`test` executed: 46 classes, 225 tests, 0 failures, 0 skipped) | evidence/oms-core-1.log |
| oms-contracts | `./gradlew check` | 0 (`test` up to date; last executed in T-1, 7 classes, 12 tests, 0 failures) | evidence/oms-contracts-1.log |
| oms-streaming-service | `./gradlew check` | 0 | evidence/oms-streaming-service-1.log |
| oms-mcp-server | `./gradlew check` | 0 | evidence/oms-mcp-server-1.log |
| oms-exchange-simulator | `./gradlew check` | 0 | evidence/oms-exchange-simulator-1.log |

## Follow-ups

- Run `POST /actuator/projections/order_execution_view/rebuild` once after deploying, to fill the
  view for existing fills.
- Migrate oms-ui from the hidden `/api/executions` to `GET /api/query/executions`, then retire the
  hidden endpoint (review finding 10).
- Authentication for the management endpoints, now that one of them writes.
- Projections on other pipelines when a projection needs order changes other than fills.
- Republish on rebuild, when a consumer needs to be re-fed.

## Verdict

Verdict: <!-- PENDING -->
