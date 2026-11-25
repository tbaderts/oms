# Proposal — SPEC-0069: Carry the FIX instrument block on executions

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The requester ([ticket Goal](./ticket.md)):

> execution report (FIX protocol) has an instrument block that is mandatory (either symbol or
> securityId). so execution should have whatever came back from exchange/simulator. if it's missing
> there, we can add it.

**Today.** An execution in the OMS has no instrument at all:

- **Contract.** The fill command's `Execution` (`oms-cmd-api.yml`) and the Avro `Execution` record
  on `oms_executions` have no `symbol`, `securityId` or `securityIdSource`.
- **Storage.** The `executions` table and the JPA entity `org.example.common.model.Execution` have
  no instrument columns ([Execution](../../../oms-knowledge-base/domain/model/execution.md)).
- **Simulator.** `oms-exchange-simulator` prices each fill from the order's symbol
  (`OrderEvaluator`), but `CommandGateway.fill` builds the `Execution` without it.
- **Validation.** `ValidateExecutionTask` requires `orderId`, `execId`, `lastQty` and `lastPx`; any
  fill without an instrument is applied.

In FIX the ExecutionReport's Instrument component is required: Symbol (55), or SecurityID (48) with
SecurityIDSource (22). Without it a fill read on its own — the REST execution blotter, the
`oms_executions` topic, the execution detail screen — cannot say what traded. Only
`order_execution_projection` and `oms_order_executions` carry an instrument, copied from the order,
and those are meant for booking and other downstream systems, not for the UI (SPEC-0071).

**Cost of doing nothing.** The execution blotter cannot show or filter fills by instrument without
joining to orders. A venue that reports a fill on the wrong instrument goes unnoticed: the OMS
applies it to the order regardless.

## What Changes

- **Contract, additive.** The fill command's `Execution` and the Avro `Execution` record gain
  `symbol`, `securityId` and `securityIdSource` (FIX 55, 48, 22), all optional in the schema.
  Avro fields are nullable with a `null` default, so existing readers and writers stay compatible.
- **Validation, BREAKING for fill producers that send no instrument.** oms-core refuses a fill that
  carries neither `symbol` nor `securityId`, and a fill whose instrument contradicts its order's
  (a different `symbol`, or a different `securityId` when both have one). A refused fill changes
  nothing and is reported as refused, like any other invalid fill. Producers that break: the
  exchange simulator (fixed in this ticket), the developer cockpit's API templates and
  `oms-core/rest.http` (updated in this ticket), and any external caller of `POST` fill commands.
- **Storage.** `executions` gains `symbol`, `security_id` and `security_id_source`, stored as the
  venue reported them. Existing rows are backfilled from their order, so no fill is left without
  an instrument.
- **Publication.** The `Execution` published on `oms_executions` carries the stored instrument.
- **Simulator.** Every fill the exchange simulator reports carries the order's `symbol`, and its
  `securityId` and `securityIdSource` when the order has them.
- **oms-ui.** The execution metamodel offers `symbol` and `securityId` as columns and filters, and
  the execution detail screen shows them in an Instrument section.
- **Knowledge base.** The execution model page, execution processing and the validation rules
  describe the instrument block.

## Scope

### In scope

- `oms-contracts`: the three fields on the command `Execution` and the Avro `Execution`.
- `oms-core`: Liquibase change with backfill, entity, mapping from the command, validation in
  `ValidateExecutionTask`, publication on `oms_executions`, metamodel, tests.
- `oms-exchange-simulator`: the instrument on every fill.
- `oms-ui`: Instrument section in the execution detail layout; columns come from the metamodel.
- `developer-cockpit` API templates and `oms-core/rest.http`: example fills carry a symbol.
- `oms-knowledge-base`: execution model, execution processing, validation engine pages, `log.md`.

### Out of scope

- The other FIX Instrument fields (SecurityExchange, maturity, strike, …): the OMS's orders do not
  carry them as matching keys today.
- The streaming execution stream: it reads `oms_order_executions` today; moving it to
  `oms_executions` is SPEC-0071.
- A specified executions query API: SPEC-0070.
- Changing `order_execution_projection` or `oms_order_executions`; they already carry the order's
  instrument.
- Instrument reference data or symbology mapping (translating a venue's securityId to a symbol).

## Acceptance Criteria

- **AC-1** — Given a LIVE order for `MSFT`, when a fill command arrives with `symbol` `MSFT`,
  `securityId` `US5949181045` and `securityIdSource` `ISIN`, then the command is applied and the
  stored `executions` row and the `Execution` record published on `oms_executions` carry those three
  values.
- **AC-2** — Given a LIVE order for `MSFT` with `securityId` `US5949181045`, when a fill command
  arrives with only `securityId` `US5949181045` (no `symbol`), then the fill is applied and stored
  with that `securityId` and no `symbol`.
- **AC-3** — Given a LIVE order, when a fill command arrives with neither `symbol` nor `securityId`,
  then the command is refused with a message naming the missing instrument, no `executions` row is
  written, and the order's `cumQty`, `leavesQty`, state and `order_events` are unchanged.
- **AC-4** — Given a LIVE order for `MSFT`, when a fill command arrives with `symbol` `AAPL`, then
  the command is refused with a message naming both symbols, and nothing about the order changes.
  The same holds for a `securityId` that differs from the order's when both have one.
- **AC-5** — Given `executions` rows stored before this change, when the Liquibase migration runs,
  then every row has its order's `symbol`, and its `securityId` and `securityIdSource` where the
  order has them.
- **AC-6** — Given the exchange simulator and oms-core running, when the simulator fills an order,
  then the fill is applied (not refused) and the stored execution carries the order's `symbol`.
- **AC-7** — Given oms-core's metamodel, when oms-ui requests `GET /api/v1/metamodel/Execution`,
  then `symbol` and `securityId` are among the offered fields; and the execution detail screen,
  given an execution with a `symbol`, shows it in an Instrument section.
- **AC-8** — Given a consumer reading `oms_executions` with the schema registered before this
  change, when an `Execution` with the new fields is published, then the consumer deserialises it
  without error (backward compatibility, checked by the contract compatibility test).

## Impact

| Area | Impact |
|---|---|
| Modules | oms-contracts, oms-core, oms-exchange-simulator, oms-ui, oms-knowledge-base; developer-cockpit templates (no code). oms-streaming-service is verified but not changed. |
| Contracts (OpenAPI / Avro) | `oms-cmd-api.yml` `Execution` and `Execution.avsc`: three optional fields, additive in the schema. Validation makes an instrument required (**BREAKING** for producers that send none). |
| Data (tables, migrations) | `executions`: three nullable columns, backfilled from `orders`. No information lost. |
| Events / Kafka topics | `oms_executions` records carry the instrument. No new topic. |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-ui gains columns and a detail section. Fill producers must send an instrument (simulator, cockpit templates, `rest.http`, external callers). oms-mcp-server only reads; unaffected. |
| Knowledge base | `domain/model/execution.md`, `capabilities/execution-processing.md`, `framework/validation-engine.md`, `log.md` |

## Open Questions

- [resolved] Must a fill carry an instrument, or is it optional? → assumption: required (symbol or
  securityId), as the Goal and FIX say. A fill without one is refused. Needs the requester's
  confirmation at proposal approval, since it breaks producers that send none.
- [resolved] What happens when the fill's instrument differs from the order's? → assumption: the
  fill is refused, so a venue error cannot move the order's quantities on the wrong instrument.
  The alternative, applying it and flagging it, is a risk decision for the requester at approval.
- [resolved] Which instrument fields? → assumption: `symbol`, `securityId`, `securityIdSource`, the
  ones the order carries and FIX requires; the rest of the Instrument block is out of scope.
- [resolved] What about fills stored before this change? → assumption: backfill from their order,
  which is the instrument they were applied to.
- [deferred] Comparing a fill's `securityId` against an order that has only a `symbol` needs
  symbology mapping → safe to defer: such a fill is accepted on its `securityId` alone (AC-4 only
  checks equality when both sides have one).
