# Interfaces

The APIs, Kafka topics and message schemas other systems use. Together they cover every API path, controller, topic and Avro schema of the OMS.

Back to the [knowledge base index](../index.md).

- [Avro Messages](avro-messages.md) — Catalogue of all 31 Avro schemas in oms-contracts: commands, messages, entities and enumerations, and which are used.
- [Command API](command-api.md) — POST /api/command/execute: the single HTTP entry point for commands, with its accepted command types and responses.
- [Kafka Topics](kafka-topics.md) — The Kafka topics of the OMS: the commands it consumes and the order and execution events it publishes.
- [Query API](query-api.md) — The contract-first search endpoint for orders with dynamic filters, sorting and pagination.
- [REST Read API](rest-read-api.md) — Hand-written read endpoints for orders, executions, order events and the entity metamodel.
