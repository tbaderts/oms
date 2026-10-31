---
id: SPEC-0020
title: Add projection framework to the write path
type: feature
status: blocked
awaiting:
autopilot: true
modules: [oms-core, oms-contracts, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-30
blocked_from: verify
blocked_reason: Decision needed (review finding 1, confirmed): fill messages are Avro decimal(18,4). Since SPEC-0020 the OrderExecution record is encoded inside the fill transaction, so a REST fill with more than 4 decimal places in lastQty/lastPx/avgPx (e.g. lastPx 170.12345) is refused and rolled back with an obscure AvroTypeException. Kafka fills cannot carry more than 4 decimals (schema). Before SPEC-0020 such a fill was recorded but its execution message then failed in the relay. Options: A (recommended) validate in ValidateExecutionTask and refuse fills with scale > 4 with a clear 400 validation error, and declare it in the command contract; B round to 4 decimals in the published message and the view only, keeping the stored fill exact; C round the fill itself before recording. All other ACs pass; reviewer verdict MET. Unblock with a note naming A, B or C.
---

# SPEC-0020 — Add projection framework to the write path

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Roadmap ticket C of the architecture review (oms-core/docs/architecture-review-2026-10-30.md, section 5): introduce a Projection interface and a ProjectTask that runs every Projection bean inside the command transaction after UpdateOrderTask; give the outbox a generic payload column and a payload_type discriminator through a new Liquibase changeset; add the order_execution_view projection table and a GET /api/query/executions endpoint served from it; add a ProjectionRebuilder that rebuilds any projection from order_events and executions.

## Log

- 2026-10-30 created
- 2026-10-31 18:44 — autopilot on
- 2026-10-31 18:45 — proposal gate passed; awaiting human approval
- 2026-10-31 18:46 — proposal approved by Toni Badertscher
- 2026-10-31 18:46 — proposal → design
- 2026-10-31 18:49 — design → plan
- 2026-10-31 18:49 — plan → implement
- 2026-10-31 19:13 — verify run: pass
- 2026-10-31 19:14 — implement → verify
- 2026-10-31 19:18 — blocked: Decision needed (review finding 1, confirmed): fill messages are Avro decimal(18,4). Since SPEC-0020 the OrderExecution record is encoded inside the fill transaction, so a REST fill with more than 4 decimal places in lastQty/lastPx/avgPx (e.g. lastPx 170.12345) is refused and rolled back with an obscure AvroTypeException. Kafka fills cannot carry more than 4 decimals (schema). Before SPEC-0020 such a fill was recorded but its execution message then failed in the relay. Options: A (recommended) validate in ValidateExecutionTask and refuse fills with scale > 4 with a clear 400 validation error, and declare it in the command contract; B round to 4 decimals in the published message and the view only, keeping the stored fill exact; C round the fill itself before recording. All other ACs pass; reviewer verdict MET. Unblock with a note naming A, B or C.
