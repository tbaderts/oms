# Proposal — SPEC-0046: Add command log and refuse duplicates everywhere

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The event log records every command that **changed** an order (`order_events.transaction`). A
command that was **refused or failed** leaves no durable trace (review
`oms-core/docs/event-sourcing-cqrs-review-2026-11-07.md`, finding F-2, severity H). A refusal
marks the transaction rollback-only, so the only evidence is a log line and, on Kafka only, a
counter increment (`oms.commands.consumed{outcome=refused}`). Operations cannot answer "did the
venue's cancel ever reach us, and why was it refused?" from the database, and an auditor cannot
see the asks the OMS turned down. Target architecture sections 4.2 and 5.4 call for a `command_log`
of every ask and its outcome, surviving the rollback.

Duplicate handling is uneven:
- **Lifecycle commands** are refused by commandId (`DeduplicateCommandTask`).
- **Other paths** hit the unique constraint `uq_order_events_order_id_command_id` when a commandId
  is reused (F-13). On REST that is a generic 409 or 400. On Kafka it is a failure that can be
  retried and dead-lettered instead of acknowledged.
- **Accept** bypasses the lifecycle pipeline altogether (F-20): no dedup task, its own validation,
  and direct calls to the appender, against P-10.
- **Fills** still have a command-less entry point, `ExecutionCommandProcessor.process(Execution)`,
  which records fill events with no command.

Doing nothing leaves refusals invisible. SPEC-0048 (several instances) builds on a single dedup
and logging path and depends on this ticket.

## What Changes

- **`command_log` table.** One row per command attempt, whatever its outcome, with these columns:
  `command_id`, `type`, `order_id`, `received_at`, `source`, `principal`, `outcome`, `reason` and
  `event_version`.
  - `source` is `REST`, `KAFKA` or `SCHEDULER`.
  - `outcome` is `APPLIED`, `REFUSED` or `FAILED`.
  - `event_version` is the event the command appended, when it applied.

  Every entry point writes it: the REST command API, the Kafka command listener, end-of-day close
  and the expiry scheduler.
  - **Refused and failed rows** are written in their own `REQUIRES_NEW` transaction after the
    result is known, so they survive the command's rollback.
  - **Applied rows** are written in the command's own transaction (see Open Questions).
- **New query operation** `GET /api/query/orders/{orderId}/commands` in `oms-query-api.yml`
  (additive). It returns the order's command log, oldest first.
- **Duplicate-command refusal everywhere.** A command whose commandId the order has already applied
  is refused with a typed duplicate-command refusal on every path: lifecycle, accept and fill.
  - On REST it answers **409** with the Problem+JSON type `urn:oms:error:duplicate-command`.
  - On Kafka it is **acknowledged** and counted as refused, not retried or dead-lettered.
  - A race that reaches `uq_order_events_order_id_command_id` maps to the same refusal.
  - The REST status of the lifecycle duplicate refusal changes from 400 to 409; see Open
    Questions. `oms-cmd-api.yml` declares the 409 response (additive documentation).
- **Accept joins the lifecycle pipeline** as `LifecycleAction.ACCEPT` (UNACK → LIVE, event `ACK`,
  market-ack SLA stamp). It is loaded, deduplicated, validated against the state machine, applied,
  saved and recorded by the same tasks as every other lifecycle command.
  `OrderAcceptCommandProcessor` is removed. An accept is still refused unless the order is UNACK,
  as SPEC-0044 requires.
- **`ExecutionCommandProcessor.process(Execution)` is removed.** Every caller passes the command,
  so every fill event stores its command.

## Scope

### In scope

- The `command_log` table (new Liquibase changeset), its entity, repository and writer, and the
  writes from every entry point.
- The query operation `getOrderCommands` (contract, generated API, controller, read service).
- `DuplicateCommandException`, the constraint mapping, its REST handler (409) and its Kafka
  handling (acknowledge).
- Dedup by commandId on the fill path.
- `LifecycleAction.ACCEPT`, moving the accept dispatch onto the lifecycle processor on REST and
  Kafka, and removing `OrderAcceptCommandProcessor`.
- Removal of the command-less fill overload, with its callers and tests updated.
- Knowledge base: a command-log page, plus updates to the order-lifecycle, execution-processing,
  error-handling and query-API pages.

### Out of scope

- Authentication. REST has no authenticated principal today, so `principal` is null for REST
  commands.
- Retention, partitioning or archival of `command_log` (SPEC-0052).
- Undecodable Kafka records. They are not commands; their trace remains the dead-letter topic.
- Deduplicating `OrderCreateCmd` by commandId. A create has no order yet; the existing
  `(sessionId, clOrdId)` constraint keeps doing that job.
- Locking changes and multi-instance safety (SPEC-0048). Expected version on commands (SPEC-0050).
- A UI for the command log.

## Acceptance Criteria

- **AC-1** — Given a LIVE order, when an `OrderCancelRequestCmd` with commandId `C-1` is applied
  over REST, then `GET /api/query/orders/{orderId}/commands` returns an entry with commandId `C-1`,
  type `OrderCancelRequestCmd`, source `REST`, outcome `APPLIED`, a null reason, and `eventVersion`
  equal to the version of the `CXL_REQUEST` event it appended.
- **AC-2** — Given a LIVE order with a cancel already pending, when a second `OrderCancelRequestCmd`
  with a new commandId is sent over REST, then:
  - the response is 400;
  - no `order_events` row is added;
  - the command log has an entry for that commandId with outcome `REFUSED` and a reason that names
    the refusal, and that entry persists although the command rolled back.
- **AC-3** — Given an UNACK order, when an `OrderAcceptCmd` arrives on the Kafka command topic,
  then the order becomes LIVE with an `ACK` event and the command log has an entry with source
  `KAFKA`, the header's commandId, principal equal to the header's `producer`, outcome `APPLIED` and
  the `ACK` event's version. Given a Kafka `OrderCancelRejectCmd` for an order with no pending cancel,
  then it is acknowledged (not dead-lettered) and logged `REFUSED`.
- **AC-4** — Given an `ExecutionCreateCmd` on Kafka for an order that does not exist, when it is
  consumed, then it reaches the dead-letter topic, and the command log has at least one entry for
  its commandId with outcome `FAILED`, the command's orderId and a reason naming the missing order.
- **AC-5** — Given a FILLED order before the end-of-day cutoff, when the end-of-day close runs, then
  the command log has an entry for its `OrderCloseCmd` with source `SCHEDULER`, principal
  `oms-core:end-of-day`, outcome `APPLIED` and the `CLOSE` event's version. The scheduled expiry
  logs its `OrderExpireCmd` the same way with principal `oms-core:expiry`.
- **AC-6** — Given an order with a fill applied by a command with commandId `F-1`, when another
  `ExecutionCreateCmd` with commandId `F-1` and a different execId arrives, then:
  - over REST, the answer is 409 with type `urn:oms:error:duplicate-command`;
  - over Kafka, it is acknowledged, not dead-lettered, and counted
    `oms.commands.consumed{outcome=refused}`;
  - on both paths, no execution, event or outbox row is written, and the command log has a
    `REFUSED` entry whose reason says duplicate.
- **AC-7** — Given a lifecycle command with commandId `C-2` already applied to an order, when it is
  sent again over REST, then the answer is 409 with type `urn:oms:error:duplicate-command`, nothing
  is written to the order, and the command log has a `REFUSED` entry for the repeat.
- **AC-8** — Given an UNACK order, when an `OrderAcceptCmd` with commandId `A-1` is applied over REST,
  then:
  - the answer is 200, the order is LIVE with `marketAckTime` set, and there is one `ACK` event;
  - a repeat of `A-1` answers 409 duplicate-command;
  - an accept with a new commandId on the now LIVE order answers 400 and writes nothing;
  - an accept on a FILLED order answers 400.
- **AC-9** — Given fills applied over REST and over Kafka, when their `PARTIAL_FILL` or `FILL` events
  are read, then every one has a non-null `transaction` holding the `ExecutionCreateCmd`.
- **AC-10** — Given the query API, when `GET /api/query/orders/{orderId}/commands` is called for an
  order with no logged commands, then it answers 200 `[]`. Each entry has only the contracted
  properties, entries are ordered by `receivedAt` and then by insertion, and `/v3/api-docs`
  declares the operation `getOrderCommands`.
- **AC-11** — Given the command-log write of a refused command fails, when the command is
  processed, then the command's own result is unchanged (same response or acknowledgement), and
  the counter `oms.command_log.write_failures` increases by one.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-contracts, oms-core, oms-knowledge-base (set on the ticket); consumers verified per `specs/config.json` |
| Contracts (OpenAPI / Avro) | `oms-query-api.yml`: new operation `getOrderCommands` and schemas `CommandLogEntryDto`, `CommandSource`, `CommandOutcome`. Additive, version 2.3.0. `oms-cmd-api.yml`: a declared 409 response on `/execute`. Additive documentation of a status already answered for conflicts, version 3.3.0. No Avro change |
| Data (tables, migrations) | New table `command_log` with indexes on `(order_id, received_at)` and `command_id`. New changeset, with a rollback that drops it. No existing data changes |
| Events / Kafka topics | No new topic or schema. Duplicate commands are acknowledged instead of retried or dead-lettered |
| Consumers (oms-ui, oms-mcp-server, downstream) | REST clients: a repeated lifecycle command answers 409 instead of 400, and a duplicate fill answers 409 instead of 400. Accept responses keep their status codes and message. The exchange simulator (Kafka) sees no change. The new query operation is optional for every consumer |
| Knowledge base | New `domain/command-log.md`. Updates to `oms-concepts/order-lifecycle.md` (ACCEPT as a lifecycle action), `capabilities/execution-processing.md`, `oms-framework/error-handling.md` (duplicate-command 409), `interfaces/query-api.md` and FR-010 (dedup on every path) |

## Open Questions

- [resolved] Should applied commands be logged in a `REQUIRES_NEW` transaction too, as the goal's
  wording says for every path? → assumption: no. An `APPLIED` row is written in the command's own
  transaction, so it exists exactly when the change committed. A separate transaction could commit
  "APPLIED" for a command whose own transaction then fails to commit. `REFUSED` and `FAILED` rows
  use `REQUIRES_NEW` as the goal says, since the command's transaction rolls back. **Please confirm
  at approval.**
- [resolved] Should a repeated lifecycle command (today 400 "Duplicate command …") also answer 409?
  → assumption: yes. One duplicate-command refusal with one status on every path is the goal's
  intent, and 409 is the status a conflict with already-applied state gets elsewhere. It is a
  visible change for REST clients that test for 400. **Please confirm at approval.**
- [resolved] How is a retried Kafka failure logged? → assumption: one `FAILED` row per attempt, then
  an `APPLIED` row if a retry succeeds. The log records attempts, not just final outcomes, and
  `command_log` has no uniqueness on `command_id`. A concurrency conflict that is retried is logged
  `FAILED` with its reason.
- [resolved] What is the principal on each path? → assumption: REST null (no authentication
  exists); Kafka the header's `producer`; scheduler `oms-core:end-of-day` or `oms-core:expiry`.
- [resolved] A refused `OrderCreateCmd` has no orderId; where does its row go? → assumption: it is
  logged with a null `order_id`. It is not visible through the per-order operation, which is
  acceptable until a search over the log is needed.
- [resolved] What if writing a REFUSED or FAILED row itself fails? → assumption: the command's
  outcome stands. The failure is logged and counted (`oms.command_log.write_failures`, AC-11),
  because losing an audit row must not turn a refusal into a different answer.
