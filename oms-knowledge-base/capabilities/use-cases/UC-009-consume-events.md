---
type: Use Case
title: "Receive order and execution events downstream"
description: "A downstream system receives every order and execution change, in order per order, exactly as committed."
tags: [use-case]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-009"
actors: [/capabilities/actors/downstream-system.md]
capability: "/capabilities/event-publication.md"
---
# UC-009 Receive order and execution events downstream

A downstream system receives every order and execution change, in order per order, exactly as committed.

Capability: [event-publication](../event-publication.md). Actors: [Downstream System](../actors/downstream-system.md).

## Preconditions

- The consumer is subscribed to the event topics.

## Main Flow

1. A command commits; its outbox rows are staged in the same transaction.
2. The relay (one leader) publishes them in commit order, keyed by the root order id.
3. The consumer processes each record and de-duplicates on its natural key.

## Alternative Flows

- Kafka is unavailable: commands still commit; publication catches up later.
- One aggregate keeps failing: only its later messages wait.

## Postconditions

- The consumer has every change once, in order per order.

## Requirements

- [FR-023](../functional-requirements/FR-023-relay-outbox-in-order.md)
- [FR-024](../functional-requirements/FR-024-retry-failed-publication.md)
- [NFR-004](../non-functional-requirements/NFR-004-reliable-publication.md)
- [NFR-010](../non-functional-requirements/NFR-010-contract-compatibility.md)
- [NFR-011](../non-functional-requirements/NFR-011-several-instances.md)
