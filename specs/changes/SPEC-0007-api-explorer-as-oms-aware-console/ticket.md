---
id: SPEC-0007
title: API Explorer as OMS-aware console
type: feature
status: done
awaiting:
autopilot: false
modules: [developer-cockpit]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-27
blocked_from:
blocked_reason:
---

# SPEC-0007 — API Explorer as OMS-aware console

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Build the developer-cockpit API Explorer (so far only a placeholder) as an OMS-aware console rather than a second Swagger UI: pick a command type, get a request built from its schema, send it, and see the order's resulting state and events.

## Log

- 2026-10-27 created
- 2026-10-27 10:15 — proposal gate passed; awaiting human approval
- 2026-10-27 10:18 — proposal approved by Toni Badertscher
- 2026-10-27 10:18 — proposal → design
- 2026-10-27 10:21 — design → plan
- 2026-10-27 10:23 — autopilot on
- 2026-10-27 10:24 — plan → implement
- 2026-10-27 10:44 — blocked: T-12 runtime check needs the built cockpit to start, but the user's running Developer Cockpit (pid 48372, started 08:53) holds the hard-coded WebSocket port 9321. Tried: checked for a configurable port (WS_PORT is a constant, CSP names 9321). Needs: the user to close their cockpit, then unblock; the check script and build are ready.
- 2026-10-27 11:18 — unblocked → implement
- 2026-10-27 11:25 — verify run: pass
- 2026-10-27 11:25 — implement → verify
- 2026-10-27 11:29 — reopened at implement: Independent review: null not reported for required props; shown search URL keeps page=N after edits; refused sends recorded as 'unreachable' and history.add can reject the IPC; blank orderId accepted by followUp; 'not found' shown when the order query failed
- 2026-10-27 11:32 — verify run: pass
- 2026-10-27 11:32 — implement → verify
- 2026-10-27 11:33 — verify → done
- 2026-10-27 11:33 — autopilot off
