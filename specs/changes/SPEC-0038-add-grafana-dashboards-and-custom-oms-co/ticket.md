---
id: SPEC-0038
title: Add Grafana dashboards and custom oms-core metrics
type: feature
status: done
awaiting:
autopilot: false
modules: [oms-core, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-31
blocked_from:
blocked_reason:
---

# SPEC-0038 — Add Grafana dashboards and custom oms-core metrics

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

I guess we haven't created dashboards yet and the best way to do that would be via grafana mcp client. maybe we create a new ticket for setting all of this up, test grafana integration with dashboard and create some custom metrics in oms-core to expose some data points for metrics

## Log

- 2026-10-31 created
- 2026-11-02 15:52 — autopilot on
- 2026-11-02 15:54 — proposal gate passed; awaiting human approval
- 2026-11-02 15:56 — proposal approved by Toni Badertscher
- 2026-11-02 15:56 — proposal → design
- 2026-11-02 15:58 — design → plan
- 2026-11-02 15:59 — plan → implement
- 2026-11-02 16:11 — verify run: pass
- 2026-11-02 16:19 — verify run: pass
- 2026-11-02 16:19 — implement → verify
- 2026-11-02 16:19 — verify → done
- 2026-11-02 16:19 — autopilot off
