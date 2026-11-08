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
be. Those are the first ceilings SPEC-0048 (several instances) and SPEC-0052 (partitioning) build
on, and both depend on this ticket.

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
  then `id`. With pooled ids, ids alone may no longer follow commit order.
- **Proof** of lower fill latency and write volume, and of unchanged per-key publication order:
  see Open Questions.

## Scope

### In scope

- The outbox pointer columns and the publisher's read-back, with a changeset adding
  `outbox.order_id` and `outbox.exec_id`.
- Sequence pooling with its changeset, JDBC batching configuration, and the relay's claim order.
- Tests for each, and the knowledge-base pages for the outbox and the event publication capability.

### Out of scope

- Multi-instance relay safety (advisory lock or partitioned relays). That is SPEC-0048, which
  depends on this ticket.
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
- **AC-8** — Given the SPEC-0024 load suite, when it runs against `main` and against this change,
  then fill p95 latency and write volume improve, and the per-key publication order is unchanged
  with several instances. **Depends on the open question.**

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

- [open] **The goal requires proof "with the SPEC-0024 harness". SPEC-0024 is still at proposal,
  and nothing of it is built.** Which should this ticket do?
  - (a) Wait for SPEC-0024 and prove AC-8 with its load suite, as the goal says.
  - (b) Replace AC-8 with in-repo measurements: AC-6 and AC-7 (statement and round-trip counts, and
    outbox bytes, against a recorded baseline), plus an ordering test. This proves the write-set
    reduction, not latency under load, and leaves the load comparison as a follow-up for SPEC-0024.
  - (c) Do (b) now and keep AC-8 as a separate later check once SPEC-0024 exists.
- [open] **"Per-key publication order is unchanged with several instances"** cannot be shown
  end to end yet. The relay is documented as single-instance until SPEC-0048 adds an advisory lock,
  and SPEC-0048 depends on this ticket. Is AC-5 (version-ordered draining when pooled ids interleave,
  in one instance) enough here, with the several-instance check moved to SPEC-0048?
- [resolved] Should `outbox_seq` be pooled too? → assumption: no. The review says to keep it at 1;
  version ordering in the relay is the safety net either way.
- [resolved] Does the publisher read through JPA or plain SQL? → design decision. It reads by unique
  key, off the request path, inside the relay's existing per-row handling.
