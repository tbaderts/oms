# Proposal — SPEC-0029: Model order expiry and close in the state machine

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

Finding 12 of the architecture review (`oms-core/docs/architecture-review-2026-10-30.md`, §8 table;
[ticket Goal](./ticket.md)).

`State` has `EXP` and `CLOSED`, and the Avro `State` and the UI show them, but no order can reach
them:

- **There are three state machine configurations in `OrderStateMachineConfig`** — standard,
  simplified and extended. Only `standard` is used, by four call sites that each create their own
  copy.
  - Standard has no transition into `EXP`.
  - It has `FILLED/CXL/REJ → CLOSED`, but nothing drives them.
- **The knowledge base and the code disagree on what CLOSED means.**
  - The order-lifecycle spec (`oms-concepts/order-lifecycle.md` §4.10–4.11) defines `LIVE → EXP`
    when the time in force runs out, and `LIVE → CLOSED` as an administrative close.
  - The code's configurations instead close orders that are already finished.
- **Nothing drives expiry or end of day.**
  - A DAY order stays LIVE forever after the session ends.
  - A GTD order ignores its `expireTime`.
  - Nothing closes a finished day.

For an OMS this means open orders that are no longer working, quantities that look live, and no
point at which a trading day is finished.

## What Changes

- **One product state machine.**
  - `OrderStateMachineConfig` keeps a single product configuration: today's standard one plus the
    expiry and close transitions below.
  - The unused simplified and extended configurations are removed.
  - The processors obtain their state machine from one provider, `OrderStateMachines.forOrder(order)`.
    Today it returns the product configuration for every order; once order trees exist, it can
    return one per leg.
- **Transitions added:**
  - `LIVE → EXP` and `UNACK → EXP`: expiry.
  - `LIVE → CLOSED`: administrative close.
  - `EXP → CLOSED`: end of day. The existing `FILLED/CXL/REJ → CLOSED` are used for the same
    purpose.
  - `CLOSED` becomes the only terminal state.
- **Expire command** — `OrderExpireCmd` (FIX ExecutionReport ExecType=C, Expired).
  - Sent by the venue or by the OMS's own expiry step, over REST and Kafka like the other lifecycle
    commands.
  - It moves a LIVE or UNACK order to `EXP` with `leavesQty = 0`, keeping `cumQty`, and records an
    `EXP` event.
- **Close command** — `OrderCloseCmd` (administrative, operator).
  - It closes a LIVE order (`leavesQty = 0`, reason recorded) or a finished one (FILLED, CXL, REJ,
    EXP).
- **Scheduled steps in oms-core:**
  - **GTD expiry:** every minute, a LIVE or UNACK order with `timeInForce = GOOD_TILL_DATE` whose
    `expireTime` has passed is expired.
  - **End of day:** at a configured time and time zone, LIVE and UNACK `DAY` orders are expired.
    Then every finished order (FILLED, CXL, REJ, EXP) whose last change was before the end of day
    is closed.

  Each step issues the same commands through the same pipeline, so every change is an event with
  an outbox message, as for any other command.
- **Exchange simulator:** an order the OMS publishes in a final state (EXP, CLOSED, CXL, REJ,
  FILLED) is done; the simulator stops filling it.
- **Contracts (additive):**
  - OpenAPI: `OrderExpireCmd` and `OrderCloseCmd` in the `Command` discriminator, command API
    3.2.0.
  - Avro: `OrderExpireCmd` and `OrderCloseCmd` records with the `CommandHeader` (SPEC-0025), each
    under its own subject.
- **Docs:** the order lifecycle concept, the order-expiry and order-close capabilities, and the
  command API pages.

## Scope

### In scope

The product configuration and its provider, the two lifecycle actions and commands (REST, Kafka,
contracts), the two scheduled steps, the simulator's handling of final states, and the knowledge
base.

### Out of scope

- A trading calendar (holidays, half days): end of day runs every day at the configured time.
- Per-venue sessions or closing times; one end of day for the whole OMS.
- The venue expiring orders itself. The simulator does not send ExecType=C; the OMS's steps drive
  expiry, and `OrderExpireCmd` is the entry point a real venue would use.
- IOC/FOK: the venue cancels their remainder today (`OrderCancelCmd`); unchanged.
- Busts and corrections after close (`ExecutionBustCmd`/`WhackCmd` stay unhandled).
- Per-leg configurations themselves; only the provider that makes them possible.

## Acceptance Criteria

- **AC-1** — Given the product state machine, when its transitions are listed, then they are
  exactly:
  - NEW→UNACK;
  - UNACK→LIVE, REJ, EXP;
  - LIVE→FILLED, CXL, REJ, EXP, CLOSED;
  - FILLED, CXL, REJ, EXP→CLOSED.

  CLOSED is the only terminal state. No other configuration exists, and every processor and task
  obtains its state machine from `OrderStateMachines`.
- **AC-2** — Given a LIVE order with a partial fill, when `OrderExpireCmd` arrives over REST or
  Kafka, then:
  - the order is `EXP` with `leavesQty = 0` and `cumQty` unchanged;
  - an `EXP` event is appended and an `OrderMessage` with state `EXP` is published;
  - a fill for the order is then refused;
  - an expire for a FILLED, CXL, REJ, EXP or CLOSED order is refused (400 over REST, acknowledged
    over Kafka), as are other invalid lifecycle commands;
  - a repeated `commandId` is refused as a duplicate.
- **AC-3** — Given orders in each state, when `OrderCloseCmd` arrives for each, then:
  - a LIVE order becomes `CLOSED` with `leavesQty = 0` and the reason recorded;
  - a FILLED, CXL, REJ or EXP order becomes `CLOSED` with its quantities unchanged;
  - a NEW, UNACK or CLOSED order is refused.

  Each close appends a `CLOSE` event and publishes the order.
- **AC-4** — Given LIVE and UNACK orders with time in force GTD (`expireTime` past and future),
  DAY and GTC, when the expiry step runs, then only the GTD orders whose `expireTime` has passed
  are expired. When the end-of-day step runs, the LIVE and UNACK DAY orders are expired too. GTC
  orders and orders already final are untouched. Running a step again changes nothing more.
- **AC-5** — Given, at end of day, finished orders (FILLED, CXL, REJ, EXP) last changed before the
  end-of-day time and one changed after it, when the end-of-day step runs, then exactly the earlier
  ones become `CLOSED`, each with a `CLOSE` event and a published message. The end-of-day time and
  zone come from configuration (`oms.end-of-day.time`, `oms.end-of-day.zone`).
- **AC-6** — Given the exchange simulator with a resting order, when the OMS publishes the order as
  `EXP` (or any final state), then the simulator sends no further fill or answer for it.
- **AC-7** — Given the command API and the Avro contracts, when they are built, then:
  - `OrderExpireCmd` and `OrderCloseCmd` exist (OpenAPI discriminator, command API 3.2.0; Avro
    records with `header` first);
  - `registerSchemas` covers their subjects;
  - every earlier command and record is unchanged, compatible with its baseline.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-contracts, oms-core, oms-exchange-simulator, oms-knowledge-base |
| Contracts (OpenAPI / Avro) | Additive: two command schemas and two Avro records with new subjects; command API 3.2.0. No existing field changes |
| Data (tables, migrations) | None expected (states and events are stored as text); the design confirms and adds an index for the steps' queries if needed |
| Events / Kafka topics | New event types `EXP` and `CLOSE` in `order_events`; `OrderMessage.state` now takes `EXP` and `CLOSED` (already in the Avro enum). `commands` gains two record types |
| Consumers (oms-ui, oms-mcp-server, downstream) | Streaming and UI already know `EXP`/`CLOSED` (badges exist). Downstream consumers see orders reach them for the first time; CLOSED orders stop being "working" in any view |
| Knowledge base | `oms-concepts/order-lifecycle.md` (product configuration, CLOSED semantics, end of day), new or updated capabilities for expiry and close, `interfaces/command-api.md`, `interfaces/avro-messages.md`, `capabilities/exchange-simulation.md` |

## Open Questions

- [resolved] What does CLOSED mean? → assumption: **both**.
  - An administrative close of a LIVE order (the spec).
  - End of day closing every finished order (the code's transitions).

  CLOSED is "nothing more will happen to this order", the only terminal state. **Please
  confirm at approval.**
- [resolved] Who expires DAY and GTD orders, the venue or the OMS? → assumption: **the OMS's
  scheduled steps**. The simulator is the only venue and does not expire orders. A real venue's
  ExecType=C arrives as `OrderExpireCmd` and has the same effect; an expiry the OMS already applied
  is refused as invalid for an EXP order. The OMS does not send a cancel to the venue first; the
  simulator stops on the published final state (AC-6). **Please confirm at approval.**
- [resolved] Expire UNACK orders too? → **yes**: an order never acknowledged by the end of its day
  is as dead as a live one.
- [resolved] End-of-day default → `17:00`, zone `America/New_York` (after the US close), both
  configurable. GTD expiry runs every minute.
- [resolved] A pending cancel request at expiry or close → the order's `cancelState` stays as it
  was; the order is final either way. The design records it.
- [deferred] A trading calendar → out of scope; safe to defer while end of day runs daily.
