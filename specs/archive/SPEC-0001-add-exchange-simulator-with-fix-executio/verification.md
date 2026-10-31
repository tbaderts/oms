# Verification — SPEC-0001: Add exchange simulator with FIX execution workflow

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

Evidence sources: XMLs under `oms-core/build/test-results/test` (169 tests, 0 failures),
`oms-exchange-simulator/build/test-results/test` (44 tests, 0 failures) and
`oms-contracts/build/test-results/test` (2 tests, 0 failures). The oms-core and contracts runs are
also logged in `evidence/oms-core-1.log` and `evidence/oms-contracts-1.log`. The end-to-end ACs are
proven in two halves that meet at the Kafka contract (design decision). oms-core replays the exact
command sequence the simulator emits, and the simulator test proves it emits that sequence.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Market order: ack, then a single fill at 170, FILLED | core `ExchangeWorkflowIntegrationTest#ackThenSingleFill_ordersFilledWithNewAckFillEvents`; sim `ExchangeSimulatorKafkaIntegrationTest#unackOrder_producesAckThenSingleFill`, `ExchangeEngineTest#marketOrder_singleSlice_acksThenFillsAtReference` | PASS |
| AC-2 | 3 slices: 33/33/34, distinct execIds, PARTIAL, PARTIAL, FILL | core `#ackThenThreeFills_eventsPartialPartialFill`; sim `ExchangeEngineTest#threeSlices_sendsThreeFillsWithDistinctExecIds`, `FillSlicerTest` | PASS |
| AC-3 | Limit 172 fills at 170; limit 165 rests LIVE with leaves 100 | sim `OrderEvaluatorTest#limitBuyAboveReference_isMarketableAtReferencePrice`, `#limitBuyBelowReference_rests`, `ExchangeEngineTest#nonMarketableLimit_isAckedAndRests`, Kafka `#nonMarketableLimit_ackOnlyNoFillsWithin3s`; core `#ackOnly_orderLiveWithFullLeaves` | PASS |
| AC-4 | Unknown symbol: REJ with reason, no executions | sim Kafka `#unknownSymbol_producesRejectOnly`, `ExchangeEngineTest#unknownSymbol_sendsRejectOnly`; core `#reject_orderRejWithReasonAndNoExecutions` | PASS |
| AC-5 | Price outside band, or zero/missing qty: reject only | sim `OrderEvaluatorTest#limitOutsidePriceBand_rejected`, `#zeroOrMissingQty_rejected`, `ExchangeEngineTest#invalidQty_sendsRejectOnly` | PASS |
| AC-6 | IOC not marketable: ack, then cancel; CXL, leaves 0 | sim `ExchangeEngineTest#iocNotMarketable_acksThenCancels`, `#iocMarketable_fillsAndDoesNotCancel`; core `#ackThenCancel_orderCxlWithZeroLeaves` | PASS |
| AC-7 | Cancel request via REST: PCXL published, venue cancels, CXL | core `#cancelRequestViaRest_thenCancelConfirm_orderCxl`; sim Kafka `#pcxlForRestingOrder_producesCancel`, `ExchangeEngineTest#cancelRequestForRestingOrder_sendsCancel`, `#cancelRequestDuringSlicing_cancelsOnlyTheRemainder` | PASS |
| AC-8 | Unknown to the venue: cancel reject; order stays LIVE, cancelState REJ | sim `ExchangeEngineTest#cancelRequestForUnknownOrder_sendsCancelReject`; core `#cancelRequestThenCancelReject_orderStaysLiveWithCancelStateRej` | PASS |
| AC-9 | Ineligible state: refused, nothing written, REST 400 | core `OrderLifecycleCommandProcessorTest` refusal cases (verify no save and no append), `CommandControllerWebMvcTest#lifecycleCommand_failure_returns400Failed` (all 4 types) | PASS |
| AC-10 | Duplicate delivery has no second effect | core `#duplicateLifecycleCommands_onKafka_haveNoSecondEffect`, `#replayedCancelRequestAndReject_afterProcessing_haveNoSecondEffect`, `OrderLifecycleCommandProcessorTest#duplicateCommandId_refusedWithoutWrites`; sim `ExchangeEngineTest#redeliveredUnack_andOmsOwnUpdates_sendNothing`, `#commandIdsAreDeterministicPerAnswer` | PASS |
| AC-11 | Contracts backward compatible; consumers still build | contracts `CommandMessageCompatibilityTest#newSchemaReadsBaselineData`; `./gradlew check` exit 0 in contracts, core, streaming, mcp (last-run.json) and simulator (T-17) | PASS |
| AC-12 | Simulator counters on /actuator/prometheus; orderId in logs | sim `SimulatorMetricsIntegrationTest#countersExposedOnPrometheusEndpoint`, `ExchangeEngineTest#countsEveryAnswerByKind`, `#logsIncludeOrderId` | PASS |

## Goal Assessment

The goal asked for:
- a simulator that subscribes to OMS orders over Kafka;
- order economics evaluated by the simulator;
- answers in FIX style: an ack, then one or more executions;
- reject and cancel scenarios;
- whatever OMS model and command support those need.

All of it is delivered:
- the `oms-exchange-simulator` module;
- four new lifecycle commands, applied through one rule-table pipeline;
- the `CXL_REQUEST` and `CXL_REJ` events;
- cancel-state tracking with PCXL and REJ;
- replay-safe idempotency through `commandId`.

Implementation also fixed three latent defects that would have stopped any fill arriving through a
command (T-19 to T-21). Without those fixes the goal could not have been met.

**Gap, named honestly:** the round trip has never run with both services up at the same time,
either automated or as a recorded docker-compose run. Each half is tested against hand-built
fixtures of the other side's messages. The fixtures are built from the shared generated contract
classes, which limits the risk of a mismatch at the seam, but does not remove it. Recommended
before merge: one documented compose smoke run (AAPL market → FILLED; ZZZZ → REJ; limit 165 plus a
cancel request → CXL). This is not material to the ACs.

Left out on purpose (proposal non-goals, also documented in exchange-simulator.md §8):
- order book and matching;
- replace (35=G);
- busts and corrections;
- expiry and FOK;
- a FIX session layer;
- persistent simulator state.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | All new Avro and OpenAPI definitions are in oms-contracts. `verifyContracts` also guards oms-exchange-simulator. |
| P-02 | Specification before code, generated models only | PASS | Contracts were written first (T-1/T-2/T-19/T-22). All command and message classes are generated. |
| P-03 | Never edit generated code | PASS | Nothing under build/generated was edited. |
| P-04 | Contracts evolve compatibly | PASS | Additive only: union branches appended, optional fields with null defaults. Proven by `CommandMessageCompatibilityTest`. |
| P-05 | Every state change is recorded in the event log | PASS | Every lifecycle action appends exactly one event through `PublishOrderEventTask`, in the same transaction. `assertReplayMatches` proves replay agrees after REJ, CXL, CXL_REQUEST and CXL_REJ. |
| P-06 | Kafka only through the transactional outbox | PASS | oms-core writes only through `OrderEventAppender` → outbox. The simulator is an external venue with no database, so it publishes directly (design decision). |
| P-07 | Schema changes through new Liquibase changesets | N/A | No schema change in this ticket. `004-sla-timestamps.yaml` is pre-existing, unrelated work. |
| P-08 | Concurrency and idempotency are explicit | PASS | `saveAndFlush` makes txNr conflicts surface; they are rethrown (409 / retry). Duplicates are refused by state preconditions plus `DeduplicateCommandTask`, which checks `commandId`. Residual risk: commands sent without a commandId rely on preconditions alone (documented). |
| P-09 | Commands and queries stay separate | PASS | Only the command API and command listener were extended. |
| P-10 | State transitions go through the state machine and task pipeline | PASS | Load → Deduplicate → Validate (the standard state machine for REJECT/CANCEL) → Apply → Save → Publish. |
| P-11 | Layering and conventions | PASS | New `service.lifecycle` package following the existing processor and task pattern. The simulator is layered engine / kafka / config / metrics. |
| P-12 | Jackson 3 only | PASS | No com.fasterxml usage was added. T-21 removed a Jackson `convertValue` that failed on Avro records. |
| P-13 | Errors and validation follow the framework specs | PASS | Refusals are `markValidationFailed` and failed TaskResults. REST returns 400 FAILED, conflicts return 409. |
| P-14 | Test first, every AC proven by an automated test | PASS | Every task was red then green (tasks.md). Every AC is traced above. |
| P-15 | Observability | PASS | Simulator counters, orderId in the MDC, Kafka observation on the template and listener. oms-core keeps its existing `@Observed` and logging. |
| P-16 | Security | PASS | No new endpoints beyond `/api/command/execute` types and actuator, as for existing modules. No secrets. Text is truncated to the column width. |
| P-17 | Simplicity and dependencies | PASS | The simulator uses only artifacts oms-core already uses. The R10 warnings (build.gradle, settings.gradle, docker-compose.yml) are new-module wiring, recorded in design.md. |
| P-18 | Modules build standalone | PASS | The simulator includes `../oms-contracts` and builds standalone. |
| P-19 | Documentation follows behaviour | PASS | New exchange-simulator.md. Updated order-lifecycle.md (§4.5, §4.9.1, §10.1), execution-reporting.md (§2.2), the README and rest.http (with commandId). |

## Independent Review

spec-reviewer, round 1: **NOT MET**.
- **1 (blocking):** a replayed cancel request or cancel reject was re-applied after a cancel
  reject. **Fixed** by an optional `commandId` and `DeduplicateCommandTask`, with deterministic
  simulator ids built from the event version (T-22 to T-24). Proven against real Postgres and Kafka.
- **2:** `auto-offset-reset: earliest` would replay the order history. **Fixed** by defaulting to
  `latest` (T-25).
- **3:** the engine's order map grew without limit. **Fixed** with a bounded LRU. Evict-on-terminal
  was rejected and the reason recorded (T-25).
- **4:** `FillSlicer` overflowed on quantities above `Integer.MAX_VALUE`. **Fixed** (T-25).
- **5:** this ticket's changes are mixed with pre-existing uncommitted SLA work. **Open**, as a
  process item; see Follow-ups.
- **6:** no replay check for the new events. **Fixed** with `assertReplayMatches`.
- **7:** evidence gaps. The simulator is not in `specs/config.json`. Its checks ran explicitly
  (T-17), and this file is now written. **Open** for a human: register the module.

spec-reviewer, round 2 (re-review): **MET**. No blocking or major findings. Two minor points:
- The dedupe scans the whole event log of the order. Accepted at current sizes; see Follow-ups.
- Commands without an id rely on state preconditions. Mitigated: rest.http and the knowledge base
  now show `commandId`.

## Automated Evidence

`evidence/last-run.json`:
- ranAt 2026-10-25T05:56:01Z, result **pass**, fingerprint cf141fa103ab819e.
- Modules: oms-contracts, oms-core, oms-streaming-service, oms-mcp-server, oms-knowledge-base.
- `./gradlew check` exited 0 in each.
- Policy check: PASS, 0 errors. Six R10/P-17 warnings for build wiring, recorded in design.md.

oms-exchange-simulator has since been registered in `specs/config.json` (at the user's request, as
a module and as an impact of oms-contracts). A re-run of `spec verify` included it:
`./gradlew check` exit 0, log `evidence/oms-exchange-simulator-1.log`.

## Follow-ups

- ~~Register `oms-exchange-simulator` in `specs/config.json`~~: done.
- Commit strategy: this ticket's changes touch the same files as the pre-existing uncommitted SLA
  work (`CommandController`, `CommandListener`, `SetOrderStateTask`, `OrderAcceptCommandProcessor`,
  `service/sla`). Commit the SLA work first or together, otherwise the tree does not compile.
- Run a docker-compose smoke test with both services (see Goal Assessment).
- `CommandListener` maps the Avro `OrderCreateCmd` with Jackson `convertValue` too, which is the
  same latent defect T-21 fixed for executions.
- Optional: an indexed lookup for `commandId` (column or table), should event logs grow large.

## Verdict

Verdict: GOAL MET
