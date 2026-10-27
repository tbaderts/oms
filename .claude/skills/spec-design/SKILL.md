---
name: spec-design
description: Stage 2 of the OMS spec workflow. Write design.md for a spec ticket (approach, contract changes, persistence, events, state machine, decisions, risks, test strategy per acceptance criterion, compliance with every architecture policy) and pass the design gate. Use when a ticket is at the design stage.
argument-hint: "<ticket id>"
---

# Stage 2: Design (how)

`spec` means `node specs/tools/spec.mjs`. Ticket: $ARGUMENTS.

The design must be concrete enough that the plan can be written without re-reading the code, and
checked line by line against `specs/policies/architecture-policies.md`.

## 1. Inputs

- `proposal.md`: every AC must be addressed.
- `specs/policies/architecture-policies.md`: read all policies; you will rule on each one.
- The framework specs that apply (read the relevant ones fully rather than skimming):
  `domain-model_spec.md`, `state-machine-framework_spec.md`,
  `task-orchestration-framework_spec.md`, `state-query-store_spec.md`, `validation-rules.md`,
  `error-handling.md`, `openapi-contracts.md`, `testing-patterns.md` in
  `oms-knowledge-base/oms-framework/`.
- **The closest existing example in the code.** Find the most similar existing flow (e.g.
  `OrderAcceptCommandProcessor` + its tasks + `OrderAcceptCommandProcessorTest`) and design the
  change as a sibling of it. Following existing patterns beats inventing new ones (P-11, P-17).

## 2. Write `design.md`

Replace every `<!-- FILL … -->`. Specifically:

- **Contract Changes**: the actual YAML/AVSC snippets, not prose. State compatibility (P-04).
- **Data & Persistence**: the new changelog file name (next number after the highest in
  `oms-core/src/main/resources/db/changelog/`), changesets, constraints, indexes. Never modify an
  existing changeset (P-07).
- **Events & Messaging**: what lands in `order_events` (P-05), what goes through the outbox (P-06),
  and consumer idempotency (P-08).
- **Domain, State & Orchestration**: state machine transitions and task pipeline steps (P-10),
  validation and the error responses (P-13).
- **Alternatives & Decisions**: at least the main decision with a rejected alternative. Any new
  dependency or build change must be justified here (P-17).
- **Test Strategy**: a table with **every AC**, its test level and the concrete test class#method
  (existing or to be created). Integration tests extend `AbstractKafkaPostgresIntegrationTest`
  when persistence or Kafka is involved.
- **Policy Compliance**: one row per policy, already listed. Status:
  - `comply` + *how* in a few words (e.g. "new changelog 005-…, no edits to 001–004");
  - `n/a` + why it does not apply;
  - `exception` + justification. Use this only when complying would clearly be worse. It forces
    human approval of the design, which is intended.
- **Knowledge Base Updates**: which `oms-knowledge-base/` pages change (P-19).

If designing reveals that the proposal is wrong (an AC is untestable, scope is missing), do not
paper over it: `spec reopen <id> proposal "<why>"` and fix the proposal. That clears the proposal
approval, so a human reviews it again.

## 3. Self-check, then gate

Before advancing, re-read the design against each AC and ask: *could a different engineer
implement this without asking me anything?* Then:

```bash
node specs/tools/spec.mjs advance <id>
```

- Exit 1: fix and re-run.
- Exit 3: approval needed (policy exception or configured). Summarise the exception(s) and the
  trade-off for the user, ask them to run `spec approve <id>`, and stop.
- Exit 0: continue with `spec-plan`.
