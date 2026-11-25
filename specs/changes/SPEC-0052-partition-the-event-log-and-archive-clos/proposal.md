# Proposal — SPEC-0052: Partition the event log and archive closed orders

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

Every table that records an order's history only grows:
- `order_events`, with a full JSON snapshot and the command per change;
- `executions`;
- `command_log`, one row per command attempt (SPEC-0046);
- `order_execution_projection`.

Nothing ever leaves them. `CLOSED` is terminal, and since SPEC-0029 every order reaches it, but
nothing acts on it. The event-sourcing and CQRS review (finding F-17) and target architecture §4.4
call for two things:
- `order_events` partitioned by month on `time_stamp`;
- the history of orders closed for longer than a retention period moved out of the hot database,
  driven by the CLOSE event, with partitions that hold nothing else detached.

**Why it matters.**
- **Hot tables keep growing.** Indexes, autovacuum work, backups and restore time grow with all
  history, not with the open book.
- **Measured size.** SPEC-0047's load suite measured about 19 KB of WAL per filled order. A desk
  doing tens of thousands of orders a day adds hundreds of megabytes a day to tables that are
  scanned, vacuumed and backed up every day, forever.

**Context of the decision (requester, 2026-11-16).** This OMS is an experimentation stack for
validating architecture concepts; regulatory compliance is not a driver. The requester chose:
- **The archive** is a PostgreSQL **logical replica** of the OMS database whose publication does not
  replicate deletes. Rows deleted from the primary by archiving stay on the replica, so it holds the
  full history.
- **The same replica serves CQRS read separation** (SPEC-0021). One replica validates two concepts:
  query segregation and archiving.
- **Post-trade analytics** should hold an order's history before it is archived. Analytics is only
  planned (`capabilities/post-trade-analytics.md`, maturity *planned*), so this becomes a pluggable
  precondition that is switched off until analytics exists.

The knowledge base today names `order_events` in the OMS as the long-term record and the source for
rebuilds (`post-trade-analytics.md` §9). After this ticket, the OMS database holds the retention
window, and the replica holds the full history.

## What Changes

- **Partitioning.** `order_events` becomes a natively partitioned table, by month on `time_stamp`,
  in a new changeset. Existing rows are moved into their month's partition, with no data lost.
  - **Global uniqueness keeps holding.** `(order_id, version)` and `(order_id, command_id)` stay
    unique across partitions, through a side table of keys (see the resolved question). Weakening
    either constraint would weaken P-08.
  - **Future partitions.** They are created ahead of time, so an insert never lacks a partition.
- **The archive replica.** A second PostgreSQL service, `postgres-replica`, in the root
  `docker-compose.yml`, subscribes to a publication on the OMS database.
  - **What it replicates.** The publication covers the order-history tables (orders, events and
    their keys, executions, command log, projection). It replicates inserts and updates, but **not
    deletes or truncates**.
  - **Partitioned tables.** Their rows are published under the parent table, so the replica's
    tables need not mirror the primary's partitions.
  - **oms-core** gets a read-only connection to the replica (`oms.replica.*`). Archiving uses it to
    verify, and SPEC-0021 will reuse it for its query service.
- **Archiving.** A scheduled job, run on the scheduler leader (SPEC-0048), archives every order that
  has been CLOSED for longer than `oms.retention.closed-order-days`.
  - **Verify, then delete.** For each order:
    1. Check that the replica holds the order's complete record (the order row, every event and key
       row, every execution, every command-log row, every projection row), with the same row counts
       and the same content checksum as the primary.
    2. Check the archiving preconditions.
    3. Only then delete the order's rows from the OMS database, in one transaction.
  - **Analytics precondition.** It is pluggable and off by default
    (`oms.retention.require-analytics=false`). When it is on, an order is archived only once the
    analytics check confirms it. Until analytics exists, nothing provides that check.
  - **Which orders it skips.** An order with pending outbox rows, or not CLOSED, is never archived.
  - **Counted and logged.** `oms.retention.archived` counts archived orders. Failures are counted in
    `oms.retention.failures`, logged with the order id and the reason, and retried on the next run.
- **Detaching partitions.** A monthly partition of `order_events` whose rows all belong to archived
  orders is detached and dropped on the primary. A partition that still holds a row of a retained
  order is kept. DDL is not replicated, so the replica keeps those rows.
- **Measurement.** The SPEC-0024 load suite measures storage per order (table and index bytes, and
  WAL) on the primary with retention on. A projection shows a year at the proposed daily volume
  stays within the proposed storage and vacuum budget (the numbers are in the resolved questions,
  for approval).
- **Documentation.** The knowledge base gets a retention and archive page:
  - what the OMS database keeps, and for how long;
  - that the replica holds the full history and why it ignores deletes;
  - the switched-off analytics precondition;
  - the change to the system-of-record statement in `post-trade-analytics.md` §9.

## Scope

### In scope

- The partitioning changeset, key uniqueness across partitions, and future partitions.
- The replica: the compose service, the publication without deletes, the subscription, the replica's
  schema, and oms-core's read-only connection to it.
- The archiving job: configuration, replica verification, the pluggable analytics precondition
  (off), deletion, partition detaching, metrics and logs.
- The storage measurement and the year projection, recorded in verification.md.
- The knowledge-base updates.

### Out of scope

- **SPEC-0021's query service.** Routing queries to the replica, its API and its consistency rules
  belong to SPEC-0021, which builds on the replica and connection this ticket provides.
- **Reading archived orders back through the OMS command or query APIs.** The OMS serves its
  retention window; the replica is reachable directly, and later through SPEC-0021.
- **Building post-trade analytics** or its confirmation check.
- **Partitioning** `executions`, `command_log` or the projection table. They shrink by archiving.
- **Archiving the outbox.** Its rows are deleted once published already. The outbox is not
  replicated.
- **Replica high availability, backups, and monitoring beyond a health check.** This is an
  experimentation stack.
- **Compliance guarantees** (immutable WORM storage, retention for a regulatory period). Not a
  driver here, per the requester.

## Acceptance Criteria

The retention period, budgets and daily volume below are the resolved assumptions; the tests use
small values.

- **AC-1** — Given the migrated schema, when `order_events` is inspected, then it is partitioned by
  range on `time_stamp` with one partition per month. Every event that existed before the migration
  is present, in its month's partition, with identical content. The application appends, replays
  and queries events as before, and the existing event-log test suites pass unchanged.
- **AC-2** — Given an event with `(order_id, version)` already present, in any partition, when
  another event with the same order and version is appended, even with a time stamp in another
  month, then it is rejected as a version conflict, as today. Given an event with
  `(order_id, command_id)` present, the same holds as a duplicate command.
- **AC-3** — Given the current month, when the partition maintenance runs, then partitions exist for
  at least the next two months. An event appended at a month boundary lands in the new month's
  partition without error.
- **AC-4** — Given the OMS database and the replica, when an order is created, accepted, filled and
  closed, then the replica holds its order row, events, keys, executions, command-log rows and
  projection rows with the same content, within the replication lag. Given rows deleted from the
  primary, or a partition dropped there, when the replica is read, then it still holds those rows.
- **AC-5** — Given an order CLOSED longer ago than the retention period, whose complete record the
  replica holds (equal counts and checksum), when the archiving job runs, then:
  - none of the order's rows remain in the OMS database;
  - the replica still holds all of them;
  - `oms.retention.archived` rises by 1.

  Given an order CLOSED more recently, or not CLOSED, or with a pending outbox row, then it is not
  touched.
- **AC-6** — Given the replica unreachable, behind (missing some of the order's rows), or holding
  different content, when the job runs, then:
  - no row of that order is deleted;
  - `oms.retention.failures` rises;
  - a WARN names the order and the reason;
  - once the replica holds the record, the next run archives it.
- **AC-7** — Given `oms.retention.require-analytics=true` and an analytics check that does not confirm
  an order, when the job runs, then that order is not archived, and a WARN says why. Given the
  default `false`, then no analytics check is consulted and archiving depends on the replica alone.
- **AC-8** — Given a past month whose events all belong to archived orders, when the job runs, then
  that partition is detached and dropped on the primary, and its rows remain on the replica. Given a
  past month with one event of a retained order, then that partition stays.
- **AC-9** — Given two instances, when the archiving job is due on both, then only the scheduler
  leader archives, and the follower's archived counter stays 0.
- **AC-10** — Given the SPEC-0024 load suite at its baseline shape, when it measures storage per order
  on the primary with retention on, then the projection for one year at the proposed daily volume
  and retention is within the proposed hot-storage budget. Autovacuum time per day on
  `order_events` is within the proposed vacuum budget. Measurements and projection are recorded in
  verification.md.
- **AC-11** — Given this change, when the knowledge base is read, then the retention and archive page
  states:
  - the retention period;
  - that the replica holds the full history, without replicated deletes;
  - that archiving verifies the replica before deleting;
  - that the analytics precondition exists but is off;
  - that the OMS serves no history beyond retention.

  `post-trade-analytics.md` §9 no longer names `order_events` in the OMS as the long-term record.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-core, oms-knowledge-base. Plus the root `docker-compose.yml`, which is not a spec module: a new `postgres-replica` service |
| Contracts (OpenAPI / Avro) | None |
| Data (tables, migrations) | New changelog: `order_events` becomes partitioned (existing rows move: a full copy of the table, so a maintenance window on large databases); the `order_event_keys` side table; partition maintenance; the publication. **Rows leave the OMS database by design**, deleted only after the replica is verified to hold them. The replica's schema is created and kept in step with the primary's (DDL is not replicated); the design decides how |
| Events / Kafka topics | None. Archiving publishes nothing |
| Consumers (oms-ui, oms-mcp-server, downstream) | Archived orders disappear from search, the event-log endpoint and the MCP order tools after retention; they remain on the replica. A create reusing an archived order's `(session_id, cl_ord_id)` is no longer refused as a duplicate. SPEC-0021 gains the replica and connection it needs |
| Knowledge base | A new retention and archive page; `post-trade-analytics.md` §9; `architecture/concepts/state-store.md`; `domain/model/order-event.md` (or its current path); `capabilities/order-expiry-and-close.md`; `infrastructure` Docker stack page |

## Open Questions

- [resolved] **System of record after archiving** → the requester's decision (2026-11-16):
  - analytics should hold an order's history first, implemented as a pluggable precondition that is
    off until post-trade analytics exists;
  - meanwhile the replica holds the full history.

  Compliance is not a driver: this is an experimentation stack.
- [resolved] **Archive target** → the requester's decision (2026-11-16): a PostgreSQL logical replica
  whose publication does not replicate deletes, shared with CQRS read separation (SPEC-0021).
  Cold-storage files and a separate archive database are not pursued.
- [resolved] **Sequencing with SPEC-0021** → assumption: this ticket builds the replica, the
  publication, the subscription and oms-core's read-only connection, because archiving cannot be
  verified without them. SPEC-0021 then builds its query service on top. If the requester prefers
  SPEC-0021 to go first, this ticket waits for it and drops the replica set-up from its scope.
- [resolved] **Retention period** → the requester's decision (2026-11-17): **30 days** after CLOSE,
  configurable (`oms.retention.closed-order-days`). That is enough for this experimentation stack:
  it covers corrections and busts of recent fills and a month-end check. Changing it is a
  configuration change.
  - The first assumption was 90 days. On a clean history, the verify stage measured 14.3 KB per
    CLOSED order: 25.7 GB at 90 days, over the 25 GB budget.
- [resolved] **The budgets for AC-10** → assumptions proposed for approval (the requester asked for
  proposed numbers):
  - **Volume:** 20,000 orders a day, one fill each (the SPEC-0024 baseline shape: create, accept,
    fill, close).
  - **Hot storage budget:** ≤ 25 GB for the order-history tables and their indexes on the primary,
    at the steady state of one 30-day retention period (about 600,000 retained orders, so about
    41 KB per order). The budget is unchanged from the 90-day assumption; the shorter retention
    gives it ample headroom.
  - **Vacuum budget:** autovacuum on `order_events` ≤ 10 minutes a day at that volume, projected
    from the measured per-order cost.
  - **The replica has no budget.** It grows with all history by design; its size is measured and
    recorded, not bounded.

  If the measurement shows the 25 GB budget is unrealistic for the snapshot-per-event design, the
  verify stage reports it rather than changing the numbers.
- [resolved] **Uniqueness across partitions** → (a): a side table `order_event_keys (order_id, version,
  command_id)`, not partitioned, with the two unique constraints, written in the same transaction as
  the event, archived (deleted) with it and replicated. The alternative, unique keys including
  `time_stamp`, would weaken the safety net P-08 relies on and need a policy exception.
- [resolved] **What triggers archiving** → the CLOSE event's time stamp: an order is eligible once
  its CLOSE event is older than the retention period (target architecture §4.4).
- [resolved] **Is the order row archived too** → yes. Without it, the SPEC-0049 reconciler would
  report an order with no events, and search would show orders whose history is gone.
- [resolved] **Duplicate creates after archiving** → assumption: acceptable. `(session_id,
  cl_ord_id)` is unique among retained orders only; FIX client order ids are unique per session and
  day in practice. Documented as a consequence.
