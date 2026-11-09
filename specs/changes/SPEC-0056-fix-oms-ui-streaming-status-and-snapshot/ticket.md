---
id: SPEC-0056
title: Fix oms-ui streaming status and snapshot reloads
type: fix
status: proposal
awaiting: proposal
autopilot: true
modules: [oms-ui, oms-streaming-service]
approvals: []
owner: Toni Badertscher
created: 2026-11-09
blocked_from:
blocked_reason:
---

# SPEC-0056 — Fix oms-ui streaming status and snapshot reloads

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Follow-up to SPEC-0054. Observed in the running app on 2026-11-09: the streaming blotter shows Disconnected (and offers Connect) while events keep arriving - after switching tabs or modes the freshly mounted blotter never learns the shared connection is already open, so the status indicator cannot be trusted. Every tab or mode switch re-downloads the full snapshot (about 6,300 orders / 8,300 executions) only to keep 2,000 rows. The live Executions blotter shows a different column set than the REST one (empty Id column; Exec Id, Leaves Qty and Transact Time missing). Fix these so the status always reflects the real connection state, switching tabs or modes does not reload the whole snapshot, and live and paging blotters show the same columns.

## Log

- 2026-11-09 created
- 2026-11-09 06:45 — autopilot on
- 2026-11-09 06:48 — set modules = oms-ui, oms-streaming-service
- 2026-11-09 06:48 — proposal gate passed; awaiting human approval
- 2026-11-09 06:55 — proposal approved by Toni Badertscher
- 2026-11-09 06:55 — proposal → design
- 2026-11-09 07:03 — reopened at proposal: Reproduction in the running app: defect 3 does not occur with the default columns (every default column of Order and Execution is on the stream). It occurs when a column the stream does not carry is chosen (Execution: id, status, rootOrderId, execRefId, bustedAtVersion, secondaryExecID, dayOrderQty, dayCumQty, dayAvgPx; Order: 25 fields incl. id, txNr, sessionId, SLA timestamps). AC-6 as approved (live Id filled) needs the database id on the Kafka records: an Avro contract change in oms-contracts and oms-core, beyond this ticket. Proposal revised for a decision.
- 2026-11-09 07:03 — proposal gate passed; awaiting human approval
