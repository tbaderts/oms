# Architecture Assessments

Dated reviews and measurements of the architecture. Point-in-time records: they cite the code and paths of their day.

Part of [Architecture](../index.md). Back to the [knowledge base index](../../index.md).

## Documents

- [OMS Architecture Convergence Assessment](architecture-convergence-assessment.md) — Whether and how two teams building similar OMS cores on different architectures should converge.
- [OMS Core Architecture Review (2026-10-30)](architecture-review-2026-10-30.md) — Review of oms-core, its contracts, consumers and knowledge base as built on 2026-10-30: assessment against the stated goals, projections, order trees, wire format and a recommended roadmap.
- [OMS Event Sourcing and CQRS Review (2026-11-07)](event-sourcing-cqrs-review-2026-11-07.md) — Review of the write path, event log, outbox, projections and query path as on main at 09bd78e, with findings F-1 to F-n and the decisions taken in discussion.
- [Load Baseline (2026-11-08)](load-baseline-2026-11-08.md) — Measured throughput and latency of the order flow before the projection and order-tree rework, produced by LoadSuiteRunnerTest, and how to compare a new run against it.
