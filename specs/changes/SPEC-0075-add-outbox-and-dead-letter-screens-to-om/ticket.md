---
id: SPEC-0075
title: Add outbox and dead-letter screens to oms-ui
type: feature
status: done
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, oms-ui, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-25
blocked_from:
blocked_reason:
---

# SPEC-0075 — Add outbox and dead-letter screens to oms-ui

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

we need some additional capabilities for oms-ui to help us manage the platform. oms has an order outbox, we need a tab in oms-ui to help us manage that. we need to see the state of messages in outbox and if there are any pending or blocked messages. also, kafka message listeners can end up pushing messages to dead letter topics after a few unsuccesful processing attemps. we need a tab/screen to look at dead letter topics. I'm not sure if we want to try resend as well or leave that for a follow-up ticket

## Log

- 2026-11-25 created
- 2026-11-25 06:28 — autopilot on
- 2026-11-25 06:30 — proposal gate passed; awaiting human approval
- 2026-11-25 06:45 — proposal approved by Toni Badertscher
- 2026-11-25 06:45 — proposal → design
- 2026-11-25 06:49 — set modules = oms-contracts, oms-core, oms-ui, oms-knowledge-base
- 2026-11-25 06:49 — design → plan
- 2026-11-25 06:49 — plan → implement
- 2026-11-25 07:19 — verify run: pass
- 2026-11-25 07:20 — implement → verify
- 2026-11-25 07:24 — reopened at implement: Review: bound schema-registry decoding (timeouts + deadline); dedicated AdminNotFoundException instead of global NoSuchElementException 404; outbox detail race -> 404; Exec column and message type in the Outbox table; stale detail guard; Decoder branch tests; pending vs oms.outbox.pending note.
- 2026-11-25 10:28 — verify run: pass
- 2026-11-25 10:28 — implement → verify
- 2026-11-25 10:28 — verify → done
- 2026-11-25 10:28 — autopilot off
