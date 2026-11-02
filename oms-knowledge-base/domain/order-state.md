---
type: Domain Concept
title: "Order State"
description: "The order states and cancel states, what each means, and the transitions the state machine and lifecycle actions allow as built."
tags: [state-machine, order-lifecycle, cancel-state]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-contracts/src/main/avro/State.avsc"
  - resource: "repo:oms-contracts/src/main/avro/CancelState.avsc"
  - resource: "repo:oms-core/src/main/java/org/example/common/state/OrderStateMachineConfig.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/LifecycleAction.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/ValidateLifecycleActionTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/execution/tasks/DetermineOrderStateTask.java"
  - resource: "repo:oms-core/src/test/java/org/example/common/state/StateMachineTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessorTest.java"
---
# Order State

An order has two state dimensions: `state` (where the order is in its life) and `cancelState`
(where a cancel request stands). Both are Avro enums in `oms-contracts`.

## States

| State | Meaning |
|---|---|
| NEW | Initial state before the OMS has taken responsibility |
| UNACK | Accepted by the OMS, not yet acknowledged by the market |
| LIVE | Acknowledged by the market and working |
| FILLED | Fully executed (`leavesQty` = 0) |
| CXL | Open quantity cancelled |
| REJ | Refused by the market |
| CLOSED | Terminal: nothing more happens to the order (administrative close, or end of day for a finished order) |
| EXP | Expired: the time in force ran out; closed at end of day |

## Cancel states

| Cancel state | Meaning |
|---|---|
| PCXL | A cancel request is pending at the market |
| CXL | The market confirmed the cancel |
| REJ | The market refused the cancel request; the order stays LIVE |
| PMOD | Pending modification; reserved for replace, which is not built |

## Transitions as built

The product configuration (`OrderStateMachineConfig.product()`, SPEC-0029). Every processor obtains it through `OrderStateMachines.forOrder(order)`, where a configuration per leg will be chosen once order trees exist:

```mermaid
stateDiagram-v2
  [*] --> NEW
  NEW --> UNACK: OrderCreateCmd
  UNACK --> LIVE: OrderAcceptCmd
  UNACK --> REJ: OrderRejectCmd
  LIVE --> FILLED: ExecutionCreateCmd (leavesQty = 0)
  LIVE --> CXL: OrderCancelCmd
  LIVE --> REJ: OrderRejectCmd
  UNACK --> EXP: OrderExpireCmd
  LIVE --> EXP: OrderExpireCmd
  LIVE --> CLOSED: OrderCloseCmd
  FILLED --> CLOSED: OrderCloseCmd (end of day)
  CXL --> CLOSED: OrderCloseCmd (end of day)
  REJ --> CLOSED: OrderCloseCmd (end of day)
  EXP --> CLOSED: OrderCloseCmd (end of day)
  CLOSED --> [*]
```

- A partial fill keeps the order LIVE (no transition is asked of the state machine).
- Lifecycle actions (`LifecycleAction`): **REJECT** → REJ and closes the open quantity, stores the
  reason; **CANCEL** → CXL with cancelState CXL and closes the open quantity; **CANCEL_REQUEST**
  sets cancelState PCXL on a LIVE order with open quantity and no pending cancel, state unchanged;
  **CANCEL_REJECT** sets cancelState REJ when a cancel is pending, state unchanged; **EXPIRE** → EXP
  and closes the open quantity; **CLOSE** → CLOSED and closes any open quantity.
- EXP and CLOSED are reached through `OrderExpireCmd`/`OrderCloseCmd` and the scheduled GTD expiry
  and end of day ([Order Expiry and Close](../capabilities/order-expiry-and-close.md)).
- CLOSED is the only terminal state. The former `simplified()` and `extended()` configurations are
  removed.

## Differences from the Order Lifecycle specification

[Order Lifecycle Management](../oms-concepts/order-lifecycle.md) is marked stable but describes
transitions the code does not have:

| Specification | As built |
|---|---|
| §4.2 NEW → REJ when validation fails | Invalid orders are not stored; the command fails (400) |
| §4.3 NEW → CXL, cancel before send | No such transition; cancel requests need a LIVE order |
| §4.6 UNACK → FILLED, immediate fill | No such transition; fills need a LIVE order |
| §9.3 duplicate acks ignored | Refused as an invalid transition (no change, but a failure response) |
| §9.4 fill without acknowledgment is processed | Refused until the order is LIVE |
| §4.10 LIVE → EXP when the venue sends ExecType=C after a cancel request | The OMS expires the order itself (GTD expiry, end of day); a venue's ExecType=C arrives as `OrderExpireCmd` |
| §4.11 LIVE → CLOSED, administrative close | As specified; also FILLED/CXL/REJ/EXP → CLOSED at end of day |

## Related

- [Order Lifecycle Management Specification](../oms-concepts/order-lifecycle.md) (full specification)
- [State Machine Framework](../oms-framework/state-machine-framework_spec.md)
- [Order](order.md), [Glossary](glossary.md)
