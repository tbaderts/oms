# Design — SPEC-0068: Fill or remove empty execution blotter columns

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

- **`oms-core/src/main/java/org/example/oms/service/MetamodelService.java`.**
  `buildExecutionMetadata()` reflects over every declared field of the JPA entity
  `org.example.common.model.Execution`, 22 fields. It builds each one with
  `buildFieldMetadata(name, type, field, false)`, which gives the display name, type, width,
  filterability and enum values. It sets `primaryKey` to `execId`, `defaultSort` to
  `transactTime,DESC`, and nine default columns. The comment notes that
  `oms-streaming-service`'s `OrderExecutionMapperTest` holds a copy of the defaults.
- **oms-ui.** REST and Streaming modes both read `/api/v1/metamodel/Execution`
  (`BackendMetamodelApiService`). `ColumnConfigService.getColumnConfig(domain, visibleColumns)`
  maps each saved or default name to a field and drops names it cannot find (a `null` then
  `filter`). So a saved layout naming a removed field already renders the rest; no test proves it
  yet. Live mode shows only streamed fields, and names the others "History only"
  (`splitColumns`, `config/streamedFields.json`).
- **Tests pinning today's behaviour:**
  - `MetamodelServiceTest#executionMetamodelUsesExecIdAndResolvableDefaults` holds
    `EXECUTION_DEFAULT_COLUMNS` (9) and asserts "the surrogate id stays selectable";
  - `ExecutionBlotterIntegrationTest#metamodelEndpointServesExecIdPrimaryKey` (HTTP) and
    `#restExecutionsCarryExecIdAndAvgPx` (REST rows carry `id`, `execId`, `orderId`, `avgPx`; this
    stays true, because REST payloads are unchanged);
  - `oms-streaming-service` `OrderExecutionMapperTest#executionDtoCarriesAllBlotterDefaultColumns`
    holds `BLOTTER_DEFAULT_COLUMNS`;
  - `oms-ui` `ColumnConfigService.test.ts` mocks the metamodel.
- **Knowledge base:** `ui/admin-ui.md`, the "Executions columns" paragraph, and
  `capabilities/functional-requirements/FR-032-metamodel-driven-grid.md`.
- **Closest example:** `buildOrderMetadata` and SPEC-0041, which reshaped the execution defaults
  and pinned them in the same three tests.

## Approach

**1. oms-core: an explicit, ordered list of execution report fields.**
- **Two constants in `MetamodelService`.** Both have Javadoc naming the FIX tags:
  - `EXECUTION_FIELDS = List.of("execId", "orderId", "execType", "lastQty", "lastPx", "lastMkt",
    "leavesQty", "cumQty", "avgPx", "transactTime", "status")`;
  - `EXECUTION_DEFAULT_COLUMNS = List.of("execId", "orderId", "execType", "lastQty", "lastPx",
    "lastMkt", "cumQty", "leavesQty", "avgPx", "transactTime")`.
- **`buildExecutionMetadata()`** iterates `EXECUTION_FIELDS`, and looks up each with
  `Execution.class.getDeclaredField(name)`. Each entry is still built by `buildFieldMetadata`, so
  types, labels and enum values (`status`) work as today. A name missing from the entity is a
  programming error: it is logged at error level and skipped, as the current loop does for
  failures. The test catches it.
- **Comments.** The class comment says that fields not in the list stay on the entity and the
  APIs, and that a ticket that fills one adds it here (SPEC-0030 for `execRefId`). The "keep in
  step with OrderExecutionMapperTest" comment stays.
- **The order metamodel is untouched.**

**2. Tests pinning the new contract.**
- **oms-core `MetamodelServiceTest`:**
  - `EXECUTION_DEFAULT_COLUMNS` gets the 10 columns;
  - a new `executionMetamodelOffersExecutionReportFieldsOnly` asserts the exact ordered list
    (AC-1) and that none of the 11 removed names appears;
  - the "id stays selectable" assertion goes, as AC-1 approves (see Alternatives & Decisions).
- **oms-core `ExecutionBlotterIntegrationTest`:** a new `executionReportFieldsAreFilled` applies
  two fills over the command API, reads `/api/executions`, and asserts every offered field and
  every default column is non-null in each row (AC-3). The existing metamodel HTTP test also
  checks the exact ordered field list (AC-1 and AC-2 end to end).
- **oms-streaming-service `OrderExecutionMapperTest`:** `BLOTTER_DEFAULT_COLUMNS` gets the 10
  columns, `lastMkt` included, and the fixture sets `lastMkt("XSIM")`. Its assertion then proves
  AC-4.
- **oms-ui `ColumnConfigService.test.ts`:** a new case for a saved list with `dayAvgPx` and
  `lastQty` (AC-5). It asserts that `getColumnConfig` returns only `lastQty`, without throwing.

**3. Knowledge base.** `ui/admin-ui.md`'s "Executions columns" gets the offered fields, the
defaults, and why the rest are not offered. `log.md` gets an entry.

| What Changes (proposal) | Where |
|---|---|
| Offered execution report fields | `MetamodelService.EXECUTION_FIELDS` and `buildExecutionMetadata` |
| Never-filled and internal fields not offered | the same, by omission; entity, database and APIs unchanged |
| Defaults with `lastMkt` | `MetamodelService.EXECUTION_DEFAULT_COLUMNS`; the streaming test copy |
| Saved removed fields skipped | existing `ColumnConfigService` behaviour plus a new test |

## Contract Changes

None. `/api/v1/metamodel/{entity}` is not in the OpenAPI specs, and its response shape is
unchanged (`EntityMetadataDto`); only the contents of `fields` and `defaultColumns` for
`Execution` change. No Avro or OpenAPI file changes, and nothing is regenerated.

## Data & Persistence

None. The `executions` table and the entity keep every column.

## Events & Messaging

None. Payloads on `oms_order_executions` and the streaming `ExecutionDto` are unchanged.

## Domain, State & Orchestration

None. Display metadata only.

## Alternatives & Decisions

- **D1. An explicit allow-list, not a deny-list or an annotation.**
  - A deny-list of the 11 removed names would silently offer any new entity field.
  - A JPA-entity annotation such as `@BlotterHidden` would add a UI concern to the domain model.
  - The list also fixes the order in which the chooser offers fields (FIX reading order).
- **D2. Remove `id` from the offered fields.**
  - The approved AC-1 says so, and it reverses SPEC-0041's "the surrogate id stays selectable"
    (an assertion in `MetamodelServiceTest`). It is a deliberate change, not a regression: the
    requester asked for execution report content only.
  - `/api/executions` still returns `id`.
- **D3. Keep the streaming and oms-core default lists as two copies.** They are pinned by
  tests on both sides, as SPEC-0041 established. A shared constant would need oms-contracts, for a
  display concern.
- **D4. No UI code change.** `ColumnConfigService` already skips unknown saved names; the new test
  pins that.
- **No new dependencies or build changes.**

## Risks & Mitigations

- **A user had saved a removed column.** It disappears, along with its empty values. This is the
  intended outcome and is pinned by AC-5.
- **Live mode and `status`.** `status` is not streamed, so in Live mode it is named "History only",
  as other non-streamed fields are today. It is not a default column.
- **A later ticket fills a removed field and forgets to add it back.** The class comment names the
  list, and SPEC-0030 is the known case.

## Test Strategy

| AC | Level | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | unit + web | `MetamodelServiceTest#executionMetamodelOffersExecutionReportFieldsOnly`; `ExecutionBlotterIntegrationTest#metamodelEndpointServesExecIdPrimaryKey` | Exactly the 11 fields in order; none of the 11 removed names; the same over HTTP |
| AC-2 | unit + web | `MetamodelServiceTest#executionMetamodelUsesExecIdAndResolvableDefaults`; `ExecutionBlotterIntegrationTest#metamodelEndpointServesExecIdPrimaryKey` | `defaultColumns` is the 10-column list; every default is an offered field |
| AC-3 | integration | `ExecutionBlotterIntegrationTest#executionReportFieldsAreFilled` | After two fills over the command API, every offered field and every default column is non-null in each `/api/executions` row |
| AC-4 | unit (streaming) | `OrderExecutionMapperTest#executionDtoCarriesAllBlotterDefaultColumns` | Every one of the 10 defaults, `lastMkt` included, is non-null on the streaming `ExecutionDto` |
| AC-5 | unit (oms-ui, Jest) | `ColumnConfigService.test.ts` "skips a saved column that is no longer offered" | `getColumnConfig('Execution', ['dayAvgPx', 'lastQty'])` returns only the `lastQty` column and does not throw |
| AC-6 | gate | `spec verify` (oms-core, oms-streaming-service, oms-ui checks, and the others configured); `okf-check oms-knowledge-base` | All pass; 0 knowledge base errors |

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | No contract changes |
| P-02 | Specification before code, generated models only | comply | The proposal and design come first. The metamodel DTOs are hand-written oms-core types, as today |
| P-03 | Never edit generated code | comply | None touched |
| P-04 | Contracts evolve compatibly | comply | Data APIs are unchanged. Metamodel content changes inside the same response shape, and the only consumer, oms-ui, skips unknown names (AC-5) |
| P-05 | Every state change is recorded in the event log | n/a | No state changes |
| P-06 | Kafka only through the transactional outbox | n/a | No messages |
| P-07 | Schema changes through new Liquibase changesets | n/a | No schema change |
| P-08 | Concurrency and idempotency are explicit | n/a | Static metadata |
| P-09 | Commands and queries stay separate | n/a | Neither changes |
| P-10 | State transitions go through the state machine and task pipeline | n/a | None |
| P-11 | Layering and conventions | comply | The change stays in `MetamodelService`, the existing home of blotter metadata |
| P-12 | Jackson 3 only | n/a | No JSON mapping code |
| P-13 | Errors and validation follow the framework specs | comply | A misconfigured field name is logged and skipped, as before, and caught by a test |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Test Strategy covers AC-1 to AC-6, tests written first |
| P-15 | Observability | n/a | No runtime behaviour |
| P-16 | Security | n/a | No new input or exposure |
| P-17 | Simplicity and dependencies | comply | An allow-list constant; no dependencies |
| P-18 | Modules build standalone | comply | Each module's tests hold their own expectations (D3) |
| P-19 | Documentation follows behaviour | comply | `ui/admin-ui.md` and `log.md` |

## Knowledge Base Updates

- `oms-knowledge-base/ui/admin-ui.md`, "Executions columns":
  - the 11 offered fields with their FIX tags;
  - the 10 defaults, with `lastMkt` added;
  - the fields not offered and why (never filled, or internal), with the APIs unchanged;
  - `id` is no longer selectable (D2);
  - `status` is History only in Live mode.
- `oms-knowledge-base/log.md`: an entry for SPEC-0068.
