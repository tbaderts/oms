---
aliases: [oms-framework/oms-state-store]
type: Architecture
title: "State Store"
description: "How oms-core stores order state: the orders and executions tables, the append-only order_events log with snapshots, the command log, the transactional outbox and the projections, all written in one transaction."
tags: [state-store, event-sourcing, persistence, outbox, cqrs]
status: draft
updated: "2026-11-17T12:00:00Z"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-14T12:00:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderReplayService.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OutboxRelay.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/commandlog/CommandLogWriter.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/projection/Projection.java"
  - resource: "repo:oms-core/src/main/resources/db/changelog/db.changelog-master.yaml"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/OrderEventAppenderTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/OrderReplayServiceTest.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/model/OrderEventSchemaVersion.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/replay/StoredEventDecoder.java"
---
# State Store

oms-core keeps its state in one PostgreSQL database, managed by Liquibase (`ddl-auto: validate`).
Every command that changes an order writes **all** of the following in **one** transaction, so they
can never disagree:

| Store | Table | What it holds | Detail |
|---|---|---|---|
| Current state | `orders` | The order as it is now, versioned with `txNr` (optimistic locking) | [Order](../../domain/model/order.md) |
| Fills | `executions` | One row per fill, unique on `(orderId, execId)`, with the order's `avgPx` and version as of that fill | [Execution](../../domain/model/execution.md) |
| Event log | `order_events` | One row per change: per-order `version`, the command, resulting state, a full order snapshot, metadata and a field diff | [Order Event](../../domain/model/order-event.md) |
| Command log | `command_log` | Every command received and its outcome (applied, refused, failed) | [Command Log](../../domain/model/command-log.md) |
| Outbox | `outbox` | What must be published to Kafka, drained after commit | [Outbox Message](../../domain/model/outbox-message.md) |
| Projections | e.g. `order_execution_projection` | Read models computed from the change, rebuildable from the log | [Projections](projections.md) |

## How a change is written

1. A command processor loads the order (row-locked for lifecycle commands) and runs its task
   pipeline ([Task Orchestrator](../../framework/task-orchestrator.md),
   [State Machine](../../framework/state-machine.md)).
2. `OrderEventAppender` is the only writer of `order_events`. It takes the next version from the
   order (`txNr + 1`), writes the event with the snapshot, and stages the outbox rows and projection
   rows in the caller's transaction.
3. The transaction commits. A unique-constraint violation on `(order_id, version)` means another
   writer won the race; the command is retried or refused, never applied twice.
4. `OutboxRelay` publishes the staged messages to Kafka after commit, in commit order per order
   ([ADR-005](../decisions/ADR-005-transactional-outbox.md),
   [Event Publication](../../capabilities/event-publication.md)).

## Reading it back

- **Queries** read `orders`, `executions`, `order_events`, `command_log` and the projection
  tables directly. There is no separate read store
  ([ADR-003](../decisions/ADR-003-shared-table-cqrs.md), [Query Engine](../../framework/query-engine.md)).
- **Replay** is a lookup, not a fold: `OrderReplayService` returns the snapshot of any version and
  checks the log for gaps ([ADR-002](../decisions/ADR-002-event-sourcing.md),
  [Event Sourcing and Replay](../../capabilities/event-sourcing-and-replay.md)).
- **Order trees** use `rootOrderId` and `parentOrderId` on `orders`
  (`OrderRepository.findByRootOrderId`, `findByParentOrderId`). Every order is its own root today;
  parent and child orders are planned ([Order Grouping](../../domain/concepts/order-grouping.md)).

## Event schema versions and upcasting (SPEC-0024)

The `transaction` (command) and `order_snapshot` columns hold JSON of the generated models, and
`Order` ignores unknown properties, so a renamed or removed field would be lost silently when an old
row is read. Every row therefore records the schema version its JSON was written in:

- **Column.** `order_events.schema_version INTEGER NULL` (changelog
  `014-order-events-schema-version.yaml`), mapped as `OrderEvent.schemaVersion`.
- **Writer.** `OrderEventAppender` stamps `OrderEventSchemaVersion.CURRENT` on every event. That
  constant is the only place that knows the current version, which is **1**.
- **Rows without a version** were written before the column existed and are **version 1**. There is
  no backfill.
- **Upcasting.** A row of an older version is brought up to `CURRENT` before it is decoded, by one
  pure JSON transformation per version step (v1→v2, v2→v3, …), applied in order. Each step is
  documented here when it is added, with a golden fixture of the old shape. Version 1 is the only
  version so far, so no steps exist yet.
- **Newer than the build.** A row whose version is newer than `CURRENT` is refused, not decoded.
- **Where the rule lives.** `StoredEventDecoder` (oms-core test scope, `org.example.oms.replay`),
  used by the golden-fixture test and the replay harness
  ([Testing](../../delivery/testing.md#replay-harness-and-golden-event-fixtures)).
- **Production readers do not apply it yet.** Hibernate and `OrderReplayService` decode the JSON
  straight into the models. That is harmless while version 1 is the only version; before the first
  bump, the production read paths must decode through the same rule (for example by moving
  `StoredEventDecoder` to main code).
- **Bumping the version.** (1) Increment `OrderEventSchemaVersion.CURRENT`. (2) Add the upcast step to
  `StoredEventDecoder` and make the production readers use it. (3) Commit a fixture of the old shape
  under `oms-core/src/test/resources/fixtures/order-events/`. (4) Document the step in this section.

## Retention and the archive replica (SPEC-0052)

- **Partitioned log.** `order_events` is partitioned by month on `time_stamp`. Its uniqueness on
  `(order_id, version)` and `(order_id, command_id)` is enforced on `order_event_keys`, which
  triggers keep in step, under the same constraint names. The write path above is unchanged.
- **Retention window.** The database holds open orders and orders closed within the retention
  period. Older closed orders are archived: verified on a logical replica that does not replicate
  deletes, then deleted here. The replica holds the full history.
- See [Retention and Archive](retention-and-archive.md).

## Not built

- A query service on the replica (SPEC-0021, proposal). The replica and its read-only connection
  exist (SPEC-0052).
- Stores for quotes and quote requests: they exist as Avro schemas only
  ([Quotes](../../capabilities/quotes.md)).

The February 2026 design this page replaces is archived as
[State Store Specification (February 2026)](../../archive/state-store-spec-2026-02.md).
