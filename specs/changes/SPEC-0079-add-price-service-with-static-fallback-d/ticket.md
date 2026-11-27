---
id: SPEC-0079
title: Add price service with static fallback data
type: feature
status: done
awaiting:
autopilot: false
modules: [oms-contracts, oms-price-service, oms-ui, oms-exchange-simulator, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-26
blocked_from:
blocked_reason:
---

# SPEC-0079 — Add price service with static fallback data

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

SPEC-0073 added alpha vantage as a market data provider for oms-ui and oms-exchange-simulator. it works well but has quite a restrictive rate limiter. subscriptions are expensive. I wonder if there are free alternatives with less punishing limits or if there are different ways of using it if we stick with alpha vantage. one option could be to create a price service that would provide price and reference data to our services. maybe there is a way of getting data (end of day) from a file and use that as a fallback. also, reference data lookups like finding symbol could then go against static data from file, without consuming real-time api. the real-time api could be use for price, when limit is reached, price service would fall back to static data and previous day closing price

## Log

- 2026-11-26 created
- 2026-11-26 12:03 — autopilot on
- 2026-11-26 12:05 — set modules = oms-contracts, oms-ui, oms-exchange-simulator, oms-knowledge-base
- 2026-11-26 12:05 — proposal gate passed; awaiting human approval
- 2026-11-26 12:20 — proposal approved by Toni Badertscher
- 2026-11-26 12:20 — proposal → design
- 2026-11-26 12:25 — design → plan
- 2026-11-26 12:26 — plan → implement
- 2026-11-26 12:26 — blocked: T-0: specs/config.json needs an oms-price-service module entry (verify: ['./gradlew check']) and 'oms-price-service' added to modules.oms-contracts.impacts. Agents cannot edit the gate config. Without it, spec verify cannot build the new module and it cannot be added to the ticket's modules. Add both, then unblock; implementation continues from T-0.
- 2026-11-26 13:19 — unblocked → implement
- 2026-11-26 13:47 — blocked: Implementation done (T-1 to T-15; price service 61 tests, oms-ui backend and frontend, simulator incl. Kafka ITs all green, okf-check 0 errors). T-16 (spec verify) still needs T-0: specs/config.json has no oms-price-service module, so verify would not build or test the new module. Please add modules.oms-price-service = { verify: ['./gradlew check'] } and add 'oms-price-service' to modules.oms-contracts.impacts, then unblock. Or, to verify without it, unblock with a spec note saying so, and the new module's ./gradlew check is run separately and recorded in verification.md.
- 2026-11-26 14:20 — unblocked → implement
- 2026-11-26 14:34 — set modules = oms-contracts, oms-price-service, oms-ui, oms-exchange-simulator, oms-knowledge-base
- 2026-11-26 15:00 — verify run: pass
- 2026-11-26 15:02 — implement → verify
- 2026-11-26 15:02 — verify → done
- 2026-11-26 15:02 — autopilot off
- 2026-11-26 19:39 — archived
- 2026-11-26 19:39 — archived
