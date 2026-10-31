---
id: SPEC-0018
title: Fix outbox key, audit and dedup defects
type: fix
status: done
awaiting:
autopilot: false
modules: [oms-core, oms-contracts, oms-streaming-service, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-30
blocked_from:
blocked_reason:
---

# SPEC-0018 — Fix outbox key, audit and dedup defects

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Address findings 1 to 5 of the architecture review (oms-core/docs/architecture-review-2026-10-30.md, section 8): key execution messages by orderId (rootOrderId once trees exist) instead of execId and document the key of every topic; pass the ExecutionCreateCmd through for fills received over REST so the event log records the command; expose the event version in the query DTO and deduplicate the streaming snapshot on it instead of the database id; replace the event-history scan in DeduplicateCommandTask with a command_id column on order_events under a unique (order_id, command_id) index; make findByRootOrderId return a list and add findByParentOrderId.

## Log

- 2026-10-30 created
- 2026-10-31 05:44 — autopilot on
- 2026-10-31 05:47 — proposal gate passed; awaiting human approval
- 2026-10-31 05:47 — proposal approved by Toni Badertscher
- 2026-10-31 05:47 — proposal → design
- 2026-10-31 05:52 — design → plan
- 2026-10-31 05:53 — plan → implement
- 2026-10-31 06:01 — blocked: Implement: Docker Desktop port forwarding is broken on this machine. Testcontainers starts postgres:16-alpine, but JDBC to localhost:<mapped port> fails with SocketTimeoutException (Read timed out). The running compose services time out too (oms-core :8090, grafana :3000 -> curl 000). All remaining verify steps are oms-core Testcontainers tests. Done: T-1 (eventVersion contract), T-6 (streaming per-order dedup, green). T-2 is written (006 changelog, OrderEvent.commandId, migration assertion) but not verified. To unblock: restart Docker Desktop, then spec unblock SPEC-0018 and /spec-run SPEC-0018.
- 2026-10-31 06:01 — autopilot off
- 2026-10-31 06:17 — autopilot on
- 2026-10-31 06:19 — unblocked → implement
- 2026-10-31 06:45 — verify run: pass
- 2026-10-31 06:47 — implement → verify
- 2026-10-31 06:51 — reopened at implement: Independent review: QueryController's class-level @Transactional(readOnly) makes OrderQueryService.search join a READ COMMITTED transaction, so REPEATABLE_READ never applies and eventVersion can belong to a newer state than the order on the page (P-08). Fix and test the isolation in effect.
- 2026-10-31 06:57 — blocked: Implement (reopened at verify): T-14 is written but cannot be verified. The independent review found that QueryController's class-level @Transactional(readOnly) makes OrderQueryService.search join a READ COMMITTED transaction, so REPEATABLE_READ never applies (P-08); T-14 (QuerySearchIsolationIntegrationTest, red-first, then drop the controller annotation) is added but not run yet. Blocked because other Claude sessions are working in the same working tree at the same time: SPEC-0034 is editing oms-core (oms-cmd-api.yml, GlobalExceptionHandler, CommandControllerWebMvcTest, OrderLifecycleIntegrationTest, prometheus.yml deleted), and its Gradle runs share oms-core/build, so the test task fails with EOFException/NoSuchFileException, and any verify evidence would include the other ticket's unfinished changes. To unblock: let the SPEC-0034 session finish (or run it in a separate worktree), then spec unblock SPEC-0018 and /spec-run SPEC-0018.
- 2026-10-31 07:02 — unblocked → implement
- 2026-10-31 07:15 — autopilot on
- 2026-10-31 07:17 — implement → verify
- 2026-10-31 07:18 — verify run: pass
- 2026-10-31 07:23 — verify run: pass
- 2026-10-31 07:23 — verify → done
- 2026-10-31 07:23 — autopilot off
