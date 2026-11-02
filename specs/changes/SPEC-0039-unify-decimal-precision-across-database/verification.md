# Verification — SPEC-0039: Unify decimal precision across database, Avro and OpenAPI

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

The final `spec verify` (2026-11-01 06:30Z, after the review fixes T-10 to T-12):

- **Executed:** oms-core (49 classes, 241 tests, 0 failures, 0 skipped) and developer-cockpit
  (495 passed, 2 skipped: the symlink cases that cannot run on Windows).
- **Up to date, unchanged since their last executed runs:**
  - oms-contracts (8 classes, 15 tests, 0 failures, after T-3's clean build);
  - oms-exchange-simulator (5 classes, 44 tests, T-7 and T-11; T-11 changed only Javadoc);
  - oms-streaming-service (6 classes, 23 tests, T-7).

Each method below is in `<module>/build/test-results/test/TEST-*.xml` with no `<failure>` or
`<skipped>`.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Every price and quantity is decimal(18,8) in Avro and bounded 10/8 in OpenAPI; no double | oms-contracts `DecimalPrecisionContractTest#everyAvroDecimalIs18By8AndNoDoubleRemains`: walks `CommandMessage` (and every command record it contains), `OrderMessage`, `Execution`, `OrderExecution`, `Quote`, `QuoteRequest`; it finds no `double` or `float`, and every decimal is (18,8); the listed price and quantity fields of each record are decimals. `#everyPriceAndQuantityInTheApiModelsIsBoundedTo10By8`: every `BigDecimal` field of `cmd.Order`, `cmd.Execution`, `query.OrderDto`, `query.ExecutionViewDto` carries `@Digits(integer = 10, fraction = 8)`. Red first: doubles and scale 2/4 (T-1), missing `@Digits` until T-3 | PASS |
| AC-2 | Migration: all price and quantity columns NUMERIC(18,8), values unchanged | `LiquibaseMigrationIntegrationTest#priceAndQuantityColumnsAreNumeric18By8` (all 24 columns of `orders`, `executions`, `order_execution_view`); `DecimalPrecisionMigrationIntegrationTest#existingValuesSurviveUnchanged` (migrate to `before-008-decimal-precision`, insert values with 1 to 8 decimals including 9999999999.99999999 and 0.00000001, migrate the rest: values equal, type `numeric(18,8)`). Red before T-5 | PASS |
| AC-3 | A value beyond the precision fails the migration, naming the column; nothing changes | `DecimalPrecisionMigrationIntegrationTest#valueBeyondPrecision_failsTheMigrationNamingTheColumn`: a 9-decimal `orders.price`; the migration fails with `orders.price` in the message; the column is still `numeric`; the value is unchanged. Red before T-5 (nothing thrown). `#integerDigitsBeyondPrecision_failsTheMigrationNamingTheColumn`: an 11-integer-digit `executions.last_qty` fails the migration naming `executions.last_qty`, type unchanged (T-10, after review) | PASS |
| AC-4 | REST: 9-decimal price/lastPx or 11-integer-digit lastQty → 400 naming the field, nothing processed | `CommandControllerWebMvcTest#overPrecisePrice_isRejected` (3 cases: `order.price`, `execution.lastPx`, `execution.lastQty`): 400 `validation-failed`, the field in `errors`, both processors never called. Red before T-3 (accepted) | PASS |
| AC-5 | 8 decimals survive every layer, over REST and Kafka | `DecimalPrecisionIntegrationTest#eightDecimalsSurviveEveryLayer`: order created over REST at price 170.12345678 and qty 100.12345678; fills of 0.12345678 (REST) and 0.00000001 (Kafka) at 170.12345678. The exact values, and `cumQty` 0.12345679 and `leavesQty` 99.99999999, are in `orders`, `executions`, `order_execution_view`, the `/api/query/search` JSON, and the records on `oms_orders`, `oms_executions`, `oms_order_executions` (since T-10 also every fill's `lastQty`, `cumQty` and `leavesQty` in `executions` and the view, and `lastQty` on both fill topics). Red before T-6 (`cumQty` rounded to 0.1235) | PASS |
| AC-6 | Kafka create keeps 8 decimals; a 9-decimal value cannot be serialised | `DecimalPrecisionIntegrationTest#kafkaOrderCreateKeepsEightDecimals` (stored and published price 170.12345678; red: the order was never created, see Goal Assessment); oms-contracts `DecimalPrecisionContractTest#aNineDecimalValueCannotBeSerialised` (`AvroTypeException`); `OrderMapperTest#toCmdOrder_mapsDecimalsAndIsoTimes` (the explicit Kafka order mapping, T-10) | PASS |
| AC-7 | Simulator, streaming service and exchange workflow pass | `cd oms-exchange-simulator && ./gradlew check` (44 tests), `cd oms-streaming-service && ./gradlew check` (23 tests), `ExchangeWorkflowIntegrationTest` (14/14), all green | PASS |

## Goal Assessment

The Goal: one precision, decimal(18,8), for every price and quantity in the database, Avro and
OpenAPI; nothing more precise accepted at the REST and Kafka boundaries; a BREAKING Avro change
versioned with its consumers.

- **One precision everywhere:**
  - Avro: 26 decimal fields, no double (AC-1).
  - OpenAPI: 25 fields bounded (AC-1).
  - Database: 24 columns (AC-2).
  - Internal arithmetic: scale 8 with `UNNECESSARY` in oms-core; the simulator's scale constants
    also moved to 8.
- **Boundaries:** REST refuses (AC-4); Avro cannot carry more (AC-6). The SPEC-0020 limitation
  (a REST fill with 5 to 8 decimals failing deep in the pipeline) is closed (AC-5).
- **Versioning:**
  - command API 3.0.0, query API 2.0.0;
  - new Avro compatibility baselines;
  - consumers changed in the same ticket (oms-core, simulator, streaming service; the cockpit's
    pinned version);
  - a deployment runbook in `interfaces/avro-messages.md`.
- **Found along the way:** creating an order over Kafka had never worked. `CommandListener` used
  Jackson `convertValue` on the Avro record, which always fails, and the listener's unit test mocked
  the mapper, so it couldn't see that. AC-6 needed the path, so it is now mapped explicitly
  (`OrderMapper.toCmdOrder`), like fills already were.

Out of scope as agreed: tick sizes, `avgPx` computation, UI formatting. No material gap.

## Policy Review

Reviewed against the diff of the SPEC-0039 files (tasks.md lists them). The working tree also
holds uncommitted work of earlier, finished tickets; not judged here.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | All schema and spec edits under `oms-contracts/src/main/{avro,openapi}` |
| P-02 | Specification before code, generated models only | PASS | Contracts first (T-2, T-3); `@Digits` generated from the spec via `x-field-extra-annotation`; no hand-written models |
| P-03 | Never edit generated code | PASS | Regenerated only (clean build) |
| P-04 | Contracts evolve compatibly | PASS | A BREAKING change handled as P-04 requires: declared **BREAKING** in the approved proposal, versioned (cmd 3.0.0, query 2.0.0, new Avro baselines), consumers listed and changed together, deployment runbook (drain, Schema Registry compatibility, coordinated deploy) as confirmed at approval |
| P-05 | Every state change is recorded in the event log | N/A | No new state change |
| P-06 | Kafka only through the transactional outbox | PASS | Unchanged mechanism |
| P-07 | Schema changes through new Liquibase changesets | PASS | New `008-decimal-precision.yaml` (018 tag, 019 check and alter) with rollback; 001–007 untouched; entities validate |
| P-08 | Concurrency and idempotency are explicit | N/A | No change to keys, locking or dedup |
| P-09 | Commands and queries stay separate | PASS | No change to the split |
| P-10 | State transitions go through the state machine and task pipeline | PASS | Only `CalculateOrderQuantitiesTask`'s scale and rounding mode changed |
| P-11 | Layering and conventions | PASS | Kafka order mapping via MapStruct in `OrderMapper`, as fills already were; the listener lost its `ObjectMapper` |
| P-12 | Jackson 3 only | PASS | Jackson use removed from the listener; none added |
| P-13 | Errors and validation follow the framework specs | PASS | Precision violations are the `validation-failed` Problem+JSON 400 |
| P-14 | Test first, every AC proven by an automated test | PASS | Every AC has a test above, each seen red first |
| P-15 | Observability | PASS | The migration's failure names table and column; validation failures logged by the existing handler |
| P-16 | Security | PASS | Input bounded at both boundaries |
| P-17 | Simplicity and dependencies | PASS | No new library; one rule per layer; `spec check` no warnings |
| P-18 | Modules build standalone | PASS | `spec verify` ran oms-contracts, oms-core, oms-streaming-service, oms-mcp-server, oms-exchange-simulator, developer-cockpit, all exit 0 |
| P-19 | Documentation follows behaviour | PASS | `interfaces/avro-messages.md` (precision, version, runbook), `oms-framework/openapi-contracts.md`, `oms-framework/validation-rules.md`, `oms-concepts/projections.md`; `okf-check` 0 errors, 0 warnings |

## Independent Review

**Round 1** (2026-11-01 06:27Z), verdict MET: every AC proven, deviations judged sound, nothing
missed. In particular, no double remains, all 25 API fields carry `@Digits`, all 24 columns are
altered, and the only `setScale` left in oms-core is the `UNNECESSARY` one. Minor findings, all
resolved in T-10 and T-11 and re-verified (06:30Z):

1. **The migration's integer-digit branch was untested.** Fixed: `integerDigitsBeyondPrecision_…`.
2. **The runbook said old records cannot be read**, while scale-only changes are silently misread.
   Fixed: the runbook explains why draining is mandatory.
3. **Stale KB:** `domain/order-quantities.md` described HALF_UP rounding, and
   `oms-framework/oms-state-store.md` showed precision 19 with scale 4 or 6. Fixed.
4. **The end-to-end test did not assert every layer's quantities.** Fixed: execution and view
   quantities, and `lastQty` on both fill topics.
5. **Simulator Javadocs still said scale 4.** Fixed.
6. **The simulator's `scaled()` rounds its own configured prices HALF_UP at 8.** Accepted as
   designed: it applies only to prices the simulator generates, not to OMS data.
7. **`toCmdOrder` had no unit test.** Fixed: `OrderMapperTest`.
8. **A producer registering its own decimal scale would pass the Schema Registry and be misread.**
   Within the approved proposal. Documented in the runbook ("producers must use the shared
   schemas"); follow-up below.

## Automated Evidence

`evidence/last-run.json`, ran 2026-11-01T06:30:54Z, result **pass**, fingerprint
`fc3789eb8018a1a0`. Policy check: PASS, no errors, no warnings.

| Module | Command | Exit | Log |
|---|---|---|---|
| oms-contracts | `./gradlew check` | 0 (`test` up to date; last executed in T-3: 8 classes, 15 tests, 0 failures) | evidence/oms-contracts-1.log |
| oms-core | `./gradlew check` | 0 (`test` executed: 49 classes, 241 tests, 0 failures) | evidence/oms-core-1.log |
| oms-streaming-service | `./gradlew check` | 0 (up to date; T-7: 23 tests) | evidence/oms-streaming-service-1.log |
| oms-mcp-server | `./gradlew check` | 0 | evidence/oms-mcp-server-1.log |
| oms-exchange-simulator | `./gradlew check` | 0 (up to date; T-7: 44 tests) | evidence/oms-exchange-simulator-1.log |
| developer-cockpit | `npm run typecheck` | 0 | evidence/developer-cockpit-1.log |
| developer-cockpit | `npm test` | 0 (495 passed, 2 skipped) | evidence/developer-cockpit-2.log |

The first verify attempt (06:16Z) failed on one oms-core test that compared `BigDecimal` with
`equals` at scale 4 (`10.0000` vs `10.00000000`, same value); it now compares values.

## Follow-ups

- Deploy with the runbook in `interfaces/avro-messages.md`: drain, Schema Registry compatibility
  `NONE` for the new registration, coordinated deploy, compatibility back to `BACKWARD`.
- A consumer-side guard against producers that register a different decimal scale (e.g. reject
  schemas whose decimal logical type is not (18,8) in a registry hook or at consumer start-up).
- oms-contracts regenerates `CommandMessage` only on a clean build when a referenced `.avsc`
  changes (SPEC-0018's follow-up, hit again here).

## Verdict

Verdict: GOAL MET

All seven ACs pass with tests that ran in the final verify run, the independent review found no
blocking or major finding and its minor findings are fixed or accepted with reasons, and the Goal
assessment has no material gap.
