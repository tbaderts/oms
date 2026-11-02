# Design — SPEC-0029: Model order expiry and close in the state machine

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

The proposal was approved without notes, so its assumptions stand:
- CLOSED is both the administrative close of a LIVE order and the end-of-day close of a finished
  one; it is the only terminal state;
- the OMS's scheduled steps drive expiry;
- UNACK orders expire too;
- end of day is 17:00 America/New_York, configurable;
- the cancel state is left as it is on expiry and close.

**Today:**
- **`org.example.common.state.OrderStateMachineConfig`** builds three configurations;
  `createStandard()` is the only one used. The users are:
  - `OrderAcceptCommandProcessor` (field, `isValidTransition(state, LIVE)`);
  - `SetOrderStateTask` (NEW→UNACK);
  - `DetermineOrderStateTask` (fill target state);
  - `ValidateLifecycleActionTask` (REJECT, CANCEL).

  Each holds its own `StateMachine` field.
- **Lifecycle commands** go through `OrderLifecycleCommandProcessor`:
  - `supports(command)` and a switch map `OrderRejectCmd`/`OrderCancelCmd`/
    `OrderCancelRequestCmd`/`OrderCancelRejectCmd` to a `LifecycleAction` (target state, resulting
    cancel state, `Event`, whether the open quantity is closed, `ReasonEffect`).
  - The pipeline is `DeduplicateCommandTask`, `LoadOrderTask` (row lock),
    `ValidateLifecycleActionTask`, `ApplyLifecycleActionTask` (toBuilder: state, cancel state,
    `leavesQty = 0`, reason, `transactTime`), `SaveOrderTask`, and `PublishOrderEventTask` (the
    appender: event and outbox).
  - REST (`CommandController`, `OrderLifecycleCommandProcessor.supports`) and Kafka
    (`CommandListener` switch on record class → `CommandHeaderMapper` → `handleLifecycle`) call it.
- **`Event`** has NEW_ORDER, ACK, PARTIAL_FILL, FILL, CXL, REJ, CXL_REQUEST, CXL_REJ; stored as
  text.
- **`OrderMessageMapper.mapState`** maps by name; the Avro `State` already has CLOSED and EXP.
- **`Order`** has `timeInForce` (`DAY`, `GOOD_TILL_DATE`, …), `expireTime`, `transactTime`.
  `OrderRepository` is a `JpaRepository` plus `JpaSpecificationExecutor`.
- **`OmsApplication`** has `@EnableScheduling`, and `OmsConfig` defines a `Clock` (UTC).
  `OutboxRelay` is the only `@Scheduled` component.
- **The simulator's `ExchangeEngine.handle`** marks unknown orders done and reacts to a change
  into PCXL. A known order's later messages are otherwise ignored, so fills continue after the OMS
  has finished the order.
- **Contracts:** the command API is at 3.1.0. Command records have `header` first; per-record
  subjects (SPEC-0025). `CommandSchemaTest` and `SchemaRegistrarTest` count the records (11
  commands, 14 subjects). `CommandCompatibilityTest` needs a baseline per `*Cmd`. The cockpit's
  `ApiCatalogService.test.ts` pins the command API version.

**Read:** `oms-concepts/order-lifecycle.md` (§4, §6),
`oms-framework/state-machine-framework_spec.md`, `task-orchestration-framework_spec.md`,
`validation-rules.md`, `error-handling.md`, `openapi-contracts.md`, `testing-patterns.md`,
`capabilities/order-cancellation.md`, `order-rejection.md`.

**Closest example:** `LifecycleAction.CANCEL` with `OrderCancelCmd`, end to end (contracts, REST,
Kafka, pipeline, tests).

## Approach

1. **Product state machine** (`OrderStateMachineConfig`):
   - `product()` replaces `standard()`, `simplified()`, `extended()` and their `create*`
     factories. Its transitions are:
     - NEW→UNACK;
     - UNACK→LIVE, REJ, EXP;
     - LIVE→FILLED, CXL, REJ, EXP, CLOSED;
     - FILLED→CLOSED, CXL→CLOSED, REJ→CLOSED, EXP→CLOSED.

     Initial state NEW; terminal CLOSED.
   - New `@Component org.example.common.state.OrderStateMachines` holds one
     `StateMachine<State>` and exposes `forOrder(Order order)`. Today it returns the product machine
     for every order; the Javadoc says this is where a leg's configuration will be chosen.
   - The four users take it by constructor injection and call `forOrder(order)`. Their unit tests
     pass `new OrderStateMachines()`.
2. **Lifecycle actions** (`LifecycleAction`):
   - `EXPIRE(State.EXP, null, Event.EXP, true, ReasonEffect.NONE)`: ExecutionReport ExecType=C.
   - `CLOSE(State.CLOSED, null, Event.CLOSE, true, ReasonEffect.NONE)`: administrative or end of
     day. Closing the open quantity is a no-op for finished orders, whose `leavesQty` is already 0.
   - `Event` gains `EXP` and `CLOSE`.
   - `ValidateLifecycleActionTask` validates `REJECT, CANCEL, EXPIRE, CLOSE` with
     `forOrder(order).isValidTransition(state, target)`. This makes AC-2/AC-3's refusals the state
     machine's, as for cancel.
   - The cancel state is left unchanged (resulting cancel state `null`). The reason (`text`) is
     kept in the event's stored command, like a cancel's.
3. **Commands:**
   - `OrderLifecycleCommandProcessor` maps the OpenAPI `OrderExpireCmd` → EXPIRE and
     `OrderCloseCmd` → CLOSE (orderId, text), and `supports` includes them.
   - REST needs nothing more (the controller asks `supports`).
   - `CommandListener` maps the Avro `OrderExpireCmd`/`OrderCloseCmd` to the models with
     `CommandHeaderMapper` and calls `handleLifecycle`, like `OrderCancelCmd`.
4. **Scheduled steps** — new package `org.example.oms.service.endofday`:
   - **`OrderExpiryService`** (`@Service`):
     - `int expireDueGtd(Instant now)` and `int expireDayOrders(Instant now)` find order ids through
       `OrderRepository`: GTD `findIdsToExpireGtd(states, now)`; DAY
       `findOrderIdsByStateInAndTimeInForce(LIVE, UNACK; DAY)`.
     - For each id, `orderLifecycleCommandProcessor.process(new OrderExpireCmd(...), now)`. The
       command has `type`, `orderId`, `text` "Time in force expired",
       `commandId = "EXP-" + orderId + "-" + yyyyMMdd`, and `producer`-style `correlationId` null.
     - Each order runs in its own transaction (the processor's). A refusal or a concurrency failure
       is logged and the loop continues; the next run retries. The method returns the number
       expired.
   - **`EndOfDayService`** (`@Service`):
     - `EndOfDayResult run(Instant cutoff)` calls `expireDayOrders(cutoff)`, then closes finished
       orders.
     - The query is `findOrderIdsToClose(FILLED, CXL, REJ, EXP; cutoff)`: the state is in the list
       and no event of the order has `time_stamp >= cutoff`. JPQL with `NOT EXISTS` on `OrderEvent`.
     - Each id gets `OrderCloseCmd`, text "End of day",
       `commandId = "EOD-" + orderId + "-" + yyyyMMdd`, same error handling. It returns the counts.
     - The cutoff is the instant the step runs, so orders expired by the same run (event time
       before the close loop starts) are closed too.
   - **`EndOfDayScheduler`** (`@Component`, `@ConditionalOnProperty("oms.end-of-day.enabled",
     matchIfMissing = true)`, implements `SchedulingConfigurer`):
     - It registers a `CronTrigger("0 m h * * *", zone)` from `oms.end-of-day.time` (default
       `17:00`) and `oms.end-of-day.zone` (default `America/New_York`), calling
       `endOfDayService.run(clock.instant())`.
     - Its `@Scheduled(fixedDelayString = "${oms.end-of-day.gtd-poll-interval-ms:60000}")` calls
       `expireDueGtd(clock.instant())`.
     - `cronExpression()` is package-visible for its test.
   - **Tests:** a test-only `src/test/resources/config/application.yml` sets
     `oms.end-of-day.enabled: false` for every Spring test context. Spring Boot reads
     `classpath:/config/` in addition to and above the main `application.yml`. Tests call the
     services directly, with explicit instants.
5. **Repository** (`OrderRepository`):
   - `@Query("select o.orderId from Order o where o.state in :states and o.timeInForce = :tif and
     o.expireTime <= :now") List<String> findIdsToExpireGtd(...)` with `tif = GOOD_TILL_DATE`.
   - `findOrderIdsByStateInAndTimeInForce` as a JPQL `select o.orderId`.
   - `@Query("select o.orderId from Order o where o.state in :states and not exists (select e from
     OrderEvent e where e.orderId = o.orderId and e.timeStamp >= :cutoff)") List<String>
     findOrderIdsToClose(...)`.
6. **Exchange simulator:** in `ExchangeEngine.handle`, a known order whose message state is final
   (`FILLED`, `CXL`, `REJ`, `EXP`, `CLOSED`) is marked `done`. Scheduled fills check `done`
   already, so none follow; it is logged.
7. **Contracts** (Contract Changes): two OpenAPI schemas and discriminator entries, 3.2.0; two Avro
   records and their baselines. `CommandSchemaTest` expects 13 commands, and `SchemaRegistrarTest`
   16 subjects. The cockpit pin moves to 3.2.0.

| What Changes (proposal) | Where |
|---|---|
| One product state machine, provider | `OrderStateMachineConfig.product()`, `OrderStateMachines`, four users |
| Transitions | `product()` |
| Expire / Close commands | contracts, `LifecycleAction`, `Event`, processor, `CommandListener` |
| Scheduled steps | `service/endofday/*`, `OrderRepository`, configuration |
| Simulator | `ExchangeEngine` |
| Contracts | oms-contracts |
| Docs | Knowledge Base Updates |

## Contract Changes

**OpenAPI** (`oms-cmd-api.yml`, `info.version: 3.2.0`): two discriminator mappings and two schemas,
following `OrderCancelCmd`:

```yaml
          OrderExpireCmd: '#/components/schemas/OrderExpireCmd'
          OrderCloseCmd: '#/components/schemas/OrderCloseCmd'
    OrderExpireCmd:
      description: The order's time in force ran out (FIX ExecutionReport ExecType=C).
      allOf:
        - $ref: '#/components/schemas/Command'
        - type: object
          required: [orderId]
          properties:
            orderId: { type: string, minLength: 1 }
            text: { type: string, maxLength: 255, description: Expiry reason }
    OrderCloseCmd:
      description: Close the order; nothing more happens to it (administrative or end of day).
      allOf:
        - $ref: '#/components/schemas/Command'
        - type: object
          required: [orderId]
          properties:
            orderId: { type: string, minLength: 1 }
            text: { type: string, maxLength: 255, description: Close reason }
```

**Avro** (`OrderExpireCmd.avsc`, `OrderCloseCmd.avsc`), shaped like `OrderCancelCmd.avsc`:
`header: CommandHeader`, `orderId: string`, `text: ["null","string"] = null`. Baselines are
`compat/commands/OrderExpireCmd.json` and `OrderCloseCmd.json` (first release). The subjects are
`commands-…OrderExpireCmd` and `…OrderCloseCmd`.

**Compatibility: additive.** New schemas and new subjects; no existing field or subject changes
(P-04). The Avro `State` already has EXP and CLOSED. Generated classes: two new `cmd` models and
two new `msg` records.

## Data & Persistence

None — no schema change. States and events are stored as text: `orders.state` and
`order_events.event` are VARCHAR, so the new `Event` values fit. The step queries filter on `state`
(indexed: `idx_orders_state`), `time_in_force`/`expire_time` (small sets), and `order_events`
through its `(order_id, version)` unique index. No new index; the follow-ups add one if volumes
call for it.

## Events & Messaging

- **`order_events` (P-05):** an expire appends `EXP` and a close `CLOSE`, with the command and the
  snapshot, through the appender. One event per order per command.
- **Outbox (P-06):** each staged as an `ORDER` row, so `oms_orders` publishes state `EXP` or
  `CLOSED`. No new topic.
- **`commands`:** two new record types, consumed by `CommandListener`.
- **Idempotency (P-08):**
  - A second expire or close is refused by the state machine (EXP→EXP, CLOSED→CLOSED invalid).
  - The scheduled commands carry deterministic `commandId`s, deduplicated by the lifecycle
    pipeline.
  - Re-running a step changes nothing more (AC-4/AC-5).
- **Concurrency:** the lifecycle row lock and the SPEC-0027 version check. A step that loses to a
  concurrent command skips that order and retries on the next run.

## Domain, State & Orchestration

| Action | From | To | leavesQty | cancelState | Event |
|---|---|---|---|---|---|
| EXPIRE | LIVE, UNACK | EXP | 0 | unchanged | EXP |
| CLOSE | LIVE | CLOSED | 0 | unchanged | CLOSE |
| CLOSE | FILLED, CXL, REJ, EXP | CLOSED | unchanged (0) | unchanged | CLOSE |

- **Refusals** (P-13): invalid transitions are refused by `ValidateLifecycleActionTask`, as for
  cancel. Over REST that is 400 with `CommandResult` FAILED; over Kafka it is acknowledged.
- **Fills on EXP or CLOSED orders:** refused by `DetermineOrderStateTask`, since there is no
  transition out of EXP to FILLED.
- **The pipelines are unchanged** apart from the state-machine provider.

## Alternatives & Decisions

- **One product configuration, with a provider** — chosen over keeping the three configurations
  and choosing by property. Only one was ever used, and the proposal asks for a product decision.
  The provider is the extension point for per-leg configurations, without speculative variants
  (P-17).
- **Expire and close as lifecycle actions** — chosen over new processors. They are rows of the
  existing rule table, validated by the state machine, with event, outbox and deduplication for
  free.
- **Scheduled steps call the lifecycle processor with commands** — chosen over bulk SQL updates.
  Every change is then an event with a message (P-05/P-06), and the steps reuse validation and
  locking. A bulk update would bypass the event log.
- **`SchedulingConfigurer` with `oms.end-of-day.time`/`zone`** — chosen over a cron property. The
  operator sets a time of day, as the proposal states; the trigger is built from it.
- **Test-only `config/application.yml` disables the scheduler** — chosen over a property in every
  test base. One file covers every Spring test context, and no test depends on the wall clock.
- **Deterministic `commandId`s for scheduled commands** — an operator re-running a step, or two
  instances, are refused as duplicates.
- **The simulator stops on any final state** rather than only EXP: cancel and reject already make
  it stop through its own answers, and FILLED and CLOSED orders must not trade either.
- **No new dependency; no build change** (P-17).
- **Changed during implementation (independent review):**
  - **Own scheduler thread.** `EndOfDayScheduler` no longer uses Spring's shared scheduler, whose
    single thread also drains the outbox (`OutboxRelay`): a long end of day would have held up
    every Kafka message. It owns a single-threaded `ThreadPoolTaskScheduler` (`end-of-day-`),
    started on construction-complete and shut down on destroy. It schedules the cron end of day
    and the fixed-delay GTD expiry; `@Scheduled` and `SchedulingConfigurer` are gone.
  - **One order's failure does not stop the run.** Both services catch any `RuntimeException` per
    order, log it with the order id, and continue. Failures are counted in the result
    (`EndOfDayResult.failed`) and in the metric `oms.end-of-day.failures{step=expire|close}`;
    applied changes are counted in `oms.end-of-day.orders{step=expire|close}`.
  - **No time in force means DAY** (FIX tag 59 default). DAY expiry matches `timeInForce = DAY` or
    `timeInForce is null`.
  - **Cancel reject on a CLOSED order is refused.** CANCEL_REJECT requires a pending cancel and a
    state other than CLOSED. EXPIRE and CLOSE leave a pending cancel in place, and CLOSED means
    nothing more happens. FILLED/CXL/EXP keep accepting it: the venue's "too late" answer is still
    recorded.
  - **`oms.end-of-day.time` is read as text** and parsed as `H:mm`, with a clear startup error.
    Unquoted YAML `16:30` is a base-60 integer; the capability page says to quote it.
  - **Documented as known gaps** rather than changed:
    - a GTD order without `expireTime` never expires;
    - other session-bound times in force (AT_THE_OPENING, AT_THE_CLOSE, GOOD_TILL_CROSSING) are not
      expired;
    - a venue fill crossing an OMS-side expiry is refused, which is a position risk with a real
      venue;
    - a DAY order created between the cutoff and the query is expired too;
    - the first end of day closes every finished order ever recorded.
- **Changed during implementation: the orders end of day closes.** Approach step 4 said the
  orders the same run expired are closed because their events precede the close loop. With the
  cutoff passed in (the instant end of day starts), those expiry events come after it. So
  `EndOfDayService.run(cutoff)` closes the finished orders whose last event is before the cutoff,
  plus the ids it expired itself in that run. An order changed after the cutoff by anything else
  stays, as AC-5 requires.
- **Changed during implementation: the query API's `OrderEventType`.** The event-log endpoint
  (SPEC-0035) maps `Event` to the query API's `OrderEventType` enum with MapStruct, and the build
  failed until it gained `EXP` and `CLOSE`. Adding enum values to a response is additive, so it
  complies with P-04; the query API goes to 2.1.0. Nothing reads that enum besides oms-core's
  mapper: oms-ui's `OrderEventType` is an unrelated streaming type. Tested by
  `OrderExpiryCloseIntegrationTest`, which reads the event log of an expired and closed order
  through `GET /api/query/orders/{id}/events`.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| End of day fires during a test run | Disabled in every test context (`config/application.yml`); the services are tested with explicit instants |
| A large number of orders at end of day: one transaction per order is slow | Acceptable for the volumes here; logged with counts. A follow-up can batch if needed |
| An order changes while end of day runs | Row lock and version check; the step skips and the next run retries |
| A real venue expires an order the OMS already expired | Refused as an invalid transition (EXP→EXP), acknowledged; no double event |
| Downstream consumers see EXP/CLOSED for the first time | Both are in the Avro enum and the UI already; documented |

## Test Strategy

| AC | Level (unit / web-mvc / integration / e2e) | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | unit | `OrderStateMachineConfigTest#productTransitionsAreExactly` (new), `#onlyClosedIsTerminal`; `OrderStateMachinesTest#returnsTheProductMachineForEveryOrder` | The full allowed-transition set equals the AC's list; CLOSED is the only terminal state; `simplified`/`extended` no longer exist (compile-level: the factories are removed). The provider returns the product machine |
| AC-2 | unit + integration | `OrderLifecycleCommandProcessorTest#expire_*`; `OrderExpiryCloseIntegrationTest#expireOverRestAndKafka` (new, extends `AbstractFillFlowIntegrationTest`) | A partly filled LIVE order expired over REST (200) and another over Kafka: `EXP`, `leavesQty` 0, `cumQty` kept, an `EXP` event, `OrderMessage` state EXP on `orders`. A later fill is refused. An expire for FILLED/CXL/REJ/EXP/CLOSED is refused (400). A repeated `commandId` is a duplicate |
| AC-3 | unit + integration | `OrderLifecycleCommandProcessorTest#close_*`; `OrderExpiryCloseIntegrationTest#closeLiveAndFinishedOrders` | LIVE → CLOSED with `leavesQty` 0 and the reason in the stored command; FILLED/CXL/REJ/EXP → CLOSED with quantities unchanged; NEW/UNACK/CLOSED refused; a `CLOSE` event and a published message for each |
| AC-4 | integration | `EndOfDayIntegrationTest#gtdExpiryExpiresOnlyDueGtdOrders`, `#endOfDayExpiresDayOrders`, `#stepsAreIdempotent` (new) | GTD past/future, DAY, GTC in LIVE and UNACK: `expireDueGtd(now)` expires only the due GTD ones; `run(cutoff)` expires the DAY ones; GTC and final orders are untouched; running again expires nothing |
| AC-5 | integration + unit | `EndOfDayIntegrationTest#endOfDayClosesOrdersFinishedBeforeTheCutoff`; `EndOfDaySchedulerTest#cronAndZoneFromConfiguration` | Finished orders with their last event before the cutoff are closed (`CLOSE` event and message); one changed after the cutoff stays. The scheduler builds `0 0 17 * * *` in America/New_York by default, and `0 30 16 * * *` in Europe/Zurich from properties |
| AC-6 | unit + integration | `ExchangeEngineTest#finalStateStopsTheOrder` (new); `ExchangeSimulatorKafkaIntegrationTest` (existing, still passing) | A marketable order sliced into 4 fills with a delay: after the first fill an `OrderMessage` with state EXP arrives, and no further fill is sent |
| AC-7 | unit (oms-contracts) + cockpit | `CommandSchemaTest` (13 records), `CommandCompatibilityTest` (13 baselines), `SchemaRegistrarTest` (16 subjects), `CommandBaseContractTest#versionIs320`, new `LifecycleCommandsContractTest#expireAndCloseInTheDiscriminator`; `ApiCatalogService.test.ts` | Both schemas exist with `orderId` required and the mappings in place; 3.2.0; both Avro records have `header` first; registration covers them; the earlier baselines still pass |

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | comply | New OpenAPI schemas and Avro records only in oms-contracts |
| P-02 | Specification before code, generated models only | comply | Contracts first; processors use the generated `cmd`/`msg` classes |
| P-03 | Never edit generated code | comply | Regenerated by `./gradlew clean build` |
| P-04 | Contracts evolve compatibly | comply | Additive: new schemas, new records with new subjects, 3.2.0; every earlier baseline still passes |
| P-05 | Every state change is recorded in the event log | comply | Expire and close append `EXP`/`CLOSE` events through the appender, including those from the scheduled steps |
| P-06 | Kafka only through the transactional outbox | comply | The order message is staged by the appender; no direct publish |
| P-07 | Schema changes through new Liquibase changesets | n/a | No schema change |
| P-08 | Concurrency and idempotency are explicit | comply | Lifecycle row lock, version check, state-machine refusal of repeats, deterministic `commandId`s for scheduled commands |
| P-09 | Commands and queries stay separate | comply | The steps issue commands; their finder queries are internal repository reads |
| P-10 | State transitions go through the state machine and task pipeline | comply | New transitions in the product machine; validated by `ValidateLifecycleActionTask`; applied by the lifecycle pipeline |
| P-11 | Layering and conventions | comply | `service/endofday` for the steps; `common/state` for the machine and its provider; lifecycle rows in `LifecycleAction` |
| P-12 | Jackson 3 only | n/a | No new Jackson use |
| P-13 | Errors and validation follow the framework specs | comply | Refusals as `CommandResult` FAILED / acknowledged; conflicts as before (409/retry) |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Test Strategy above |
| P-15 | Observability | comply | Each step logs its counts; per order, the lifecycle logs and `oms.commands.consumed` for Kafka commands; events and messages as for any command |
| P-16 | Security | n/a | No new exposure beyond two commands on the existing API |
| P-17 | Simplicity and dependencies | comply | Removes two unused configurations; no dependency; Spring scheduling already enabled |
| P-18 | Modules build standalone | comply | oms-contracts, oms-core and the simulator verified; consumers rebuild against the contracts |
| P-19 | Documentation follows behaviour | comply | Knowledge Base Updates below |

## Knowledge Base Updates

- `oms-concepts/order-lifecycle.md` — the product configuration (one machine, its transitions),
  CLOSED semantics, expiry and end of day, `OrderStateMachines`.
- `capabilities/order-expiry-and-close.md` (new) — commands, steps, configuration; linked from
  `capabilities/index.md`.
- `interfaces/command-api.md` — the two commands, 3.2.0.
- `interfaces/avro-messages.md` — the two records.
- `capabilities/exchange-simulation.md` — stops on a final state.
- `domain/order-state.md` — EXP and CLOSED are reachable.
