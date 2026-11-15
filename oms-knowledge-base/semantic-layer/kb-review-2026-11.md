---
type: Assessment
title: "Knowledge Base Review (November 2026)"
description: "Register of the SPEC-0061 review: every document of the knowledge base before the reorganisation, what was done with it (keep, update, merge, archive, delete), where it lives now, and what was found."
tags: [knowledge-base, review, register, okf]
status: stable
point_in_time: true
updated: "2026-11-14T12:00:00Z"
---
# Knowledge Base Review (November 2026)

SPEC-0061 reorganised the knowledge base into the sections described in the
[Knowledge Base Strategy](knowledge-base-strategy.md) and reviewed every document against the code
on `main` (base commit `33f4e20`). This register lists all 161 markdown files that existed
before, so any old path can be traced. Moved concepts also keep their old id in `aliases`, which
the knowledge server resolves.

**Method.** Every document was scanned for claims that can be checked mechanically: class, file,
endpoint, topic and table names, technologies and versions, retired terms and links. Documents with
findings, and every specification that describes behaviour, were then read against the code: wrong
facts were corrected, specifications that describe more than is built got an *Implementation
status* banner instead of a rewrite, and superseded documents went to the
[archive](../archive/index.md). Documents whose **disposition is keep** passed the mechanical scan
and were moved or had their metadata normalised, but were **not read line by line**; their
`updated` date records the move, not a full content review. An independent agent review then
spot-checked the result and its findings were fixed. Machine-reviewed only: nobody has signed off a
document as human-reviewed (`verified`).

**Totals.** keep 107, update 44, merge 4, archive 6,
delete 0.

## Documents that most need a human eye

- [domain/concepts/order-lifecycle.md](../domain/concepts/order-lifecycle.md) — Banner: transitions differ from OrderStateMachineConfig (no NEW→REJ, NEW→CXL, UNACK→FILLED; adds FILLED→LIVE and end-of-day CLOSED); Order State is authoritative.decide whether to rewrite the spec to the code or change the state machine. Status lowered to draft.
- [framework/validation-engine.md](../framework/validation-engine.md) — Banner: the rule engine (ValidationEngine, ValidationRule, factories) is not built; validation is done by pipeline tasks; status to draft.1,450 lines of unbuilt design — keep as target, or archive.
- The 107 documents with disposition **keep** (see below): they passed the mechanical
  scan but were not read line by line. The functional and non-functional requirements among them
  were re-checked for their implementation status and sources (T-14).

## Register

Dispositions: **keep** (moved or unchanged, metadata normalised), **update** (content corrected or
extended), **merge** (folded into the new path together with another document), **archive** (moved
to the archive as deprecated), **delete** (removed; content is elsewhere).

| Old path | Disposition | New path | Notes |
|---|---|---|---|
| `KNOWLEDGE-BASE-REVIEW-REPORT.md` | archive | `archive/kb-review-report-2026-02.md` | February review of 20 documents; superseded by this register. |
| `architecture/contracts-module.md` | keep | `architecture/decisions/ADR-001-contracts-module.md` | Now ADR-001 with an id. |
| `architecture/developer-cockpit.md` | update | `tools/developer-cockpit.md` | Requirements view rewritten for the SPEC-0061 catalogue (Capabilities tab, implementation, layout module). |
| `architecture/event-sourcing.md` | keep | `architecture/decisions/ADR-002-event-sourcing.md` | Now ADR-002 with an id. |
| `architecture/exchange-simulator.md` | merge | `architecture/context/exchange-simulator.md` | Component page merged with the simulator specification into one Component. |
| `architecture/index.md` | update | `architecture/index.md` | Regenerated with the six architecture sub-sections. |
| `architecture/kb-explorer.md` | keep | `tools/kb-explorer.md` | Moved; metadata normalised. |
| `architecture/mcp-server.md` | update | `tools/knowledge-server.md` | Rewritten: current tools, in-process Lucene index with Ollama embeddings (it claimed Qdrant), alias redirect and deprecated filter from SPEC-0061. |
| `architecture/oms-contracts.md` | update | `architecture/context/oms-contracts.md` | Links renamed to Message API and Contract-first Code Generation. |
| `architecture/oms-core.md` | update | `architecture/context/oms-core.md` | Package list completed (commandlog, endofday, leadership, reconciliation, sla, metrics, projection). |
| `architecture/oms-ui.md` | update | `architecture/context/oms-ui.md` | Links the UI specification and the design system. |
| `architecture/shared-table-cqrs.md` | update | `architecture/decisions/ADR-003-shared-table-cqrs.md` | Now ADR-003; points to the query engine and marks the read-store design as archived. |
| `architecture/streaming-service.md` | update | `architecture/context/streaming-service.md` | Consumes oms_order_executions, not oms_executions. |
| `architecture/system-context.md` | update | `architecture/context/system-context.md` | Added oms_order_executions, mission control, the planned market adapter, pgAdmin and the Grafana MCP server; Qdrant is not used by the MCP server (it said it was). |
| `architecture/task-pipeline-and-state-machine.md` | keep | `architecture/decisions/ADR-004-task-pipeline-and-state-machine.md` | Now ADR-004 with an id. |
| `architecture/transactional-outbox.md` | keep | `architecture/decisions/ADR-005-transactional-outbox.md` | Now ADR-005 with an id. |
| `capabilities/admin-ui.md` | keep | `capabilities/admin-ui.md` | Metadata normalised. |
| `capabilities/block-allocation.md` | keep | `capabilities/block-allocation.md` | Metadata normalised. |
| `capabilities/booking-integration.md` | keep | `capabilities/booking-integration.md` | Metadata normalised. |
| `capabilities/event-publication.md` | keep | `capabilities/event-publication.md` | Metadata normalised. |
| `capabilities/event-sourcing-and-replay.md` | keep | `capabilities/event-sourcing-and-replay.md` | Metadata normalised. |
| `capabilities/exchange-simulation.md` | keep | `capabilities/exchange-simulation.md` | Metadata normalised. |
| `capabilities/execution-processing.md` | keep | `capabilities/execution-processing.md` | Metadata normalised. |
| `capabilities/index.md` | update | `capabilities/index.md` | Index regenerated for the new layout. |
| `capabilities/knowledge-services.md` | keep | `capabilities/knowledge-services.md` | Metadata normalised. |
| `capabilities/order-acceptance.md` | keep | `capabilities/order-acceptance.md` | Metadata normalised. |
| `capabilities/order-cancellation.md` | keep | `capabilities/order-cancellation.md` | Metadata normalised. |
| `capabilities/order-capture.md` | keep | `capabilities/order-capture.md` | Metadata normalised. |
| `capabilities/order-expiry-and-close.md` | keep | `capabilities/order-expiry-and-close.md` | Metadata normalised. |
| `capabilities/order-grouping.md` | keep | `capabilities/order-grouping.md` | Metadata normalised. |
| `capabilities/order-query.md` | keep | `capabilities/order-query.md` | Metadata normalised. |
| `capabilities/order-rejection.md` | keep | `capabilities/order-rejection.md` | Metadata normalised. |
| `capabilities/order-replace.md` | keep | `capabilities/order-replace.md` | Metadata normalised. |
| `capabilities/order-sla-monitoring.md` | keep | `capabilities/order-sla-monitoring.md` | Metadata normalised. |
| `capabilities/post-trade-analytics.md` | keep | `capabilities/post-trade-analytics.md` | Metadata normalised. |
| `capabilities/quotes.md` | keep | `capabilities/quotes.md` | Metadata normalised. |
| `capabilities/real-time-streaming.md` | keep | `capabilities/real-time-streaming.md` | Metadata normalised. |
| `domain/command-log.md` | update | `domain/model/command-log.md` | Added the missing provenance (generated). |
| `domain/execution.md` | keep | `domain/model/execution.md` | Moved; metadata normalised. |
| `domain/glossary.md` | keep | `domain/model/glossary.md` | Moved; metadata normalised. |
| `domain/index.md` | update | `domain/index.md` | Index regenerated for the new layout. |
| `domain/order-event.md` | keep | `domain/model/order-event.md` | Moved; metadata normalised. |
| `domain/order-quantities.md` | keep | `domain/model/order-quantities.md` | Moved; metadata normalised. |
| `domain/order-state.md` | keep | `domain/model/order-state.md` | Moved; metadata normalised. |
| `domain/order.md` | keep | `domain/model/order.md` | Moved; metadata normalised. |
| `domain/outbox-message.md` | keep | `domain/model/outbox-message.md` | Moved; metadata normalised. |
| `domain/quote-and-quote-request.md` | keep | `domain/model/quote-and-quote-request.md` | Moved; metadata normalised. |
| `functional-requirements/FR-001-accept-new-orders.md` | keep | `capabilities/functional-requirements/FR-001-accept-new-orders.md` | Moved; metadata normalised. |
| `functional-requirements/FR-002-validate-new-orders.md` | keep | `capabilities/functional-requirements/FR-002-validate-new-orders.md` | Moved; metadata normalised. |
| `functional-requirements/FR-003-record-order-creation.md` | keep | `capabilities/functional-requirements/FR-003-record-order-creation.md` | Moved; metadata normalised. |
| `functional-requirements/FR-004-reject-duplicate-client-order-id.md` | keep | `capabilities/functional-requirements/FR-004-reject-duplicate-client-order-id.md` | Moved; metadata normalised. |
| `functional-requirements/FR-005-acknowledge-orders.md` | keep | `capabilities/functional-requirements/FR-005-acknowledge-orders.md` | Moved; metadata normalised. |
| `functional-requirements/FR-006-refuse-invalid-acceptance.md` | keep | `capabilities/functional-requirements/FR-006-refuse-invalid-acceptance.md` | Moved; metadata normalised. |
| `functional-requirements/FR-007-request-cancel.md` | keep | `capabilities/functional-requirements/FR-007-request-cancel.md` | Moved; metadata normalised. |
| `functional-requirements/FR-008-confirm-cancel.md` | keep | `capabilities/functional-requirements/FR-008-confirm-cancel.md` | Moved; metadata normalised. |
| `functional-requirements/FR-009-reject-cancel-request.md` | keep | `capabilities/functional-requirements/FR-009-reject-cancel-request.md` | Moved; metadata normalised. |
| `functional-requirements/FR-010-deduplicate-lifecycle-commands.md` | keep | `capabilities/functional-requirements/FR-010-deduplicate-lifecycle-commands.md` | Moved; metadata normalised. |
| `functional-requirements/FR-011-reject-orders.md` | keep | `capabilities/functional-requirements/FR-011-reject-orders.md` | Moved; metadata normalised. |
| `functional-requirements/FR-012-expose-reject-reason.md` | keep | `capabilities/functional-requirements/FR-012-expose-reject-reason.md` | Moved; metadata normalised. |
| `functional-requirements/FR-013-apply-fills.md` | keep | `capabilities/functional-requirements/FR-013-apply-fills.md` | Moved; metadata normalised. |
| `functional-requirements/FR-014-publish-fills.md` | keep | `capabilities/functional-requirements/FR-014-publish-fills.md` | Moved; metadata normalised. |
| `functional-requirements/FR-015-bust-executions.md` | keep | `capabilities/functional-requirements/FR-015-bust-executions.md` | Moved; metadata normalised. |
| `functional-requirements/FR-016-whack-executions.md` | keep | `capabilities/functional-requirements/FR-016-whack-executions.md` | Moved; metadata normalised. |
| `functional-requirements/FR-017-reject-duplicate-execution.md` | keep | `capabilities/functional-requirements/FR-017-reject-duplicate-execution.md` | Moved; metadata normalised. |
| `functional-requirements/FR-018-search-orders.md` | keep | `capabilities/functional-requirements/FR-018-search-orders.md` | Moved; metadata normalised. |
| `functional-requirements/FR-019-describe-entities.md` | keep | `capabilities/functional-requirements/FR-019-describe-entities.md` | Moved; metadata normalised. |
| `functional-requirements/FR-020-append-event-per-change.md` | keep | `capabilities/functional-requirements/FR-020-append-event-per-change.md` | Moved; metadata normalised. |
| `functional-requirements/FR-021-replay-orders.md` | keep | `capabilities/functional-requirements/FR-021-replay-orders.md` | Moved; metadata normalised. |
| `functional-requirements/FR-022-atomic-command-processing.md` | keep | `capabilities/functional-requirements/FR-022-atomic-command-processing.md` | Moved; metadata normalised. |
| `functional-requirements/FR-023-relay-outbox-in-order.md` | keep | `capabilities/functional-requirements/FR-023-relay-outbox-in-order.md` | Moved; metadata normalised. |
| `functional-requirements/FR-024-retry-failed-publication.md` | keep | `capabilities/functional-requirements/FR-024-retry-failed-publication.md` | Moved; metadata normalised. |
| `functional-requirements/FR-025-filter-streams.md` | keep | `capabilities/functional-requirements/FR-025-filter-streams.md` | Moved; metadata normalised. |
| `functional-requirements/FR-026-map-blotter-records.md` | keep | `capabilities/functional-requirements/FR-026-map-blotter-records.md` | Moved; metadata normalised. |
| `functional-requirements/FR-027-decide-venue-outcome.md` | keep | `capabilities/functional-requirements/FR-027-decide-venue-outcome.md` | Moved; metadata normalised. |
| `functional-requirements/FR-028-slice-fills.md` | keep | `capabilities/functional-requirements/FR-028-slice-fills.md` | Moved; metadata normalised. |
| `functional-requirements/FR-029-drive-oms-lifecycle.md` | keep | `capabilities/functional-requirements/FR-029-drive-oms-lifecycle.md` | Moved; metadata normalised. |
| `functional-requirements/FR-030-measure-order-latency.md` | keep | `capabilities/functional-requirements/FR-030-measure-order-latency.md` | Moved; metadata normalised. |
| `functional-requirements/FR-031-live-blotter.md` | keep | `capabilities/functional-requirements/FR-031-live-blotter.md` | Moved; metadata normalised. |
| `functional-requirements/FR-032-metamodel-driven-grid.md` | keep | `capabilities/functional-requirements/FR-032-metamodel-driven-grid.md` | Moved; metadata normalised. |
| `functional-requirements/FR-033-serve-knowledge-base.md` | keep | `capabilities/functional-requirements/FR-033-serve-knowledge-base.md` | Moved; metadata normalised. |
| `functional-requirements/FR-034-search-orders-for-agents.md` | keep | `capabilities/functional-requirements/FR-034-search-orders-for-agents.md` | Moved; metadata normalised. |
| `functional-requirements/FR-035-browse-knowledge-base.md` | keep | `capabilities/functional-requirements/FR-035-browse-knowledge-base.md` | Moved; metadata normalised. |
| `functional-requirements/FR-036-replace-orders.md` | keep | `capabilities/functional-requirements/FR-036-replace-orders.md` | Moved; metadata normalised. |
| `functional-requirements/FR-037-request-quotes.md` | keep | `capabilities/functional-requirements/FR-037-request-quotes.md` | Moved; metadata normalised. |
| `functional-requirements/FR-038-provide-quotes.md` | keep | `capabilities/functional-requirements/FR-038-provide-quotes.md` | Moved; metadata normalised. |
| `functional-requirements/FR-039-group-client-orders.md` | keep | `capabilities/functional-requirements/FR-039-group-client-orders.md` | Moved; metadata normalised. |
| `functional-requirements/FR-040-allocate-group-fills.md` | keep | `capabilities/functional-requirements/FR-040-allocate-group-fills.md` | Moved; metadata normalised. |
| `functional-requirements/FR-041-allocate-block-executions.md` | keep | `capabilities/functional-requirements/FR-041-allocate-block-executions.md` | Moved; metadata normalised. |
| `functional-requirements/FR-042-average-price.md` | keep | `capabilities/functional-requirements/FR-042-average-price.md` | Moved; metadata normalised. |
| `functional-requirements/FR-043-book-executions.md` | keep | `capabilities/functional-requirements/FR-043-book-executions.md` | Moved; metadata normalised. |
| `functional-requirements/FR-044-post-trade-data-feed.md` | keep | `capabilities/functional-requirements/FR-044-post-trade-data-feed.md` | Moved; metadata normalised. |
| `functional-requirements/FR-045-okf-aware-knowledge-tools.md` | keep | `capabilities/functional-requirements/FR-045-okf-aware-knowledge-tools.md` | Moved; metadata normalised. |
| `functional-requirements/FR-046-okf-aware-kb-explorer.md` | keep | `capabilities/functional-requirements/FR-046-okf-aware-kb-explorer.md` | Moved; metadata normalised. |
| `functional-requirements/index.md` | update | `capabilities/functional-requirements/index.md` | Index regenerated for the new layout. |
| `illustrations/index.md` | update | `architecture/illustrations/index.md` | Index regenerated for the new layout. |
| `illustrations/order-state-indicator-spec.md` | keep | `ui/order-state-indicator.md` | Moved to ui as order-state-indicator. |
| `illustrations/order_allocation_diagrams.md` | keep | `architecture/illustrations/order-allocation-diagrams.md` | Moved; metadata normalised. |
| `illustrations/task-orchestration-diagrams.md` | keep | `architecture/illustrations/task-orchestration-diagrams.md` | Moved; metadata normalised. |
| `index.md` | update | `index.md` | Rewritten for the new sections, with a where-to-start paragraph. |
| `interfaces/avro-messages.md` | merge | `domain/interfaces/message-api.md` | Merged with the Kafka topics into the Message API. |
| `interfaces/command-api.md` | keep | `domain/interfaces/command-api.md` | Moved; metadata normalised. |
| `interfaces/index.md` | update | `domain/interfaces/index.md` | Index regenerated for the new layout. |
| `interfaces/kafka-topics.md` | merge | `domain/interfaces/message-api.md` | Merged with the Avro catalogue into the Message API. |
| `interfaces/query-api.md` | update | `domain/interfaces/query-api.md` | Added the missing openapi:/orders/{orderId}/commands to covers (SPEC-0046). |
| `interfaces/rest-read-api.md` | keep | `domain/interfaces/rest-read-api.md` | Moved; metadata normalised. |
| `log.md` | update | `log.md` | Links rewritten to the new paths; 2026-11-14 entry added. |
| `non-functional-requirements/NFR-001-idempotent-command-handling.md` | keep | `capabilities/non-functional-requirements/NFR-001-idempotent-command-handling.md` | Moved; metadata normalised. |
| `non-functional-requirements/NFR-002-optimistic-concurrency.md` | keep | `capabilities/non-functional-requirements/NFR-002-optimistic-concurrency.md` | Moved; metadata normalised. |
| `non-functional-requirements/NFR-003-auditability.md` | keep | `capabilities/non-functional-requirements/NFR-003-auditability.md` | Moved; metadata normalised. |
| `non-functional-requirements/NFR-004-reliable-publication.md` | keep | `capabilities/non-functional-requirements/NFR-004-reliable-publication.md` | Moved; metadata normalised. |
| `non-functional-requirements/NFR-005-dead-letter-failed-commands.md` | keep | `capabilities/non-functional-requirements/NFR-005-dead-letter-failed-commands.md` | Moved; metadata normalised. |
| `non-functional-requirements/NFR-006-order-latency-measurement.md` | keep | `capabilities/non-functional-requirements/NFR-006-order-latency-measurement.md` | Moved; metadata normalised. |
| `non-functional-requirements/NFR-007-observability.md` | keep | `capabilities/non-functional-requirements/NFR-007-observability.md` | Moved; metadata normalised. |
| `non-functional-requirements/NFR-008-replayability.md` | keep | `capabilities/non-functional-requirements/NFR-008-replayability.md` | Moved; metadata normalised. |
| `non-functional-requirements/NFR-009-knowledge-retrieval-quality.md` | keep | `capabilities/non-functional-requirements/NFR-009-knowledge-retrieval-quality.md` | Moved; metadata normalised. |
| `non-functional-requirements/NFR-010-contract-compatibility.md` | keep | `capabilities/non-functional-requirements/NFR-010-contract-compatibility.md` | Moved; metadata normalised. |
| `non-functional-requirements/index.md` | update | `capabilities/non-functional-requirements/index.md` | Index regenerated for the new layout. |
| `okf-conventions.md` | update | `okf-conventions.md` | New types (Use Case, Actor, Pattern), keys (aliases, superseded_by, point_in_time, ADR id), review settings and the new layout. |
| `oms-concepts/block-order-allocation.md` | update | `domain/concepts/block-order-allocation.md` | Banner: concept paper for a planned capability. |
| `oms-concepts/booking-integration.md` | update | `domain/concepts/booking-integration.md` | Banner: planned; reference to the old framework folder fixed. |
| `oms-concepts/exchange-simulator.md` | merge | `architecture/context/exchange-simulator.md` | Specification merged with the component page; body kept. |
| `oms-concepts/execution-reporting.md` | update | `domain/concepts/execution-reporting.md` | Banner: fills built; bust, correction and whack recorded in the log (SPEC-0044) but without command handlers (SPEC-0030); status to draft. |
| `oms-concepts/index.md` | update | `domain/concepts/index.md` | Index regenerated for the new layout. |
| `oms-concepts/mission-control.md` | update | `tools/mission-control.md` | Re-typed as a Component with sources. |
| `oms-concepts/order-grouping.md` | update | `domain/concepts/order-grouping.md` | Banner: not built (order trees planned, SPEC-0022). |
| `oms-concepts/order-lifecycle.md` | update | `domain/concepts/order-lifecycle.md` | Banner: transitions differ from OrderStateMachineConfig (no NEW→REJ, NEW→CXL, UNACK→FILLED; adds FILLED→LIVE and end-of-day CLOSED); Order State is authoritative. needs-human: decide whether to rewrite the spec to the code or change the state machine. Status lowered to draft. |
| `oms-concepts/order-model-trading-capacity.md` | update | `domain/concepts/order-model-trading-capacity.md` | Banner: concept paper, not built. |
| `oms-concepts/order-quantity-calculations.md` | update | `domain/concepts/order-quantity-calculations.md` | Banner: single-order quantities built; tree and allocation quantities planned. |
| `oms-concepts/order-replace.md` | update | `domain/concepts/order-replace.md` | Banner: cancel and reject built, replace not; read as current behaviour before; status to draft. |
| `oms-concepts/post-trade-analytics.md` | update | `domain/concepts/post-trade-analytics.md` | Banner: concept paper for a planned capability. |
| `oms-concepts/projections.md` | keep | `architecture/concepts/projections.md` | Moved to architecture concepts; checked against Projection and its implementations. |
| `oms-concepts/streaming-architecture.md` | update | `architecture/concepts/event-streaming.md` | Implementation-status banner; corrected Java 21, R2DBC and topic names (order-events) to what the streaming service does; section 10 classes are design only. |
| `oms-framework/domain-model_spec.md` | update | `domain/model/domain-model.md` | Moved to domain model; banner: Order and Execution are flat entities, asset-class subclasses are design only; status to draft. |
| `oms-framework/error-handling.md` | update | `framework/exception-handling.md` | Banner: GlobalExceptionHandler and ProblemDetail built; exception hierarchy, retry and circuit breaker are not; status to draft. |
| `oms-framework/index.md` | update | `framework/index.md` | Index regenerated for the new layout. |
| `oms-framework/oms-state-store.md` | archive | `archive/state-store-spec-2026-02.md` | Early design (Azure, Java 21, one event table per type, direct publishing); replaced by a new architecture/concepts/state-store.md written from the code. The event schema-version rule (SPEC-0024) was carried into the new page. |
| `oms-framework/openapi-contracts.md` | archive | `archive/openapi-contracts-guide-2026-02.md` | Paths, endpoint table and generator setup predate oms-contracts (SPEC-0005); replaced by architecture/patterns/contract-first-codegen.md. |
| `oms-framework/state-machine-framework_spec.md` | update | `framework/state-machine.md` | Banner listing the built classes; context-aware and quote state machines are design only. |
| `oms-framework/state-query-store_spec.md` | archive | `archive/state-query-store.md` | Designs a ReadySet/logical-replication read store that was never built; replaced by framework/query-engine.md. |
| `oms-framework/task-orchestration-framework_spec.md` | update | `framework/task-orchestrator.md` | Banner listing the built classes and real pipelines; example classes are illustrations. |
| `oms-framework/testing-patterns.md` | update | `delivery/testing.md` | Moved to delivery; banner with the real test layout and base classes; example classes are illustrations. |
| `oms-framework/validation-rules.md` | update | `framework/validation-engine.md` | Banner: the rule engine (ValidationEngine, ValidationRule, factories) is not built; validation is done by pipeline tasks; status to draft. needs-human: 1,450 lines of unbuilt design — keep as target, or archive. |
| `oms-knowledge-base-strategy.md` | archive | `archive/knowledge-base-strategy-2026-02.md` | February inventory, old MCP tool names and ReadySet; rewritten as semantic-layer/knowledge-base-strategy.md, which carries over the filesystem-versus-MCP reasoning. |
| `oms-methodolgy/agent.md` | archive | `archive/agent-profile-java-backend.md` | Generic role profile on a stack the project does not use (Azure AKS, GitLab); superseded by the skill profiles. |
| `oms-methodolgy/ai-augmented-development.md` | update | `delivery/ai-augmented-development.md` | Old MCP tool names, folder tree and Qdrant setup replaced with the current three knowledge tools and layout. |
| `oms-methodolgy/architecture-convergence-assessment.md` | keep | `architecture/assessments/architecture-convergence-assessment.md` | Moved to architecture assessments; point-in-time record. |
| `oms-methodolgy/index.md` | update | `delivery/index.md` | Index regenerated for the new layout. |
| `oms-methodolgy/manifesto.md` | keep | `delivery/manifesto.md` | Moved; metadata normalised. |
| `oms-methodolgy/skill-profiles.md` | update | `delivery/skill-profiles.md` | Added the missing H1. |
| `oms-methodolgy/software-architecture-methodology.md` | keep | `delivery/software-architecture-methodology.md` | Moved; metadata normalised. |
| `storyboards/README.md` | keep | `storyboards/README.md` | Not part of the bundle; unchanged. |
| `storyboards/_templates/step.md` | keep | `storyboards/_templates/step.md` | Not part of the bundle; unchanged. |
| `storyboards/_templates/story.md` | keep | `storyboards/_templates/story.md` | Not part of the bundle; unchanged. |
| `storyboards/order-lifecycle/place-and-fill-order/steps/fill-arrives.md` | keep | `storyboards/order-lifecycle/place-and-fill-order/steps/fill-arrives.md` | Not part of the bundle; unchanged. |
| `storyboards/order-lifecycle/place-and-fill-order/steps/publish-order.md` | keep | `storyboards/order-lifecycle/place-and-fill-order/steps/publish-order.md` | Not part of the bundle; unchanged. |
| `storyboards/order-lifecycle/place-and-fill-order/steps/see-fill-on-blotter.md` | keep | `storyboards/order-lifecycle/place-and-fill-order/steps/see-fill-on-blotter.md` | Not part of the bundle; unchanged. |
| `storyboards/order-lifecycle/place-and-fill-order/steps/submit-order.md` | keep | `storyboards/order-lifecycle/place-and-fill-order/steps/submit-order.md` | Not part of the bundle; unchanged. |
| `storyboards/order-lifecycle/place-and-fill-order/steps/venue-accepts.md` | keep | `storyboards/order-lifecycle/place-and-fill-order/steps/venue-accepts.md` | Not part of the bundle; unchanged. |
| `storyboards/order-lifecycle/place-and-fill-order/story.md` | keep | `storyboards/order-lifecycle/place-and-fill-order/story.md` | Not part of the bundle; unchanged. |
| `ui/index.md` | update | `ui/index.md` | Index regenerated for the new layout. |
| `ui/oms-admin-ui_spec.md` | update | `ui/admin-ui.md` | Corrected React 18 / Spring Boot 3.5 / Java 21 to React 19 / Spring Boot 4.1 / Java 25, module name oms-ui; quote blotters do not exist. |

Documents that did not exist before and were written in SPEC-0061 are listed in the
[log](../log.md) entry of 2026-11-14.
