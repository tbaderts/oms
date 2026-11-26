# Interfaces

The contracts other systems use: Command API, Query API, REST read API and the Message API (Kafka topics and Avro schemas). The specifications themselves live in oms-contracts.

Part of [Domain](../index.md). Back to the [knowledge base index](../../index.md).

## Documents

- [Command API](command-api.md) — POST /api/command/execute: the single HTTP entry point for commands, with its accepted command types and responses.
- [Market Data API](market-data-api.md) — Instrument lookup and quote endpoints, served by the price service and forwarded by oms-ui for order entry: instruments from a local list, quotes live within a request budget or end-of-day closes.
- [Message API](message-api.md) — The asynchronous interface of the OMS: the Kafka topics it consumes and publishes, and the catalogue of Avro schemas on them, with keys, ordering, registration and evolution rules.
- [Query API](query-api.md) — The contract-first search endpoint for orders with dynamic filters, sorting and pagination.
- [REST Read API](rest-read-api.md) — Hand-written read endpoints for orders and the entity metamodel.
