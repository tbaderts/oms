---
type: Interface
title: "Avro Messages"
description: "Catalogue of all 32 Avro schemas in oms-contracts: commands and their header, messages, entities and enumerations, which are used, and how they are registered."
tags: [avro, schemas, contracts]
status: draft
covers: ["avro:CommandHeader", "avro:CommandResult", "avro:CommandStatus", "avro:OrderCreateCmd", "avro:OrderAcceptCmd", "avro:OrderRejectCmd", "avro:OrderCancelCmd", "avro:OrderCancelRequestCmd", "avro:OrderCancelRejectCmd", "avro:OrderExpireCmd", "avro:OrderCloseCmd", "avro:ExecutionCreateCmd", "avro:ExecutionBustCmd", "avro:ExecutionWhackCmd", "avro:QuoteCreateCmd", "avro:QuoteRequestCreateCmd", "avro:Order", "avro:OrderMessage", "avro:Execution", "avro:OrderExecution", "avro:Quote", "avro:QuoteRequest", "avro:State", "avro:CancelState", "avro:Side", "avro:OrdType", "avro:TimeInForce", "avro:PriceType", "avro:ExecInst", "avro:HandlInst", "avro:PositionEffect", "avro:SecurityIDSource"]
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-contracts/src/main/avro/CommandHeader.avsc"
  - resource: "repo:oms-contracts/src/main/avro/OrderMessage.avsc"
  - resource: "repo:oms-contracts/src/registry/java/org/example/common/contracts/registry/SchemaRegistrar.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/mapper/AvroMessageMapperTest.java"
---
# Avro Messages

All schemas live in `oms-contracts/src/main/avro/` (namespace `org.example.common.model.msg`) and
are compiled into the shared contracts jar. They evolve backward-compatibly (policy P-04).

## Commands

Each command is its own record on the `commands` topic, with no envelope (SPEC-0025). The record
name is the command type, and the first field of every command is `header`, a `CommandHeader`:

| Field | Type | Meaning |
|---|---|---|
| `commandId` | string | Identity of the command, unique per order. Stored in `order_events.command_id` for every command; the lifecycle commands are refused as duplicates when their id was already applied |
| `correlationId` | optional string | The root order the command belongs to |
| `causationId` | optional string | The event that caused it, as `orderId:eventId` |
| `sentAt` | `timestamp-micros` | When the producer sent it |
| `producer` | string | Service name, for diagnosis |
| `version` | string, default `1.0.0` | Command API version |
| `expectedVersion` | optional long, default null | The order version the sender acted on (0 for a create). If set and the order is at another version, the command is refused and acknowledged, not retried (SPEC-0050). Null: no check |

oms-core copies the header onto the command model's base fields (`CommandHeaderMapper`), so the
stored command of every event carries it, and logs each command's `commandId` and `correlationId`
on every line of its processing.

A producer must keep `commandId` unique per order and at most 255 characters (the
`order_events.command_id` column; the REST API allows 64). Two points follow from storing it for
every command:
- A repeated id makes the event insert fail, which is retried and then dead-lettered rather than
  refused.
- A lifecycle command reusing the id of an earlier create, accept or fill of the same order is
  refused as a duplicate.

| Schema | Fields after `header` | Handled | Capability |
|---|---|---|---|
| OrderCreateCmd | `order` | yes | [Order Capture](../capabilities/order-capture.md) |
| OrderAcceptCmd | `orderId` | yes | [Order Acceptance](../capabilities/order-acceptance.md) |
| OrderCancelRequestCmd | `orderId` | yes | [Order Cancellation](../capabilities/order-cancellation.md) |
| OrderCancelCmd, OrderCancelRejectCmd | `orderId`, optional `text` | yes | [Order Cancellation](../capabilities/order-cancellation.md) |
| OrderExpireCmd, OrderCloseCmd | `orderId`, optional `text` | yes | [Order Expiry and Close](../capabilities/order-expiry-and-close.md) |
| OrderRejectCmd | `orderId`, optional `text` | yes | [Order Rejection](../capabilities/order-rejection.md) |
| ExecutionCreateCmd | `execution` | yes | [Execution Processing](../capabilities/execution-processing.md) |
| ExecutionBustCmd, ExecutionWhackCmd | `executionId` | **no** | [Execution Processing](../capabilities/execution-processing.md) |
| QuoteCreateCmd, QuoteRequestCreateCmd | `quote` / `quoteRequest` | **no** | [Quotes](../capabilities/quotes.md) |

The payload fields are required. A command oms-core does not handle, or a record it cannot decode,
goes to `commands.DLT` with its original bytes ([Kafka Topics](kafka-topics.md)).

## Results

- `CommandResult` (`id`, `status`, `message`) with `CommandStatus` OK / FAILED: the API response.

## Subjects and registration

Producers of commands use `TopicRecordNameStrategy`: each command record has its own Schema
Registry subject, `commands-<record full name>`, for example
`commands-org.example.common.model.msg.OrderAcceptCmd`. Adding a command type adds a subject and
changes no existing one. The event topics keep `TopicNameStrategy` (`oms_orders-value`,
`oms_executions-value`, `oms_order_executions-value`).

The services run with `auto.register.schemas=false`: schemas are registered from oms-contracts,
not by whichever service sends first.

```bash
cd oms-contracts && ./gradlew registerSchemas -PregistryUrl=http://<registry>:8081
```

`registerSchemas` checks every command subject and the three event subjects for compatibility
with the registry, and registers them only if all pass; an incompatible subject fails the run, by
name, and nothing is registered. It registers the generated classes' schemas, which are exactly
what the serializers look up. Local runs need no registration step:
- the docker-compose setup sets `KAFKA_AUTO_REGISTER_SCHEMAS=true` for oms-core and the exchange
  simulator;
- `oms-core/.env` sets it for a host-native `bootRun`;
- the simulator's README shows it for a standalone run.

Without the variable, a service writing to a fresh registry fails with "subject not found": the
outbox stops publishing and the simulator cannot send.

`CommandCompatibilityTest` checks each command record against its own baseline in
`compat/commands/`, the first release of the bare records.

## Entities and messages

- `Order`, `Execution`: the domain records ([Order](../domain/order.md), [Execution](../domain/execution.md)).
- `OrderMessage`: the order as published on `oms_orders`, including state, cancel state and quantities.
- `Execution` as published on `oms_executions` also carries `rootOrderId` (the record key) and
  `orderVersion` (the event-log version the fill produced), both optional (SPEC-0019).
- `OrderExecution`: one fill with the order as of that fill, published on `oms_order_executions`
  (SPEC-0019). The fill (`execId`, `lastQty`, `lastPx`, `execType`, `lastCapacity`, `lastMkt`,
  `transactTime`); the order's identity (`orderId`, `rootOrderId`, `parentOrderId`, `leg`,
  `clOrdId`, `sessionId`, `account`) and economics (`side`, `symbol`, `securityId`, `ordType`,
  `price`, `orderQty`, `settlCurrency`, `exDestination`); the resulting position (`cumQty`,
  `leavesQty`, `avgPx`, `state`); `orderVersion`, equal to the `eventId` of the `OrderMessage` of
  the same change; and `tradeDate`, the UTC date of `transactTime` (of the fill's processing time
  when it has none). `avgPx` is the order's volume-weighted average price after the fill (SPEC-0041;
  also on `Execution`), null for fills stored before then. Every field is optional with a `null` default. Consumers deduplicate on
  `(orderId, execId, orderVersion)`.
- `Quote`, `QuoteRequest`: schema-only ([Quote and Quote Request](../domain/quote-and-quote-request.md)).

## Enumerations

`State`, `CancelState` ([Order State](../domain/order-state.md)), `Side`, `OrdType`,
`TimeInForce`, `PriceType`, `ExecInst`, `HandlInst`, `PositionEffect`, `SecurityIDSource` —
FIX value sets used by `Order`.

## Precision and versions

Every price and quantity in every record (`Order`, `OrderMessage`, `Execution`,
`OrderExecution`, `Quote`, `QuoteRequest`) is `decimal(18,8)`: 10 integer and 8 decimal digits,
the same precision as the database columns (`NUMERIC(18,8)`) and the OpenAPI contracts (SPEC-0039).
No `double` is used. The Avro serializer refuses a more precise value, so it cannot be sent; a value
with fewer decimals is rescaled without loss. `DecimalPrecisionContractTest` (oms-contracts) pins
the rule; the compatibility baselines in `compat/` are the version released with SPEC-0039.

The SPEC-0039 schemas are a breaking change against the earlier ones (`double` and scale 2/4).
`Order`, `Quote` and `QuoteRequest` changed type (`double` to bytes), so old records fail to
resolve. `OrderMessage`, `Execution` and `OrderExecution` changed only the decimal scale: Avro
schema resolution and the Schema Registry's compatibility check ignore logical types, so an old
record is read without error but with the wrong scale (off by 10^4 or 10^6). That is why the topics
must be drained first. For the same reason, a producer must use the shared schemas: one that
registered its own decimal scale would pass the registry and be misread. Deploying such a change:

1. Stop the command producers (exchange simulator, clients) and wait until oms-core has consumed
   `commands`, the outbox is empty (`select count(*) from outbox`), and the streaming service and
   other consumers have caught up on `oms_orders`, `oms_executions`, `oms_order_executions`.
2. For each affected subject, set the Schema Registry compatibility to `NONE`:
   `curl -X PUT -H 'Content-Type: application/vnd.schemaregistry.v1+json' -d '{"compatibility":"NONE"}' http://localhost:8081/config/<topic>-value`.
3. Deploy oms-core, oms-streaming-service and oms-exchange-simulator together.
4. Set the compatibility back to `BACKWARD` once the new versions are registered.

## Cutting over to bare command records

The removal of the command envelope, a union of every command record (SPEC-0025), is breaking on `commands`: oms-core
cannot read an envelope any more, and the simulator writes only bare records. It can share the
drain above when both changes ship together.

1. Run `registerSchemas` against the registry.
2. Stop the exchange simulator (the only producer of commands) and wait until the `commands`
   consumer lag of oms-core is zero.
3. Deploy oms-core, then the simulator.
4. Once the topic's retention has passed, soft-delete the old `commands-value` subject.

An envelope left on the topic is not lost: oms-core cannot decode it and dead-letters it with its
original bytes.
