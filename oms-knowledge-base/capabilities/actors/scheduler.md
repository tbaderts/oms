---
type: Actor
title: "Scheduler"
description: "The OMS's own scheduled jobs (expiry, end of day, reconciliation), run on one leader instance."
tags: [actor, system]
status: draft
updated: "2026-11-14T12:00:00Z"
kind: "system"
---
# Scheduler

The OMS's own scheduled jobs (expiry, end of day, reconciliation), run on one leader instance.

## Responsibilities

- Expires orders whose time in force ran out.
- Closes finished orders at end of day.
- Reconciles orders with their event log.
