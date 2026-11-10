---
id: SPEC-0057
title: Make oms-ui streaming hold up under load
type: feature
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

# SPEC-0057 — Make oms-ui streaming hold up under load

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Follow-up to SPEC-0054, which capped the number of rows but did not address high update rates. Today every event copies the whole row map, rebuilds the row array, pushes all rows to AG Grid and re-renders three times; ingesting an 8,300-event snapshot took more than 5 seconds with nothing else running. Eviction drops rows by first arrival, so a busy order that keeps getting fills is evicted before a quiet one. The client requests unlimited events and the server sends the full snapshot even though the client keeps only maxStreamingRows. Make the live blotters cope with a large number of incoming updates: batch updates into the grid as delta transactions, evict the least recently updated rows, load the snapshot in bulk and bounded to the newest N rows, add a pause/resume control and a showing N of M indicator. Acceptance must be measured (sustained event rate, frame budget, flat memory), not only unit-tested.

## Log

- 2026-11-09 created
- 2026-11-09 16:24 — autopilot on
- 2026-11-09 16:27 — proposal gate passed; awaiting human approval
- 2026-11-09 16:59 — proposal approved by Toni Badertscher
- 2026-11-09 16:59 — proposal → design
- 2026-11-09 17:03 — design → plan
- 2026-11-09 17:03 — plan → implement
- 2026-11-09 22:44 — blocked: T-14: AC-10 (measurements/ac-10-harness.json, flat heap after the column-definition fix) and AC-11 (2,000 of 8,218 executions in 376 ms) are measured. Needed: the user re-runs AC-9 on the current build, http://localhost:8080/?loadHarness&domain=Order&rate=2000&duration=60&keys=10000&maxRows=2000 with the window in front, and pastes window.__omsLoadResult (the earlier pass predates the fix). Then: verification.md, spec verify (quiet window with oms-60), independent review.
- 2026-11-09 23:02 — 2026-11-10: the live grids drew no rows (AG Grid modules were never registered; applyTransaction failed with error #200). Fixed: theme/agGridModules.ts (AllCommunityModule), rowData=NO_ROWS, onFlush only on an accepted transaction. All earlier AC-9/AC-10/AC-11 measurements are void (measurements/*.json marked). AC-11 re-measured with rows: 928 ms in the throttled automation tab (budget 1,000). To unblock: the user re-runs AC-9 (rate=2000, 60 s) and AC-10 (rate=1000, 600 s) harness pages on the current 8080 build, window in front, and pastes both results; ideally also reads performance.getEntriesByName('oms:snapshot:Execution') after opening the live Executions tab.
- 2026-11-10 06:46 — 2026-11-10 consistency check of StreamingBlotter.tsx: the memoised AgGridReact element, useCallback onGridReady/onRowDoubleClicked and animateRows=false are SPEC-0057's AC-9 run-2 fix (design.md; test 'does not re-render the grid when only the counters change'; measurements ac-9-harness-run2-fail.json, ac-9-harness-15s-after-fix.json). SPEC-0058 has since edited the same file (fit-to-width sizing inside the memo, theme row height 30 px, toolbar icons, modal badges). AC-9 (60 s) and AC-10 still need to be measured on the current build that includes SPEC-0058.
- 2026-11-10 10:22 — 2026-11-10: the requester asked to unblock and finish (chat: 'Yes, unblock and finish'). Measurements on the current build: measurements/ac-9-harness-final.json (AC-9 PASS), ac-10-harness-final.json (AC-10 PASS, 0% heap growth), ac-11-snapshot-final.json (761 ms).
- 2026-11-10 10:22 — unblocked → implement
- 2026-11-10 10:24 — verify run: pass
- 2026-11-10 10:24 — implement → verify
- 2026-11-10 10:28 — reopened at implement: Second independent review (MET) found a major hazard: the 1 s quiet-snapshot fallback can fire against the new server when an oms-core page is slow; late SNAPSHOT rows are then put as live (newest first, so newer rows get evicted: AC-5) and the late SNAPSHOT_END is ignored (no 'of M': AC-8). Plus minor: refused transaction desyncs the store, TestStreamController SSE emits the marker, hidden blotters schedule frames.
- 2026-11-10 10:32 — verify run: pass
- 2026-11-10 10:32 — implement → verify
- 2026-11-10 10:33 — verify run: pass
- 2026-11-10 10:34 — verify → done
- 2026-11-10 10:34 — autopilot off
