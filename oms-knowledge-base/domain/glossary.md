---
type: Glossary
title: "Glossary"
description: "Definitions of the OMS domain and technical terms used across the knowledge base."
tags: [glossary, terms, fix]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-contracts/src/main/avro/State.avsc"
  - resource: "repo:oms-contracts/src/main/avro/Order.avsc"
  - resource: "/oms-concepts/order-model-trading-capacity.md"
---
# Glossary

| Term | Definition |
|---|---|
| Ack (acknowledgement) | The market's confirmation that it accepted an order; moves the order to LIVE |
| Aggregate | The unit of consistency in the OMS; here, one order with its events |
| Allocation | Distributing an executed quantity to accounts (planned, see [Block Allocation](../capabilities/block-allocation.md)) |
| Cancel request | A client's request to cancel the open quantity (FIX OrderCancelRequest, 35=F) |
| clOrdId | Client order id (FIX 11); unique per session |
| Command | A request to change state, sent to the command API or the `commands` topic |
| cumQty | Quantity executed so far (FIX 14) |
| DLT | Dead-letter topic: where a command that keeps failing ends up (`<topic>.DLT`) |
| Event (order event) | Record of one state change in the event log |
| Execution / fill | A report that part or all of an order traded |
| ExecType | FIX field 150: kind of execution report (new, fill, cancel, reject, …) |
| leavesQty | Quantity still open (FIX 151) |
| Leg | Whether an order is the client (`CLI`) or market (`MKT`) side of a trade |
| Lifecycle action | Reject, cancel, cancel request or cancel reject applied to an existing order |
| orderQty | Quantity ordered (FIX 38) |
| Outbox | Table of messages staged for Kafka in the same transaction as the change |
| Replay | Rebuilding an order from its event log |
| SLA checkpoint | A timestamp on the order used to measure latency (received, ack, market send, market ack) |
| State / cancel state | See [Order State](order-state.md) |
| STP | Straight-through processing: no manual step between order and execution |
| Trade blotter | The real-time UI view of orders and executions |
| txNr | The order's optimistic-lock version |
| Venue | A market or broker an order is sent to |
