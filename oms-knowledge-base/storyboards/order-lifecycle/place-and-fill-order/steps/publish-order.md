---
id: publish-order
title: OMS publishes the order to the venue
kind: system
from: oms-core
to: exchange
illustrations:
  - src: publish-order.excalidraw.svg
    caption: The outbox relay publishes the OrderMessage on oms_orders, where the simulator reads it
links:
  events: [OrderMessage]
  requirements: [FR-023, FR-024]
in:
  - name: Order
    origin: { kind: step, ref: submit-order }
out:
  - name: Order message
    shape: "OrderMessage on topic oms_orders { orderId, symbol, side, orderQty, price, state }"
extensions:
  - id: publish-retried
    when: Kafka is not reachable when the relay tries to publish
    then: The message stays in the outbox and is retried, still in commit order, until Kafka is back.
    continueAt: { kind: stay }
    illustrations:
      - src: publish-order-publish-retried.excalidraw.svg
        caption: Nothing is lost while Kafka is down; the outbox keeps the message
---

## What happens

The OMS never sends to the venue directly. When it stored the order, it also stored an order message
in its outbox, in the same transaction. The outbox relay picks that message up and publishes it on
the `oms_orders` topic, where the exchange simulator is listening.

## Business rules

- Messages leave the OMS in the order they were committed.
- A failed publication is retried; an order can never be stored without its message eventually
  being published.

## Notes

- The streaming service also reads `oms_orders`, so the new ACME order already shows on the blotter
  as UNACK.
