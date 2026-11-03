# Verification — SPEC-0041: Align executions blotter fields and keys with orders

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests below ran in the `spec verify` of 2026-11-03T10:14Z (`evidence/last-run.json`). Their
`build/test-results` XML has 0 failures, errors and skips. oms-core's test task ran in full in
that run (142 s; result timestamps 10:12–10:13Z).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Execution metamodel: `primaryKey` execId, no execID/executionId, every default column is a field and includes execId/orderId/avgPx | `MetamodelServiceTest#executionMetamodelUsesExecIdAndResolvableDefaults` (unit; also pins the exact default list); `ExecutionBlotterIntegrationTest#metamodelEndpointServesExecIdPrimaryKey` (over HTTP at `/api/v1/metamodel/Execution`) (evidence/oms-core-1.log) | PASS |
| AC-2 | `/api/executions`: non-null id/execId/orderId/avgPx, no execID/executionId; 40@10 then 60@11 → avgPx 10, 10.6 | `ExecutionBlotterIntegrationTest#restExecutionsCarryExecIdAndAvgPx` (order of 100, both fills over REST); `CalculateOrderQuantitiesTaskTest#avgPxIsVolumeWeightedOverAppliedFills` and `#avgPxRoundsHalfEvenAtScale8`. The tie 1.000000005 → 1.00000000 tells HALF_EVEN apart from HALF_UP (evidence/oms-core-1.log) | PASS |
| AC-3 | avgPx 10 / 10.6 on `/api/query/executions` and on the `Execution` and `OrderExecution` Kafka messages | `ExecutionBlotterIntegrationTest#avgPxReachesProjectionAndMessages`: reads the projection over HTTP, and consumes `oms_executions` and `oms_order_executions` from earliest (evidence/oms-core-1.log) | PASS |
| AC-4 | A redelivered fill adds no row and leaves avgPx unchanged | `ExecutionBlotterIntegrationTest#duplicateFillDoesNotChangeAvgPx`. It redelivers fill 1 while the order is LIVE (refused by the idempotency check) and fill 2 after FILLED. Afterwards there are still 2 rows, with avgPx 10 and 10.6 (evidence/oms-core-1.log) | PASS |
| AC-5 | Two fills of one order → two rows with distinct row ids | `StreamingBlotter.test.tsx` "shows every fill of one order as its own row": it drives the real component through the execution subscription callback and reads the stubbed grid's `rowData` + `getRowId`. Also `Blotter.test.tsx` "keys execution rows by orderId and execId" (REST) and `rowId.test.ts`. Both component tests fail when the old keying is restored (tasks.md Notes) (evidence/oms-ui-1.log) | PASS |
| AC-6 | Same execId on two orders → two rows, in streaming and REST | `StreamingBlotter.test.tsx` "keeps fills with the same execId on two orders apart"; `Blotter.test.tsx` (REST, three rows `O-1\|E-1`, `O-1\|E-2`, `O-2\|E-1`); `rowId.test.ts` (evidence/oms-ui-1.log) | PASS |
| AC-7 | Every default column resolves on a streaming row, including execId/orderId/avgPx; streaming metadata has no executionId | `OrderExecutionMapperTest#executionDtoCarriesAllBlotterDefaultColumns` (JSON of the mapped DTO has all 9 defaults non-null, no `executionId`); `MetadataServiceTest#executionMetadataHasNoExecutionId`; together with AC-1, which pins the oms-core default list (evidence/oms-streaming-service-1.log, oms-core-1.log) | PASS |

## Goal Assessment

Goal: *"executions blotter doesn't show certain fields like id, execution id, avgPx. there is also
confusion about id vs executionId. I think executionId should be the primary key, or lets say we
follow the same approch as on the orders blotter."*

- **Execution id:** shown in both modes as `execId`, the default first column and the pinned
  primary key (AC-1, AC-2, AC-7). In streaming mode this column was previously always blank,
  because the metamodel called it `execID` while the feed sent `execId`.
- **avgPx:** previously empty everywhere, because it was never computed. It is now the
  volume-weighted average per fill, on every feed (AC-2, AC-3).
- **id vs executionId confusion:** resolved.
  - `executionId`, never populated, is gone from the entity, the metamodel, the streaming DTO and
    the docs.
  - Identity follows the orders blotter: the business key, `orderId` + `execId`, is used both as
    the metamodel `primaryKey` and as the row id in both blotters (AC-5, AC-6).
  - This also fixes a real bug: the streaming blotter collapsed all fills of one order into one
    grid row.
- **`id`:** the requester listed it among the missing fields. Following "the same approach as on
  the orders blotter" (approved proposal), `id` can be selected as a column in REST mode but is not
  a default, and streaming rows don't carry it, the same as for orders. If the requester wants `id`
  visible by default, that is a one-line change to the default list. This is a deliberate
  interpretation, not an oversight.
- **Left out on purpose:**
  - avgPx for fills stored before this change, which stay blank (deferred: needs a backfill);
  - an average price on the order itself (follow-up);
  - dropping the now-unmapped `execution_id` column.

The requester should agree the goal is met in spirit. The only judgement call is the `id` default
described above, which is visible in the approved proposal.

## Policy Review

Reviewed against the SPEC-0041 part of the working-tree diff. The tree also holds uncommitted,
unrelated SPEC-0033 changes, which are excluded here.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | Only `oms-contracts/src/main/avro/{Execution,OrderExecution}.avsc` changed; auto R01 passes |
| P-02 | Specification before code, generated models only | PASS | The Avro doc change was T-1, before any code. No hand-written model replaces a generated one |
| P-03 | Never edit generated code | PASS | Nothing under `build/generated*` touched |
| P-04 | Contracts evolve compatibly | PASS | The Avro diff is `doc` text only. The non-contract JSON break (`/api/executions` `@Hidden`, streaming `ExecutionDto`) is declared BREAKING in the proposal, and its only consumer (oms-ui) is updated |
| P-05 | Every state change is recorded in the event log | PASS | No new state change; the fill's event path through `OrderEventAppender` is unchanged |
| P-06 | Kafka only through the transactional outbox | PASS | No new publisher; avgPx flows through the existing mappers into outbox rows (auto R04 passes) |
| P-07 | Schema changes through new Liquibase changesets | N/A | No schema change. `@Column(name = "execid")` keeps the column, and `execution_id` is left unmapped. `ddl-auto: validate` passes in every integration test |
| P-08 | Concurrency and idempotency are explicit | PASS | The duplicate check in `PersistExecutionTask` still precedes the save, and avgPx is only copied after it (AC-4). The notional sum is read in the same `txNr`-protected fill transaction |
| P-09 | Commands and queries stay separate | PASS | Computed on the command path; the query side only reads stored values |
| P-10 | State transitions go through the state machine and task pipeline | PASS | No transitions changed; the computation is in the existing `CalculateOrderQuantitiesTask` |
| P-11 | Layering and conventions | PASS | Repository `@Query`, constructor injection, MapStruct mapping simplified; mirrors cumQty/leavesQty |
| P-12 | Jackson 3 only | PASS | New tests use `tools.jackson.databind`; auto R03 passes |
| P-13 | Errors and validation follow the framework specs | N/A | No new validation or error responses |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC maps to passing tests, written red first (tasks T-3/T-4/T-5/T-7/T-8/T-12). After review, the UI wiring is covered by component tests that fail on the old code |
| P-15 | Observability | PASS | The `CalculateOrderQuantitiesTask` info log now includes `avgPx` with `orderId`; no new flow needing metrics |
| P-16 | Security | N/A | No inputs, secrets or entitlements touched |
| P-17 | Simplicity and dependencies | PASS | No new dependency. The R10 warnings in the evidence are all SPEC-0033 build files, not this ticket |
| P-18 | Modules build standalone | PASS | `spec verify` ran oms-contracts, oms-core, oms-streaming-service, oms-mcp-server, oms-exchange-simulator and oms-ui; all exit 0 |
| P-19 | Documentation follows behaviour | PASS | Updated: `domain/execution.md`, `domain/index.md`, `capabilities/execution-processing.md`, FR-013, `interfaces/avro-messages.md`, `ui/oms-admin-ui_spec.md`, `oms-framework/domain-model_spec.md`, `oms-concepts/execution-reporting.md`, `CLAUDE.md`, `oms-streaming-service/docs/FILTERED_STREAMING.md`, `oms-core/.../service/execution/README.md` |

## Independent Review

The spec-reviewer agent's verdict was **MET**, with no blocking findings. Each finding and how it
was resolved:

1. **[major] The UI wiring for AC-5/AC-6 was proven only via the `rowIdOf` helper**, so reverting
   the call sites would have kept every test green.
   - **Fixed** (implement reopened, T-12): added `StreamingBlotter.test.tsx` and
     `Blotter.test.tsx`. They render the real components with AG Grid stubbed, and assert the row
     ids the components produce.
   - Mutation check: with the old `getRowId`/row-map keying in place, all 3 tests failed. With the
     fix restored, all pass.
2. **[minor] Stale `execID`/`executionId` in further docs** (`domain-model_spec.md`,
   `execution-reporting.md`, `domain/index.md`, `CLAUDE.md`, `FILTERED_STREAMING.md`).
   - **Fixed** (T-15).
   - The `.executionId(...)` builder calls left in `execution-reporting.md` belong to a conceptual
     `ExecutionEvent` in an unbuilt part of that spec, so they are intentional.
3. **[minor] AC-7's two default-column lists are hand-copied across modules.**
   - **Mitigated** (T-14): `MetamodelService.buildExecutionMetadata` now names the streaming test
     that holds the copy.
   - A shared source would need a cross-module dependency, which the gain doesn't justify (P-17).
4. **[minor] The rounding test did not tell HALF_EVEN apart from HALF_UP.**
   - **Fixed** (T-13): an exact tie, 2.00000001 / 2 = 1.000000005, must give 1.00000000.
5. **[minor] verification.md unfilled.** **Fixed:** this document.

The reviewer's goal-gap note on `id` is addressed in the Goal Assessment above.

## Automated Evidence

`evidence/last-run.json`, run at 2026-11-03T10:14:18Z, result **pass**, fingerprint
`986ecb84b2a1705c`:

- Policy check (changes since main, merge-base fa21abbb): PASS with 0 errors. The 5 R10 warnings
  are SPEC-0033's `docker-compose.yml` / `build.gradle` changes.
- Commands, all exit 0:

  | Module | Command | Time |
  |---|---|---|
  | oms-contracts | `./gradlew check` | 2 s |
  | oms-core | `./gradlew check` | 142 s (74 test classes, 0 failures) |
  | oms-streaming-service | `./gradlew check` | 3 s |
  | oms-mcp-server | `./gradlew check` | 20 s |
  | oms-exchange-simulator | `./gradlew check` | 2 s |
  | oms-ui | `npm test -- --watchAll=false --passWithNoTests` | 10 s (11 suites, 43 tests) |

- oms-knowledge-base has no verify command.

## Follow-ups

- Backfill `avgPx` for fills stored before SPEC-0041, for example during a projection rebuild or
  replay.
- An average price on the order itself (`Order`, `OrderDto`, orders blotter).
- Drop the unmapped `executions.execution_id` column in a new changeset.
- Saved blotter column state in users' browsers may still list `execID`/`executionId`. Those
  columns are silently dropped, and a user can reset their columns.
- oms-ui `tsconfig.json`: TS 6 deprecations (`moduleResolution=node10`, `baseUrl`) make a plain
  `tsc --noEmit` fail before it type-checks anything. This predates SPEC-0041.

## Verdict

Verdict: GOAL MET
