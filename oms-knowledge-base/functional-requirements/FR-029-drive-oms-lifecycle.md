---
type: Requirement
title: "Drive the OMS lifecycle over Kafka"
description: "For each new UNACK order on oms_orders the simulator sends ack, fills, reject or cancel commands to the commands topic."
tags: [functional, exchange-simulation]
status: draft
id: "FR-029"
priority: "must"
implementation: "implemented"
capability: "/capabilities/exchange-simulation.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-exchange-simulator/src/main/java/org/example/simulator/kafka/OrderMessageListener.java"
  - resource: "repo:oms-exchange-simulator/src/main/java/org/example/simulator/kafka/CommandGateway.java"
  - resource: "repo:oms-exchange-simulator/src/main/java/org/example/simulator/engine/ExchangeEngine.java"
  - resource: "repo:oms-exchange-simulator/src/test/java/org/example/simulator/kafka/ExchangeSimulatorKafkaIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/ExchangeWorkflowIntegrationTest.java"
---
# Drive the OMS lifecycle over Kafka

A pending cancel (PCXL) on a resting order produces a cancel. Single-threaded engine, so each order's events are handled in sequence.

Capability: [exchange-simulation](../capabilities/exchange-simulation.md).
