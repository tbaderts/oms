# Proposal — SPEC-0050: Support expected version on commands

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

A client that changes an order usually decided to do so from what it saw.
- **The race.** A trader cancels from a blotter row, or a tool corrects a fill it just read. If
  the order changed in between, for example filled or replaced, the command still applies to the
  newer state. Nothing tells the client that it acted on a stale view.
- **What the review recommends.** The event-sourcing and CQRS review (section 7, "expected
  version", adopted) and target architecture sections 5.1 and 7.1 recommend the standard answer:
  the command carries the version it saw, and the OMS refuses it if the order has moved on.
- **Read-your-writes.** A client that has just changed an order and wants to show the result reads
  from the query side. It has no way to know when its own change is visible there:
  - `OrderDto.eventVersion` exists (SPEC-0027);
  - the command's answer does not say which version the change produced.
- **Cost of doing nothing.** Clients keep acting on stale views without knowing it, and UIs poll or
  sleep after each command.

## What Changes

- **Expected version on every command.**
  - **REST.** The OpenAPI `Command` base (`oms-cmd-api.yml`) gains an optional `expectedVersion`
    (int64, ≥ 0).
  - **Kafka.** The Avro `CommandHeader` gains `expectedVersion` (`["null", "long"]`, default
    `null`).
  - The header value is copied to the command as `correlationId` and `causationId` already are.
- **Refusal on mismatch.** When `expectedVersion` is set and differs from the order's current
  `txNr`, which is its latest event version, the command is refused:
  - nothing is applied and no event is written;
  - REST answers 400 with a FAILED `CommandResult` whose message names both versions;
  - on Kafka it is acknowledged, not retried and not dead-lettered;
  - the command log records it as REFUSED with that reason.

  It is a refusal, not a conflict, because retrying the same command cannot succeed. The check runs
  under the order's row lock, so it sees the version the command would change.
- **Without an expected version.** Commands behave exactly as today.
- **Duplicates first.** A redelivered command whose `commandId` was already applied is reported as
  a duplicate, as today (409 on REST), even though the order's version has since moved past its
  `expectedVersion`.
- **Creates.** A create has no prior version. It applies with `expectedVersion` absent or 0, and
  is refused with any other value.
- **Produced version in the answer.** The OpenAPI `CommandResult` gains `eventVersion` (int64,
  additive): the event version the applied command produced. It is 1 for a create, and absent on
  a refusal.
- **Read-your-writes, documented.** The query contract (`oms-query-api.yml`, `OrderDto.eventVersion`)
  and the knowledge base say what a client does to read its own write: wait until search returns
  the order with `eventVersion` at least the `CommandResult.eventVersion` it got.

## Scope

### In scope

- The two contract fields, the `CommandResult` field, regeneration, and the header-to-command
  mapping.
- The check in the lifecycle and fill pipelines, its refusal on REST and Kafka, and the command-log
  record.
- The query-contract documentation, tests, and knowledge-base pages.
- The exchange simulator keeps building and producing commands without the field.

### Out of scope

- Setting `expectedVersion` from oms-ui or the exchange simulator: they keep sending none.
- A blocking "wait for version" endpoint on the query side. The documented client-side wait is
  the mechanism.
- Retry-on-mismatch helpers for clients.
- The Avro `CommandResult` record. Nothing produces it; there is no reply topic.

## Acceptance Criteria

- **AC-1** — Given a LIVE order with `txNr` N, when a REST command (a cancel request, or a fill)
  carries `expectedVersion` N, then it applies, and the `CommandResult` has `eventVersion` N + 1,
  equal to the event it wrote.
- **AC-2** — Given a LIVE order with `txNr` N, when a REST command carries `expectedVersion` N − 1,
  then:
  - the answer is 400 with status FAILED, and a message naming the expected version N − 1 and the
    actual version N;
  - the order is unchanged and no event is written;
  - the command log has one REFUSED row whose reason names both versions.
- **AC-3** — Given a LIVE order with `txNr` N, when a Kafka command's header carries
  `expectedVersion` N − 1, then:
  - it is not applied;
  - it is counted as refused (`oms.commands.consumed{outcome=refused}`);
  - nothing reaches the dead-letter topic, and the command log has a REFUSED row naming both
    versions.

  Given the same command with `expectedVersion` N, it applies.
- **AC-4** — Given commands without `expectedVersion`, on REST and on Kafka, when they are applied
  to orders of any version, then they behave as before this change. The existing command-path test
  suites pass unchanged, and a command sent with no expected version to an order at version 5
  applies.
- **AC-5** — Given a lifecycle command with `commandId` C and `expectedVersion` N that was applied
  (moving the order to N + 1), when it is sent again, then it is answered as a duplicate (409
  `urn:oms:error:duplicate-command` on REST, acknowledged on Kafka), not as a version mismatch.
- **AC-6** — Given a create with no `expectedVersion` or with 0, when it is sent over REST, then the
  order is created and the answer has `eventVersion` 1. Given a create with `expectedVersion` 3,
  when it is sent, then it is refused with 400 naming expected 3 and actual 0, and no order exists.
- **AC-7** — Given the changed contracts, when oms-contracts and its consumers are built, then:
  - `Command.expectedVersion` and `CommandResult.eventVersion` are optional int64;
  - `CommandHeader.expectedVersion` is `["null", "long"]` with default `null`, and the Avro
    compatibility check against the previous `CommandHeader` passes;
  - the exchange simulator builds and its commands still apply, without the field;
  - the description of `OrderDto.eventVersion` in `oms-query-api.yml` states the read-your-writes
    rule.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-contracts, oms-core, oms-exchange-simulator (rebuild against the new header only), oms-knowledge-base (set on the ticket) |
| Contracts (OpenAPI / Avro) | `oms-cmd-api.yml`: optional `Command.expectedVersion`, optional `CommandResult.eventVersion`, additive. `oms-query-api.yml`: description only. Avro `CommandHeader`: optional `expectedVersion` with default null, backward and forward compatible |
| Data (tables, migrations) | None. The command log's reason column already holds refusal reasons |
| Events / Kafka topics | Command topic records may carry the new header field; no outbound record changes |
| Consumers (oms-ui, oms-mcp-server, downstream) | Additive fields only. Producers that do not set `expectedVersion` are unaffected |
| Knowledge base | `interfaces/command-api.md`, `interfaces/query-api.md`, `interfaces/avro-messages.md` |

## Open Questions

- [resolved] **Which version is "the order's current version"?** → `txNr`, which since SPEC-0027
  equals the order's latest event version and is what search returns as `eventVersion`.
- [resolved] **Refusal or conflict?** → refusal (400, acknowledged on Kafka), as the goal says. A
  conflict (409) invites a retry of the same command, which cannot succeed against a moved order.
- [resolved] **What does a create's expected version mean?** → assumption: a new order has no
  version, so 0 or absent means "expect none"; any other value is refused. This is cheap to change.
- [resolved] **The Avro `CommandResult`** → assumption: left unchanged. Nothing produces it, and
  REST is the only path that answers a command. Revisit if a reply topic is added.
- [resolved] **Duplicate versus mismatch order** → the duplicate check wins (AC-5). A redelivery
  must stay idempotent; reporting it as a mismatch would make a sender believe its first attempt
  failed.
- [deferred] **SPEC-0049 is still in its final verification in the same working tree** → this
  ticket changes the same command path (`CommandDispatcher`, `LoadOrderTask`, the fill
  processor). Implementation starts after SPEC-0049 is done, and the design is written against
  its final code.
