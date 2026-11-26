---
id: SPEC-0078
title: Evaluate Cozystack for local Kubernetes deployment
type: spike
status: done
awaiting:
autopilot: false
modules: [oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-26
blocked_from:
blocked_reason:
---

# SPEC-0078 — Evaluate Cozystack for local Kubernetes deployment

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

I wanted to setup cozystack (https://github.com/cozystack/cozystack) as an alternative to docker and run my service in kubernetes, so I can also test scaling. I want kubenetes with postgres, kafka, grafana and redis operators. as part of that I also want to look at how we can streamline the build/deploy/test cycle. we start we some analysis first. I want to fugure out first if this makes sense or maybe it's an overkill for my local setup. maybe docker and cozystack can coexist and I will use both of them (not simultaniously) as it fits my needs.

## Log

- 2026-11-26 created
- 2026-11-26 11:56 — autopilot on
- 2026-11-26 11:58 — proposal gate passed; awaiting human approval
- 2026-11-26 12:03 — proposal approved by Toni Badertscher
- 2026-11-26 12:03 — proposal → design
- 2026-11-26 12:04 — design → plan
- 2026-11-26 12:04 — plan → implement
- 2026-11-26 12:49 — blocked: Docker Desktop crashed at 12:45 UTC: host C: drive full (0.8 GB free), docker_data.vhdx (83 GB) could not grow, VM disk I/O errors, read-only fs, containerd bus error. The k3d prototype (T-5) contributed to the disk use. Measurements so far are saved in spike/timings.md and k3d-stats.txt. T-5 is effectively done (measured); T-6 (delete cluster) and restoring compose need Docker running. Needs the user to free disk space on C: and restart Docker Desktop (the agent did not delete anything of the user's). Then unblock: the agent deletes the k3d cluster and image, restarts compose, and writes ADR-006.
- 2026-11-26 13:17 — unblocked → implement
- 2026-11-26 13:19 — verify run: pass
- 2026-11-26 13:19 — implement → verify
- 2026-11-26 13:23 — reopened at implement: spec-reviewer: compose footprint omits control-center and pgadmin, CPU column misread, AC-9 test tautological, Skaffold claim false, switch path contradicts evidence, option-3 arithmetic, cozystack.md table, k3d-stats caveat, no test entry point
- 2026-11-26 13:25 — verify run: pass
- 2026-11-26 13:25 — implement → verify
- 2026-11-26 13:26 — verify run: pass
- 2026-11-26 13:27 — verify → done
- 2026-11-26 13:27 — autopilot off
