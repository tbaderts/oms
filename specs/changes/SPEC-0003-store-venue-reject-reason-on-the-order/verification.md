# Verification — SPEC-0003: Store venue reject reason on the order

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

Evidence: the latest `spec verify` run (2026-10-25T06:51:50Z), with every module's `check` or
`npm test` exiting 0. Test results:
- oms-core: 174 tests, 0 failures;
- oms-streaming-service: 18 tests, 0 failures;
- oms-contracts: 5 tests, 0 failures;
- oms-exchange-simulator: 44 tests, 0 failures;
- oms-ui: all tests passing (`evidence/oms-ui-1.log`).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Reject stores the reason in rejectReason and keeps the client's text | core `OrderLifecycleCommandProcessorTest#reject_onUnackOrder_movesToRejWithReasonAndNoOpenQuantity`; `ExchangeWorkflowIntegrationTest#reject_orderRejWithReasonAndNoExecutions` (Postgres + Kafka, replay asserted); also `#reject_withoutText_clearsAnEarlierReason` | PASS |
| AC-2 | Cancel reject stores the reason, cancelState REJ, client text kept | core `OrderLifecycleCommandProcessorTest#cancelReject_onPendingCancel_setsCancelStateRejAndKeepsOrderLive`; `ExchangeWorkflowIntegrationTest#cancelRequestThenCancelReject_orderStaysLiveWithCancelStateRej` | PASS |
| AC-3 | Successful cancel: text kept, rejectReason null | core `OrderLifecycleCommandProcessorTest#cancel_withReason_doesNotTouchTextOrRejectReason` | PASS |
| AC-4 | New cancel request clears an earlier reason | core `OrderLifecycleCommandProcessorTest#cancelRequest_clearsAnEarlierRejectReason` | PASS |
| AC-5 | Reason over 255 characters: first 255 kept, order still rejected | core `OrderLifecycleCommandProcessorTest#reject_truncatesReasonToTheColumnWidth` (distinguishable prefix, asserts the exact first 255 characters) | PASS |
| AC-6 | Reason reaches the orders topic and the query API | core `ExchangeWorkflowIntegrationTest#reject_reasonReachesOrdersTopicAndQueryApi`; sim `ExchangeSimulatorKafkaIntegrationTest#unknownSymbol_producesRejectOnly` (the simulator sends the reason) | PASS |
| AC-7 | oms-ui offers a Reject Reason column and shows it in the detail panel | ui `DetailPanel.test.tsx#showsRejectReasonInStatusSection`; core `MetamodelServiceTest#orderMetamodelIncludesRejectReason` (source of the blotters' column selector); streaming `OrderMessageMapperTest#mapsRejectReason`, `MetadataServiceTest#orderMetadataListsRejectReason` | PASS |
| AC-8 | Contracts compatible; every consumer builds; UI tests pass | contracts `OrderMessageCompatibilityTest` (backward and forward compatibility, field present); `spec verify` exit 0 for contracts, core, streaming, mcp, simulator, ui | PASS |

## Goal Assessment

The goal: find out whether a reject reason comes back and whether we do anything with it. If
not, add it to the model and the OMS, make sure the simulator returns it, and display it in
oms-ui.

Today's behaviour, before this ticket: the reason did come back from the simulator, but it
overwrote the client's `text`. Now:
- the reason has its own field on the order, `rejectReason` (FIX Text 58 from the venue);
- it is published on the orders topic, queryable through the query API, and kept in event
  snapshots and replay;
- it is streamed and offered as a blotter column, and shown in the detail panel's Status section;
- the client's `text` is never touched by lifecycle commands.

The simulator already returned reasons, and that is proven. The FIX question is answered in the
proposal and in the knowledge base: Text 58 is stored, while the codes OrdRejReason 103 and
CxlRejReason 102 are deferred.

Remaining gap: the UI is proven by component and metamodel tests, not by a browser run against
the live stack. On the live stack (2026-10-25), the API returned an order with `text` preserved
after the simulator restart, but oms-ui itself was not rebuilt or exercised. That is not material
to the ACs.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | Both schema changes are in oms-contracts. |
| P-02 | Specification before code, generated models only | PASS | The contracts changed first (T-1/T-2); models are generated. |
| P-03 | Never edit generated code | PASS | Nothing generated was edited. |
| P-04 | Contracts evolve compatibly | PASS | The Avro field is appended with a null default (compatibility tested both ways); the query API field is optional and additive. |
| P-05 | Every state change is recorded in the event log | PASS | Set inside the lifecycle pipeline; the snapshot carries it; `assertReplayMatches` compares rejectReason. |
| P-06 | Kafka only through the transactional outbox | PASS | Only `OrderMessageMapper` content changed. |
| P-07 | Schema changes through new Liquibase changesets | PASS | `005-order-reject-reason.yaml`, changeset `013-order-reject-reason`; earlier changesets untouched. |
| P-08 | Concurrency and idempotency are explicit | PASS | Unchanged; deduplication and txNr checks still run before Apply. |
| P-09 | Commands and queries stay separate | PASS | The command side writes the field; the query side reads it. |
| P-10 | State transitions go through the state machine and task pipeline | PASS | `LifecycleAction.ReasonEffect` plus `ApplyLifecycleActionTask`; no new transitions. |
| P-11 | Layering and conventions | PASS | Follows the existing rule table, mappers and UI field groups. |
| P-12 | Jackson 3 only | PASS | No Jackson usage was added. |
| P-13 | Errors and validation follow the framework specs | PASS | No new error paths; truncation is documented. |
| P-14 | Test first, every AC proven by an automated test | PASS | Red then green per task (T-6 is a documented guard test). |
| P-15 | Observability | PASS | The apply log line includes `rejectReason`. |
| P-16 | Security | PASS | Bounded length; rendered as text by React. |
| P-17 | Simplicity and dependencies | PASS | No new dependencies. The R10 warnings concern build files from SPEC-0001 and the SLA work. |
| P-18 | Modules build standalone | PASS | No build changes. |
| P-19 | Documentation follows behaviour | PASS | order-lifecycle.md (including the stale §4.2 line), exchange-simulator.md, execution-reporting.md and domain-model_spec.md are updated. |

## Independent Review

spec-reviewer verdict: **MET**, with one process note and four minor findings:
1. **Stale §4.2 line** saying the rejection reason goes into `text`. **Fixed**: it now says the
   command is refused with 400 and no order is created. Checked against
   `OrderCreateCommandProcessor`: validation runs first, the pipeline stops on failure, and the
   transaction rolls back.
2. **A reject without text left an older reason visible.** **Fixed**: SET writes null when the
   reason is blank. New test `reject_withoutText_clearsAnEarlierReason` (T-12).
3. **The truncation test could not prove the prefix.** **Fixed**: it now uses a distinguishable
   input and asserts the exact first 255 characters.
4. **`substring` could split a UTF-16 surrogate pair.** **Accepted** as theoretical for venue text;
   listed under Follow-ups.
5. **Process: verification.md was not yet written.** **Done** (this file).

## Automated Evidence

`evidence/last-run.json`:
- ranAt 2026-10-25T06:51:50Z, result **pass**, fingerprint e13c8fb488f975d6.
- Modules: oms-contracts, oms-core, oms-streaming-service, oms-mcp-server,
  oms-exchange-simulator and oms-ui. Every command exited 0.
- Policy check: PASS, 0 errors. The R10/P-17 warnings concern build files changed by SPEC-0001 and
  the pre-existing SLA work.

## Follow-ups

- FIX reason codes (OrdRejReason 103, CxlRejReason 102) if a venue or client needs them.
- Optional: surrogate-safe truncation of `rejectReason`.
- Rebuild oms-ui (`docker compose up -d --build oms-ui`) to see the new field and the earlier
  metamodel-cache fix in the running UI.
- Commit order: SPEC-0003 builds on uncommitted SPEC-0001 and SLA work (see SPEC-0001's
  follow-ups).

## Verdict

Verdict: GOAL MET
