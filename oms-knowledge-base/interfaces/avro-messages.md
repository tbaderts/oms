---
type: Interface
title: "Avro Messages"
description: "Catalogue of all 31 Avro schemas in oms-contracts: commands, messages, entities and enumerations, and which are used."
tags: [avro, schemas, contracts]
status: draft
covers: ["avro:Cmd", "avro:Command", "avro:CommandMessage", "avro:CommandResult", "avro:CommandStatus", "avro:OrderCreateCmd", "avro:OrderAcceptCmd", "avro:OrderRejectCmd", "avro:OrderCancelCmd", "avro:OrderCancelRequestCmd", "avro:OrderCancelRejectCmd", "avro:ExecutionCreateCmd", "avro:ExecutionBustCmd", "avro:ExecutionWhackCmd", "avro:QuoteCreateCmd", "avro:QuoteRequestCreateCmd", "avro:Order", "avro:OrderMessage", "avro:Execution", "avro:Quote", "avro:QuoteRequest", "avro:State", "avro:CancelState", "avro:Side", "avro:OrdType", "avro:TimeInForce", "avro:PriceType", "avro:ExecInst", "avro:HandlInst", "avro:PositionEffect", "avro:SecurityIDSource"]
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-contracts/src/main/avro/Command.avsc"
  - resource: "repo:oms-contracts/src/main/avro/CommandMessage.avsc"
  - resource: "repo:oms-contracts/src/main/avro/OrderMessage.avsc"
  - resource: "repo:oms-contracts/src/main/avro/Cmd.avsc"
  - resource: "repo:oms-core/src/test/java/org/example/oms/mapper/AvroMessageMapperTest.java"
---
# Avro Messages

All schemas live in `oms-contracts/src/main/avro/` (namespace `org.example.common.model.msg`) and
are compiled into the shared contracts jar. They evolve backward-compatibly (policy P-04).

## Commands

Every command record has `type` and `version`; lifecycle commands also carry `commandId` for
de-duplication.

| Schema | Payload | Handled | Capability |
|---|---|---|---|
| OrderCreateCmd | `order` | yes | [Order Capture](../capabilities/order-capture.md) |
| OrderAcceptCmd | `orderId` | yes | [Order Acceptance](../capabilities/order-acceptance.md) |
| OrderCancelRequestCmd | `orderId`, `commandId` | yes | [Order Cancellation](../capabilities/order-cancellation.md) |
| OrderCancelCmd, OrderCancelRejectCmd | `orderId`, `text`, `commandId` | yes | [Order Cancellation](../capabilities/order-cancellation.md) |
| OrderRejectCmd | `orderId`, `text`, `commandId` | yes | [Order Rejection](../capabilities/order-rejection.md) |
| ExecutionCreateCmd | `execution` | yes | [Execution Processing](../capabilities/execution-processing.md) |
| ExecutionBustCmd, ExecutionWhackCmd | `executionId` | **no** | [Execution Processing](../capabilities/execution-processing.md) |
| QuoteCreateCmd, QuoteRequestCreateCmd | `quote` / `quoteRequest` | **no** | [Quotes](../capabilities/quotes.md) |

## Envelopes and results

- `Command` (`type`, `version`): base shape of every command.
- `CommandMessage` (`command`): the Kafka envelope on the `commands` topic.
- `CommandResult` (`id`, `status`, `message`) with `CommandStatus` OK / FAILED: the API response.
- `Cmd`: an enum of short command codes (OCRE, OCXL, OREJ, ECRE, EWHK, EBST); not used by the
  dispatchers, which switch on the record type.

## Entities and messages

- `Order`, `Execution`: the domain records ([Order](../domain/order.md), [Execution](../domain/execution.md)).
- `OrderMessage`: the order as published on `oms_orders`, including state, cancel state and quantities.
- `Quote`, `QuoteRequest`: schema-only ([Quote and Quote Request](../domain/quote-and-quote-request.md)).

## Enumerations

`State`, `CancelState` ([Order State](../domain/order-state.md)), `Side`, `OrdType`,
`TimeInForce`, `PriceType`, `ExecInst`, `HandlInst`, `PositionEffect`, `SecurityIDSource` —
FIX value sets used by `Order`.
