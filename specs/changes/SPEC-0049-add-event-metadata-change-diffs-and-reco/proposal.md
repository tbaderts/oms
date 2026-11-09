# Proposal — SPEC-0049: Add event metadata, change diffs and reconciliation

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The event-sourcing and CQRS review (`oms-core/docs/event-sourcing-cqrs-review-2026-11-07.md`)
found three gaps that this ticket closes.

- **F-10: events say *that* an order changed, not *what* changed or *who* caused it.**
  - Each `order_events` row stores the full snapshot after the change, and the causing command
    as JSON.
  - An auditor or a support engineer who wants "what did this fill change" diffs two snapshots by
    hand.
  - The command header's `correlationId` and `causationId` are inside the stored command JSON,
    but cannot be queried or indexed.
  - Who sent the command, and through which door (REST, Kafka, a scheduler job), is recorded only
    in the separate command log (SPEC-0046), not on the event it produced.
- **F-12: the log is checked against the state only in tests.**
  - P-05 says every state change is recorded in the event log. Tests prove it for the paths they
    exercise.
  - In production, a path that changes `orders` without appending an event would go unnoticed.
    So would a gap in an order's versions.
  - The pieces exist (`OrderReplayService.replay`, `isContiguous`) but nothing runs them.
- **F-14: a deployment can hold an aggregate.**
  - PROJECTION outbox rows store the Avro encoding of the record with the class's schema at
    staging time, and are decoded with the class's schema at publishing time.
  - If a deployment changes that record between the two, decoding fails. The row then uses up its
    attempts and holds every later message of its order tree (SPEC-0026).

Doing nothing leaves audit and support reading raw snapshots. Event-log drift stays invisible
until a replay or a customer finds it, and every change to the order-executions record carries a
"drain the outbox before deploying" risk.

## What Changes

- **Event metadata.** `order_events` gains `correlation_id`, `causation_id`, `principal` and
  `source`. They are filled for every new event:
  - **Kafka:** from the command header (`correlationId`, `causationId`, `producer`), with source
    `KAFKA`;
  - **REST:** `correlationId` and `causationId` from the command body when sent. The principal is
    the authenticated caller, which is null today because REST has no authentication (see Open
    Questions). Source is `REST`;
  - **schedulers:** the job's principal (`oms-core:expiry`, `oms-core:end-of-day`), with source
    `SCHEDULER`.
- **Change diff.** `order_events` gains `changes` (jsonb).
  - It holds the field-level difference between the order as loaded for the command and as saved
    by it: `{"<field>": {"from": <old>, "to": <new>}, …}`.
  - Only changed fields are listed. For an order's first event, every field set at creation is
    listed with `from: null`.
- **Query API, additive.** `OrderEventDto` (oms-query-api.yml) gains `correlationId`,
  `causationId`, `principal`, `source` and `changes`. Existing fields are unchanged.
- **Reconciliation sampler.**
  - A scheduled job, run only on the scheduler leader (SPEC-0048), samples recently changed
    orders and some random ones.
  - For each sampled order it checks that the latest event's snapshot agrees with the `orders` row
    (`OrderReplayService.replay`), and that the versions are contiguous (`isContiguous`).
  - It exposes the gauges `oms.event_log.inconsistent` and `oms.event_log.gaps`: orders found
    inconsistent or with gaps in the latest run.
  - It logs each mismatch at WARN with the order id and the differing fields or missing versions.
- **Writer schema on PROJECTION rows.**
  - The outbox row stores the Schema Registry id of the schema the payload was encoded with.
  - The relay decodes with that writer schema and the current class's reader schema, by Avro
    schema resolution.
  - A compatible change to the record between staging and publishing no longer fails the row.
    Rows without a schema id decode as today.

## Scope

### In scope

- The four metadata columns, `changes`, and filling them for every new event on every path.
- The additive `OrderEventDto` fields, and the order-events endpoint returning them.
- The reconciliation sampler, its gauges, logs and configuration (interval, sample sizes).
- The writer schema id on PROJECTION rows and writer/reader decoding.
- Tests for each, and the knowledge-base pages.

### Out of scope

- Backfilling metadata or `changes` for events written before this change. They stay null.
- Authentication on REST. The REST principal stays null until a later ticket adds it.
- Repairing an inconsistency the sampler finds. It reports, it does not fix.
- Writer schema ids on ORDER and EXECUTION rows. Since SPEC-0047 these rows are pointers, built
  at publish time with the current schema, so they have no staged encoding to drift.
- Showing the new fields in oms-ui or in oms-mcp-server.

## Acceptance Criteria

- **AC-1** — Given a Kafka command whose header has `correlationId` C, `causationId` X and
  `producer` P, when it is applied, then its `order_events` row has `correlation_id` C,
  `causation_id` X, `principal` P and `source` `KAFKA`.
- **AC-2** — Given a REST command with `correlationId` C in its body, when it is applied, then its
  event has `correlation_id` C, `source` `REST` and `principal` null. Given a GTD expiry and an
  end-of-day close run by the schedulers, then their events have `source` `SCHEDULER` and
  `principal` `oms-core:expiry` and `oms-core:end-of-day` respectively.
- **AC-3** — Given a LIVE order of 100 with nothing filled, when a fill of 40 at 170 is applied,
  then the event's `changes` holds exactly the fields that changed, each with its old and new
  value, among them `cumQty` 0 → 40, `leavesQty` 100 → 60 and `txNr`. It holds no field whose value
  did not change; in particular not `state`, since a partial fill leaves the order LIVE (the OMS has
  no partially-filled state). The order carries no average price; the fill's is on the execution.
- **AC-4** — Given a new order, when it is created, then its first event's `changes` lists every
  field set at creation with `from` null. Given a command that changes nothing but the order's
  version, then `changes` holds only `txNr`.
- **AC-5** — Given an order with events written after this change, when
  `GET /api/query/orders/{orderId}/events` is called, then each entry carries `correlationId`,
  `causationId`, `principal`, `source` and `changes` as stored. Given an event written before
  this change, those fields are null and the existing fields are as before.
- **AC-6** — Given the reconciliation sampler and three orders: one consistent, one whose `orders`
  row was changed without an event (cumQty edited by SQL), and one with a missing version (an
  event deleted by SQL), when the sampler runs, then:
  - `oms.event_log.inconsistent` is 1 and `oms.event_log.gaps` is 1;
  - a WARN log names the inconsistent order and its differing field, and another names the order
    with the gap and its missing version;
  - after the two orders are repaired and the sampler runs again, both gauges are 0.
- **AC-7** — Given two instances, when the sampler is due on both, then only the scheduler leader
  samples, and the follower's sampled-orders counter stays 0. Given the configured sample sizes
  (default 50 recent and 10 random), then one run reads at most that many orders.
- **AC-8** — Given a PROJECTION row staged with schema id W of the order-executions record, when
  it is published by code whose class schema differs from W by a compatible change (a field added
  with a default), then the published record carries the original values and the new field's
  default, and the row is not failed. Given a PROJECTION row with no schema id, then it decodes as
  today.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-contracts, oms-core, oms-knowledge-base (set on the ticket) |
| Contracts (OpenAPI / Avro) | `oms-query-api.yml`: five optional properties on `OrderEventDto`, additive. Avro: none |
| Data (tables, migrations) | New changelog 016. It adds nullable `correlation_id`, `causation_id`, `principal`, `source` and `changes` (jsonb) to `order_events`, an index on `correlation_id`, and nullable `payload_schema_id` on `outbox`. No backfill; old rows stay null |
| Events / Kafka topics | None. Records and keys unchanged |
| Consumers (oms-ui, oms-mcp-server, downstream) | Additive JSON fields on the order-events endpoint, which existing clients ignore |
| Knowledge base | `oms-framework/oms-state-store.md` (event columns), `domain/order-event.md`, `capabilities/event-sourcing-and-replay.md` (reconciliation), `oms-concepts/projections.md` (deployment note no longer needed), `capabilities/event-publication.md` |

## Open Questions

- [resolved] **Who is the REST principal?** → assumption: null. oms-core has no authentication on
  REST today. `CommandOrigin` already documents the REST principal as "null until authentication
  exists". When authentication arrives, it fills the same column. Cheap to revisit.
- [resolved] **What does "the order as loaded" mean for `changes`?** → assumption: a copy of the
  order taken when the pipeline loads it for the command. `changes` is the diff between that copy
  and the order the appender saves. It is not computed against the previous event's snapshot, to
  avoid a read per change.
- [resolved] **The diff's JSON shape** → assumption: `{field: {from, to}}`, with field names as in
  the snapshot JSON, values in their snapshot JSON form, and nested values compared whole.
- [resolved] **Sampler defaults** → assumption: every 5 minutes, the 50 most recently changed
  orders plus 10 random ones, all configurable. The gauges show the latest run, not a running
  total.
- [resolved] **What the sampler compares** → assumption: the business fields of the `orders` row
  against the latest event's snapshot. The row id and fields a snapshot does not carry are
  excluded. The design names the list.
- [resolved] **Where the writer schema id comes from** → assumption: the Schema Registry id of the
  record's schema, looked up once per record type and cached, never per command. If the registry
  cannot be reached, the row is staged without an id and decodes as today, so the registry never
  fails a command.
- [deferred] **SPEC-0047 is still being verified in the same working tree** → this ticket builds
  on its outbox and appender code. Implementation starts after SPEC-0047 is done, and the design
  is written against its final code.
