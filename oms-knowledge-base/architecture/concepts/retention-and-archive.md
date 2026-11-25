---
type: Architecture
title: "Retention and Archive"
description: "How oms-core keeps its database to a retention window: order_events partitioned by month, closed orders archived after verifying a logical replica holds them, and emptied partitions dropped. The replica keeps the full history."
tags: [retention, archive, partitioning, replica, state-store, cqrs]
status: draft
updated: "2026-11-17T12:00:00Z"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-17T12:00:00Z" }
sources:
  - resource: "repo:oms-core/src/main/resources/db/changelog/017-partition-order-events.yaml"
  - resource: "repo:oms-core/src/main/java/org/example/oms/archive/RetentionJob.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/archive/ReplicaVerifier.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/archive/PartitionMaintenance.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/archive/ReplicaSchema.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/archive/ArchivePreconditions.java"
  - resource: "repo:docker-compose.yml"
---
# Retention and Archive

Since SPEC-0052, oms-core's database holds a **retention window**, not all history:
- every order that is open, or was closed within `oms.retention.closed-order-days` (default 30 days, the requester's choice for this experimentation stack);
- the full history of every order lives on the **archive replica**, a PostgreSQL logical replica
  that does not replicate deletes.

The OMS serves no history beyond retention: archived orders are gone from search, the event-log
endpoint and the MCP order tools. They remain on the replica, which SPEC-0021's query service is to
read. This OMS is an experimentation stack, so compliance retention (immutable storage, regulatory
periods) is out of scope.

## Partitioned event log

`order_events` is partitioned by range on `time_stamp`, one partition per month (UTC), named
`order_events_pYYYYMM`, plus `order_events_default` (changelog 017).
- **Keys.** PostgreSQL enforces uniqueness on a partitioned table only with the partition key, so
  `(order_id, version)` and `(order_id, command_id)` are enforced on **`order_event_keys`**.
  - Triggers keep it equal to the events' keys: an insert records the key, a delete forgets it, and
    a truncate empties the table.
  - The constraints keep their old names (`uq_order_events_order_id_version`,
    `uq_order_events_order_id_command_id`). A concurrent writer or a duplicate command fails exactly
    as before ([State Store](state-store.md), P-08).
- **The primary key** is `(id, time_stamp)`, because a partitioned table's key must include the
  partition key.
- **Legacy events** with no time stamp got `1970-01-01T00:00Z` as a marker for "unknown" when the
  table was migrated, and sit in the default partition.
- **Maintenance** (`PartitionMaintenance`, on the scheduler leader every hour):
  - keeps the current month and the next `oms.partitions.months-ahead` (2) created;
  - detaches and drops a monthly partition that ended before the retention period and that
    archiving has emptied;
  - never drops a partition that holds a row, nor the default partition;
  - detaches with `lock_timeout = 5s`: DETACH locks `order_events`, so behind a long transaction it
    gives up with a WARN, and the run stops dropping until the next one, so a run holds appends back
    for at most those 5 s.
  - Counter: `oms.retention.partitions_dropped`.
- **The migration copied the table.** On a large database it needs a maintenance window.

## The archive replica

- **Compose service** `postgres-replica` (port 5433, database `oms_replica`).
- **Publication.** The primary publishes `oms_history`: `orders`, `order_events`,
  `order_event_keys`, `executions`, `command_log` and `order_execution_projection`.
  - `publish = 'insert, update'`: **no deletes, no truncates**, so rows archived here stay there.
    Partition DDL is not replicated either.
  - `publish_via_partition_root`: `order_events` arrives as one table. New months land in the
    replica's default partition, and no maintenance runs there.
  - The outbox is not published.
- **Start-up** (`ReplicaSchema`, when `oms.replica.enabled`):
  1. oms-core migrates the replica with the **same Liquibase changelog**, in context `replica`, so
     its schema is the primary's, without the publication. The primary runs context `primary`
     (`spring.liquibase.contexts`).
  2. It creates the subscription once, copying existing history (`copy_data`).
  - A replica that can't be reached is logged and does not stop oms-core; archiving then refuses.
- **Keys the replica must not enforce.** The replica keeps every row ever written, so a key that is
  unique only among the orders the OMS still holds can't hold there. Inserting a row it refuses
  would stop replication for every table, and with it archiving.
  - `uq_orders_session_cl_ord_id` is therefore dropped **on the replica only** (changelog
    `018-replica-relaxed-keys`). A precondition skips it on any database that publishes
    `oms_history`, so a Liquibase run without contexts can't apply it to the primary. Every other natural key there contains the order id, which is never
    reused.
  - **Rewrite rows in place, never delete and re-insert them.** An update replicates by row id; a
    delete does not replicate, so a re-inserted row arrives as a second copy. Projection rebuilds
    therefore upsert in place and delete only the rows they no longer produce
    (`Projection.retainOnly`). A row such a rebuild deletes stays on the replica, and its order fails
    verification (`replica-mismatch`) until it is resolved by hand.
- **Read access.** oms-core reads the replica through a read-only pool (`ReplicaDatabase`). It
  connects as the replica database's owner, because it creates the subscription: read-only is a
  session default there, not a privilege boundary.
- **Settings and secrets.** The replica's credentials and the primary's conninfo
  (`REPLICA_DB_*`, `REPLICA_PRIMARY_CONNINFO`) come from the environment only.

## Archiving

`RetentionJob`, on the scheduler leader every `oms.retention.interval-ms` (10 minutes), takes up to
`oms.retention.batch-size` orders that are:
- `CLOSED`, with a CLOSE event older than the retention period;
- without a pending outbox row.

For each order:
1. **Verify.** For each history table, the order's row count and a checksum of its rows' content
   must be equal on the primary and the replica (`ReplicaVerifier`).
2. **Preconditions.** The rule is that post-trade analytics holds the order's history first. That
   capability is only planned, so the check is pluggable (`AnalyticsHistoryCheck`) and **off**
   (`oms.retention.require-analytics=false`). Turning it on with an implementation needs no
   archiver change.
3. **Delete.** In one transaction, lock the order and re-check that it is still `CLOSED` at the
   version verified. Then delete its rows from every history table. The replica keeps them.

**Failures** keep every row and are retried on later runs. The job remembers them (in memory, up to
10,000 orders) and fills each batch with never-failed orders first, then the failed ones by fewest
failures, so orders that keep failing never take every place in the batch. Limits: beyond 10,000
remembered orders, new failures are not ordered last; and an order archived by another leader stays
remembered until the memory is lost on a restart or hand-over. An exception for one order fails that
order only (`error`). The reasons:
- a replica that differs or is behind (`replica-mismatch`);
- a replica that can't be reached (`replica-unreachable`);
- a refused precondition (`precondition`);
- a changed order (`changed`);
- an error (`error`).

Each is counted in `oms.retention.failures{reason}` and logged at WARN with the order id and the
reason. Other meters: `oms.retention.archived`, and the gauge `oms.retention.eligible`.

A create reusing an archived order's `(session_id, cl_ord_id)` is no longer refused as a duplicate:
that pair is unique among retained orders only. The replica then holds both orders.

**A known gap.** A refused command writes its `command_log` row in a transaction of its own, without
touching the order's version. One committed between verification and the delete is not deleted with
the order. It still reaches the replica, so nothing is lost, but it stays on the primary as an orphan.
## Operating notes

- **A replica that stays down** keeps WAL on the primary through its replication slot.
  `max_slot_wal_keep_size=2GB` caps it, then invalidates the slot. To recover:
  1. on the replica, `DROP SUBSCRIPTION oms_history` (or the configured name);
  2. truncate the replica's history tables, or re-create its database;
  3. restart oms-core, which subscribes again with a full copy.
- **Schema changes.** Logical replication does not carry DDL.
  - oms-core migrates the primary first, then the replica, at start-up.
  - A changeset that adds a column to a published table can therefore stop replication briefly:
    from the first row with that column, until the replica is migrated.
  - Archiving fails safe meanwhile, because verification sees the replica behind.

Related: [State Store](state-store.md), [Order Event](../../domain/model/order-event.md),
[Local Docker Stack](../../infrastructure/local-docker-stack.md),
[Order Expiry and Close](../../capabilities/order-expiry-and-close.md).
