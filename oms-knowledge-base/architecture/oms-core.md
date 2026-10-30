---
type: Component
title: "oms-core"
description: "The Spring Boot core of the OMS: command processing, order state, event log, outbox, queries."
tags: [component, spring-boot, core]
status: draft
component: "oms-core"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/OmsApplication.java"
  - resource: "repo:oms-core/build.gradle"
  - resource: "repo:oms-core/src/main/resources/application.yml"
---
# oms-core

Java 25, Spring Boot 4, Jackson 3, Spring Data JPA on PostgreSQL (Liquibase migrations), Spring
Kafka with Avro. Packages: `api` (controllers), `service/command`, `service/execution`,
`service/lifecycle` (processors and task pipelines), `service` (event appender, replay, outbox
relay, queries), `config` (Kafka listener and config), `model`, `repository`, `mapper`
(MapStruct).

Capabilities: [Order Capture](../capabilities/order-capture.md), [Order Acceptance](../capabilities/order-acceptance.md),
[Order Cancellation](../capabilities/order-cancellation.md), [Order Rejection](../capabilities/order-rejection.md),
[Execution Processing](../capabilities/execution-processing.md), [Order Query](../capabilities/order-query.md),
[Event Sourcing and Replay](../capabilities/event-sourcing-and-replay.md), [Event Publication](../capabilities/event-publication.md),
[Order SLA Monitoring](../capabilities/order-sla-monitoring.md).
Interfaces: [Command API](../interfaces/command-api.md), [Query API](../interfaces/query-api.md),
[REST Read API](../interfaces/rest-read-api.md), [Kafka Topics](../interfaces/kafka-topics.md).

Context: [System Context](system-context.md).
