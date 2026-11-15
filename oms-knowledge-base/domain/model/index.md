# Domain Model

Aggregates, entities and value sets of the OMS (order, execution, event log, outbox, states, quantities) and the glossary.

Part of [Domain](../index.md). Back to the [knowledge base index](../../index.md).

## Documents

- [Command Log](command-log.md) — Every command the OMS receives, from REST, Kafka or its own scheduler, and what became of it: applied, refused or failed.
- [Domain Model Organization and OMS Core Libraries](domain-model.md) — Core domain entities and libraries that asset-class models extend, with field-level definitions and FIX mappings.
- [Execution](execution.md) — A fill reported by a venue against an order, persisted in the executions table, identified by (orderId, execId) and carrying the order's average price as of that fill.
- [Glossary](glossary.md) — Definitions of the OMS domain and technical terms used across the knowledge base.
- [Order Event](order-event.md) — Append-only log entry recording each order state change with a per-order version, the command, the resulting state and a snapshot of the order.
- [Order-Execution Projection](order-execution-projection.md) — One row per applied fill with the order as of that fill: the read model behind GET /api/query/executions and the oms_order_executions topic, written in the fill's transaction and rebuildable from the event log.
- [Order Quantities](order-quantities.md) — How orderQty, cumQty and leavesQty are set and changed by creation, fills, cancels and rejects as built, and which quantity fields are not maintained yet.
- [Order State](order-state.md) — The order states and cancel states, what each means, and the transitions the state machine and lifecycle actions allow as built.
- [Order](order.md) — The order aggregate: identity, instrument, economics, quantities, state and SLA timestamps, persisted in the orders table.
- [Outbox Message](outbox-message.md) — A message staged in the outbox table in the same transaction as a state change, later published to Kafka by the outbox relay.
- [Quote and Quote Request](quote-and-quote-request.md) — Quote requests and quotes as they exist today: Avro schemas and commands only, with no entity, processor or API behind them.
