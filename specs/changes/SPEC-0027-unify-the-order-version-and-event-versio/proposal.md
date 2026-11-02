# Proposal — SPEC-0027: Unify the order version and event version

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

Finding 6 of the architecture review (`oms-core/docs/architecture-review-2026-10-30.md`, §8 table;
[ticket Goal](./ticket.md)).

An order carries two counters that mean almost the same thing:

- **`orders.tx_nr`** is the JPA `@Version`. Hibernate increments it at flush and uses it for
  optimistic locking.
- **`order_events.version`** is the event-log version, published as `eventId`/`orderVersion`.
  `OrderEventAppender` computes it with `SELECT max(version) + 1` per event, which is one extra
  query on every command.

The two drift by construction: an order is inserted at `txNr = 0` with event version 1. The
outbox entity carries the version explicitly because `txNr` "still holds the pre-update value"
at staging time (`OutboxMessage` Javadoc). The query API then exposes both, `txNr` and a separately
queried `eventVersion` (SPEC-0035), so a reader must know which one to trust.

One sequence is simpler, saves a query per event, and makes the order row say directly which
event it is the result of.

## What Changes

- **One version per order.**
  - The order's version column (`tx_nr`) holds the version of the last event appended for it: 1
    after creation, n after the n-th event.
  - `OrderEventAppender` derives the next version from the order it is given (current + 1) and sets
    it on the order. The `max(version) + 1` query goes away.
  - The event, the outbox rows and the published `eventId`/`orderVersion` keep the same numbers as
    today, so consumers see no difference.
- **Concurrency stays explicit (P-08).** Two commands that change the same order concurrently
  still cannot both win. The loser fails and is rolled back as a whole, so no update is lost. Today
  that is Hibernate's version check; the design decides whether the version check or the
  `(order_id, version)` unique constraint of the event log is the guard.
- **Existing data.** A migration sets each order's `tx_nr` to the highest `order_events.version`
  of that order, or 0 if it has none. The old `tx_nr` values are overwritten; they were an internal
  counter, published nowhere.
- **Query API.**
  - `OrderDto.txNr` and `eventVersion` report the same number.
  - `eventVersion` is read from the order row instead of the extra per-page query on
    `order_events`. For an order with no events it stays absent, as today.
  - No contract change, but the value of `txNr` changes (see Impact).

## Scope

### In scope

- `Order` (the version field), `OrderEventAppender`, the command paths that save an order before
  appending, the outbox entity's comment, `OrderQueryService` (`eventVersion`), and a Liquibase
  changelog for the migration.
- Tests that assert `txNr` deltas (they keep their meaning: one per applied command).
- Knowledge base pages on the order, event sourcing and the query API.

### Out of scope

- Renaming `tx_nr`/`txNr`. The column and the API field keep their names to avoid a contract
  change; they are documented as the order's event version.
- Event versions of other aggregates; executions have none.
- Snapshotting or replay changes beyond what the version change requires.

## Acceptance Criteria

- **AC-1** — Given a new order, when it is created and then accepted, filled and cancelled
  through the command paths (REST and Kafka), then after each command the order's `txNr` equals
  the `version` of the event just appended. That is 1, 2, 3, 4 for this sequence. The outbox
  rows and published messages carry the same number as `eventId`/`orderVersion`.
- **AC-2** — Given any command, when its event is appended, then no `max(version)` query on
  `order_events` is issued. `OrderEventRepository.findMaxVersionByOrderId` no longer exists or is
  unused.
- **AC-3** — Given two commands that change the same order concurrently (for example two fills
  read at the same version), when both commit, then exactly one is applied. The other fails as a
  whole (no event, no order change, no outbox row) and is reported as a conflict: a 409 over REST,
  a retry over Kafka. The order's `cumQty` reflects both fills only after the retry.
- **AC-4** — Given orders written before this change, with `tx_nr` values that differ from their
  latest event version, when the migration runs, then every order's `tx_nr` equals its highest
  `order_events.version`, or 0 without events. The next command appends version + 1, with no gap
  and no duplicate.
- **AC-5** — Given orders with events, when they are read through the query API (`GET /orders`,
  `GET /orders/{id}`), then `txNr` and `eventVersion` are equal. `eventVersion` is absent for an
  order without events. The query service issues no query on `order_events` for it.
- **AC-6** — Given the replay check (`OrderReplayService`, the existing replay assertions), when an
  order's events are replayed, then the replayed order equals the stored one, including its version.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-core, oms-knowledge-base |
| Contracts (OpenAPI / Avro) | None in shape. The **value** of `OrderDto.txNr` in the query API changes: it becomes the event version (1 after creation), where it was Hibernate's counter (0 after creation). `eventVersion` is unchanged. oms-ui only displays it (`DetailPanel`) |
| Data (tables, migrations) | New changelog: `UPDATE orders SET tx_nr = coalesce(max event version, 0)`. The old `tx_nr` values are overwritten (an internal counter; no information anyone reads is lost). Possibly a dropped default or constraint change, decided in the design |
| Events / Kafka topics | None. `eventId`/`orderVersion` keep their values and sequence |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-ui shows `txNr` one higher than before for existing and new orders. No Kafka consumer is affected |
| Knowledge base | `domain/order.md` (version), `capabilities/event-sourcing-and-replay.md`, `interfaces/query-api.md` (`txNr` = `eventVersion`), `architecture/event-sourcing.md` if it describes the two sequences |

## Open Questions

- [resolved] Keep Hibernate's `@Version` or let the event log's unique `(order_id, version)` be the
  optimistic lock? → assumption: **the design decides**, under AC-3. Hibernate does not let the
  application assign a `@Version` value, and the Goal asks that the appender set it. So the likely
  design drops `@Version` and relies on the event log's unique constraint, the classic event-store
  check. Every order write already appends an event in the same transaction. **Please confirm at
  approval** that changing the concurrency mechanism is acceptable, as long as AC-3 holds; any
  policy point goes to the design.
- [resolved] Rename `txNr` to `version`? → **no**: it would break the query contract for no
  behavioural gain. The field is documented as the event version instead.
- [resolved] Is overwriting the old `tx_nr` values acceptable? → assumption: **yes**. They are an
  internal optimistic-lock counter; no event, message or report depends on them, and the event log
  keeps the full history. **Please confirm at approval.**
