---
id: SPEC-0073
title: Use Alpha Vantage data in exchange simulator
type: feature
status: implement
awaiting:
autopilot: true
modules: [oms-exchange-simulator, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-25
blocked_from:
blocked_reason:
---

# SPEC-0073 — Use Alpha Vantage data in exchange simulator

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

oms-ui now supports order entry using alphavantage api for market data. oms-exchange-simulator uses some static data with limited coverage. we need to switch simulator to use alphavantage as well so it has access to securities reference data and prices. we also need to add some price checks that make sure, user submitted limit is within acceptable range of what stock exchanges such as NASDAQ or NYSE accept

## Log

- 2026-11-25 created
- 2026-11-25 04:36 — autopilot on
- 2026-11-25 04:40 — set modules = oms-exchange-simulator, oms-knowledge-base
- 2026-11-25 04:40 — proposal gate passed; awaiting human approval
- 2026-11-25 04:42 — proposal approved by Toni Badertscher
- 2026-11-25 04:42 — proposal → design
- 2026-11-25 04:45 — design → plan
- 2026-11-25 04:46 — plan → implement
