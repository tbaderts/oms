# Architecture Concepts

The cross-cutting architecture ideas the code follows: event sourcing and the state store, projections, event streaming and the target architecture.

Part of [Architecture](../index.md). Back to the [knowledge base index](../../index.md).

## Documents

- [Trade Blotter Backend Component Specification](event-streaming.md) — Backend component that streams orders, executions and quotes in real time to the Trade Blotter UI.
- [Projections](projections.md) — Read models computed from each order change inside the command transaction, published through the outbox and rebuildable from the event log.
- [State Store](state-store.md) — How oms-core stores order state: the orders and executions tables, the append-only order_events log with snapshots, the command log, the transactional outbox and the projections, all written in one transaction.
- [OMS Target Architecture](target-architecture.md) — Event sourcing and CQRS in the OMS as it will be once the planned changes (SPEC-0021 to SPEC-0030 and the November review) are in: principles, storage, command processing, publication, reads, scaling. A plan, not a description of today.
