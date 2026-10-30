# Domain

The business objects and value sets of the OMS as built, and the glossary.

Back to the [knowledge base index](../index.md).

- [Execution](execution.md) — A fill reported by a venue against an order, persisted in the executions table and unique per order and execID.
- [Glossary](glossary.md) — Definitions of the OMS domain and technical terms used across the knowledge base.
- [Order](order.md) — The order aggregate: identity, instrument, economics, quantities, state and SLA timestamps, persisted in the orders table.
- [Order Event](order-event.md) — Append-only log entry recording each order state change with a per-order version, the command, the resulting state and a snapshot of the order.
- [Order Quantities](order-quantities.md) — How orderQty, cumQty and leavesQty are set and changed by creation, fills, cancels and rejects as built, and which quantity fields are not maintained yet.
- [Order State](order-state.md) — The order states and cancel states, what each means, and the transitions the state machine and lifecycle actions allow as built.
- [Outbox Message](outbox-message.md) — A message staged in the outbox table in the same transaction as a state change, later published to Kafka by the outbox relay.
- [Quote and Quote Request](quote-and-quote-request.md) — Quote requests and quotes as they exist today: Avro schemas and commands only, with no entity, processor or API behind them.
