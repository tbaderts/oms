# Verification — SPEC-0045: Rename order_execution_view to order_execution_projection

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

Every test below ran in the latest `spec verify`. It executed the whole oms-core suite, 528 tests
with 0 skipped and 0 failures, in 176 s (`evidence/oms-core-1.log`, `oms-core/build/test-results/test`).
Each assertion was read against its AC.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Rename keeps rows; all seven objects renamed; nothing named after the view remains; sequence continues | `OrderExecutionProjectionRenameMigrationTest#renameKeepsRowsAndRenamesEveryObject`. Liquibase migrates to the tag, two rows are seeded with every column populated, then the update runs. Compared: every column of every row; the seven names in `pg_class`/`pg_constraint`; no leftover names; `nextval` greater than the max id | PASS |
| AC-2 | Rollback restores the names and rows | `OrderExecutionProjectionRenameMigrationTest#rollbackRestoresTheOriginalNames` (real Liquibase `rollback` to the tag) | PASS |
| AC-3 | A fill writes a row to the renamed table; the query output is unchanged | `ProjectionIntegrationTest#fill_writesOneViewRowMatchingItsOrderExecution`; `ExecutionViewQueryIntegrationTest` (four methods, file unchanged against `main`); `LiquibaseMigrationIntegrationTest#projectionSchemaIsApplied` | PASS |
| AC-4 | Rebuild by name `order_execution`, timer tag, old name 404 | `ProjectionRebuildIntegrationTest#rebuild_reproducesTheViewWithoutPublishing` (200, `projection: order_execution`, equal rows, `oms.projection.rebuild{projection=order_execution}` count + 1); `#oldProjectionName_is404` | PASS |
| AC-5 | A failed rebuild answers 500 naming the order; table unchanged | `ProjectionRebuildIntegrationTest#unmatchedFillEvent_failsAndLeavesTheViewUnchanged`, `#fillEventWithoutExecId_failsNamingOrderAndVersion` | PASS |
| AC-6 | `table() == name() + "_projection"` for every projection bean, and the table exists | `ProjectionIntegrationTest#everyProjectionTableIsItsNameWithProjectionSuffix` | PASS |
| AC-7 | The query contract is unchanged by this ticket | `oms-query-api.yml` has the same MD5 as at the start of SPEC-0045's implementation (T-4). Its diff against `main` is SPEC-0044's (2.2.0, `execId`, `EXEC_*`); the reviewer confirmed this | PASS |

## Goal Assessment

The Goal is met:
- **Table rename.** The table and its sequence, primary key, unique constraint and three indexes
  are renamed in a new changeset (`012`) with a working rollback, and every row is kept.
- **Name and table separated.** `Projection.table()` separates the projection name
  (`order_execution`: rebuild URL, errors, metric tag) from its table (lock, rows).
- **Java renames.** The entity, repository and query service have their new names. The query
  contract and its contract-named classes are unchanged.
- **Documentation.** `projections.md`, `interfaces/query-api.md`, `booking-integration.md` and the
  target-architecture roadmap are updated.
- **Naming rule.** It is recorded in the knowledge base, the `Projection` Javadoc and the changelog
  header, and a test enforces it.

No active spec ticket names the table, so none needed updating. Done tickets, the dated review
documents and applied changesets 007, 008 and 011 keep the old name on purpose: they are history.
No main source outside those changesets and the rename itself names the old table (T-4).

## Policy Review

Reviewed against this ticket's part of the working-tree diff. SPEC-0044's uncommitted changes sit
in the same tree and are excluded.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | No contract change |
| P-02 | Specification before code, generated models only | N/A | No API or message change |
| P-03 | Never edit generated code | PASS | Nothing generated touched |
| P-04 | Contracts evolve compatibly | PASS | Query contract and `ExecutionViewDto` unchanged (AC-3, AC-7). `ExecutionViewController` and `ExecutionViewDtoMapper` keep their contract-derived names |
| P-05 | Every state change is recorded in the event log | N/A | No order state change |
| P-06 | Kafka only through the transactional outbox | PASS | Staging unchanged |
| P-07 | Schema changes through new Liquibase changesets | PASS | New `012` (026 tag, 027 renames with explicit reverse rollback). 001–011 untouched. The entity maps the new names under `validate` |
| P-08 | Concurrency and idempotency are explicit | PASS | Unique constraint kept (renamed); the rebuild still locks the table, now through `table()` |
| P-09 | Commands and queries stay separate | PASS | Unchanged |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No transition |
| P-11 | Layering and conventions | PASS | Renames stay in their layers; the naming rule is recorded |
| P-12 | Jackson 3 only | N/A | No JSON code |
| P-13 | Errors and validation follow the framework specs | PASS | Endpoint answers unchanged (400, 404, 500) |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | The migration test was red before the changeset existed; the rebuild and naming tests were red (compile) before `table()` and the new name. Every AC has a passing test |
| P-15 | Observability | PASS | The rebuild timer is tagged with the projection name (AC-4) |
| P-16 | Security | PASS | `LOCK TABLE` concatenates `table()`, a bean constant; the request only selects a bean by name |
| P-17 | Simplicity and dependencies | PASS | Renames plus one interface method; no dependency |
| P-18 | Modules build standalone | PASS | `spec verify` ran oms-core `check` (the ticket's only code module); exit 0 |
| P-19 | Documentation follows behaviour | PASS | `projections.md` (naming rule, `table()`, new URL, old URL 404), `query-api.md`, `booking-integration.md`, target-architecture roadmap |

## Independent Review

The spec-reviewer agent found all seven ACs proven and no goal gap. It raised five minor findings:

1. **The migration test compared only four columns.** **Fixed (T-8).** Every column is now seeded
   and compared.
2. **`ProjectTaskTest`'s failure assertion was weakened to `contains("failing")`.** **Fixed (T-8).**
   It asserts "Projection failing failed".
3. **Some test variables still say "view"** (`viewRepository`, `orderExecutionViewRepository`).
   **Not fixed:** they are cosmetic and outside any AC. Recorded under Follow-ups.
4. **verification.md was unfilled.** **Fixed:** this document.
5. **`projections.md` carries both SPEC-0044's and SPEC-0045's edits.** **Accepted.** Both tickets
   are uncommitted in the same tree; committing them as one change, or splitting hunks, is the
   maintainer's choice.

## Automated Evidence

`evidence/last-run.json`: result **pass**.
- **Policy check:** PASS, no errors or warnings.
- **oms-core:** `./gradlew check`, exit 0, 176 s, a full test run: 528 tests, 0 skipped, 0 failures
  (`evidence/oms-core-1.log`).
- **No other module.** The ticket's modules are oms-core and oms-knowledge-base, which has no build.

## Follow-ups

- Rename the remaining "view" variables in the tests (`viewRepository`, `viewRows`,
  `orderExecutionViewRepository`) when those tests are next touched.
- Operators: use `POST /actuator/projections/order_execution/rebuild`. After an upgrade, stop old
  instances first, as the changelog header states.

## Verdict

Verdict: GOAL MET
