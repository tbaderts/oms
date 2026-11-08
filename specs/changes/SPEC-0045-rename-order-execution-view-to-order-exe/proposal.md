# Proposal — SPEC-0045: Rename order_execution_view to order_execution_projection

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The order-execution read model (SPEC-0020) is a table: one row per applied fill with the order as of
that fill, written in the fill's transaction and rebuildable from the event log. It is named
`order_execution_view`. In PostgreSQL "view" means a SQL view, which is exactly the alternative the
review of 2026-11-07 weighed and rejected (`oms-core/docs/event-sourcing-cqrs-review-2026-11-07.md`,
section 5.4, decision of 2026-11-07; target architecture section 4.2). The name invites the wrong
mental model:
- **It looks rebuild-free.** Readers expect a view that needs no rebuild and cannot drift.
- **It looks safe to drop.** It might seem replaceable by `CREATE VIEW` with no further thought.

The projection name is also the table name today (`Projection.name()`). The name is therefore
used for the rebuild URL, the `LOCK TABLE` and the metric tag. So no projection can be renamed for
operators without renaming its table, and the next projections (positions, SPEC-0051) would
repeat the coupling.

Doing nothing keeps a misleading name in every query, index and page that mentions it. Renaming
later costs more, because each new ticket adds references (SPEC-0044 added one).

## What Changes

- **Table rename.** A new Liquibase changeset renames the table `order_execution_view` to
  `order_execution_projection`, with a rollback. The rows are kept. These objects are renamed to
  match:
  - the sequence (`order_execution_projection_seq`);
  - the primary key (`pk_order_execution_projection`);
  - the unique constraint (`uq_order_execution_projection_order_id_execid`);
  - the three indexes (`idx_order_execution_projection_root_order_id`, `…_account`,
    `…_transact_time`).
- **`Projection` gains `table()`.** The projection name and the table name are separate:
  - name `order_execution`, table `order_execution_projection`;
  - the rebuild locks and clears `table()`;
  - the rebuild selector, the error messages and the `oms.projection.rebuild` metric tag use
    the name.
- **Rebuild URL.** The operator rebuild URL becomes `POST /actuator/projections/order_execution/rebuild`.
  The old `…/order_execution_view/rebuild` answers 404. This is a management endpoint, not a
  published contract. Its only callers are tests and the knowledge base.
- **Java names.**
  - entity `OrderExecutionView` → `OrderExecutionProjectionRow`;
  - `OrderExecutionViewRepository` → `OrderExecutionProjectionRepository`;
  - `OrderExecutionViewQueryService` → `OrderExecutionProjectionQueryService`.
- **Unchanged.** The query contract does not change: `ExecutionViewDto`, `getExecutions` and
  `GET /api/query/executions` keep their shape and behaviour (P-04). Neither does the
  `oms_order_executions` topic.
- **Naming rule.** For future projections, the table is `<subject>_projection` and the projection
  name is `<subject>`. It is recorded in the knowledge base and enforced by a test over every
  projection bean.

## Scope

### In scope

- The changeset and its rollback. The entity, repository and query service renames. `Projection.table()`,
  `OrderExecutionProjection`, `ProjectionRebuilder` and the tests that name the table or the URL.
- Knowledge base: `oms-concepts/projections.md` (name, rebuild URL, naming rule),
  `interfaces/query-api.md`, `oms-concepts/booking-integration.md`, and the other pages that name the
  table.
- `oms-core/docs/target-architecture.md` roadmap row for SPEC-0045 marked done.

### Out of scope

- Any change to the projection's content, key or behaviour. The row for a busted fill and the
  `(order_id, execid, order_version)` key belong to SPEC-0030 and SPEC-0051.
- Renaming the query contract's `ExecutionViewDto` or the `ExecutionViewController` and
  `ExecutionViewDtoMapper` classes that implement it. They follow the contract's names, and
  renaming the DTO would break consumers.
- Rewriting applied changesets (`007`, `008`, `011`). They keep the old name; history is not edited
  (P-07).
- Done tickets and dated review documents. They are historical records.
- An alias for the old rebuild URL.

## Acceptance Criteria

- **AC-1** — Given a database migrated to the tag just before this change, with rows in
  `order_execution_view`, when the new changeset is applied, then:
  - `order_execution_projection` holds the same rows;
  - no table, sequence, constraint or index whose name contains `order_execution_view` or starts
    with `idx_oev_` remains;
  - the sequence `order_execution_projection_seq`, the primary key `pk_order_execution_projection`,
    the unique constraint `uq_order_execution_projection_order_id_execid` and the indexes
    `idx_order_execution_projection_root_order_id`, `_account` and `_transact_time` exist;
  - the next row inserted gets an id greater than every existing id.
- **AC-2** — Given the changeset applied, when Liquibase rolls back to that tag, then
  `order_execution_view` exists again with the same rows and the original sequence, key, constraint
  and index names, and `order_execution_projection` does not exist.
- **AC-3** — Given a LIVE order, when a fill is applied, then one row for that fill is in
  `order_execution_projection`, and `GET /api/query/executions?orderId=…` returns it with exactly the
  properties and values it returned before this change. The existing query test assertions pass
  unchanged.
- **AC-4** — Given orders with fills, when `POST /actuator/projections/order_execution/rebuild` is
  called, then:
  - it answers 200 with `{"projection": "order_execution", "rows": n}`;
  - the rows of `order_execution_projection` equal those before the rebuild, ids aside;
  - the `oms.projection.rebuild` timer has a sample tagged `projection=order_execution`;
  - `POST /actuator/projections/order_execution_view/rebuild` answers 404.
- **AC-5** — Given a fill event whose execution cannot be found, when the rebuild is called, then it
  answers 500 naming the order, and `order_execution_projection` holds the same rows as before the
  call.
- **AC-6** — Given every `Projection` bean in the application context, when its names are read,
  then `table()` equals `name() + "_projection"` and names an existing table.
- **AC-7** — Given this ticket's diff, when `oms-contracts/src/main/openapi/oms-query-api.yml` is
  compared to `main`, then it is unchanged.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-core, oms-knowledge-base (already set on the ticket) |
| Contracts (OpenAPI / Avro) | None. `ExecutionViewDto` and `getExecutions` are unchanged |
| Data (tables, migrations) | New changeset `012-rename-order-execution-projection.yaml`. It renames the table, sequence, primary key, unique constraint and three indexes, with a rollback. No data is changed or lost. Upgrade: stop old instances first, because they write to the old table name |
| Events / Kafka topics | None. `oms_order_executions` records are unchanged |
| Consumers (oms-ui, oms-mcp-server, downstream) | None for the query API. Operators: the rebuild URL becomes `/actuator/projections/order_execution/rebuild`, and the metric tag value `projection` changes from `order_execution_view` to `order_execution`. No dashboard uses that tag |
| Knowledge base | `oms-concepts/projections.md`, `interfaces/query-api.md`, `oms-concepts/booking-integration.md`, plus any other page naming the table; `oms-core/docs/target-architecture.md` roadmap row |

## Open Questions

- [resolved] Should the old rebuild URL keep working as an alias for a release? → assumption: no. It
  is an operator endpoint with no caller outside tests, and the knowledge base documents the new
  one.
- [resolved] Which active spec tickets name the table? → none. Only done tickets and the dated
  review documents do, and they stay as historical records. SPEC-0044's changeset `011` reads
  `order_execution_view` and runs before this rename, so the new changeset is numbered after it.
- [resolved] Should `ExecutionViewController` and `ExecutionViewDtoMapper` be renamed too? →
  assumption: no. They implement the contract's `ExecutionsApi` and `ExecutionViewDto` and follow
  the contract's names, which P-04 keeps.
