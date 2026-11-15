---
type: Actor
title: "Downstream System"
description: "A system that consumes what the OMS publishes: the streaming service, booking, analytics."
tags: [actor, system]
status: draft
updated: "2026-11-14T12:00:00Z"
kind: "system"
---
# Downstream System

A system that consumes what the OMS publishes: the streaming service, booking, analytics.

## Responsibilities

- Consumes order and execution events from Kafka.
- De-duplicates on the natural keys of the records.
- Books or analyses fills (planned).
