# Proposal — SPEC-0044: Record execution lifecycle in the order event log

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

An execution is an entity inside the order aggregate: a fill is recorded as a `PARTIAL_FILL` or
`FILL` event on the order, with the `ExecutionCreateCmd` stored in `order_events.transaction`
(review `oms-core/docs/event-sourcing-cqrs-review-2026-11-07.md`, section 4.1; target architecture
`oms-core/docs/target-architecture.md`, section 4.1). That boundary is right, but the log cannot
yet carry an execution's lifecycle (finding F-1, severity H):

- **Not addressable.** "Every event about execution X" needs a JSON scan of `transaction`. The
  projection rebuilder does exactly that (`ProjectionRebuilder.execIdOf`) and falls back to
  matching fills by position for fills recorded before SPEC-0018.
- **No event types.** `Event` has no bust, correction or whack, and the order state machine has no
  `FILLED → LIVE` for a bust that reopens quantity.
- **No status or version link.** `executions` has no `status`, `order_version`, `root_order_id`,
  `exec_ref_id` or `busted_at_version`. A busted fill would still count in
  `ExecutionRepository.sumNotionalByOrderId`, so the order's `avgPx` would be wrong.
- **No point-in-time executions.** `OrderReplayService.replayAt` gives the order at version n, but
  not the executions as of version n once a fill can be reversed later.

Finding F-11 adds that `CancelState` rules are hand-coded preconditions in
`ValidateLifecycleActionTask`, and the execution status would be a third set of hand-coded rules,
against policy P-10.

SPEC-0030 (bust and correction processors) depends on all of this. Without it, SPEC-0030 would
have to flag or delete execution rows ad hoc, and booking (the `oms_order_executions` consumer)
would get no reversal record keyed like the fill it reverses.

## What Changes

- `order_events` gains an `exec_id` column, set on every event about one execution, indexed on
  `(order_id, exec_id)` and backfilled for existing fill events.
- New event types `EXEC_BUST`, `EXEC_CORRECT` and `EXEC_WHACK` are recorded in `order_events` and
  exposed in the query contract's `OrderEventType`.
- The order state machine allows `FILLED → LIVE`. It is meant only for a bust that reopens
  quantity; SPEC-0030's pipeline is what guards that.
- `executions` gains `status` (`APPLIED`, `BUSTED`, `CORRECTED`), `order_version`,
  `root_order_id`, `exec_ref_id` and `busted_at_version`, backfilled for existing rows.
- A new fill records `exec_id` on its event and `status`, `order_version` and `root_order_id` on
  its execution.
- `OrderEventAppender` gains `appendExecutionLifecycleEvent` for bust, correction and whack. It
  appends the event with `exec_id`, updates the execution's status, and stages the order on
  `oms_orders` plus an `OrderExecution` record with `execType` `H` (bust, whack) or `G`
  (correction) on `oms_order_executions`, under the same key as the fill.
- The order's `avgPx` counts `APPLIED` executions only.
- `OrderReplayService.executionsAt(orderId, version)` returns the executions in force at that
  version.
- `GET /api/query/orders/{orderId}/events` takes an optional `execId` query parameter. Additive.
- Cancel-state rules and execution-status rules are `StateMachineConfig` instances, consulted
  instead of hand-coded conditions. Lifecycle commands are allowed and refused exactly as today.
- The projection rebuilder matches fill events to executions by `order_events.exec_id` only. The
  position-matching fallback is deleted.

No change is marked **BREAKING**. The three new `OrderEventType` values are additive, but a
consumer that maps the enum exhaustively must tolerate them (see Impact).

## Scope

### In scope

- One Liquibase changeset with the columns, indexes and backfills above, and a rollback.
- `Event`, `OrderStateMachineConfig`, a cancel-state and an execution-status `StateMachineConfig`,
  and `ValidateLifecycleActionTask` reading the cancel-state configuration.
- `Execution` and `OrderEvent` entity fields, `OrderEventAppender.appendExecutionEvent` and the new
  `appendExecutionLifecycleEvent`.
- `ExecutionRepository.sumNotionalByOrderId`, `OrderReplayService.executionsAt`.
- The `execId` filter and the new `OrderEventType` values in `oms-query-api.yml`, and their
  implementation.
- `ProjectionRebuilder` without the positional fallback.
- Knowledge-base pages: Execution, Order Event, Order State, the order-lifecycle and
  execution-reporting concepts, projections, and FR-015 and FR-016 status notes.

### Out of scope

- Bust, correction and whack **command processing**: no listener dispatch, no REST endpoint, no
  quantity recalculation, no validate task in a bust pipeline. That is SPEC-0030, which calls
  `appendExecutionLifecycleEvent`.
- What a bust publishes on `oms_executions` (SPEC-0030, change E5 of the booking paper).
- Changes to the order-execution projection table's row for a busted or corrected fill, and its
  unique key. Its rename is SPEC-0045. Positions are SPEC-0051.
- Rippling busts up an order tree (SPEC-0022).
- `exec_ref_id` population. The column exists; SPEC-0030 sets it on correcting fills.
- Event metadata, change diffs and reconciliation (SPEC-0049). Partitioning (SPEC-0052).
- An `execId` field in `OrderEventDto`.
- Avro changes. `execType` is already a string on `OrderExecution` and `Execution`.

## Acceptance Criteria

- **AC-1** — Given a database migrated to the schema before this change, holding an order whose
  `order_events` contain an `ACK`, a `PARTIAL_FILL` whose stored command carries execId `EX-1`, and
  a `FILL` with no stored command (a pre-SPEC-0018 REST fill), with `executions` rows `EX-1` and
  `EX-2` and an order-execution projection row for `EX-1` at order version 3, when the new
  changeset is applied, then `exec_id` is `EX-1` on the `PARTIAL_FILL`, `EX-2` on the `FILL` and
  null on the `ACK`; every `executions` row has `status` `APPLIED`, `order_version` equal to the
  version of its fill event and `root_order_id` equal to the order's root order id (its own order
  id when it has none); and an index on `order_events (order_id, exec_id)` exists.
- **AC-2** — Given a LIVE order, when an `ExecutionCreateCmd` for execId `EX-9` is applied, then
  the fill's `order_events` row has `exec_id` `EX-9`, and the `executions` row has `status`
  `APPLIED`, `order_version` equal to that event's `version`, `root_order_id` equal to the order's
  root order id, and null `exec_ref_id` and `busted_at_version`.
- **AC-3** — Given a FILLED order (orderQty 100) with fills `EX-1` (40 @ 171.95, version 3) and
  `EX-2` (60 @ 172.00, version 4), when `appendExecutionLifecycleEvent` records `EXEC_BUST` for
  `EX-1` with the order at state LIVE, cumQty 60, leavesQty 40, then: `order_events` has version 5,
  event `EXEC_BUST`, `exec_id` `EX-1`, resulting state LIVE, with the command and snapshot; `EX-1`
  has `status` `BUSTED` and `busted_at_version` 5, and `EX-2` is unchanged; the outbox holds an
  ORDER row at version 5 for `oms_orders` and a PROJECTION row for `oms_order_executions` whose
  `OrderExecution` has execId `EX-1`, execType `H`, orderVersion 5, cumQty 60, leavesQty 40, and the
  order's root order id as key.
- **AC-4** — Given an order with an `APPLIED` fill, when `appendExecutionLifecycleEvent` records
  `EXEC_CORRECT` for it, then the execution's `status` is `CORRECTED`, `busted_at_version` is the
  new event's version, and the staged `OrderExecution` has execType `G`; and given another
  `APPLIED` fill, when it records `EXEC_WHACK`, then that execution is `BUSTED` and the staged
  record has execType `H`.
- **AC-5** — Given an order whose fill `EX-1` is already `BUSTED`, when `EXEC_BUST` is recorded for
  `EX-1` again, or `EXEC_BUST` is recorded for an execId the order does not have, then the call is
  refused with an exception, and after the transaction rolls back there is no new `order_events`
  row, no new outbox row, the order's `tx_nr` is unchanged and `EX-1` is still `BUSTED`.
- **AC-6** — Given two `appendExecutionLifecycleEvent` calls for the same order prepared from the
  same order version, when both commit, then exactly one event is appended and the other call fails
  with `OptimisticLockingFailureException` and writes nothing.
- **AC-7** — Given the product order state machine, when transitions are checked, then
  `FILLED → LIVE` is valid and every other transition is valid exactly when it was before this
  change; and given the execution-status configuration, then exactly `APPLIED → BUSTED`,
  `APPLIED → CORRECTED` and `CORRECTED → BUSTED` are valid.
- **AC-8** — Given an order of orderQty 200 with fill `EX-1` (40 @ 171.95) `BUSTED` and fill `EX-2`
  (60 @ 172.00) `APPLIED`, and the order at cumQty 60, when fill `EX-3` (40 @ 173.00) is applied,
  then the order's and `EX-3`'s `avgPx` are (60 × 172.00 + 40 × 173.00) / 100 = 172.40000000,
  excluding `EX-1`.
- **AC-9** — Given the order of AC-3 after the bust at version 5, when
  `OrderReplayService.executionsAt` is called, then version 2 returns no executions, version 4
  returns `EX-1` and `EX-2`, and version 5 returns `EX-2` only.
- **AC-10** — Given the order of AC-3 after the bust, when
  `GET /api/query/orders/{orderId}/events?execId=EX-1` is called, then it answers 200 with exactly
  the version 3 `PARTIAL_FILL` and the version 5 `EXEC_BUST` entries, in that order; without
  `execId` it answers all five events as before; and with an execId the order does not have it
  answers 200 with an empty array.
- **AC-11** — Given orders in every combination of state (LIVE with and without leaves, CXL, EXP,
  CLOSED) and cancel state (none, `PCXL`, `REJ`, `CXL`), when `CXL_REQUEST` and `CXL_REJ`
  lifecycle commands are processed, then each is applied or refused exactly as before this change,
  and the existing lifecycle integration tests pass unchanged.
- **AC-12** — Given fill events that all have `exec_id`, when
  `POST /actuator/projections/{name}/rebuild` runs, then each fill gets one projection row matched
  by `exec_id`; and given a fill event with a null `exec_id`, then the rebuild fails with an error
  naming the order and the event version, and the projection table is left as it was.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-contracts, oms-core, oms-knowledge-base (already set on the ticket); consumers verified per `specs/config.json` |
| Contracts (OpenAPI / Avro) | `oms-query-api.yml`: optional `execId` query parameter on `getOrderEvents`, and `EXEC_BUST`, `EXEC_CORRECT`, `EXEC_WHACK` added to `OrderEventType`. Both additive. No Avro change |
| Data (tables, migrations) | One new changeset. `order_events.exec_id` with an index and backfill. `executions.status` (not null, default `APPLIED`), `order_version`, `root_order_id`, `exec_ref_id`, `busted_at_version`, indexes on `root_order_id` and `transact_time`, and backfill. No data is removed. Rollback drops the new columns and indexes |
| Events / Kafka topics | No new topic or schema. `oms_orders` carries orders after the new events. `oms_order_executions` can carry `OrderExecution` records with execType `H` or `G` at a higher `orderVersion` for an existing `(orderId, execId)`. Nothing emits them until SPEC-0030 adds the processors |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-ui, the developer cockpit and oms-mcp-server see three new event type names in the event log, with no code changes found that map the enum exhaustively. The streaming service already lets a higher `orderVersion` of the same execId through its dedup. Booking must treat execType `H` and `G` as reversals once SPEC-0030 emits them |
| Knowledge base | `domain/execution.md`, `domain/order-event.md`, `domain/order-state.md`, `oms-concepts/order-lifecycle.md`, `oms-concepts/execution-reporting.md`, `oms-concepts/projections.md`, `functional-requirements/FR-015` and `FR-016` |

## Open Questions

- [resolved] Should the new execution columns be backfilled from the order-execution projection
  table, which lacks fills recorded before SPEC-0020? → assumption: the backfill takes
  `order_version` from the projection table where a row exists, as the goal says. For every other
  fill it takes the version of the fill event matched by `order_events.exec_id`. `exec_id` itself
  is backfilled from the stored command and, for fills without one, by position (k-th fill event to
  k-th execution by id), the rule the rebuilder uses today. That is what makes deleting the
  fallback safe.
- [resolved] Does this ticket depend on SPEC-0045's rename? → assumption: no. The changeset names
  the projection table as it is called when this ticket is implemented. If SPEC-0045 has landed by
  then, that is `order_execution_projection`.
- [resolved] Which validate task consults the execution-status configuration, given that the bust
  pipeline is SPEC-0030? → assumption: `appendExecutionLifecycleEvent` refuses an invalid status
  transition or an unknown execution itself (AC-5). SPEC-0030's validate task consults the same
  configuration before quantities are recalculated.
- [resolved] Does a correction set `busted_at_version`? → assumption: yes. The column means "the
  version from which this execution no longer counts", so `executionsAt` handles bust and
  correction alike. A later bust of a `CORRECTED` execution keeps the first value.
- [resolved] What execType does a whack publish? → assumption: `H` (trade cancel), like a bust.
  It differs from a bust only in the event name and in being manual.
- [resolved] Does `appendExecutionLifecycleEvent` also stage a record on `oms_executions`? →
  assumption: no. The goal names only `oms_order_executions`, and SPEC-0030 owns what a bust
  publishes on the execution topics.
- [resolved] Should `OrderEventDto` expose `exec_id`? → assumption: no, the goal asks only for the
  filter. Adding it later is additive.
