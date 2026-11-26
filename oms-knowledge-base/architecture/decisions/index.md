# Architecture Decision Records

Decisions that shape the system, one per document (ADR-nnn): context, decision, consequences.

Part of [Architecture](../index.md). Back to the [knowledge base index](../../index.md).

## Documents

- [ADR-001 Decision: One Contracts Module](ADR-001-contracts-module.md) — All OpenAPI and Avro contracts live in oms-contracts and nowhere else.
- [ADR-002 Decision: Event Sourcing with Snapshots](ADR-002-event-sourcing.md) — Orders keep current state in a table and every change as an event carrying a full snapshot.
- [ADR-003 Decision: Shared-table CQRS](ADR-003-shared-table-cqrs.md) — Commands and queries have separate APIs and models but read and write the same tables.
- [ADR-004 Decision: Task Pipelines and a State Machine](ADR-004-task-pipeline-and-state-machine.md) — Every command runs as an ordered task pipeline, and state changes are validated by one state machine.
- [ADR-005 Decision: Transactional Outbox](ADR-005-transactional-outbox.md) — Kafka messages are staged in the database with the change and published by a relay.
- [ADR-006 Decision: Compose and a Lightweight Local Kubernetes Coexist; No Local Cozystack](ADR-006-local-kubernetes-platform.md) — Compose stays the everyday stack; a k3d cluster with the upstream operators is used, one at a time, for scaling tests.
