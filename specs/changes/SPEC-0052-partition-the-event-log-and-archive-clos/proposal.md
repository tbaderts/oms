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
- the history of orders closed for longer than a retention period moved to cold storage, driven
  by the CLOSE event, with partitions that hold nothing else detached.

**Why it matters.**
- **Hot tables keep growing.** Indexes, autovacuum work, backups and restore time grow with all
  history, not with the open book.
- **Measured size.** SPEC-0047's load suite measured about 19 KB of WAL per filled order. A desk
  doing tens of thousands of orders a day adds hundreds of megabytes a day to tables that are
  scanned, vacuumed and backed up every day, forever.

**What it must not break.** The knowledge base currently says the opposite of archiving. It names
`order_events` as the full history kept for regulatory record keeping, for years, and the source
for replays (`oms-concepts/post-trade-analytics.md` §9: "The OMS stays the system of record"). MiFIR
Art. 25 order record keeping needs the full event history, unchanged and reproducible, for years.
Moving it out of the OMS is only safe once the place it moves to meets that bar. The first open
question is therefore which store is the system of record after archiving.

## What Changes

- **Partitioning.** `order_events` becomes a natively partitioned table, by month on `time_stamp`,
  in a new changeset. Existing rows are moved into their month's partition, with no data lost.
  - **Global uniqueness keeps holding.** `(order_id, version)` and `(order_id, command_id)` stay
    unique across partitions. PostgreSQL only enforces uniqueness on a partitioned table when the
    key includes the partition column, so the design decides how (see Open Questions; a side table
    of keys is the recommendation). Weakening either constraint would weaken P-08.
  - **Future partitions.** They are created ahead of time, so an insert never lacks a partition.
- **Archiving.** A scheduled job, run on the scheduler leader (SPEC-0048), archives every order
  that has been CLOSED for longer than `oms.retention.closed-order-days`.
  - **What it moves.** In one transaction per order, it writes the order's complete record to cold
    storage:
    - the order row;
    - every event (with command, snapshot and metadata);
    - every execution;
    - every command-log row;
    - every projection row.

    It then verifies the copy (row counts and a checksum), and only then deletes the order's rows
    from the OMS.
  - **Which orders it skips.** An order with pending outbox rows, or not CLOSED, is never archived.
  - **Counted and logged.** `oms.retention.archived` counts archived orders. Failures are counted
    in `oms.retention.failures`, logged with the order id, and retried on the next run.
- **Detaching partitions.** A monthly partition of `order_events` whose rows all belong to
  archived orders is detached and dropped, after its rows were confirmed archived. A partition
  that still holds a row of an open or retained order is kept.
- **Measurement.** The SPEC-0024 load suite measures storage per order (table and index bytes, and
  WAL) with and without retention. A projection from it shows that a year at the agreed daily
  volume stays within the agreed storage and vacuum budget (numbers: Open Questions).
- **Documentation.** The knowledge base gets the retention policy:
  - what is kept in the OMS, for how long, and where archived history lives;
  - that post-trade analytics keeps its own history;
  - the change to the system-of-record statement.

## Scope

### In scope

- The partitioning changeset, key uniqueness across partitions, and the creation of future
  partitions.
- The archiving job, its configuration, the cold-storage writer and verification, deletion,
  partition detaching, metrics and logs.
- The storage measurement and the year projection, recorded in the ticket.
- The knowledge-base updates, including the post-trade analytics retention table.

### Out of scope

- Partitioning `executions`, `command_log` or the projection table. They shrink by archiving; the
  goal partitions only `order_events`.
- Reading archived orders back through the OMS APIs. The OMS does not serve history beyond its
  retention (target architecture §4.4).
- Building the post-trade analytics store, or re-publishing from the event log (C6).
- Archiving the outbox. Its rows are deleted once published already.

## Acceptance Criteria

The retention period, storage and vacuum budget, daily volume and cold-storage target below are
set by the answers to the open questions; the tests use small values.

- **AC-1** — Given the migrated schema, when `order_events` is inspected, then it is partitioned by
  range on `time_stamp` with one partition per month. Every event that existed before the
  migration is present, in its month's partition, with identical content. The application appends,
  replays and queries events as before, and the existing event-log test suites pass unchanged.
- **AC-2** — Given an event with `(order_id, version)` already present, in any partition, when
  another event with the same order and version is appended, even with a time stamp in another
  month, then it is rejected as a version conflict, as today. Given an event with
  `(order_id, command_id)` present, the same holds as a duplicate command.
- **AC-3** — Given the current month, when the partition maintenance runs, then partitions exist for
  at least the next two months. An event appended at a month boundary lands in the new month's
  partition without error.
- **AC-4** — Given an order CLOSED longer ago than the retention period, when the archiving job
  runs, then:
  - cold storage holds its complete record (order, events, executions, command-log rows,
    projection rows), with counts and a checksum equal to the source;
  - none of those rows remain in the OMS;
  - `oms.retention.archived` rises by 1.

  Given an order CLOSED more recently, or not CLOSED, or with a pending outbox row, then it is not
  touched.
- **AC-5** — Given a failure while writing or verifying an order's archive (cold storage
  unavailable, or a checksum mismatch), when the job runs, then no row of that order is deleted,
  `oms.retention.failures` rises, a WARN names the order, and the next run archives it.
- **AC-6** — Given a past month whose events all belong to archived orders, when the job runs, then
  that partition is detached and dropped. Given a past month with one event of a retained order,
  then that partition stays.
- **AC-7** — Given two instances, when the archiving job is due on both, then only the scheduler
  leader archives, and the follower's archived counter stays 0.
- **AC-8** — Given the SPEC-0024 load suite at the agreed shape, when it measures storage per order
  with retention on, then the projection for one year at the agreed daily volume and retention is
  within the agreed storage budget. Autovacuum time per day on the hot tables is within the agreed
  vacuum budget. Measurements and projection are recorded in verification.md.
- **AC-9** — Given this change, when the knowledge base is read, then the retention policy page states:
  - the retention period;
  - what is archived and where;
  - that the OMS serves no history beyond retention;
  - that post-trade analytics keeps its own history.

  `post-trade-analytics.md` §9 no longer names `order_events` as the long-term system of record.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-core, oms-knowledge-base (set on the ticket) |
| Contracts (OpenAPI / Avro) | None |
| Data (tables, migrations) | New changelog 017. It turns `order_events` into a partitioned table, moving existing rows (a full copy of the table: a maintenance window on large databases), adds the uniqueness mechanism and partition maintenance. **Information leaves the OMS by design**: archived orders' rows are deleted after verified copy to cold storage |
| Events / Kafka topics | None. Archiving publishes nothing |
| Consumers (oms-ui, oms-mcp-server, downstream) | Archived orders disappear from search, the event log endpoint and the MCP order tools after retention. A create reusing an archived order's `(session_id, cl_ord_id)` is no longer refused as a duplicate |
| Knowledge base | A new retention policy page; `oms-concepts/post-trade-analytics.md` §9; `oms-framework/oms-state-store.md`; `domain/order-event.md`; `capabilities/order-expiry-and-close.md` |

## Open Questions

- [open] **System of record after archiving.** Today the KB says `order_events` in the OMS is the
  full history kept for years for regulatory record keeping (MiFIR Art. 25), and the source for
  rebuilds. After this ticket, archived history lives in cold storage. Is cold storage the system of
  record for archived orders, with the requirements that brings (complete, unchanged, reproducible,
  kept for the regulatory period)? Or must post-trade analytics hold it first?
  - **Recommendation:** cold storage is the system of record for archived orders. It is written
    immutable and verified, as AC-4 and AC-5 require. Analytics keeps its own copy from the topics
    as it does today.
- [open] **Cold storage target.**
  - (a) Files: one compressed, checksummed JSON document per order in a configured directory or
    object store, ideally immutable storage such as Azure Blob with a time-based retention policy
    (WORM).
  - (b) A separate archive database or schema in PostgreSQL.
  - **Recommendation:** (a). It is cheap, immutable, independent of the OMS database's lifecycle,
    and replayable with the SPEC-0024 harness. Locally a directory, in production an object store.
- [resolved] **Retention period** → assumption: 90 days after CLOSE, configurable
  (`oms.retention.closed-order-days`). It covers corrections and busts of recent fills, and
  month-end and quarter-end checks. Changing it is a configuration change.
- [open] **The budgets for AC-8.** The goal speaks of "the agreed storage and vacuum budget",
  which is not written down anywhere. Name:
  - the daily order volume (and fills per order) to project;
  - the storage budget for the hot tables, for example "≤ 50 GB at a steady state of one
    retention period";
  - the vacuum budget, for example "autovacuum on order_events ≤ 10 minutes a day".
- [resolved] **Uniqueness across partitions** → (a): a side table `order_event_keys (order_id, version,
  command_id)`, not partitioned, with the two unique constraints, written in the same transaction as
  the event and archived with it. The alternative, unique keys including `time_stamp`, would weaken
  the safety net P-08 relies on and need a policy exception. The design details it.
- [resolved] **What triggers archiving** → the CLOSE event's time stamp: an order is eligible once
  its CLOSE event is older than the retention period (target architecture §4.4).
- [resolved] **Is the order row archived too** → yes. Without it, the SPEC-0049 reconciler would
  report an order with no events, and search would show orders whose history is gone.
- [resolved] **Duplicate creates after archiving** → assumption: acceptable. `(session_id,
  cl_ord_id)` is unique among retained orders only; FIX client order ids are unique per session and
  day in practice. Documented as a consequence.
