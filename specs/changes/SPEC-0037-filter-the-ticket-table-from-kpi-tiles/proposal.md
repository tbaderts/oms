# Proposal — SPEC-0037: Filter the ticket table from KPI tiles

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

<!-- FILL: The problem or opportunity in 3–8 sentences. Who is affected (traders, ops, downstream
     systems)? What evidence is there (incident, spec gap, data, user request)? What happens if we
     do nothing? Link the ticket Goal and any knowledge-base page it relates to. -->

## What Changes

<!-- FILL: Bullet list of observable changes in behaviour, API, messages, data or UI.
     Prefix breaking changes with **BREAKING** and name who they break. -->

## Scope

### In scope

<!-- FILL: What this ticket delivers. -->

### Out of scope

<!-- FILL: Explicit non-goals and things deferred to later tickets. Being clear here keeps the
     agent from gold-plating. -->

## Acceptance Criteria

<!-- One criterion per bullet, numbered AC-1, AC-2, …, in the form
       - **AC-n** — Given <context>, when <action>, then <observable outcome>.
     Rules:
       * Objectively testable by an automated test, with no judgement needed.
       * Observable from outside the unit (API response, persisted state, event in order_events,
         message on a topic, metric, log line), not "the code uses X".
       * Cover the unhappy paths: invalid input, illegal state transition, duplicate delivery,
         concurrency conflict, where relevant.
       * Include non-functional criteria (latency, throughput, observability) when the change
         affects them, with a number and how it is measured. -->

- **AC-1** — <!-- FILL: Given …, when …, then … -->

## Impact

| Area | Impact |
|---|---|
| Modules | <!-- FILL: e.g. oms-contracts, oms-core (also run `spec set SPEC-0037 modules …`) --> |
| Contracts (OpenAPI / Avro) | <!-- FILL: none, or which spec/schema and whether additive --> |
| Data (tables, migrations) | <!-- FILL --> |
| Events / Kafka topics | <!-- FILL --> |
| Consumers (oms-ui, oms-mcp-server, downstream) | <!-- FILL --> |
| Knowledge base | <!-- FILL: pages that will need updating --> |

## Open Questions

<!-- List each question as one of:
       - [open] question                      ← the gate fails while any of these remain
       - [resolved] question → answer
       - [deferred] question → why it is safe to defer
     On autopilot, do not block on a question you can answer with a reasonable, reversible
     assumption: record it as [resolved] with "assumption: …". Write "None." if there are none. -->
