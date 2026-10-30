---
id: submit-order
title: Trader submits a new order
kind: user
from: trader
to: oms-core
illustrations:
  - src: submit-order.excalidraw.svg
    caption: The trader sends BUY 100 ACME at 42.50 to the OMS, which stores it as UNACK
links:
  api: [oms-cmd-api#executeCommand, oms-cmd-api#OrderCreateCmd]
  states: ["NEW -> UNACK"]
  requirements: [FR-001, FR-002, FR-003, FR-004]
in:
  - name: Order ticket
    shape: "{ symbol: ACME, side: BUY, orderQty: 100, ordType: LIMIT, price: 42.50, clOrdId: T-1001 }"
    origin: { kind: external, lane: trader }
out:
  - name: Order
    shape: "{ orderId, clOrdId, symbol, side, orderQty, price, state: UNACK, leavesQty: 100, cumQty: 0 }"
  - name: Order created event
    shape: "order_events { version: 1, state: UNACK }"
    final: true
extensions:
  - id: invalid-order
    when: The order fails validation, for example a quantity or price that is not positive
    then: The command is answered with the validation errors and nothing is stored.
    continueAt: { kind: end }
    illustrations:
      - src: submit-order-invalid-order.excalidraw.svg
        caption: BUY 0 ACME at -1 is refused before anything is stored
    out:
      - name: Validation errors
        shape: "[ { field, message } ]"
        final: true
  - id: duplicate-client-order-id
    when: The client order id was already used, for example when a client resends yesterday's order
    then: The OMS refuses the new order as a duplicate; the first order is not touched.
    continueAt: { kind: end }
    illustrations:
      - src: submit-order-duplicate-client-order-id.excalidraw.svg
        caption: A resent T-1001 is refused as a duplicate
    out:
      - name: Duplicate rejection
        shape: "{ clOrdId, reason: DUPLICATE }"
        final: true
---

## What happens

The trader wants to buy 100 ACME shares at a limit of 42.50. The order ticket goes to the OMS command
API as an `OrderCreateCmd`. The OMS checks it, gives it its own order id, and stores it in state
UNACK: received, but not yet acknowledged by a venue. All 100 shares are still open.

## Business rules

- An order must pass the new-order validation before anything is stored.
- A client order id (`clOrdId`) can be used only once.
- The order and its first event (version 1) are written in one transaction, so there is never half an
  order.

## Notes

- Orders can also arrive as commands on the `commands` Kafka topic; the processing is the same.
- In the cockpit, the API Explorer's "New order" template sends exactly this command.
