---
id: SPEC-0039
title: Unify decimal precision across database, Avro and OpenAPI
type: refactor
status: done
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, oms-streaming-service, oms-exchange-simulator, oms-knowledge-base, developer-cockpit]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-01
blocked_from:
blocked_reason:
---

# SPEC-0039 — Unify decimal precision across database, Avro and OpenAPI

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Use one decimal precision for every price and quantity (orderQty, cumQty, leavesQty, lastQty, lastPx, price, stopPx, avgPx, etc.) in the database (NUMERIC columns), the Avro contracts (including Order.avsc, which still uses double, review finding 9) and the OpenAPI contracts: decimal(18,8), i.e. 8 decimal places, the maximum NYSE Pillar uses for price fields, applied to quantities too. It must not be possible to send an order or fill with higher precision than that: reject it at the REST and Kafka boundaries with a clear validation error. This is a BREAKING Avro change (scale 4 to 8; double to decimal) to be versioned with consumers updated together. Raised by the SPEC-0020 review: a REST fill with more than 4 decimals now fails Avro encoding inside the fill transaction.

## Log

- 2026-11-01 created
- 2026-11-01 05:52 — autopilot on
- 2026-11-01 05:53 — proposal gate passed; awaiting human approval
- 2026-11-01 05:54 — proposal approved by Toni Badertscher
- 2026-11-01 05:54 — proposal → design
- 2026-11-01 05:56 — set modules = oms-contracts, oms-core, oms-streaming-service, oms-exchange-simulator, oms-knowledge-base, developer-cockpit
- 2026-11-01 05:57 — design → plan
- 2026-11-01 05:57 — plan → implement
- 2026-11-01 06:16 — verify run: fail
- 2026-11-01 06:20 — verify run: pass
- 2026-11-01 06:20 — implement → verify
- 2026-11-01 06:25 — reopened at implement: Review minor findings: migration integer-digit branch untested; runbook says old records are refused while scale-only changes are silently misread; two KB pages still describe HALF_UP / old scales; end-to-end test misses some layers; simulator Javadocs say scale 4; Kafka order mapping has no unit test.
- 2026-11-01 06:30 — verify run: pass
- 2026-11-01 06:31 — implement → verify
- 2026-11-01 06:31 — verify → done
- 2026-11-01 06:31 — autopilot off
