---
type: Capability
title: "Order Expiry and Close"
description: "Orders expiring when their time in force runs out, and orders being closed administratively or at end of day."
tags: [expiry, close, end-of-day, order-lifecycle, orders]
status: draft
maturity: "implemented"
commands: ["OrderExpireCmd", "OrderCloseCmd"]
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-02T12:00:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/common/state/OrderStateMachineConfig.java"
  - resource: "repo:oms-core/src/main/java/org/example/common/state/OrderStateMachines.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/LifecycleAction.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/endofday/OrderExpiryService.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/endofday/EndOfDayService.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/endofday/EndOfDayScheduler.java"
---
# Order Expiry and Close

## Summary

An order whose time in force runs out becomes EXP. An order that is finished, or that operations
take out of the market, becomes CLOSED: nothing more happens to it. CLOSED is the only terminal
state of the order state machine (SPEC-0029).

## Actors

- The OMS itself: the scheduled expiry and end-of-day steps.
- A venue: ExecutionReport ExecType=C arrives as `OrderExpireCmd`.
- Operations: an administrative close.

## Behaviour

Both are lifecycle actions, handled by the shared lifecycle pipeline (see
[Order Cancellation](order-cancellation.md)):

| Command | Action | From | To | Open quantity | Event |
|---|---|---|---|---|---|
| `OrderExpireCmd` | `EXPIRE` | LIVE, UNACK | EXP | closed (`leavesQty` 0), `cumQty` kept | `EXP` |
| `OrderCloseCmd` | `CLOSE` | LIVE | CLOSED | closed | `CLOSE` |
| `OrderCloseCmd` | `CLOSE` | FILLED, CXL, REJ, EXP | CLOSED | already 0 | `CLOSE` |

- **Refusals:** any other state is refused by the state machine, like an invalid cancel. Over REST
  that is 400; over Kafka it is acknowledged. A fill for an EXP or CLOSED order is refused.
- **What stays:** the cancel state is left as it was. The reason (`text`) is kept with the event's
  command.

**Scheduled steps** (`EndOfDayScheduler`, `oms.end-of-day.*`):

- **GTD expiry**, every `gtd-poll-interval-ms` (default one minute): LIVE and UNACK orders with
  `timeInForce = GOOD_TILL_DATE` whose `expireTime` has passed are expired.
- **End of day**, daily at `time` in `zone` (default 17:00 America/New_York; no trading calendar):
  1. LIVE and UNACK `DAY` orders are expired, including orders without a time in force (FIX tag 59
     defaults to DAY).
  2. Every finished order (FILLED, CXL, REJ, EXP) whose last event is before end of day is closed,
     together with the orders this run expired. An order changed after the cutoff waits for the
     next end of day.
- `GOOD_TILL_CANCEL` orders are never expired.

Each step issues the commands through the lifecycle pipeline, one transaction per order, so every
change is an event and a published `OrderMessage`. One order's failure (a concurrent command, a
database error) is logged with its id and counted in `oms.end-of-day.failures{step}`; the other
orders continue, and the next run retries it. Applied changes are counted in
`oms.end-of-day.orders{step=expire|close}`. Both steps run on their own thread (`end-of-day-`),
not on Spring's shared scheduler thread, which drains the outbox. The command ids are derived from the order and
the day (`EXP-…`, `EOD-…`), so a repeated run is refused. An order changed concurrently is skipped
and taken by the next run. `oms.end-of-day.enabled=false` turns the scheduler off, as the tests do.

Configuration (`application.yml` or environment):
- `oms.end-of-day.time` (`OMS_END_OF_DAY_TIME`): `H:mm`, for example `"16:30"`. Quote it in YAML:
  unquoted `16:30` is read as a base-60 number, and startup fails with a message naming the
  property.
- `oms.end-of-day.zone` (`OMS_END_OF_DAY_ZONE`): an IANA zone.
- `oms.end-of-day.gtd-poll-interval-ms`, `oms.end-of-day.enabled`.

A pending cancel (`PCXL`) survives expiry and close. A venue's cancel reject is still recorded on
an EXP order, but refused on a CLOSED one.

The [exchange simulator](exchange-simulation.md) stops working an order once the OMS publishes it
in a final state, so an expired order gets no further fills.

## Requirements

- [NFR-001 Idempotent command handling](../non-functional-requirements/NFR-001-idempotent-command-handling.md)
- [NFR-002 Optimistic concurrency on orders](../non-functional-requirements/NFR-002-optimistic-concurrency.md)

## Interfaces and domain

[Command API](../interfaces/command-api.md), [Avro Messages](../interfaces/avro-messages.md),
[Kafka Topics](../interfaces/kafka-topics.md); [Order State](../domain/order-state.md),
[Order](../domain/order.md).

## Detailed specifications

- [Order Lifecycle Management Specification](../oms-concepts/order-lifecycle.md) (§4.10, §4.11)

## Known gaps

- No trading calendar: end of day runs every day, holidays included.
- One end of day for the whole OMS; no per-venue sessions.
- The simulator does not send venue expiries; the OMS's steps drive expiry.
- The OMS expires an order without cancelling it at the venue. With a real venue, a fill that
  crosses the expiry is refused (the order is no longer LIVE): a position risk to settle before
  connecting one.
- A GTD order without `expireTime` never expires (it behaves as GTC); nothing refuses it at
  creation.
- Other session-bound times in force (`AT_THE_OPENING`, `AT_THE_CLOSE`, `GOOD_TILL_CROSSING`) are
  not expired. IOC/FOK remainders are cancelled by the venue.
- A DAY order created in the moment between end of day starting and its query is expired with
  the day.
- The first end of day after deployment closes every finished order ever recorded, one
  transaction each.

## Verification

`OrderStateMachineConfigTest`, `OrderLifecycleCommandProcessorTest`, `CommandListenerTest`,
`OrderExpiryCloseIntegrationTest`, `EndOfDayIntegrationTest`, `EndOfDaySchedulerTest`,
`ExchangeEngineTest`. Conventions: [Testing Patterns](../oms-framework/testing-patterns.md).
