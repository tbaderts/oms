# Design — SPEC-0028: Use decimals for quantities in Order.avsc

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

<!-- FILL: How the relevant part of the system works today, with file references
     (e.g. `oms-core/src/main/java/.../OrderAcceptCommandProcessor.java`). Name the closest existing
     example this change will follow, and the knowledge-base specs you read. -->

## Approach

<!-- FILL: The solution in prose plus a component/sequence sketch (mermaid welcome). Which classes
     are added or changed, and in which layer? Map each What-Changes bullet from the proposal to
     where it happens. -->

## Contract Changes

<!-- FILL: The exact OpenAPI paths/schemas and Avro fields to add or change, as YAML/AVSC snippets.
     State compatibility (P-04): additive or BREAKING, defaults for new Avro fields, which
     generated classes change. "None — <reason>" if no contract changes. -->

## Data & Persistence

<!-- FILL: Entity changes, the new Liquibase changelog (file name, changesets, indexes,
     constraints), data migration or backfill, and rollback. Optimistic locking and unique
     constraints (P-08). "None — <reason>" if not applicable. -->

## Events & Messaging

<!-- FILL: New or changed order_events entries (P-05), outbox messages and topics (P-06),
     idempotency on the consumer side, ordering assumptions. "None — <reason>" if not applicable. -->

## Domain, State & Orchestration

<!-- FILL: State machine transitions added or changed, task pipeline steps, validation rules and
     error responses (P-10, P-13). "None — <reason>" if not applicable. -->

## Alternatives & Decisions

<!-- FILL: Each significant decision as: **Decision** — chosen option; alternatives considered;
     why rejected. Record every new dependency or build change here (P-17). Decisions changed during
     implementation are appended here with the reason. -->

## Risks & Mitigations

<!-- FILL: What could go wrong (data migration, performance, compatibility, concurrency) and how
     the design or tests contain it. -->

## Test Strategy

<!-- FILL: One row per acceptance criterion. Every AC from the proposal must appear here; the
     gate checks it. Name the test class (new or existing) so the plan and the verify stage can
     find it.

| AC | Level (unit / web-mvc / integration / e2e) | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | integration | OrderLifecycleIntegrationTest#… | … |
-->

## Policy Compliance

<!-- For every policy in specs/policies/architecture-policies.md: Status is `comply`, `n/a` or
     `exception`. For comply, say *how* briefly. n/a and exception need a justification. Any
     exception forces human approval of this design. -->

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | <!-- FILL --> | |
| P-02 | Specification before code, generated models only | <!-- FILL --> | |
| P-03 | Never edit generated code | <!-- FILL --> | |
| P-04 | Contracts evolve compatibly | <!-- FILL --> | |
| P-05 | Every state change is recorded in the event log | <!-- FILL --> | |
| P-06 | Kafka only through the transactional outbox | <!-- FILL --> | |
| P-07 | Schema changes through new Liquibase changesets | <!-- FILL --> | |
| P-08 | Concurrency and idempotency are explicit | <!-- FILL --> | |
| P-09 | Commands and queries stay separate | <!-- FILL --> | |
| P-10 | State transitions go through the state machine and task pipeline | <!-- FILL --> | |
| P-11 | Layering and conventions | <!-- FILL --> | |
| P-12 | Jackson 3 only | <!-- FILL --> | |
| P-13 | Errors and validation follow the framework specs | <!-- FILL --> | |
| P-14 | Test first, every acceptance criterion is proven by an automated test | <!-- FILL --> | |
| P-15 | Observability | <!-- FILL --> | |
| P-16 | Security | <!-- FILL --> | |
| P-17 | Simplicity and dependencies | <!-- FILL --> | |
| P-18 | Modules build standalone | <!-- FILL --> | |
| P-19 | Documentation follows behaviour | <!-- FILL --> | |

## Knowledge Base Updates

<!-- FILL: Pages under oms-knowledge-base/ to update in this ticket (P-19), with a one-line summary
     each, or "None — <reason>". -->
