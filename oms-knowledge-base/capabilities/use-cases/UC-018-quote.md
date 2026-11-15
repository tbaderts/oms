---
type: Use Case
title: "Request and provide quotes (planned)"
description: "A client asks for a price and the desk answers with a quote. Only the Avro schemas exist."
tags: [use-case, planned]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-018"
actors: [/capabilities/actors/client-system.md, /capabilities/actors/trader.md]
capability: "/capabilities/quotes.md"
---
# UC-018 Request and provide quotes (planned)

A client asks for a price and the desk answers with a quote. Only the Avro schemas exist.

Capability: [quotes](../quotes.md). Actors: [Client System](../actors/client-system.md), [Trader](../actors/trader.md).

## Preconditions

- None yet.

## Main Flow

1. The client sends a quote request.
2. The trader answers with a quote.

## Alternative Flows

- The quote expires unanswered.

## Postconditions

- The client has a price.

## Requirements

- [FR-037](../functional-requirements/FR-037-request-quotes.md)
- [FR-038](../functional-requirements/FR-038-provide-quotes.md)
