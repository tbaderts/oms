---
type: Actor
title: "Venue"
description: "The market an order is sent to; today the exchange simulator plays it, later a market adapter will connect real venues."
tags: [actor, external]
status: draft
updated: "2026-11-14T12:00:00Z"
kind: "external"
---
# Venue

The market an order is sent to; today the exchange simulator plays it, later a market adapter will connect real venues.

## Responsibilities

- Acknowledges or rejects orders.
- Reports fills.
- Confirms or rejects cancels.
