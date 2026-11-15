---
type: Pattern
title: "Transaction Handling"
description: "One command, one database transaction: how oms-core bounds transactions, locks an order, appends events and stages outbox messages together, and what happens on refusal, failure and concurrent change."
tags: [pattern, transactions, concurrency, locking, outbox]
status: draft
updated: "2026-11-14T12:00:00Z"
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/CommandDispatcher.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessor.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/execution/ExecutionCommandProcessor.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/repository/OrderRepository.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/commandlog/CommandLogWriter.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/TwoInstanceIntegrationTest.java"
---
# Transaction Handling

**Rule: one command is one database transaction.** Everything a command changes (the order, its
executions, the event log entry, the command log entry, the outbox rows and the projection rows)
commits together or not at all. Nothing leaves the process inside that transaction: Kafka is only
written by the outbox relay after commit
([ADR-005](../decisions/ADR-005-transactional-outbox.md), [State Store](../concepts/state-store.md)).

## Where the boundary is

- REST (`CommandController`) and Kafka (`CommandListener`) both call
  `CommandDispatcher.dispatch`, which is `@Transactional`. It routes to the processor
  (`OrderCreateCommandProcessor`, `ExecutionCommandProcessor`, `OrderLifecycleCommandProcessor`),
  whose own `@Transactional` joins the same transaction.
- The processor runs its task pipeline inside that transaction
  ([Task Orchestrator](../../framework/task-orchestrator.md)). A failing task fails the pipeline,
  and the transaction rolls back.
- Scheduled jobs (expiry, end of day) send the same commands through the dispatcher, so they follow
  the same rule.

## Outcomes

| Outcome | Transaction | Command log |
|---|---|---|
| Applied | Commits the change, the event, the outbox and projection rows | `APPLIED` row in the same transaction, flushed before commit so a late failure is still logged as one |
| Refused (business rule, duplicate, version mismatch) | Marked rollback-only: nothing changes | `REFUSED` row, written by `CommandLogWriter` in its own (`REQUIRES_NEW`) transaction, so it survives the rollback |
| Failed (exception) | Rolled back | `FAILED` row, also in its own transaction; Kafka retries the command, REST answers with an error |

## Concurrency

- **Lifecycle and fill commands lock the order row** (`OrderRepository.findLockedByOrderId`,
  `PESSIMISTIC_WRITE`) before deciding anything, so two commands on one order are serialised across
  threads and instances.
- **The event version is the safety net.** `OrderEventAppender` writes version `txNr + 1`; a second
  writer of the same version breaks the unique `(order_id, version)` constraint and the command is
  retried (Kafka) or answered `409` (REST).
- **Optimistic checks for clients.** A command may carry `expectedVersion`; if the order has moved
  on, the command is refused (SPEC-0050).
- **Several instances** are safe: scheduled jobs and the outbox relay run on one leader per
  database (`service/leadership`), and ids are drawn in blocks that are unique across instances
  (SPEC-0048).

## Do and don't

- Do put `@Transactional` on the entry point of a write path, and keep the work inside it short:
  no remote calls, no waiting.
- Do read with `@Transactional(readOnly = true)` on the query side
  ([Query Engine](../../framework/query-engine.md)).
- Don't publish to Kafka, call another service, or write a file inside a command transaction.
- Don't catch and swallow an exception inside a pipeline: let the transaction roll back and the
  command log record it.

Tests: `TwoInstanceIntegrationTest`, `OrderVersionTwoInstanceIntegrationTest` and
`DuplicateCommandIntegrationTest` prove the concurrency rules against PostgreSQL.
