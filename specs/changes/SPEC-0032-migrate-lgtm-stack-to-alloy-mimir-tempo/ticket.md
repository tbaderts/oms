---
id: SPEC-0032
title: Migrate LGTM stack to Alloy, Mimir, Tempo 3
type: chore
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

# SPEC-0032 — Migrate LGTM stack to Alloy, Mimir, Tempo 3

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

the goal is to have the grafana lgtm stack running locally, which is grafana dashboard, loki, tempo, mimir and some telemetry agent like opentelemetry. we also need to check if we run recent versions. we have a few things in the setup that are probably obsolete now like jaeger, prometheus and specifically promtrail, which is end of life.

## Log

- 2026-10-31 created
- 2026-10-31 05:51 — autopilot on
- 2026-10-31 05:53 — proposal gate passed; awaiting human approval
- 2026-10-31 05:53 — proposal approved by Toni Badertscher
- 2026-10-31 05:53 — proposal → design
- 2026-10-31 06:04 — reopened at proposal: AC-7 untestable within scope: oms-core emits no traces today (Boot 4 tracing auto-config modules spring-boot-micrometer-tracing(-opentelemetry) are not on the classpath, so the OtlpGrpcSpanExporter bean is never used). Fixing it is a Gradle change, scoped to SPEC-0033. Moving oms-core trace delivery to SPEC-0033.
- 2026-10-31 06:04 — proposal gate passed; awaiting human approval
- 2026-10-31 06:14 — proposal approved by Toni Badertscher
- 2026-10-31 06:14 — proposal → design
- 2026-10-31 06:21 — design → plan
- 2026-10-31 06:21 — plan → implement
- 2026-10-31 06:38 — verify run: fail
- 2026-10-31 06:39 — verify run: fail
- 2026-10-31 06:44 — verify run: pass
- 2026-10-31 06:44 — implement → verify
- 2026-10-31 06:48 — reopened at implement: spec-reviewer: AC-5 freshness guard ineffective (Loki label values ignore start), AC-8 metric not unique per run, AC-2 restart check is a State snapshot only. Strengthening the smoke test.
- 2026-10-31 06:50 — verify run: pass
- 2026-10-31 06:50 — implement → verify
- 2026-10-31 06:53 — verify run: fail
- 2026-10-31 07:13 — blocked: Verify gate only: all 8 ACs PASS (smoke test 37/37 cold and warm; spec-reviewer MET, findings fixed; verification.md complete with Verdict GOAL MET). The required oms-core ./gradlew check fails on QuerySearchIsolationIntegrationTest#search_readsOrdersAndVersionsUnderRepeatableRead, a red-first test that SPEC-0018 T-14 (another session, same working tree) added at 07:51 and has not turned green; SPEC-0032 changes no Java. Earlier Gradle NoSuchFileException/EOFException came from the same sessions sharing oms-core/build. To unblock: let SPEC-0018 finish T-14 (or move one ticket to a separate worktree), then spec unblock SPEC-0032, spec verify SPEC-0032, spec advance SPEC-0032.
- 2026-10-31 07:58 — autopilot on
- 2026-10-31 07:59 — Block cause resolved: SPEC-0018 is done (T-14 finished; QuerySearchIsolationIntegrationTest passes, oms-core 191/191 in SPEC-0034's final verify). Unblocked by the agent at the start of /spec-run SPEC-0032 requested by the user.
- 2026-10-31 07:59 — unblocked → verify
- 2026-10-31 07:59 — verify run: pass
- 2026-10-31 07:59 — verify → done
- 2026-10-31 07:59 — autopilot off
