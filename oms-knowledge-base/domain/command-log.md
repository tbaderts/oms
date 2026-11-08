---
type: Domain Concept
title: "Command Log"
description: "Every command the OMS receives, from REST, Kafka or its own scheduler, and what became of it: applied, refused or failed."
tags: [audit, command, entity]
status: draft
entity: "CommandLogEntry"
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/model/CommandLogEntry.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/CommandDispatcher.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/commandlog/CommandLogWriter.java"
  - resource: "repo:oms-core/src/main/resources/db/changelog/013-command-log.yaml"
  - resource: "repo:oms-contracts/src/main/openapi/oms-query-api.yml"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/CommandLogIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/CommandLogKafkaIntegrationTest.java"
---
# Command Log

The [order event log](order-event.md) records what a command **changed**. The command log records
the **ask**: every command the OMS received and what became of it, including the ones that were
refused or failed and so changed nothing (SPEC-0046). It answers "did the venue's cancel reach us,
and why was it refused?" from the database instead of the application logs.

## Structure

Table `command_log`, entity `CommandLogEntry`, one row per **attempt**:

| Field | Meaning |
|---|---|
| `commandId` | The command's commandId, when it had one. Not unique: a retried Kafka command is logged once per attempt |
| `type` | The command type, e.g. `OrderCancelRequestCmd` |
| `orderId` | The order it named. Null for an `OrderCreateCmd` that was refused, which never got an order id |
| `receivedAt` | When it crossed the OMS boundary (also the SLA checkpoint) |
| `source` | `REST`, `KAFKA` or `SCHEDULER` |
| `principal` | Who sent it: the Kafka header's `producer`, or `oms-core:end-of-day` / `oms-core:expiry`. Null on REST until authentication exists |
| `outcome` | `APPLIED`, `REFUSED` (invalid, not allowed in the order's state, or a duplicate) or `FAILED` (an exception) |
| `reason` | Why it was refused or failed |
| `eventVersion` | The version of the event it appended, when applied |
| `loggedAt` | When the row was written |

Indexes: `(order_id, received_at)` for the per-order read, `command_id` for lookups by id.

## How it is written

Every entry point (the REST command API, the Kafka command listener and the scheduled end-of-day and
expiry jobs) hands its command to `CommandDispatcher`. That is the one place commands are routed and
their outcome logged:

- **Applied**: the row is written in the command's own transaction, so it exists exactly when the
  change committed.
- **Refused**: the command's transaction rolls back; the row is written in a transaction of its own
  (`REQUIRES_NEW`), so it survives.
- **Failed**: the same, then the exception goes on to the entry point (REST answers it, Kafka retries
  and dead-letters it).

If writing a refused or failed row itself fails, the command's answer stands; the failure is logged
and counted in `oms.command_log.write_failures`.

An applied command's writes, including its APPLIED row, are flushed before the dispatch returns.
A failure there is still logged `FAILED` before the command rolls back. The one case that can leave
no row is a failure of the database commit itself, after a successful flush.

Not logged: Kafka records that cannot be decoded, or whose type has no command-API model (a quote,
a bust until SPEC-0030). They are not commands the OMS can process; their trace is the dead-letter
topic.

## Reading it

`GET /api/query/orders/{orderId}/commands` (`getOrderCommands`, [Query API](../interfaces/query-api.md))
returns the order's rows oldest first, as `CommandLogEntryDto`.

## Related

- [Order Event](order-event.md), [FR-010 Deduplicate commands](../functional-requirements/FR-010-deduplicate-lifecycle-commands.md)
- [Error Handling](../oms-framework/error-handling.md) (`urn:oms:error:duplicate-command`)
