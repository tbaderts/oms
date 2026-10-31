# Verification — SPEC-0035: Add order-events endpoint to the query contract

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

Test results checked in `oms-core/build/test-results/test/` and
`oms-contracts/build/test-results/test/`: every class below has 0 failures, 0 errors, 0 skipped.
Gradle reused up-to-date test results where the inputs had not changed since they were produced
(oms-contracts since T-1). Those results belong to the current sources.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Contract declares `GET /orders/{orderId}/events`, entry schema with the 8 properties, `event` enum = oms-core `Event`; `searchOrders` unchanged; contracts `check` green | `OrderEventContractTest#orderEventDtoHasContractedProperties`, `#orderEventTypeHasEightKinds` (evidence/oms-contracts-1.log); `OrderEventDtoMapperTest#eventKindsMatchContract`; `OrderEventQueryIntegrationTest#apiDocsDeclareEventLogOperation` (operationId, required path param `orderId`, `/api/query/search` still present) (evidence/oms-core-1.log). `git diff` of `oms-query-api.yml` is additive only. The MapStruct enum mapping fails compilation if `Event` gains a value the contract lacks | PASS |
| AC-2 | Create + accept → `200`, 2 entries in version order, fields equal stored rows | `OrderEventQueryIntegrationTest#returnsEventLogInVersionOrder` (versions 1, 2; `event`, `resultingState`, `commandId`, `timeStamp`, `transaction.type`, `orderSnapshot.orderId` against `order_events`); `#carriesTheStoredCommandId` (a non-null `commandId` round-trips, added after review finding 1); `OrderEventDtoMapperTest#mapsEveryField` | PASS |
| AC-3 | No property outside the contracted schema, no `id` | `OrderEventQueryIntegrationTest#responseHasOnlyContractedProperties` | PASS |
| AC-4 | Unknown order → `200 []` | `OrderEventQueryIntegrationTest#unknownOrderReturnsEmptyArray` | PASS |
| AC-5 | Path in `/v3/api-docs`; old path → `404` | `OrderEventQueryIntegrationTest#apiDocsDeclareEventLogOperation`, `#oldPathIsGone` (old path called for an existing order) | PASS |
| AC-6 | Cockpit follow-up requests `/api/query/orders/<encoded id>/events`, renders timeline; `npm test` green | `test/main/OmsHttpService.test.ts` "followUp loads the order and events sorted by version" (exact URL `…/api/query/orders/O%201/events`, version order); `test/shared/apiExplorer.test.ts` "eventsPath is the contracted event-log operation under the query prefix" (reads the contract YAML); `npm test` 485 passed, 2 skipped (evidence/developer-cockpit-2.log) | PASS |

## Goal Assessment

The goal was to contract the order-events endpoint as a query operation, as agreed in SPEC-0007,
and fix whatever that breaks. That is done:
- the event log is now `getOrderEvents` in `oms-query-api.yml`;
- oms-core implements it from the generated `OrdersApi`, and it appears in `/v3/api-docs`;
- the response shape is contracted and no longer exposes the entity or its database id;
- the old `@Hidden` path is removed;
- its only code consumer, developer-cockpit, moved to the new path, and its tests prove it.

Left out on purpose, per the proposal: paging, replay over HTTP, and the other hand-written read
endpoints. Remaining gap: architecture documents in `mission-control/docs/` still name the removed
path. They are design notes for a module outside this ticket, not code. Listed under Follow-ups.

## Policy Review

Reviewed against `git diff ad7c3d0c` plus untracked files, limited to SPEC-0035's files. The
working tree also holds uncommitted SPEC-0019 work, which this review does not cover.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | only `oms-contracts/src/main/openapi/oms-query-api.yml` changed; `verifyContracts` green |
| P-02 | Specification before code, generated models only | PASS | contract changed first (T-1). `OrderEventDto`, `OrderEventType` and `OrdersApi` are generated; no DTO is hand-written |
| P-03 | Never edit generated code | PASS | nothing under `build/generated*` was edited |
| P-04 | Contracts evolve compatibly | PASS | additive path and schemas. Removing the uncontracted endpoint is marked BREAKING, with its consumer, in the proposal (approved) |
| P-05 | Every state change is recorded in the event log | N/A | read-only operation |
| P-06 | Kafka only through the transactional outbox | N/A | no messaging |
| P-07 | Schema changes through new Liquibase changesets | N/A | no schema change |
| P-08 | Concurrency and idempotency are explicit | N/A | read-only GET, no order updates |
| P-09 | Commands and queries stay separate | PASS | the event log is now a query-API operation with its own query model; no mutation |
| P-10 | State transitions go through the state machine and task pipeline | N/A | no transitions |
| P-11 | Layering and conventions | PASS | thin controller → `OrderEventReadService` (readOnly tx) → repository. MapStruct `OrderEventDtoMapper` reuses `QueryOrderDtoMapper`. Constructor injection via Lombok. `CommandJsonConverter` is a small Spring component, recorded in design.md |
| P-12 | Jackson 3 only | PASS | `CommandJsonConverter` uses `tools.jackson.databind.ObjectMapper` (as `CommandListener` does). Tests use `tools.jackson.databind.json.JsonMapper`; auto rule R03 green |
| P-13 | Errors and validation follow the framework specs | PASS | unknown order → `200 []`, documented in the contract. Failures go through the existing Problem+JSON `GlobalExceptionHandler`. The old path gets the framework's `404` |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | each test was seen failing first (contract classes missing; `404`/`200` on the paths; old cockpit URL), then passed. Every AC is mapped above |
| P-15 | Observability | PASS | no new flow that needs custom metrics; Spring `http.server.requests` and tracing cover the endpoint. No `System.out` (R08 green) |
| P-16 | Security | PASS | no secrets. `orderId` is bound as a JPA parameter. The query API defines no entitlements |
| P-17 | Simplicity and dependencies | PASS | no new dependency or build change (R10 green); `OrderDto` reused for the snapshot |
| P-18 | Modules build standalone | PASS | `spec verify` ran `check` in oms-contracts and in every consumer (oms-core, oms-streaming-service, oms-mcp-server, oms-exchange-simulator), plus typecheck and tests in developer-cockpit. All exited 0 |
| P-19 | Documentation follows behaviour | PASS | `interfaces/query-api.md`, `interfaces/rest-read-api.md`, `capabilities/order-query.md`, `capabilities/event-sourcing-and-replay.md`, and the developer-cockpit spec pages are updated. The mission-control docs are a follow-up (below) |

## Independent Review

The spec-reviewer agent found the goal met (all six ACs, no blocking finding) and raised five minor
findings:

1. **AC-2's `commandId` check compared null with null.** Create and accept store no `commandId`.
   *Fixed:* added `OrderEventQueryIntegrationTest#carriesTheStoredCommandId`. A cancel request with
   `commandId = "CR-SPEC35"` comes back in the entry and in its `transaction`. Design Test Strategy
   updated.
2. **`x-java-type: java.time.Instant` on `OrderEventDto.timeStamp` has no effect**, because the
   generated field is `OffsetDateTime`. *Kept for now:* it copies the existing `OrderDto` date-time
   fields, which have the same ineffective extension, and the wire format (ISO-8601 UTC) is
   unaffected. Cleaning it up across the whole query contract is a follow-up.
3. **The cockpit follow-up fixture still had the entity's `id` and a non-contract event `ACCEPT`.**
   *Fixed:* dropped `id` and used `ACK`; the test passes.
4. **`mission-control/docs/architecture/*.md` still name the removed path.** *Follow-up:* these are
   design notes in a module outside this ticket, and no code calls the path.
5. **verification.md was unfilled.** *Fixed:* this document.

## Automated Evidence

`evidence/last-run.json`, the last `spec verify` run, made after the final code change:
- **Result:** `pass`.
- **Policy check:** PASS (scope: changes since main, merge-base `ad7c3d0c`), no errors or
  warnings.
- **Commands:** all exit 0.
  - oms-contracts: `./gradlew check`
  - oms-core: `./gradlew check` (87 s)
  - oms-streaming-service: `./gradlew check`
  - oms-mcp-server: `./gradlew check`
  - oms-exchange-simulator: `./gradlew check`
  - developer-cockpit: `npm run typecheck`, and `npm test` (485 passed, 2 skipped)
- **Logs:** in `evidence/`.

## Follow-ups

- Update `mission-control/docs/architecture/mission-control-v2.md` (lines ~163, 413, 449, 602) and
  `implementation-guide.md:151` to use `/api/query/orders/{orderId}/events`.
- Make `x-java-type: java.time.Instant` take effect in the query contract, or remove it from all
  date-time fields (`OrderDto`, `OrderEventDto`).
- Contract the remaining hand-written read endpoints (`/api/orders`, `/api/executions`,
  `/api/v1/metamodel`), as already listed in `capabilities/order-query.md`.

## Verdict

Verdict: GOAL MET
