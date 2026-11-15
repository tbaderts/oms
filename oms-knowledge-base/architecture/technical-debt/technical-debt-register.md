---
type: Assessment
title: "Technical Debt Register"
description: "Known shortcuts, gaps and open review findings of the OMS, each with its impact, where it is, and the planned fix or ticket; kept current by the tickets that add or remove debt."
tags: [technical-debt, architecture, review, backlog]
status: draft
updated: "2026-11-14T12:00:00Z"
sources:
  - resource: "repo:oms-core/src/main/java/org/example/common/util/JsonHelper.java"
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/index/EmbeddingService.java"
  - resource: "repo:docker-compose.yml"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/OrderController.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/tasks/ValidateOrderTask.java"
---
# Technical Debt Register

What the OMS knowingly owes. Each item says what is wrong, why it matters and what would fix it.
A ticket that adds a shortcut adds a row; a ticket that removes one deletes its row and says so in
its log. Items found by a capability review are also listed under that capability's *Known gaps*.

Severity: **H** risks wrong behaviour or data, **M** costs effort or performance, **L** is untidy.

## Open (verified against the code on 2026-11-14)

| # | Sev | Debt | Where | Impact | Fix |
|---|---|---|---|---|---|
| TD-1 | M | Jackson 2 (`com.fasterxml.jackson.databind`) still used, against policy P-12 | `JsonHelper` (oms-core), `EmbeddingService`, `OrderQueryClient` (oms-mcp-server) | Two JSON stacks, different defaults | Port to `tools.jackson.databind` |
| TD-3 | M | The REST read API (`/api/orders`, `/api/executions`) is hand-written, not in the OpenAPI contracts, and has no automated tests | `OrderController`, `ExecutionController` | Breaks spec-first (P-02); changes go unnoticed | Contract it in `oms-query-api.yml` or retire it in favour of the Query API |
| TD-4 | H | Order validation is a hard-coded task, tested for one rule only; the designed rule engine is not built | `ValidateOrderTask`, [Validation Engine](../../framework/validation-engine.md), FR-002 (partial) | Untested rules can regress silently | Test every rule in `ValidateOrderTaskTest`; build the engine when rules multiply |
| TD-5 | H | `ExecutionBustCmd` and `ExecutionWhackCmd` have schemas and log events (SPEC-0044) but no handler | [Execution Processing](../../capabilities/execution-processing.md), FR-015, FR-016 | Busts must be fixed by hand in the database | SPEC-0030 |
| TD-6 | M | The Order Lifecycle specification disagrees with the state machine (NEW → REJ, NEW → CXL, UNACK → FILLED) | [Order Lifecycle](../../domain/concepts/order-lifecycle.md), `OrderStateMachineConfig` | Readers and agents can build on transitions the code refuses | Decide which is right; rewrite the specification or change the machine |
| TD-7 | M | `order_events`, `executions` and `outbox` grow without bound; `CLOSED` drives no archival | schema, `EndOfDayService` | Storage and query cost grow forever | SPEC-0052 (blocked) |
| TD-8 | M | The RSocket routes of the streaming service are not tested over RSocket: `TradeBlotterExecutionStreamTest` calls the controller methods directly, so routing, payload encoding and the snapshot-then-stream merge over the wire are untested | `TradeBlotterController` | The blotter's live path can break unnoticed | Route tests with an RSocket requester |
| TD-9 | L | No trading calendar and one end of day for the whole OMS | `EndOfDayScheduler` | Wrong expiry on holidays and across venues | Calendar and per-venue sessions when a real venue arrives |
| TD-10 | L | SLA metrics have dashboards but no alert rules; `leg` is not populated, so client and market orders are not separated | [Order SLA Monitoring](../../capabilities/order-sla-monitoring.md) | Breaches are only seen by looking | Alert rules in Grafana; populate `leg` with order trees |
| TD-11 | L | The knowledge index is built at startup only | `KnowledgeIndexService` | Knowledge base edits need a server restart | Watch the folder and re-index changed files |
| TD-12 | L | `oms-mcp-server` has no actuator, unlike the other services | `oms-mcp-server/build.gradle` | No health endpoint for compose or monitoring | Add `spring-boot-starter-actuator` |
| TD-13 | M | No build-and-test CI; the only workflow with checks (`spec-gates`) triggers on pull requests, which the direct-to-main workflow does not use | `.github/workflows/` | A broken module is found only when someone runs its checks | Run every module's verify on push to `main` ([CI/CD](../../delivery/ci-cd.md)) |
| TD-14 | M | The knowledge base checks (`okf-check`, its tests, `check-kb-refs`) are not in the `verify` list of `oms-knowledge-base` in `specs/config.json`, so `spec verify` does not run them | `specs/config.json` | A ticket can pass verify with a broken knowledge base | Add the three commands to the module's `verify` (a human change: gate config) |

## Findings of the November review, not re-verified here

From the [event sourcing and CQRS review](../assessments/event-sourcing-cqrs-review-2026-11-07.md)
(section on findings). They may have been addressed by later tickets; check the code before acting:

- **F-7** (M) publication latency floor from the relay's poll interval.
- **F-14** (L) projection outbox payloads encoded and decoded with possibly different schemas
  across a deployment.
- **F-15** (M) projection rebuild loads everything into memory and locks the table.
- **F-19** (L) no aggregate-level test fixture.

## Resolved since the reviews

TD-2, an unused Qdrant container in compose (left over from before the knowledge server moved to an
embedded Lucene index), was removed in SPEC-0061.


Going by the tickets that closed them: F-1 execution lifecycle in the log (SPEC-0044); F-2 refused
commands leave a trace and F-13 duplicate command ids (SPEC-0046); F-3, F-4 fill write set and
sequences (SPEC-0047); F-5, F-6, F-8, F-16 several instances, relay leader, listener concurrency,
scheduler leader (SPEC-0048); F-10, F-12 event metadata, change diffs, reconciliation (SPEC-0049);
F-11 `CancelState` in a state machine (`CancelStateMachineConfig`, SPEC-0044).
