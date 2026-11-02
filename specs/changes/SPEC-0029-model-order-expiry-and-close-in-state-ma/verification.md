# Verification — SPEC-0029: Model order expiry and close in the state machine

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

The final `spec verify` ran at 2026-11-02 11:39Z, after the review fixes (T-10) and the
strengthened AC-5 test. Every command exited 0:
- `check` in oms-contracts, oms-core (317 tests), oms-streaming-service, oms-mcp-server and
  oms-exchange-simulator;
- the developer-cockpit typecheck and tests.

Every test below is in that run with no failure or skip.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Exactly the product transitions; CLOSED only terminal; no other configuration; all users via `OrderStateMachines` | `OrderStateMachineConfigTest#productTransitionsAreExactly` compares the allowed transitions of every `State` with the AC's list. `#onlyClosedIsTerminal`; `OrderStateMachinesTest#returnsTheProductMachineForEveryOrder`. `simplified()`/`extended()` are removed, and `createProduct()` is called only in `OrderStateMachines`. `OrderAcceptCommandProcessor`, `SetOrderStateTask`, `DetermineOrderStateTask` and `ValidateLifecycleActionTask` inject the provider. `StateMachineTest` builds its second configuration locally. evidence/oms-core-1.log | PASS |
| AC-2 | Expire over REST and Kafka: EXP, `leavesQty` 0, `cumQty` kept, EXP event, EXP message; later fill refused; expire of final orders refused; repeated `commandId` refused | `OrderExpiryCloseIntegrationTest#expireOverRestAndKafka`: a partly filled order expired over REST (200) and another over Kafka. Checked: EXP, `leavesQty` 0, `cumQty` 40, the `EXP` event, the `OrderMessage` state EXP on `orders`, and EXP in `GET /api/query/orders/{id}/events`. A later fill is refused, as are a second expire and a repeated `commandId` (400). `OrderLifecycleCommandProcessorTest#expire_onOpenOrder_*` (LIVE, UNACK; the cancel state is kept) and `#expire_onFinishedOrNewOrder_refused` (NEW, FILLED, CXL, REJ, EXP, CLOSED). `CommandListenerTest#expireAndClose_areDelegatedWithTheirFieldsAndHeader` | PASS |
| AC-3 | Close: LIVE → CLOSED with `leavesQty` 0 and the reason recorded; FILLED/CXL/REJ/EXP → CLOSED with quantities kept; NEW/UNACK/CLOSED refused; CLOSE event and message | `OrderExpiryCloseIntegrationTest#closeLiveAndFinishedOrders`: LIVE closed (`leavesQty` 0, `cumQty` 40, reason in the stored `OrderCloseCmd`, a `CLOSE` event, an `OrderMessage` CLOSED); a FILLED order closed with `cumQty` 100; one closed over Kafka; a second close refused. Unit: `#close_onLiveOrder_closesOpenQuantity`, `#close_onFinishedOrder_keepsQuantities` (FILLED, CXL, REJ, EXP), `#close_onNewUnackOrClosedOrder_refused` | PASS |
| AC-4 | GTD expiry expires only due GTD; end of day expires DAY (incl. no time in force); GTC and final orders untouched; idempotent | `EndOfDayIntegrationTest`: `#gtdExpiryExpiresOnlyDueGtdOrders` covers GTD due (LIVE, UNACK), GTD future, DAY and GTC; `#endOfDayExpiresDayOrders` covers DAY LIVE and UNACK, and an order without a time in force, all expired then closed, while GTC stays LIVE; `#stepsAreIdempotent` checks that a second run appends no event | PASS |
| AC-5 | End of day closes the orders finished before the cutoff (event and message); one changed after stays; time and zone from configuration | `EndOfDayIntegrationTest#endOfDayClosesOrdersFinishedBeforeTheCutoff`: FILLED, EXP, CXL and REJ orders finished before the cutoff are CLOSED, each with a `CLOSE` event, and the CLOSED `OrderMessage` is published on `orders`. A FILLED order changed after the cutoff stays FILLED. `EndOfDaySchedulerTest`: `0 0 17 * * *` America/New_York by default and `0 30 16 * * *` Europe/Zurich from configuration; `9:05` is accepted; an invalid time fails naming `oms.end-of-day.time`; the steps run at the clock's instant on the scheduler's own `end-of-day-` thread. `EndOfDayServiceTest`: one failing order does not stop the others | PASS |
| AC-6 | The simulator stops working an order published in a final state | `ExchangeEngineTest#finalStateStopsTheOrder`: four fill slices with a delay, EXP published after the first fill, no fill follows. The other final states use the same `FINAL_STATES` check. `ExchangeSimulatorKafkaIntegrationTest` still passes. evidence/oms-exchange-simulator-1.log | PASS |
| AC-7 | Contracts: both commands in the OpenAPI discriminator (3.2.0) and as Avro records with `header` first; registration covers them; earlier contracts unchanged | `LifecycleCommandsContractTest#expireAndCloseInTheDiscriminator`; `CommandSchemaTest` (13 records, `header` first); `CommandCompatibilityTest` (13 baselines: all earlier ones unchanged, plus the two new ones); `SchemaRegistrarTest` (16 subjects); `CommandBaseContractTest#versionIs320`; the cockpit's `ApiCatalogService.test.ts` (3.2.0, the two types) and starter templates. evidence/oms-contracts-1.log, developer-cockpit-2.log | PASS |

## Goal Assessment

The Goal asked for four things:
- **Decide which configuration is the product one.** Done: `product()`. CLOSED is the only
  terminal state, with both meanings (approved).
- **Add the missing transitions.** Done (AC-1).
- **Add the commands or scheduled step that drive them.** Done: `OrderExpireCmd`/`OrderCloseCmd`
  over REST and Kafka, plus GTD expiry and end of day (AC-2–AC-5).
- **Prepare for one configuration per leg.** Done: `OrderStateMachines.forOrder(order)`, used by
  every caller.

Expiry and end of day are therefore modelled, and the orders the finding is about now leave LIVE:
DAY, including those without a time in force, and GTD.

Limits, documented in `capabilities/order-expiry-and-close.md` (Known gaps):
- no trading calendar;
- GTD without `expireTime`;
- other session-bound times in force (AT_THE_OPENING, AT_THE_CLOSE, GOOD_TILL_CROSSING);
- the fill-versus-expiry race with a real venue;
- the first end of day closing all history.

The proposal scoped out the calendar and real venue expiry; the rest the review raised and they
are recorded rather than built. No material gap against the Goal.

## Policy Review

Reviewed against the diff of the SPEC-0029 files (tasks.md lists them, with its Notes). The working
tree also holds uncommitted work of earlier, finished tickets. The R10 warnings concern SPEC-0025's
files.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | Both commands (OpenAPI, Avro) and the query enum change in oms-contracts only |
| P-02 | Specification before code, generated models only | PASS | Contracts first (T-1); generated `cmd`/`msg`/`query` classes used |
| P-03 | Never edit generated code | PASS | Regenerated |
| P-04 | Contracts evolve compatibly | PASS | Additive: two command schemas and records with new subjects (3.2.0). Query API `OrderEventType` gains `EXP`/`CLOSE` (2.1.0; no other reader of that enum). Every earlier baseline passes |
| P-05 | Every state change is recorded in the event log | PASS | `EXP`/`CLOSE` events through the appender, including from the scheduled steps |
| P-06 | Kafka only through the transactional outbox | PASS | Steps call the lifecycle processor; messages through the outbox |
| P-07 | Schema changes through new Liquibase changesets | N/A | No schema change |
| P-08 | Concurrency and idempotency are explicit | PASS | Lifecycle row lock and version check; the state machine refuses repeats; deterministic `commandId`s for scheduled commands; per-order failures isolated |
| P-09 | Commands and queries stay separate | PASS | The steps issue commands; finder queries are internal reads |
| P-10 | State transitions go through the state machine and task pipeline | PASS | New transitions in `product()`; validated and applied by the lifecycle pipeline |
| P-11 | Layering and conventions | PASS | `common/state` (machine, provider), `service/endofday`, lifecycle rows in `LifecycleAction` |
| P-12 | Jackson 3 only | N/A | No new Jackson use |
| P-13 | Errors and validation follow the framework specs | PASS | Refusals as `CommandResult` FAILED (400) / acknowledged on Kafka; startup error for an invalid end-of-day time |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC above, red first per task including the review fixes |
| P-15 | Observability | PASS | `oms.end-of-day.orders{step}` and `oms.end-of-day.failures{step}`; per-order errors logged with the id; step totals logged |
| P-16 | Security | N/A | Two commands on the existing API; no new exposure |
| P-17 | Simplicity and dependencies | PASS | Two unused configurations removed; no dependency; one dedicated scheduler thread |
| P-18 | Modules build standalone | PASS | All five Java modules and the cockpit in verify |
| P-19 | Documentation follows behaviour | PASS | `order-lifecycle.md`, the new `capabilities/order-expiry-and-close.md` (with configuration and known gaps), `domain/order-state.md`, `domain/order-event.md`, `interfaces/command-api.md`, `interfaces/query-api.md`, `interfaces/avro-messages.md`, `capabilities/exchange-simulation.md`; okf-check reports 0 errors and 0 warnings |

## Independent Review

**Round 1 (MET, with major findings).** Every finding is fixed (T-10) or recorded:
1. **[major]** The steps ran on Spring's single scheduler thread, shared with the outbox relay.
   **Fixed:** own `end-of-day-` thread.
2. **[major]** A non-concurrency exception aborted the loop. **Fixed:** per-order handling, a
   failure count and metrics.
3. **[major]** Orders without a time in force never expired. **Fixed:** treated as DAY.
4. **[minor]** A cancel reject was accepted on a CLOSED order. **Fixed:** refused; still recorded
   on EXP (decision).
5. **[minor]** An unquoted YAML time failed startup obscurely. **Fixed:** parsed as `H:mm` text
   with a clear error; documented.
6. **[minor]** GTD without `expireTime`. **Known gap.**
7. **[minor]** DAY orders created after the cutoff. **Known gap.**
8. **[minor]** Stale KB pages. **Fixed.**
9. **[minor]** The venue fill race. **Known gap.**
10. **[minor]** The integration tests act on the shared test database. **Accepted.**
11. **[process]** verification.md. Done.

**Round 2 (MET).** It found AC-5 weak (FILLED and EXP only, no message assertion). **Fixed:**
CXL and REJ fixtures and the CLOSED `OrderMessage` check, re-verified at 11:39Z. Minor notes,
accepted and recorded as follow-ups:
- The first GTD pass runs while the context is starting.
- End of day and GTD expiry share the dedicated thread.
- A failed DAY expiry waits a day; no alert is defined.

## Automated Evidence

`evidence/last-run.json`, ran 2026-11-02T11:39:38Z, result **pass**, fingerprint
`5e76ad9a08f9f152`. Policy check: PASS, no errors. The three R10 warnings concern SPEC-0025's
files.

| Module | Command | Exit | Log |
|---|---|---|---|
| oms-contracts | `gradlew check` | 0 | evidence/oms-contracts-1.log |
| oms-core | `gradlew check` | 0 (317 tests) | evidence/oms-core-1.log |
| oms-streaming-service | `gradlew check` | 0 | evidence/oms-streaming-service-1.log |
| oms-mcp-server | `gradlew check` | 0 | evidence/oms-mcp-server-1.log |
| oms-exchange-simulator | `gradlew check` | 0 | evidence/oms-exchange-simulator-1.log |
| developer-cockpit | `npm run typecheck` | 0 | evidence/developer-cockpit-1.log |
| developer-cockpit | `npm test` | 0 | evidence/developer-cockpit-2.log |

## Follow-ups

- A trading calendar and per-venue sessions.
- Expiry for AT_THE_OPENING, AT_THE_CLOSE and GOOD_TILL_CROSSING; refuse GTD without
  `expireTime` at creation.
- Cancel at the venue before an OMS-side expiry, before connecting a real venue (fill race).
- Grafana alerts on `oms.end-of-day.failures`.
- Start the GTD poll after `ApplicationReadyEvent`.
- Consider batching end of day if volumes grow.
- **Before deploying:** expect the first end of day to close every finished order on record.

## Verdict

Verdict: GOAL MET

All seven ACs pass with tests from the final verify run. The independent review's verdict is MET
in both rounds; every major finding is fixed and re-verified, and the remaining limits are
documented known gaps. The goal assessment has no material gap.
