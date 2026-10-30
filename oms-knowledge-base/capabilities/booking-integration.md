---
type: Capability
title: "Booking Integration"
description: "Turning OMS events into bookings in the synchronous downstream booking system."
tags: [booking, post-trade, integration]
status: draft
maturity: "planned"
commands: []
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "/oms-concepts/booking-integration.md"
---
# Booking Integration

## Summary

The booking system cannot consume OMS events; an adapter will book trades from them.

## Behaviour

Two options (booking entity in the OMS vs. a booking service on Temporal) are compared in the concept.

## Requirements

- [FR-043 Book executions downstream](../functional-requirements/FR-043-book-executions.md)

## Detailed specifications

- [Booking Integration](../oms-concepts/booking-integration.md)

## Known gaps

None known.
