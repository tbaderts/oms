# Proposal — SPEC-0003: Store venue reject reason on the order

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

When the market refuses something, the OMS should keep the reason, and traders should be able to
see it. Today (after SPEC-0001) the reason does arrive. The exchange simulator sends it in the
`text` field of `OrderRejectCmd`, `OrderCancelCmd` and `OrderCancelRejectCmd`. The problem is what
`ApplyLifecycleActionTask` does with it: it copies the reason into `order.text`, the client's own
FIX Text (58) on the order, and overwrites it.

Evidence from 2026-10-25: order `20261025-test-001` was created with text "Sample order". After
the reject it showed `text = "Unknown symbol INTC"`, and the client's text was gone. Nothing in
the order model or the UI separates the venue's reason from the client's note. A trader cannot
tell whether `text` is their own note or an error from the market.

FIX itself keeps them apart. The venue's reason travels on the ExecutionReport or OrderCancelReject
in Text (58), and optionally as a code: OrdRejReason (103) for an order reject, CxlRejReason (102)
for a refused cancel. It never changes the client's order text.

If we do nothing, client text keeps being destroyed by every reject, and rejects stay hard to
diagnose from oms-ui. See the ticket Goal.

## What Changes

- **New field on the order: `rejectReason`.** Optional free text, at most 255 characters. It holds
  the most recent reason the venue gave for refusing the order or a cancel request (FIX Text 58
  from the venue). It is part of the order model, the `orders` table, `OrderMessage` (Avro), the
  query API `Order` schema and oms-ui.
- **Reject commands write the new field.** `OrderRejectCmd` and `OrderCancelRejectCmd` write their
  `text` into `rejectReason`, no longer into `order.text`.
- **No lifecycle command touches `order.text` any more.** It stays exactly what the client sent.
  The reason a venue gives for a successful cancel (`OrderCancelCmd.text`) is not an error. It
  stays recorded with the command in the event log but is not stored on the order.
- **A new cancel request clears the field.** `OrderCancelRequestCmd` clears `rejectReason`, so a
  pending cancel never shows the reason from an earlier refused request.
- **oms-ui shows the field.** Both blotters (query and streaming) offer `rejectReason` as a
  column, and the order detail panel shows it.
- The exchange simulator already sends a reason on every reject and cancel reject. Its behaviour
  does not change; this ticket proves the reasons reach the order.

No breaking changes: every contract change is an additive, optional field.

## Scope

### In scope

- `rejectReason` on: the Order entity and a new Liquibase changeset; `OrderMessage.avsc`; the query
  API `Order` schema; the oms-core mappers.
- Changing the lifecycle tasks to write `rejectReason` instead of `text`.
- Carrying the field through oms-streaming-service to the UI. oms-ui: blotter column, detail
  panel, streaming types.
- Tests and knowledge-base updates (order-lifecycle.md, exchange-simulator.md, domain model).

### Out of scope

- **FIX reason codes** (OrdRejReason 103, CxlRejReason 102): deferred. The simulator does not
  produce codes yet; free text is what was asked for.
- **Backfilling old orders:** existing rows whose `text` was overwritten keep it; the field starts
  empty for them.
- **A reject or error history on the order:** the field holds only the latest reason. The full
  history already exists in `order_events`, with each command's text.
- **Errors that are not from a venue:** OMS-side validation failures on order create still return
  HTTP 400 and never create an order.

## Acceptance Criteria

- **AC-1** — Given an UNACK order created with `text = "Sample order"`, when an `OrderRejectCmd`
  with `text = "Unknown symbol ZZZZ"` is applied, then the persisted order has `state = REJ`,
  `rejectReason = "Unknown symbol ZZZZ"` and `text = "Sample order"`.
- **AC-2** — Given a LIVE order with a pending cancel (PCXL) and client text "Sample order", when
  an `OrderCancelRejectCmd` with `text = "Too late to cancel"` is applied, then the order has
  `cancelState = REJ`, `rejectReason = "Too late to cancel"` and `text = "Sample order"`.
- **AC-3** — Given a LIVE order with client text "Sample order", when an `OrderCancelCmd` with
  `text = "IOC order not marketable"` is applied, then the order has `state = CXL`,
  `text = "Sample order"` and `rejectReason` null.
- **AC-4** — Given a LIVE order whose `rejectReason` was set by an earlier cancel reject, when a
  new `OrderCancelRequestCmd` is applied, then `cancelState = PCXL` and `rejectReason` is null.
- **AC-5** — Given a reject text longer than 255 characters, when the reject is applied, then
  `rejectReason` holds its first 255 characters and the order is still rejected.
- **AC-6** — Given the exchange simulator and oms-core running against Kafka, when an order for an
  unknown symbol is created, then the order published on the orders topic has `rejectReason`
  "Unknown symbol <symbol>", and the query API returns the same `rejectReason` for that order.
- **AC-7** — Given an order with `rejectReason` set, when it reaches oms-ui through the query
  API or the streaming service, then the column selector offers a "Reject Reason" column showing
  the value, and the order detail panel displays it.
- **AC-8** — Given the previous `OrderMessage` schema and query API, when the new versions are
  built, then the schemas are backward compatible (additive optional field). `./gradlew check`
  passes in oms-contracts and every consumer (oms-core, oms-streaming-service, oms-mcp-server,
  oms-exchange-simulator), and the oms-ui tests pass.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-contracts, oms-core, oms-streaming-service, oms-ui, oms-exchange-simulator (tests only), oms-knowledge-base |
| Contracts (OpenAPI / Avro) | Additive: optional `rejectReason` on `OrderMessage.avsc` and on the query API `Order` schema. Command schemas unchanged (they already carry `text`). |
| Data (tables, migrations) | New nullable column `orders.reject_reason varchar(255)` through a new Liquibase changeset (005). No backfill. |
| Events / Kafka topics | `OrderMessage` on the orders topic gains the optional field. `order_events` snapshots include it automatically. |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-ui: new column and detail field. oms-streaming-service: maps the field through. oms-mcp-server: picks it up from the regenerated query model, no code change expected. |
| Knowledge base | order-lifecycle.md (§4.5, §4.9.1), exchange-simulator.md, execution-reporting.md, domain-model_spec.md |

## Open Questions

- [resolved] Is there something in FIX for this? → Yes. The venue's reason travels as Text (58)
  on the ExecutionReport (ExecType=8) or the OrderCancelReject. Codes are OrdRejReason (103) and
  CxlRejReason (102). This ticket stores the text; codes are deferred (see Out of scope).
- [resolved] Field name and meaning → assumption: `rejectReason`, holding the latest refusal by
  the venue (order reject or cancel reject). A successful cancel is not an error, so its reason is
  not stored on the order. Cheap to rename before implementation; please confirm when you approve.
- [resolved] Should a later successful step clear the reason? → assumption: only a new cancel
  request clears it (AC-4). A REJ order keeps its reason. After a cancel reject, a later fill keeps
  the reason until the next cancel request.
- [deferred] Repair orders whose `text` was overwritten before this change → safe to defer: these
  are development and test orders only; no production data exists.
