# Proposal — SPEC-0068: Fill or remove empty execution blotter columns

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The requester sees execution blotter columns without values. After clarifying (2026-11-17):

> execution should not have order fields. but it should display all the execution relevant stuff
> like last price, avg price, last qty and cum/leaves qty (whatever is on the FIX execution report
> message that would be relevant here)

**Today.** oms-ui's execution blotter, in both REST and Streaming mode, takes its columns from
oms-core's metamodel (`GET /api/v1/metamodel/Execution`). `MetamodelService.buildExecutionMetadata`
offers every field of the JPA entity `org.example.common.model.Execution`, 22 in all. Many of them
are never filled. In the local database (9,425 executions, counted on 2026-11-16) these columns are
null in every row:

| Field | FIX | Why it is empty |
|---|---|---|
| `dayOrderQty`, `dayCumQty`, `dayAvgPx` | 424, 425, 426 | Day-order statistics for multi-day orders; the OMS never computes them |
| `secondaryExecID` | 527 | Never set |
| `creationDate` | — | Never set |
| `execRefId` | 19 | Only for a bust or correction, which does not exist yet (SPEC-0030) |
| `lastCapacity` | 29 | Accepted by the fill command, but the exchange simulator never sends it |

The fields with values in every row are:
- `execId`, `orderId`, `execType`, `lastQty`, `lastPx`, `cumQty`, `leavesQty`, `avgPx`, `lastMkt`
  and `transactTime`, which are FIX ExecutionReport fields;
- `id`, `status`, `orderVersion` and `rootOrderId`, which are internal.

`bustedAtVersion` is internal too, and stays empty until a fill is busted.

The default columns are already filled, but the column chooser offers the empty ones. `lastMkt`, a
filled FIX field, is not a default column. The result is blank columns, and a blotter that does not
read like an execution report.

## What Changes

- **The execution metamodel offers the execution report fields the OMS records.** In FIX order:
  - `execId` (17), `orderId` (37), `execType` (150);
  - `lastQty` (32), `lastPx` (31), `lastMkt` (30);
  - `leavesQty` (151), `cumQty` (14), `avgPx` (6);
  - `transactTime` (60);
  - plus `status`, the OMS's own record of whether the fill is applied.

  These are the column chooser and filter options in both REST and Streaming mode.
- **Fields that are never filled, and internal bookkeeping, are no longer offered.** That is
  `dayOrderQty`, `dayCumQty`, `dayAvgPx`, `secondaryExecID`, `creationDate`, `execRefId`,
  `lastCapacity`, `bustedAtVersion`, `orderVersion`, `rootOrderId` and the surrogate `id`.
  - They stay in the entity, the database and the APIs; only the blotter stops offering them.
  - A later ticket that fills one, such as SPEC-0030 with `execRefId`, adds it back.
- **Default columns:** `execId`, `orderId`, `execType`, `lastQty`, `lastPx`, `lastMkt`, `cumQty`,
  `leavesQty`, `avgPx` and `transactTime`. That is today's set plus `lastMkt`, in the order a
  trader reads a fill.
- **No order fields are added to execution rows.**
- **Saved column choices that name a removed field** are skipped, as today for unknown fields. The
  blotter shows the remaining saved columns.

No **BREAKING** change: `/api/executions` and the streaming payloads keep every field.

## Scope

### In scope

- `oms-core`: `MetamodelService.buildExecutionMetadata` (the offered fields and the defaults) and
  `MetamodelServiceTest`.
- `oms-streaming-service`: `OrderExecutionMapperTest`, which holds a copy of the default columns
  (per the comment in `MetamodelService`). It also checks that the streaming `ExecutionDto` carries
  every default column, `lastMkt` included.
- `oms-ui`: a test that a saved column list naming a removed field still renders the others. That
  is existing behaviour (`ColumnConfigService.getColumnConfig` skips unknown names), now covered.
- `oms-knowledge-base`: the execution blotter documentation and `log.md`.

### Out of scope

- **Order fields on execution rows**, at the requester's direction.
- **Computing the day-order fields**, or making the exchange simulator send `LastCapacity`.
- **Busts and corrections** (`execRefId`, `bustedAtVersion`): SPEC-0030.
- **Removing fields from the entity, the database or the APIs.**
- **The order blotter's columns.**
- **The local database being empty since 2026-11-17 06:31.** It was reported to the requester
  separately and is unrelated to this ticket.

## Acceptance Criteria

- **AC-1** — Given oms-core, when `GET /api/v1/metamodel/Execution` is called, then `fields` lists
  exactly these, in this order:
  - `execId`, `orderId`, `execType`;
  - `lastQty`, `lastPx`, `lastMkt`;
  - `leavesQty`, `cumQty`, `avgPx`;
  - `transactTime`, `status`.

  None of the removed fields is offered: `dayOrderQty`, `dayCumQty`, `dayAvgPx`,
  `secondaryExecID`, `creationDate`, `execRefId`, `lastCapacity`, `bustedAtVersion`,
  `orderVersion`, `rootOrderId` and `id`.
- **AC-2** — Given oms-core, when `GET /api/v1/metamodel/Execution` is called, then
  `defaultColumns` is `execId`, `orderId`, `execType`,
  `lastQty`, `lastPx`, `lastMkt`, `cumQty`, `leavesQty`, `avgPx`, `transactTime`. Every default
  column is an offered field.
- **AC-3** — Given fills applied through the command API, when they are read with
  `GET /api/executions`, then:
  - every default column has a value in `GET /api/executions` for each of them;
  - every offered field has a value too.
- **AC-4** — Given a fill streamed by oms-streaming-service, when it is mapped to the streaming
  `ExecutionDto`, then every default column has a value. The streaming service's copy of the
  default list matches oms-core's.
- **AC-5** — Given oms-ui with saved execution columns that include a removed field (for example
  `dayAvgPx` and `lastQty`), when the blotter builds its columns, then:
  - the removed field is skipped without an error;
  - the other saved columns are shown.
- **AC-6** — Given the whole change, when the checks run, then all of these pass:
  - `oms-core`, `oms-streaming-service` and `oms-ui` checks;
  - `okf-check oms-knowledge-base`, with 0 errors.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-core, oms-streaming-service (test), oms-ui (test), oms-knowledge-base |
| Contracts (OpenAPI / Avro) | none. The metamodel endpoint is not an OpenAPI contract, and its response shape is unchanged; only its content changes |
| Data (tables, migrations) | none |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-ui's execution column chooser and filters offer 11 fields instead of 22, and `lastMkt` becomes a default column. Users who had saved a removed column lose that column, and its empty values with it |
| Knowledge base | the execution blotter page (ui or capabilities) and `log.md` |

## Open Questions

- [resolved] Which fields count as "execution relevant"? → assumption: the FIX ExecutionReport
  fields that describe the fill and the order's position after it, and that the OMS records. That
  is ExecID, OrderID, ExecType, LastQty, LastPx, LastMkt, LeavesQty, CumQty, AvgPx and
  TransactTime, plus the OMS `status` (applied or reversed), which is always filled.
- [resolved] Keep `lastCapacity` (FIX 29), which is relevant but never sent today? → assumption:
  no, not until the simulator or a venue sends it; showing an always-empty column is what the
  requester objected to. Making the simulator send it is a cheap follow-up if wanted.
- [resolved] Keep the internal `orderVersion`, `rootOrderId` and `id`? → assumption: no. They are
  OMS bookkeeping, not execution report content, and `rootOrderId` belongs to the order.
  Re-adding any of them is a one-line change.
- [resolved] Hide the removed fields, or delete them? → assumption: hide them from the blotter
  only. The entity, the database and the APIs keep them, for SPEC-0030 and for compatibility.
