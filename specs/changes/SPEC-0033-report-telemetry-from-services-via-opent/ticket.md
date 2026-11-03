---
id: SPEC-0033
title: Report telemetry from services via OpenTelemetry
type: feature
status: done
awaiting:
autopilot: false
modules: [oms-core, oms-streaming-service, oms-exchange-simulator, oms-mcp-server, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-31
blocked_from:
blocked_reason:
---

# SPEC-0033 — Report telemetry from services via OpenTelemetry

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

we also need to make sure that oms-core and other services use open telemetry dependencies for reporting and adjust logging for using the grafana stack

## Log

- 2026-10-31 created
- 2026-11-02 11:44 — autopilot on
- 2026-11-02 11:46 — set modules = oms-core, oms-streaming-service, oms-exchange-simulator, oms-mcp-server, oms-knowledge-base
- 2026-11-02 11:47 — proposal gate passed; awaiting human approval
- 2026-11-02 11:49 — proposal approved by Toni Badertscher
- 2026-11-02 11:49 — proposal → design
- 2026-11-02 11:52 — design → plan
- 2026-11-02 11:55 — plan → implement
- 2026-11-02 13:14 — verify run: pass
- 2026-11-02 13:29 — verify run: pass
- 2026-11-02 13:37 — verify run: pass
- 2026-11-02 13:37 — implement → verify
- 2026-11-02 13:37 — verify → done
- 2026-11-02 13:37 — autopilot off
