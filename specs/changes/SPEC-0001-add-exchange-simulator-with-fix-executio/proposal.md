# Proposal — SPEC-0001: Add exchange simulator with FIX execution workflow

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The OMS can create orders, but nothing downstream ever answers them. A new order goes NEW → UNACK
(`SetOrderStateTask`) and is published on `oms_orders` through the outbox, and then it sits in
UNACK until a developer hand-crafts an `OrderAcceptCmd` and one or more `ExecutionCreateCmd`s in
`oms-core/rest.http`. There is no market connectivity, so the rest of the lifecycle (ack, partial
and full fills, rejects, cancels) can only be tested by scripting each step by hand. That is slow
and error-prone, and it hides integration bugs. The recent partial-fill fix in
`DetermineOrderStateTask` is an example: partial fills were silently dropped, and no end-to-end
flow exposed it.

The order model is also incomplete for the scenarios a market produces. The `State` enum and the
standard state machine already allow UNACK → REJ, LIVE → REJ and LIVE → CXL, and `CancelState`
already has PCXL/CXL/REJ. However, there is **no command** that rejects an order, confirms a
cancel, requests a cancel or rejects a cancel request. `Cmd.avsc` names OCXL/OREJ, but no record,
OpenAPI schema or processor implements them. See `oms-knowledge-base/oms-concepts/order-lifecycle.md`
§4.5, §4.9, §5.2 and §9.2, which describe these flows as intended behaviour.

If we do nothing, every lifecycle change stays expensive to test by hand, and the cancel and reject
paths described in the knowledge base stay unimplemented.

Ticket goal: build a market/exchange simulator that subscribes to OMS orders over Kafka, evaluates
order economics and answers with FIX-style acks, single or multiple executions, rejects and cancels,
and add the OMS model and commands this needs.

## What Changes

- **New service `oms-exchange-simulator`** (Spring Boot, standalone Gradle build that includes
  `oms-contracts`, added to the root `docker-compose.yml`). It acts as the exchange:
  - consumes `OrderMessage` (Avro) from `oms_orders`;
  - treats an order first seen in state `UNACK` as a FIX *NewOrderSingle* (35=D), and an order
    whose `cancelState` becomes `PCXL` as an *OrderCancelRequest* (35=F);
  - answers by sending commands to oms-core on the existing `commands` topic (`CommandMessage`):

    | FIX semantics | Command sent to OMS |
    |---|---|
    | ExecutionReport ExecType=0 New (ack) | `OrderAcceptCmd` |
    | ExecutionReport ExecType=F Trade (partial/full fill) | `ExecutionCreateCmd` (`execType` = `F`) |
    | ExecutionReport ExecType=8 Rejected | `OrderRejectCmd` (new) |
    | ExecutionReport ExecType=4 Canceled (unsolicited or confirming a request) | `OrderCancelCmd` (new) |
    | OrderCancelReject (35=9) | `OrderCancelRejectCmd` (new) |
  - **Order economics**:
    - Each symbol has a configured reference price (static configuration, no live market data).
    - A **market** order is marketable.
    - A **limit** order is marketable when its price crosses the reference price (buy: price ≥
      reference; sell: price ≤ reference).
    - Marketable quantity fills at the reference price, either in one execution or split into a
      configurable number of partial fills with a configurable delay between them.
    - A non-marketable limit order is acked and rests (stays LIVE, no fills) until it is cancelled.
    - An **IOC** order fills what is marketable and has its remainder cancelled.
  - **Reject rules**: unknown symbol (no configured reference price), missing or non-positive
    `orderQty`, and a limit price outside a configurable band around the reference price. The reject
    reason is carried in the order's `text`.
  - Keeps resting orders in memory, ignores redelivered order messages it has already handled, and
    exposes Micrometer metrics on `/actuator/prometheus`.
- **oms-core: new commands**, each available on `/api/command` and on the `commands` topic, each
  through the state machine and task pipeline, appending to `order_events` and publishing the
  order through the outbox:
  - `OrderRejectCmd {orderId, text}`: UNACK/LIVE → REJ, leavesQty → 0.
  - `OrderCancelCmd {orderId, text}`: LIVE → CXL, `cancelState` → CXL, leavesQty → 0, cumQty kept.
  - `OrderCancelRequestCmd {orderId}`: client request; `cancelState` → PCXL, order state unchanged;
    allowed only for an order that is LIVE with leavesQty > 0 and no cancel already pending.
  - `OrderCancelRejectCmd {orderId, text}`: `cancelState` PCXL → REJ, order state unchanged.
- **oms-contracts (additive only)**:
  - new Avro records for the four commands, added as new branches of the `CommandMessage` union;
  - new OpenAPI schemas in `oms-cmd-api.yml` and new discriminator mappings.
- **New `order_events` event kinds** for the cancel request and the cancel reject. The existing `CXL`
  and `REJ` kinds are reused. The `Event` enum is persisted by name, so adding values is safe.
- **Knowledge base**: a new page describing the simulator (behaviour, configuration, FIX mapping),
  plus updates to `order-lifecycle.md` and `execution-reporting.md` for the new commands.

No **BREAKING** changes: all contract changes are additive.

## Scope

### In scope

- The `oms-exchange-simulator` module, its configuration (reference prices, price band, number of
  fill slices, fill delay), its Dockerfile and docker-compose entry, and its tests.
- FIX-style flows: ack, single fill, multiple partial fills, exchange reject, unsolicited cancel of
  the IOC remainder, client cancel request → cancel confirm, client cancel request → cancel reject.
- The four new OMS commands (contracts, processors, state-machine use, event log, outbox), REST and
  Kafka entry points, and their tests.
- Knowledge-base updates for the new behaviour.

### Out of scope

- A real FIX engine or FIX session layer (QuickFIX/J, tag=value encoding, sequence numbers).
  Only FIX *semantics* (message types, ExecType, OrdStatus meaning) are modelled.
- A limit order book or matching between OMS orders. The simulator does not match orders against
  each other, and resting orders never fill later from price movement.
- Live or random market data. Reference prices are static configuration.
- Order replace/amend (35=G, `PMOD`; see `order-replace.md`), execution bust/whack/correct, and
  DAY/GTD expiry (EXP).
- FOK and other TIF-specific behaviour beyond IOC. Other TIFs behave like DAY (rest).
- UI changes in oms-ui (for example a cancel button). The new commands are reachable over REST.
- Durability of the simulator's state across restarts. A restart forgets resting orders.
- Computing `avgPx` in oms-core (a separate known gap).

## Acceptance Criteria

- **AC-1** — Given the simulator is running with reference price 170.00 for `AAPL` and 1 fill slice,
  when a market BUY order for 100 `AAPL` is created through `/api/command`, then within 10 seconds
  the order is `FILLED` with cumQty 100 and leavesQty 0, exactly one execution with lastQty 100,
  lastPx 170.00 and execType `F` exists, and the order's `order_events` are, in version order,
  `NEW_ORDER`, `ACK`, `FILL`.
- **AC-2** — Given the simulator is configured with 3 fill slices, when a marketable order for 100
  is created, then within 10 seconds the order has exactly 3 executions with distinct execIDs whose
  lastQty sum to 100 (no slice is zero), the order ends `FILLED`, and its events are `NEW_ORDER`,
  `ACK`, `PARTIAL_FILL`, `PARTIAL_FILL`, `FILL`.
- **AC-3** — Given reference price 170.00, when a limit BUY at 172.00 is created, then it is filled
  at lastPx 170.00. And when a limit BUY at 165.00 (inside the price band, below the reference) is
  created, then within 10 seconds the order is `LIVE` with cumQty 0 and leavesQty equal to orderQty,
  and it still has no executions 3 seconds after reaching `LIVE`.
- **AC-4** — Given the simulator has no reference price for symbol `ZZZZ`, when an order for `ZZZZ`
  is created, then within 10 seconds the order is `REJ` with leavesQty 0, its `text` names the
  reason (unknown symbol), its last event is `REJ`, and it has no executions.
- **AC-5** — Given reference price 170.00 and a price band of 10%, when a limit order at 200.00 is
  created, then the order ends `REJ` with a price-band reason in `text`. When an order with
  orderQty 0 or no orderQty reaches the simulator, then the simulator sends `OrderRejectCmd` and no
  `OrderAcceptCmd` or `ExecutionCreateCmd` (simulator unit test, since oms-core validation already
  stops such orders before UNACK).
- **AC-6** — Given reference price 170.00, when an IOC limit BUY at 165.00 is created, then the order
  is acked and then ends `CXL` with cumQty 0, leavesQty 0 and events `NEW_ORDER`, `ACK`, `CXL`. When
  an IOC order is marketable, it fills in full and is not cancelled.
- **AC-7** — Given a resting (LIVE, unfilled) limit order known to the simulator, when an
  `OrderCancelRequestCmd` for it is posted to `/api/command`, then the response is 200 with status
  `OK`, the order's `cancelState` is `PCXL` and its state is still `LIVE`. Within 10 seconds the
  order is `CXL` with `cancelState` `CXL` and leavesQty 0, and its event log contains the
  cancel-request event followed by `CXL`.
- **AC-8** — Given an order is LIVE in the OMS but unknown to the simulator (for example after a
  simulator restart), when an `OrderCancelRequestCmd` is posted for it, then within 10 seconds the
  order's `cancelState` is `REJ`, its state is still `LIVE` with leavesQty unchanged, and its event
  log ends with the cancel-reject event.
- **AC-9** — Given orders in an ineligible state, when the new commands are sent, then each is
  refused with status `FAILED` (HTTP 400 on REST) and no event is appended and nothing is staged in
  the outbox:
  - `OrderCancelRequestCmd` for an order that is `FILLED`, `REJ` or `CXL`, or that already has
    `cancelState` `PCXL`;
  - `OrderCancelCmd` or `OrderRejectCmd` for an order in a terminal state;
  - `OrderCancelRejectCmd` for an order without a pending cancel;
  - any of the four for an unknown orderId.
- **AC-10** — Given an `OrderRejectCmd`, `OrderCancelCmd`, `OrderCancelRequestCmd` or
  `OrderCancelRejectCmd` has been applied, when the same command is delivered again on the
  `commands` topic, then no second event is appended and the order's state, `cancelState` and
  `txNr` are unchanged. Given the simulator has already handled an order, when the same UNACK
  `OrderMessage` is redelivered, then the simulator sends no further commands for it.
- **AC-11** — Given the previous versions of `CommandMessage` and the existing command records,
  when they are checked against the new schemas with Avro `SchemaCompatibility`, then the new
  schemas are backward compatible. `./gradlew check` passes in `oms-contracts`, `oms-core`,
  `oms-exchange-simulator` and every other contracts consumer.
- **AC-12** — Given the simulator has processed at least one ack, fill, reject and cancel, when
  `/actuator/prometheus` is scraped, then counters for orders received, acks, executions, rejects
  and cancels are present with non-zero values, and the simulator's log lines for each handled
  order include the `orderId`.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-contracts, oms-core, oms-knowledge-base, **new** oms-exchange-simulator (must be added to `specs/config.json` → `modules`, see Open Questions); docker-compose.yml |
| Contracts (OpenAPI / Avro) | Additive. 4 new Avro command records, added as new branches of the `CommandMessage` union. 4 new schemas and discriminator mappings in `oms-cmd-api.yml`. Existing schemas unchanged. |
| Data (tables, migrations) | No new tables or columns expected (`state`, `cancel_state` and `text` already exist on `orders`). New `Event` enum values are stored as strings in `order_events`. The design confirms whether any column constraint needs a changeset. |
| Events / Kafka topics | No new topics. The simulator consumes `oms_orders` (new consumer group) and produces to `commands`. oms-core publishes more order updates on `oms_orders` (cancel request/confirm/reject, reject). |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-streaming-service and oms-ui see the new states and `cancelState` values, all of which already exist in their enums. oms-mcp-server: none. No consumer breaks. |
| Knowledge base | New `oms-concepts/exchange-simulator.md`. Update `order-lifecycle.md` (cancel request / cancel reject flow, commands per transition) and `execution-reporting.md` (FIX ExecType → command mapping). |

## Open Questions

- [resolved] How does the simulator send its answers to the OMS, REST or Kafka? → assumption: Kafka
  `commands` topic with `CommandMessage`. It reuses the existing listener, the DLT and retry
  handling, and per-order ordering when keyed by orderId, which keeps the ack ahead of the fills.
  This is cheap to reverse: the same commands exist on `/api/command`.
- [resolved] What does the simulator recognise as a "new order"? → assumption: the first
  `OrderMessage` for an orderId with state `UNACK`. Today the OMS has no separate "send to market"
  step; UNACK is published as soon as the order is accepted.
- [resolved] Should the simulator be a new module or part of oms-streaming-service? → assumption: a
  new, independently deployable module `oms-exchange-simulator`. It plays an external party and must
  be easy to switch off or replace with a real venue (microservices principle).
- [resolved] How should fill prices be modelled? → assumption: fill at the static reference price
  (price improvement for marketable limits). No order book, no randomness, so tests are
  deterministic.
- [resolved] Should the cancel request be a separate pending state? → assumption: it is modelled with
  the existing `cancelState` = PCXL and the order `state` stays LIVE, as FIX OrdStatus=6
  (PendingCancel) does alongside the order's other status. No new `State` values.
- [resolved] Fills that race with a cancel request (`order-lifecycle.md` §9.2)? → assumption: the
  simulator processes each order's events serially, so a cancel request arriving mid-way through
  slicing cancels only the remaining leavesQty. The OMS accepts fills while PCXL.
- [resolved] Registering the new module with the spec tooling → assumption: a human adds
  `oms-exchange-simulator` to `specs/config.json` → `modules` (with `verify: ["./gradlew check"]`)
  after approving this proposal. Agents do not edit the gate config. Until then, `spec verify` does
  not run the simulator's tests automatically, and the verification stage runs them explicitly.
- [deferred] Order replace (35=G), bust/whack, and expiry → separate tickets; nothing here forecloses
  them, and `PMOD` and `EXP` stay unused.
