# System Context and Components

The OMS in its environment and each deployable module: what it does, what it talks to, where its code lives.

Part of [Architecture](../index.md). Back to the [knowledge base index](../../index.md).

## Documents

- [Exchange Simulator](exchange-simulator.md) — FIX exchange simulator that acknowledges, fills, rejects and cancels OMS market orders so the lifecycle can run end to end.
- [Market Adapter (planned)](market-adapter.md) — The planned venue adapter that will connect the OMS to real markets over FIX, taking the exchange simulator's place behind the same Kafka contract: consume oms_orders, answer with commands.
- [oms-contracts](oms-contracts.md) — Library holding the only copy of the OpenAPI and Avro contracts and the models generated from them.
- [oms-core](oms-core.md) — The Spring Boot core of the OMS: command processing, order state, event log, outbox, queries.
- [OMS UI](oms-ui.md) — React admin tool and trade blotter.
- [Streaming Service](streaming-service.md) — Spring Boot service that streams orders and executions to the UI over RSocket.
- [System Context](system-context.md) — The OMS components, the infrastructure they use and how commands, events and queries flow between them.
- [Price Service](price-service.md) — Owns market data for the other services: instrument search from a local list, quotes from Alpha Vantage within a request budget, and end-of-day closes from files as the fallback.
