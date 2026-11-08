# Design — SPEC-0045: Rename order_execution_view to order_execution_projection

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

The order-execution projection (SPEC-0020) is spread over several classes:

| Class | Role today |
|---|---|
| `projection/Projection` | Interface. `name()` is "the projection's table name; also its name for a rebuild" |
| `projection/OrderExecutionProjection` | `NAME = "order_execution_view"`; writes rows through `OrderExecutionViewRepository` |
| `model/OrderExecutionView` | Entity: `@Table(name = "order_execution_view")`, sequence `order_execution_view_seq` |
| `projection/ProjectionRebuilder` | Keys projections by `name()`. Runs `LOCK TABLE <name()> IN EXCLUSIVE MODE` and calls `projection.clear()`. Records the timer `oms.projection.rebuild{projection=name}` |
| `projection/ProjectionsEndpoint` | `POST /actuator/projections/{name}/rebuild` |
| `service/OrderExecutionViewQueryService` | Reads the rows for `ExecutionViewController` (`getExecutions`) |
| `projection/ProjectTask` | Sorts projections by `name()` |

The schema comes from `007-projections.yaml`, which created these objects:
- the sequence `order_execution_view_seq`;
- the table with `pk_order_execution_view`;
- the unique constraint `uq_order_execution_view_order_id_execid`;
- the indexes `idx_oev_root_order_id`, `idx_oev_account` and `idx_oev_transact_time`.

`008` changed column types, and `011` (SPEC-0044) reads the table in a backfill. Nothing outside
oms-core names the table. The only callers of the rebuild URL are `ProjectionRebuildIntegrationTest`
and the knowledge base.

**Closest examples followed.**
- Migration with a tag and a legacy-row test: `011-execution-lifecycle.yaml` and
  `ExecutionLifecycleMigrationIntegrationTest`.
- Rollback through the Liquibase `CommandScope` API, as the tag tests use `updateToTag`.

**Specs read:** `projections.md`, `state-query-store_spec.md` (read model), `testing-patterns.md`.

## Approach

This is a rename with one structural change: a projection gets a **name**, used by operators,
metrics and rebuild selection, and a **table**, used by SQL. They are separate methods, and a
naming rule ties them together.

```java
public interface Projection {
    /** The projection's name: the rebuild selector and the metric tag, e.g. "order_execution". */
    String name();

    /** The table holding its rows, by convention name() + "_projection" (SPEC-0045). */
    String table();
    ...
}
```

| Change | Where |
|---|---|
| Table and objects renamed | new `012-rename-order-execution-projection.yaml` |
| `table()` and the name `order_execution` | `Projection`, `OrderExecutionProjection` (`NAME = "order_execution"`, `TABLE = "order_execution_projection"`) |
| Lock uses the table | `ProjectionRebuilder.rebuild`: `LOCK TABLE " + projection.table() + " IN EXCLUSIVE MODE`. The selector, logs and metric tag keep `name()`. `clear()` already deletes through the repository, whose entity now maps the new table |
| Entity, repository and service renamed | `model/OrderExecutionProjectionRow`, `repository/OrderExecutionProjectionRepository`, `service/OrderExecutionProjectionQueryService`. Callers updated: `OrderExecutionProjection`, `ExecutionViewController`, `ExecutionViewDtoMapper` and the tests |
| Contract unchanged | `ExecutionViewController` and `ExecutionViewDtoMapper` keep their contract-derived names. The mapper's source type changes to the renamed entity, and its mapped properties are identical |

## Contract Changes

None. `oms-query-api.yml` (`getExecutions`, `ExecutionViewDto`) and the Avro `OrderExecution` are
not touched; AC-7 checks it. The rebuild endpoint is a Spring actuator management endpoint, not part
of the OpenAPI contracts.

## Data & Persistence

**New file** `oms-core/src/main/resources/db/changelog/012-rename-order-execution-projection.yaml`,
included last in `db.changelog-master.yaml`. `007`, `008` and `011` are not edited.

| Changeset | Content | Rollback |
|---|---|---|
| `026-tag-before-order-execution-projection` | `tagDatabase: before-012-order-execution-projection` | none needed |
| `027-rename-order-execution-projection` | See the statements below | The same statements reversed |

The statements of changeset 027:
- `renameTable order_execution_view → order_execution_projection`
- `renameSequence order_execution_view_seq → order_execution_projection_seq`
- `sql` with these renames. On PostgreSQL, renaming a constraint also renames its index.
  ```sql
  ALTER TABLE order_execution_projection RENAME CONSTRAINT pk_order_execution_view TO pk_order_execution_projection;
  ALTER TABLE order_execution_projection RENAME CONSTRAINT uq_order_execution_view_order_id_execid TO uq_order_execution_projection_order_id_execid;
  ALTER INDEX idx_oev_root_order_id RENAME TO idx_order_execution_projection_root_order_id;
  ALTER INDEX idx_oev_account RENAME TO idx_order_execution_projection_account;
  ALTER INDEX idx_oev_transact_time RENAME TO idx_order_execution_projection_transact_time;
  ```

**What stays the same.**
- **Rows, columns, types and sequence value.** Renames do not touch data. The sequence keeps its
  current value, so new ids continue after the existing ones (AC-1).
- **Entity mapping.** `OrderExecutionProjectionRow` maps `@Table(name = "order_execution_projection")`
  and sequence `order_execution_projection_seq`, with `allocationSize = 1` and fields unchanged.
  `ddl-auto: validate` checks the mapping against the migrated schema.
- **Upgrade.** Stop old instances first, as for 010 and 011: an old instance would write to a table
  that no longer exists. The changelog header says so.

## Events & Messaging

None. Nothing new is recorded in `order_events` (P-05). The projection still stages the same
`OrderExecution` record on `oms_order_executions` through the outbox (P-06). Only the name used to
select a rebuild and tag its timer changes.

## Domain, State & Orchestration

None. No state machine, pipeline step or validation changes. `ProjectTask` still runs every
projection, sorted by `name()`. The rebuild endpoint's 400, 404 and 500 answers are unchanged,
answered for the new name.

## Alternatives & Decisions

- **Decision: rename the table in place with Liquibase rename operations.**
  - Rejected: create a new table, copy the rows, drop the old one. That is slower, needs the copy
    to be verified, and loses nothing a rename keeps.
  - Rejected: a compatibility SQL view named `order_execution_view` over the new table. Nothing
    outside oms-core reads the table, and a view with the old name would bring back the confusion
    this ticket removes.
- **Decision: a separate `table()` method, plus a test of the naming rule** (`table() == name() + "_projection"`).
  - Rejected: deriving the table from the name in a default method. A future projection that
    needs a different table (a shared or partitioned one) would have to override a default it
    cannot see. The explicit method plus a test makes the rule visible and enforced.
- **Decision: constraint and index renames as `sql` with explicit rollback `sql`.** Liquibase has no
  portable rename-constraint change, and the project runs on PostgreSQL only.
- **Decision: no alias for the old rebuild URL** (approved in the proposal).
- **Decision: the contract-named web classes keep their names** (`ExecutionViewController`,
  `ExecutionViewDtoMapper`), approved in the proposal.
- No new dependency or build change (P-17).

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| An instance of the old code runs during or after the upgrade | Stop old instances first, stated in the changelog header, as for 010 and 011 |
| A missed reference to the old table in native SQL | Native SQL using the table name exists only in the rebuilder (now `table()`) and in tests. The verify stage greps the main sources for `order_execution_view` outside applied changesets. The rebuild test (AC-4) fails if `LOCK TABLE` names a missing table |
| Rollback leaves mixed names | AC-2 runs the real Liquibase rollback and checks every name and the rows |
| Operators using the old URL | The knowledge base documents the new URL; the old one answers a clear 404 "Unknown projection" |

## Test Strategy

| AC | Level | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | integration (migration, Liquibase API) | `OrderExecutionProjectionRenameMigrationTest#renameKeepsRowsAndRenamesEveryObject` (new) | Migrate to `before-012-order-execution-projection`, insert two rows into `order_execution_view` through its sequence, then update to the head. Asserts: same rows in `order_execution_projection`; no relation, sequence or constraint name containing `order_execution_view` or starting `idx_oev_` (`pg_class`, `pg_constraint`); the seven new names exist; `nextval('order_execution_projection_seq')` is greater than the max id |
| AC-2 | integration (migration, Liquibase API) | `OrderExecutionProjectionRenameMigrationTest#rollbackRestoresTheOriginalNames` (new) | After update, `rollback` to the tag. Asserts the old table with the same rows, the old seven names, and no `order_execution_projection` |
| AC-3 | integration | `ProjectionIntegrationTest#fill_writesOneViewRowMatchingItsOrderExecution` (existing, repository renamed). `ExecutionViewQueryIntegrationTest` (all four methods, assertions unchanged) | A row per fill in the renamed table, matching the record; the query API returns the same properties and order |
| AC-4 | integration (MockMvc) | `ProjectionRebuildIntegrationTest#rebuild_reproducesTheViewWithoutPublishing` (URL and expected name updated, timer tag asserted), `#oldProjectionName_is404` (new) | 200 with `projection: order_execution`; equal rows; a timer sample with tag `projection=order_execution`; the old name gives 404 |
| AC-5 | integration (MockMvc) | `ProjectionRebuildIntegrationTest#unmatchedFillEvent_failsAndLeavesTheViewUnchanged`, `#fillEventWithoutExecId_failsNamingOrderAndVersion` (URL updated) | 500 naming the order; row count and rows unchanged |
| AC-6 | integration | `ProjectionIntegrationTest#everyProjectionTableIsItsNameWithProjectionSuffix` (new) | For every `Projection` bean, `table()` equals `name() + "_projection"`, and the table exists in `information_schema.tables` |
| AC-7 | review + command | Verify-stage check: `git diff main -- oms-contracts` is empty | No contract file changed |

`LiquibaseMigrationIntegrationTest#projectionSchemaIsApplied` is updated to the new table and
constraint names, and asserts that `order_execution_view` does not exist.

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | comply | No contract change |
| P-02 | Specification before code, generated models only | n/a | No API or message change |
| P-03 | Never edit generated code | comply | Nothing generated is touched |
| P-04 | Contracts evolve compatibly | comply | Query contract unchanged (AC-3, AC-7); contract-named classes keep their names |
| P-05 | Every state change is recorded in the event log | n/a | No order state change |
| P-06 | Kafka only through the transactional outbox | comply | Staging is unchanged |
| P-07 | Schema changes through new Liquibase changesets | comply | New `012` with tag and rollback. 001–011 untouched. The entity matches under `validate` |
| P-08 | Concurrency and idempotency are explicit | comply | Unique constraint kept (renamed only); the rebuild lock is kept on the renamed table |
| P-09 | Commands and queries stay separate | comply | Unchanged: written by the command path, read by the query service |
| P-10 | State transitions go through the state machine and task pipeline | n/a | No state transition |
| P-11 | Layering and conventions | comply | Renames keep the layer packages; the naming rule is recorded |
| P-12 | Jackson 3 only | n/a | No JSON code |
| P-13 | Errors and validation follow the framework specs | comply | Endpoint answers unchanged |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Each AC is mapped to a test above; the migration tests are written first |
| P-15 | Observability | comply | The rebuild timer and logs keep their shape, tagged with the projection name (AC-4) |
| P-16 | Security | comply | `table()` comes from a bean constant, never from the request, so the `LOCK TABLE` concatenation stays safe as before |
| P-17 | Simplicity and dependencies | comply | Renames plus one interface method; no dependency |
| P-18 | Modules build standalone | comply | `spec verify` runs oms-core `check` |
| P-19 | Documentation follows behaviour | comply | Pages listed below |

## Knowledge Base Updates

- `oms-knowledge-base/oms-concepts/projections.md`:
  - the section becomes `order_execution` (table `order_execution_projection`);
  - the rebuild URL example;
  - the naming rule;
  - `table()` versus `name()`.
- `oms-knowledge-base/interfaces/query-api.md`: `getExecutions` reads `order_execution_projection`.
- `oms-knowledge-base/oms-concepts/booking-integration.md`: the reconciliation row names the new table.
- Any other knowledge-base page found by grep that names `order_execution_view`.
- `oms-core/docs/target-architecture.md`: the roadmap row for SPEC-0045 becomes "done". That page is
  hand-written, not OpenWiki.
