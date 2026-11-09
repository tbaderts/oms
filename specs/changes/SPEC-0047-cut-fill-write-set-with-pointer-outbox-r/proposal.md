# Proposal — SPEC-0047: Cut fill write set with pointer outbox rows

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

A fill is the hottest write in the OMS, and it writes the order three times (review
`oms-core/docs/event-sourcing-cqrs-review-2026-11-07.md`, finding F-3):

- `order_events.order_snapshot` stores the order as a JSON snapshot;
- the ORDER outbox row stores it again in `order_payload`;
- the EXECUTION outbox row stores it a third time, only so the publisher can derive the root order
  id for the Kafka key.

Every entity draws its id with `allocationSize = 1`, so one fill makes about six `nextval` round
trips before any insert (finding F-4). JDBC batching is off. Target architecture sections 4.2 and
6.1 make ORDER and EXECUTION outbox rows **pointers** to the event, so the snapshot is written once
and read at publish time, off the request path.

Doing nothing keeps the fill's write volume and round trips at roughly three times what they need to
be. These are the first ceilings that several instances (SPEC-0048) and partitioning (SPEC-0052)
run into.

Two tickets this one waited for are now done:
- **SPEC-0024** gives the replay harness and the load suite. The load suite has a recorded baseline,
  `oms-core/docs/load-baseline-2026-11-08.md`.
- **SPEC-0048** makes oms-core safe to run as several instances. It provides:
  - one relay leader, by advisory lock;
  - a claim that waits for rows another relay holds;
  - two-instance test support (`SecondInstance`, `TwoInstanceIntegrationTest`).

  The relay changes here must keep SPEC-0048's handover rules.

## What Changes

- **ORDER outbox rows become pointers.** They hold `aggregate_id` (the root order id),
  `aggregate_version` and a new `order_id`, but no `order_payload`. At publish time `MessagePublisher`
  reads `order_events.order_snapshot` by the unique `(order_id, version)` and builds the same
  `OrderMessage` as today.
- **EXECUTION outbox rows become pointers.** They hold `order_id`, `exec_id` and `aggregate_version`,
  but no order or execution payload. The publisher reads the execution by `(order_id, execid)` and
  the order snapshot by `(order_id, version)`, then builds the same `Execution` record as today. The
  root order id comes from `executions.root_order_id`, which SPEC-0044 added.
- **PROJECTION rows are unchanged.** They stay self-contained, carrying the Avro payload.
- **Legacy rows still publish.** Rows staged before the upgrade carry payloads; the publisher still
  publishes them as today.
- **Pooled sequences.** `order_seq`, `execution_seq`, `order_event_seq` and
  `order_execution_projection_seq` move to `allocationSize = 50` with the pooled-lo optimizer, and
  their database increments change to match in a new changeset. `outbox_seq` stays at 1.
- **JDBC batching** is enabled: `hibernate.jdbc.batch_size`, `order_inserts`, `order_updates`.
- **Relay ordering.** Rows of each aggregate are claimed and published in `aggregate_version` order,
  then `id`. With pooled ids, ids alone may no longer follow commit order. The claim keeps
  SPEC-0048's rule: it waits for rows another relay holds and never skips them.
- **Proof.**
  - Per-key publication order with two instances is tested automatically (AC-8).
  - Fill latency and write volume are compared against the SPEC-0024 baseline with the load suite
    (AC-9).

## Scope

### In scope

- The outbox pointer columns and the publisher's read-back, with a changeset adding
  `outbox.order_id` and `outbox.exec_id`.
- Sequence pooling with its changeset, JDBC batching configuration, and the relay's claim order.
- Tests for each, and the knowledge-base pages for the outbox and the event publication capability.

### Out of scope

- Multi-instance relay safety itself (leadership, handover). SPEC-0048 delivered it; this ticket
  only has to keep it working.
- Relay slices (several relay leaders), designed in SPEC-0048 but not built.
- Partitioning `order_events` (SPEC-0052).
- Changing what is published. Every topic's record content and key stay the same.
- Pooling `outbox_seq` and `command_log_seq`.

## Acceptance Criteria

- **AC-1** — Given a LIVE order, when a fill is applied, then:
  - its ORDER and EXECUTION outbox rows have null `order_payload` and `execution_payload`, and
    carry `order_id`, `aggregate_version` and, for EXECUTION, `exec_id`;
  - the order JSON snapshot is written exactly once for the change, in `order_events`.
- **AC-2** — Given those pointer rows, when the relay publishes them, then the `OrderMessage` on
  `oms_orders` and the `Execution` on `oms_executions` are equal, field by field, to the records the
  pre-change code publishes for the same fill, with the same key and `eventId`/`orderVersion`.
- **AC-3** — Given ORDER and EXECUTION outbox rows staged with payloads before the upgrade, when the
  relay publishes them after it, then they publish exactly as before.
- **AC-4** — Given a pointer row whose event or execution cannot be read, when the relay
  publishes, then the row fails with an error naming the order and version, its aggregate is held,
  and nothing is published for it.
- **AC-5** — Given an aggregate whose rows were staged with ids out of version order (as pooled ids
  allow), when the relay drains, then they are published in `aggregate_version` order.
- **AC-6** — Given the entities `Order`, `Execution`, `OrderEvent` and `OrderExecutionProjectionRow`,
  when 60 rows of each are inserted, then at most 2 `nextval` calls per sequence are made (Hibernate
  statistics), and every id is unique.
- **AC-7** — Given one fill applied through the pipeline, when its SQL statements are counted
  (Hibernate statistics), then:
  - the number of JDBC statements is at most the baseline count minus the sequence round trips;
  - the bytes written to `outbox` for it fall by at least the size of two order snapshots.

  Both baselines are measured on `main` before the change and recorded in verification.md.
- **AC-8** — Given two application contexts on one database and broker, both consuming
  `commands`, when 50 fills for one order and 50 fills spread over 10 orders are sent, and pooled
  ids interleave between the instances, then:
  - every record of each order on `oms_orders`, `oms_executions` and `oms_order_executions` is
    published once, in event-version order;
  - the records are field-for-field equal to what the payload rows would have published (AC-2);
  - no fill reaches `commands.DLT`.
- **AC-9** — Given the SPEC-0024 load suite at the baseline's shape (500 orders, concurrency 8,
  1 fill slice) on the same host, when it runs against the code before this change and after it,
  then:
  - for each side, one warm-up run is discarded, three runs are taken, and their median is compared;
  - the database write volume per order (WAL bytes between start and end of the run, divided by the
    order count) is lower after the change;
  - the median p95 of `oms_order_oms_processing_time` is lower after the change;
  - throughput is not lower than the before-side spread allows;
  - all six medians and the raw reports are recorded in verification.md.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-core, oms-knowledge-base (set on the ticket) |
| Contracts (OpenAPI / Avro) | None. Published records are unchanged |
| Data (tables, migrations) | New changeset. It adds `outbox.order_id` and `outbox.exec_id` with an index, and alters the four sequences' `INCREMENT BY` to 50. No data is lost; old outbox rows keep their payload columns |
| Events / Kafka topics | Same topics, keys and records. Publication now reads `order_events` and `executions`, one indexed read per row |
| Consumers (oms-ui, oms-mcp-server, downstream) | None. Ids become non-contiguous, with gaps of up to 49, which no consumer relies on |
| Knowledge base | `domain/outbox-message.md`, `capabilities/event-publication.md`, `architecture/event-sourcing.md` |

## Open Questions

- [resolved] **How to prove the result "with the SPEC-0024 harness"**, which did not exist when this
  was drafted → option (a), decided by Toni Badertscher on 2026-11-08 once SPEC-0024 was done. The
  load suite proves it (AC-9), and AC-6 and AC-7 stay as the in-repo checks.
- [resolved] **Where the several-instance ordering check lives** → in this ticket (AC-8). SPEC-0048
  is done, and its two-instance test support makes the check automatable here, as the goal asks.
- [resolved] **How the load comparison stays fair** → assumption, following the baseline document's
  own guidance:
  - same shape and host;
  - one warm-up run discarded;
  - the median of three runs per side.

  The "before" side is the code just before this change, not the recorded baseline. That baseline
  was measured on an uncommitted tree, and runs on another day are not comparable.
- [resolved] **How write volume is measured** → assumption: WAL bytes generated during the run,
  from `pg_current_wal_lsn()` before and after it. The load suite does not record write volume
  today, so this ticket adds it to the load report.
- [deferred] **Latency might not visibly improve at the baseline's load.** The baseline's OMS
  processing p95 moved by a factor of about 5 between two runs, and the command path was not the
  bottleneck. AC-9 still requires a lower median p95. If it is not lower, the ticket fails
  verification honestly; it does not lower the bar. The proposal approval is where to change this.
- [resolved] Should `outbox_seq` be pooled too? → assumption: no. The review says to keep it at 1;
  version ordering in the relay is the safety net either way.
- [resolved] Does the publisher read through JPA or plain SQL? → design decision. It reads by unique
  key, off the request path, inside the relay's existing per-row handling.
