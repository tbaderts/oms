---
type: Capability
title: "Order Acceptance"
description: "Moving an order to LIVE when the market acknowledges it."
tags: [order-acceptance, ack, orders]
status: draft
maturity: "implemented"
commands: ["OrderAcceptCmd"]
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessor.java"
  - resource: "repo:oms-core/src/main/java/org/example/common/state/OrderStateMachineConfig.java"
---
# Order Acceptance

## Summary

When the market acknowledges an order, the OMS marks it LIVE; only LIVE orders can be filled.

## Actors

The market or venue adapter (today the [exchange simulator](exchange-simulation.md)).

## Behaviour

An acknowledgement (`OrderAcceptCmd`) is the lifecycle action `ACCEPT` (SPEC-0046). It runs the
lifecycle pipeline in one transaction:
1. load the order under a row lock;
2. refuse a commandId the order already applied (409 `urn:oms:error:duplicate-command`);
3. require UNACK and the state machine's UNACK → LIVE;
4. move the order to LIVE and stamp the market-ack SLA with the time the command arrived;
5. save the order, record `ACK` and stage publication.

Every acknowledgement, applied or refused, is recorded in the [command log](../domain/command-log.md).
The separate `OrderAcceptCommandProcessor` was removed.

## Requirements

- [FR-005 Move acknowledged orders to LIVE](../functional-requirements/FR-005-acknowledge-orders.md)
- [FR-006 Refuse invalid acknowledgements](../functional-requirements/FR-006-refuse-invalid-acceptance.md)

## Interfaces and domain

[Command API](../interfaces/command-api.md), [Kafka Topics](../interfaces/kafka-topics.md); [Order State](../domain/order-state.md).

## Detailed specifications

- [Order Lifecycle Management Specification](../oms-concepts/order-lifecycle.md)
- [State Machine Framework](../oms-framework/state-machine-framework_spec.md)

## Known gaps

- [Order Lifecycle](../oms-concepts/order-lifecycle.md) §9.3 "Duplicate Acknowledgments" says a
  duplicate ack is ignored. The code writes nothing either way, but the response differs:
  - a redelivery with the same commandId is refused as a duplicate (409 on the API, acknowledged
    on Kafka);
  - an ack with a new commandId on an order that is no longer UNACK is refused as an invalid
    transition (400).

## Verification

`OrderLifecycleCommandProcessorTest` (accept cases), `DuplicateCommandIntegrationTest#acceptAppliesOnceAndRefusesRepeatAndNonUnack`, `CommandListenerKafkaIntegrationTest`, `OrderLifecycleIntegrationTest`. Conventions: [Testing Patterns](../oms-framework/testing-patterns.md).
