---
type: Actor
title: "Client System"
description: "An upstream system (in-house trading, online banking, asset or portfolio management, another bank) that sends orders to the OMS."
tags: [actor, external]
status: draft
updated: "2026-11-14T12:00:00Z"
kind: "external"
---
# Client System

An upstream system (in-house trading, online banking, asset or portfolio management, another bank) that sends orders to the OMS.

## Responsibilities

- Sends order and cancel commands over REST or Kafka.
- Keeps its client order ids unique per session.
- Retries safely: commands are idempotent per commandId.
