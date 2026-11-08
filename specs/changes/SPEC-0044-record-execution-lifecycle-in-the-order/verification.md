# Verification — SPEC-0044: Record execution lifecycle in the order event log

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

Every test below ran in the latest `spec verify`, which executed the whole oms-core suite:
524 tests, 0 skipped, 0 failures (`evidence/oms-core-1.log`, and `oms-core/build/test-results/test`).
Each assertion was read against its AC.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Backfill of `exec_id`, execution status, version, root, and the index | `ExecutionLifecycleMigrationIntegrationTest#legacyFillsAreBackfilled`. It covers four cases: a commanded fill, an uncommanded fill, a child with a root, and a version only the projection holds (7). It also checks that an order with an orphan execution leaves the ambiguous fill null and that no `exec_id` is duplicated. `ExecutionLifecycleIntegrationTest#storedFillCommandMatchesTheBackfillPath` checks the JSON path against a fill the application stored over REST | PASS |
| AC-2 | A new fill sets `exec_id`, APPLIED, `order_version`, `root_order_id` | `ExecutionLifecycleIntegrationTest#fillRecordsExecIdStatusVersionAndRoot` | PASS |
| AC-3 | Bust: v5 `EXEC_BUST` with `exec_id`, EX-1 BUSTED at 5, ORDER and an H record staged | `ExecutionLifecycleIntegrationTest#bustRecordsEventStatusAndStagesReversal`: event fields, command, snapshot, statuses, the ORDER row on `oms_orders`, and the decoded `OrderExecution` (H, v5, cumQty 60, leavesQty 40, key) | PASS |
| AC-4 | Correction gives CORRECTED and G; whack gives BUSTED and H | `#correctionMarksCorrectedAndStagesG`, `#whackMarksBustedAndStagesH` | PASS |
| AC-5 | A repeated or unknown bust is refused and writes nothing | `#bustOfBustedOrUnknownExecutionIsRefusedAndWritesNothing` (checked to fail with the status check disabled) | PASS |
| AC-6 | Concurrent lifecycle events: one wins, the other gets `OptimisticLockingFailureException` | `#concurrentLifecycleEventsFromSameVersionOneWins` | PASS |
| AC-7 | `FILLED → LIVE`, otherwise unchanged; exact execution-status transitions | `OrderStateMachineConfigTest#productTransitionsAreExactly`, `ExecutionStatusMachineConfigTest#transitionsAreExactly` (both exhaustive); `OrderAcceptCommandProcessorTest#process_onFilledOrder_isRefused` | PASS |
| AC-8 | avgPx excludes the busted fill: 172.40000000 | `#bustedFillIsExcludedFromAvgPx`, on EX-3's row and on its published `OrderExecution`. `Order` has no avgPx column; the order's average price is carried on each fill (tasks.md Notes) | PASS |
| AC-9 | `executionsAt` at v2, v4, v5 | `#executionsAtReturnsExecutionsInForce` | PASS |
| AC-10 | `?execId=` gives v3 and v5 only; unfiltered gives all; unknown gives `[]` | `OrderEventQueryIntegrationTest#execIdFilterReturnsOnlyThatExecutionsEvents` and `#unknownExecIdReturnsEmptyArray` (both checked to fail with the filter bypassed); `#apiDocsDeclareEventLogOperation` | PASS |
| AC-11 | Cancel request and cancel reject decisions unchanged | `ValidateLifecycleActionTaskTest#cancelRulesMatchThePreviousPreconditions`: 160 cases against the old expressions, and it also passed on the old code. `CancelStateMachineConfigTest`. `OrderLifecycleCommandProcessorTest` and `OrderLifecycleIntegrationTest` pass unmodified | PASS |
| AC-12 | Rebuild matches by `exec_id`; a null `exec_id` fails naming the order and version, with the table unchanged | `ProjectionRebuildIntegrationTest#rebuild_reproducesTheViewWithoutPublishing`, `#unmatchedFillEvent_failsAndLeavesTheViewUnchanged`, `#fillEventWithoutExecId_failsNamingOrderAndVersion` | PASS |

## Goal Assessment

Every element of the Goal is implemented and tested:
- `order_events.exec_id`, with its backfill and the `(order_id, exec_id)` index;
- `EXEC_BUST`, `EXEC_CORRECT` and `EXEC_WHACK`, and `FILLED → LIVE`;
- the five execution columns, with their backfill;
- `appendExecutionEvent` setting `exec_id`, `order_version` and `root_order_id`;
- `appendExecutionLifecycleEvent`, which stages H or G on `oms_order_executions`;
- avgPx over `APPLIED` fills only;
- `executionsAt`;
- the additive `execId` filter;
- cancel-state and execution-status `StateMachineConfig` instances;
- removal of the rebuilder's positional fallback.

These deviations are deliberate and recorded:

- **Execution-status machine not yet in a validate task.** The Goal says both machines are
  "consulted by the validate tasks". The cancel-state machine is, through
  `ValidateLifecycleActionTask`. The execution-status machine is consulted inside
  `appendExecutionLifecycleEvent`, because no bust pipeline exists until SPEC-0030. SPEC-0030's
  validate task must consult the same configuration. The proposal and design state this, and the
  proposal was approved with it.
- **Positional backfill restricted after review.** The Goal's "delete the position-matching fallback
  once the backfill has run" holds. The backfill matches by position only where that is unambiguous,
  and an ambiguous historical fill is reported by the rebuild instead of guessed.
- **Explicit FILLED guard in the accept processor.** It is needed so that adding `FILLED → LIVE`
  does not let an ACK reopen a filled order (design, Alternatives & Decisions).

Nothing processes bust, correction or whack commands yet. That is SPEC-0030, as the ticket states,
so no H or G record reaches a topic in production until then.

## Policy Review

Reviewed against the actual diff: `git diff` plus the untracked files in oms-core, oms-contracts and
oms-knowledge-base.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | Only `oms-contracts/src/main/openapi/oms-query-api.yml` changed; no stray contract folder (auto R01) |
| P-02 | Specification before code, generated models only | PASS | T-1 changed the contract and regenerated before any code. `OrdersApi` and `OrderEventType` are generated |
| P-03 | Never edit generated code | PASS | Nothing under `build/generated*` is in the diff |
| P-04 | Contracts evolve compatibly | PASS | Optional query parameter and three enum values; `info.version` 2.1.0 → 2.2.0. No Avro change. The consumers' `check` passes |
| P-05 | Every state change is recorded in the event log | PASS | `appendExecutionLifecycleEvent` goes through `appendOrderEvent` (version, command, state, snapshot). Execution status changes only in the method that appends the event |
| P-06 | Kafka only through the transactional outbox | PASS | The H/G record is staged with `stageMessage`. No `KafkaTemplate` added (auto R04) |
| P-07 | Schema changes through new Liquibase changesets | PASS | New `011-execution-lifecycle.yaml` (023–025, with rollbacks). 001–010 untouched. Changeset 024 was revised during verify; it had not been applied outside test containers (the local database stops at 022). `LiquibaseMigrationIntegrationTest` passes |
| P-08 | Concurrency and idempotency are explicit | PASS | `(order_id, version)` covers lifecycle events (AC-6). A repeated bust is refused by the status machine (AC-5). SPEC-0030's Kafka caller must acknowledge that refusal rather than retry it (Follow-ups) |
| P-09 | Commands and queries stay separate | PASS | The query side gains a read-only filter. Writes happen only on the command path |
| P-10 | State transitions go through the state machine and task pipeline | PASS | `FILLED → LIVE` is in the configuration. Cancel-state and execution-status rules are configurations. The reviewer called the explicit `FILLED` guard in `OrderAcceptCommandProcessor` doubtful. It is kept and documented: the machine has no event labels, and without the guard an ACK could take a transition reserved for busts. The bust pipeline is SPEC-0030 |
| P-11 | Layering and conventions | PASS | Controller → service → repository. Configs sit beside `OrderStateMachineConfig`. Lombok on entities. Existing mappers reused |
| P-12 | Jackson 3 only | PASS | No new JSON binding code (auto R03) |
| P-13 | Errors and validation follow the framework specs | PASS | Refusals use the existing exception types, already mapped to Problem+JSON. Lifecycle refusals keep their path and message |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Each AC above has a test that was seen red first or checked by disabling the code (tasks.md Notes) |
| P-15 | Observability | PASS | `oms_order_events{event}` counts the new events (`OrderFlowMetricsTest#executionLifecycleEventsAreCountedAfterCommit`). An INFO line carries orderId, execId, event, version and the status change |
| P-16 | Security | PASS | No secrets. `execId` is a bound query parameter |
| P-17 | Simplicity and dependencies | PASS | No new dependency or build change (auto R10). Net code removed from the rebuilder |
| P-18 | Modules build standalone | PASS | `spec verify` ran `check` in oms-core, oms-contracts, oms-streaming-service, oms-mcp-server and oms-exchange-simulator; all exit 0 |
| P-19 | Documentation follows behaviour | PASS | Updated: `domain/execution.md`, `order-event.md`, `order-state.md`, `oms-concepts/order-lifecycle.md`, `execution-reporting.md`, `projections.md`, `interfaces/query-api.md`, FR-015, FR-016 |

## Independent Review

The spec-reviewer agent found every AC proven and nothing blocking. It raised six minor findings:

1. **The positional backfill could duplicate an `exec_id`** when an order has an execution without a
   fill event. **Fixed.** The backfill ranks only unmatched events against unclaimed executions,
   where the counts agree. The migration test seeds that exact case: red before the fix, green
   after (T-17).
2. **The migration test's stored command was hand-written JSON.** **Fixed.**
   `#storedFillCommandMatchesTheBackfillPath` reruns the backfill statement on a fill stored by the
   REST command API (T-18).
3. **The test could not tell the projection-first `order_version` source from the event source.**
   **Fixed.** An execution whose fill event is absent gets version 7 from the projection only (T-17).
4. **An em dash in `OrderAcceptCommandProcessorTest` was double-encoded.** **Fixed.** The file's diff
   is now only the added test, and a scan of every changed file found no other case (T-19).
5. **verification.md was empty, and the first evidence log ran no tests** (Gradle up to date).
   **Fixed.** This document is filled in. The final `spec verify` reran the oms-core suite: 524
   tests in 147 s.
6. **A redelivered bust is refused by an exception.** SPEC-0030's Kafka caller must turn it into an
   acknowledgement. **Not a defect here; added to Follow-ups.**

On P-10, the reviewer marked the FILLED guard "PASS (doubtful)". It is kept, with the reason
recorded under Policy Review and in design.md.

## Automated Evidence

`evidence/last-run.json`: result **pass**.

| Module | Command | Exit | Time | Log |
|---|---|---|---|---|
| oms-core | `./gradlew check` | 0 | 147 s | `evidence/oms-core-1.log` |
| oms-contracts | `./gradlew check` | 0 | 1 s | `evidence/oms-contracts-1.log` |
| oms-streaming-service | `./gradlew check` | 0 | 2 s | `evidence/oms-streaming-service-1.log` |
| oms-mcp-server | `./gradlew check` | 0 | 2 s | `evidence/oms-mcp-server-1.log` |
| oms-exchange-simulator | `./gradlew check` | 0 | 2 s | `evidence/oms-exchange-simulator-1.log` |

- **oms-core:** a full run of 524 tests, 0 skipped, 0 failures.
- **Consumer modules:** up to date against the same contracts. They built and tested in the
  previous verify run, in 21 to 38 s each.
- **Policy check:** PASS, no errors or warnings.

## Follow-ups

- **SPEC-0030.** The bust, correction and whack pipeline should do three things:
  - validate with `ExecutionStatusMachineConfig` and the order machine in a validate task;
  - turn the refusal of a redelivered bust into an acknowledgement on Kafka, not a retry or
    dead-letter (P-08);
  - set `exec_ref_id` on correcting fills.
- **SPEC-0030 / SPEC-0045.** Decide what the order-execution projection row shows for a busted or
  corrected fill, and its unique key; this ticket leaves the row as it was.
- **Operations.** After upgrading an environment with legacy data, run a projection rebuild. A
  failure names any historical fill the backfill could not match unambiguously.

## Verdict

Verdict: GOAL MET
