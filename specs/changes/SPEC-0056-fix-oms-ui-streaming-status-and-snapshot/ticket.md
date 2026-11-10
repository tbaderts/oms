---
id: SPEC-0056
title: Fix oms-ui streaming status and snapshot reloads
type: fix
status: done
awaiting:
autopilot: false
modules: [oms-ui, oms-streaming-service]
approvals: [proposal]
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
- 2026-11-09 07:10 — proposal approved by Toni Badertscher
- 2026-11-09 07:10 — proposal → design
- 2026-11-09 07:12 — design → plan
- 2026-11-09 07:12 — plan → implement
- 2026-11-09 07:21 — verify run: pass
- 2026-11-09 07:22 — implement → verify
- 2026-11-09 07:25 — reopened at implement: Independent review NOT MET: (1 blocking) live and paging blotters of one domain are now mounted together and their column/filter state drifts; (2) creationDate listed as streamed but never filled; (3) securityType filled with securityDesc on the stream; (4) Connect in one live blotter leaves the other kept-mounted one Connected with a dead subscription; (5) hidden REST blotter keeps auto-refreshing; (6,7) test naming and hand-copied defaults
- 2026-11-09 07:32 — verify run: pass
- 2026-11-09 07:33 — implement → verify
- 2026-11-09 07:37 — reopened at implement: Second independent review NOT MET: Blotter save effect has no initialized guard and wipes the shared saved state on first mount (breaks AC-6 third bullet, fix #1); plus minor: double subscribe after Disconnect, failed connect not re-subscribed, BETWEEN filter re-read mismatch, weak AC-4 snapshot assertion, KB gaps
- 2026-11-09 07:40 — verify run: pass
- 2026-11-09 07:41 — implement → verify
- 2026-11-09 07:43 — reopened at implement: Third review (MET) minor regression exposed by the save guard: the paging blotter restores currentPage 0 written by the live blotter, showing Page 0 on first use
- 2026-11-09 07:45 — verify run: pass
- 2026-11-09 07:46 — implement → verify
- 2026-11-09 07:46 — verify → done
- 2026-11-09 07:46 — autopilot off
- 2026-11-09 08:30 — reopened at implement: Regression found in the browser: the .blotter-view wrapper added to keep views mounted has no height, so .blotter-container height:100% collapses and the AG Grid is 1.6px tall; no rows visible in either blotter
- 2026-11-09 08:32 — verify run: pass
- 2026-11-09 11:37 — implement → verify
- 2026-11-09 11:37 — verify → done
