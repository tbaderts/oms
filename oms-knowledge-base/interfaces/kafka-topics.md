---
type: Interface
title: "Kafka Topics"
description: "The Kafka topics of the OMS: the commands it consumes and the order and execution events it publishes."
tags: [kafka, topics, events]
status: draft
covers: ["kafka:oms_orders", "kafka:oms_executions", "kafka:commands"]
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/resources/application.yml"
  - resource: "repo:oms-core/src/main/java/org/example/oms/config/CommandListener.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/config/KafkaConsumerConfig.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OutboxRelay.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/CommandListenerKafkaIntegrationTest.java"
---
# Kafka Topics

Topic names are configured in oms-core `application.yml` (`kafka.*-topic`, overridable by
environment variables). Messages are Avro, registered in the Schema Registry.

| Topic (default) | Direction | Content | Consumers / producers |
|---|---|---|---|
| `commands` (`COMMAND_TOPIC`) | in | `CommandMessage` wrapping any command | `CommandListener`; produced by the exchange simulator and other clients |
| `oms_orders` (`ORDER_TOPIC`) | out | `OrderMessage`, the order after each change | streaming service, exchange simulator |
| `oms_executions` (`EXECUTION_TOPIC`) | out | `Execution` | streaming service |

- Outbound messages are published only by the [outbox relay](../capabilities/event-publication.md),
  in order per order.
- A command that keeps failing is retried with exponential back-off and then sent to
  `<topic>.DLT`; refused lifecycle commands are acknowledged, not retried
  ([NFR-005](../non-functional-requirements/NFR-005-dead-letter-failed-commands.md)).

Messages: [Avro Messages](avro-messages.md).
