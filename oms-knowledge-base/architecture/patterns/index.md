# Implementation Patterns

How recurring technical problems are solved in this codebase: messaging, transactions, logging and tracing, the service template, contract-first code generation. Follow these when adding code.

Part of [Architecture](../index.md). Back to the [knowledge base index](../../index.md).

## Documents

- [Contract-first Code Generation](contract-first-codegen.md) — How an API or message change flows from the OpenAPI and Avro sources in oms-contracts to generated models and interfaces, and the rules that keep every consumer compatible.
- [Kafka Messaging](kafka-messaging.md) — How services consume and produce Kafka messages in the OMS: Avro records from oms-contracts, consumers that decode, dispatch in one transaction and retry or dead-letter, and producers that only publish through the transactional outbox.
- [Logging and Tracing](logging-and-tracing.md) — How a service logs, traces and correlates work in the OMS: the correlation block on every log line, commandId and correlationId in the MDC, OTLP export of traces, logs and metrics to Alloy, and how a trace crosses Kafka and the outbox.
- [Service Template](service-template.md) — The shape every Java microservice in the OMS repository shares: Gradle composite build with oms-contracts, Java 25 and Spring Boot 4.1, configuration by environment variable, OTLP telemetry, actuator health, a two-stage Dockerfile and an entry in the root docker-compose.yml.
- [Transaction Handling](transaction-handling.md) — One command, one database transaction: how oms-core bounds transactions, locks an order, appends events and stages outbox messages together, and what happens on refusal, failure and concurrent change.
