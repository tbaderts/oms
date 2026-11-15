# Non-functional Requirements

One quality requirement per document (NFR-nnn), with its metric, target, implementation status and capability.

Part of [the parent section](../index.md). Back to the [knowledge base index](../../index.md).

## Documents

- [NFR-001 Idempotent command handling](NFR-001-idempotent-command-handling.md) — A command delivered more than once has exactly one effect. *(implemented)*
- [NFR-002 Optimistic concurrency on orders](NFR-002-optimistic-concurrency.md) — Concurrent commands on the same order never overwrite each other; the loser fails with a conflict. *(implemented)*
- [NFR-003 Complete audit trail of order changes](NFR-003-auditability.md) — Every order state change is recorded in the event log in the same transaction as the change. *(implemented)*
- [NFR-004 Reliable, ordered event publication](NFR-004-reliable-publication.md) — Every committed order change reaches Kafka at least once and in order per order. *(implemented)*
- [NFR-005 No silently dropped commands](NFR-005-dead-letter-failed-commands.md) — A command from Kafka that keeps failing is retried and then parked on a dead-letter topic, never dropped. *(implemented)*
- [NFR-006 Order latency is measured](NFR-006-order-latency-measurement.md) — Time to acknowledge, OMS processing time and market round trip are measured for every order. *(partial)*
- [NFR-007 Observable command processing](NFR-007-observability.md) — Command processing exposes metrics and traces, and logs are structured. *(partial)*
- [NFR-008 Orders can be rebuilt from their events](NFR-008-replayability.md) — Replaying the event log reproduces every order exactly. *(implemented)*
- [NFR-009 Knowledge retrieval quality](NFR-009-knowledge-retrieval-quality.md) — Knowledge base search returns the right document among the top results for the evaluation queries. *(implemented)*
- [NFR-010 Backward-compatible contracts](NFR-010-contract-compatibility.md) — Avro schemas and OpenAPI contracts change only in backward-compatible ways unless a breaking change is versioned and announced. *(partial)*
- [NFR-011 Run several oms-core instances safely](NFR-011-several-instances.md) — oms-core can run as several instances against one database without losing ordering, duplicating scheduled work or applying a command twice. *(implemented)*
