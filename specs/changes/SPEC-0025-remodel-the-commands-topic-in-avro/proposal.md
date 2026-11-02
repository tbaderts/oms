# Proposal — SPEC-0025: Remodel the commands topic in Avro

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

Roadmap ticket H of the architecture review (`oms-core/docs/architecture-review-2026-10-30.md`
§7 and §7.1; [ticket Goal](./ticket.md)).

Every command on the `commands` topic is wrapped in one `CommandMessage` record, whose only field is
a union of the eleven command records. That has costs:

- **Adding a command type changes the shared schema.** The union must grow, every consumer must
  redeploy against the new envelope, and the Schema Registry subject `commands-value` holds every
  command type in one schema. SPEC-0018 and SPEC-0039 both hit the side effect: the generated
  `CommandMessage` embeds its members' schemas and goes stale until a clean build.
- **No common header.** Each record repeats `type` and `version`. Only the four lifecycle commands
  carry a `commandId`; none carries a correlation or causation id, a send time, or the producer.
  Tracing a command back to the event that caused it, deduplicating commands generally, and
  diagnosing a bad message all lack data.
- **Dead code.** `Command.avsc` and `Cmd.avsc` are referenced nowhere.
- **The dead-letter path loses the original bytes.** When a record cannot be deserialised,
  `DeadLetterPublishingRecoverer` is built on the Avro template and re-serialises the raw bytes as
  an Avro value under a new subject, instead of keeping the message as it arrived.
- **Schemas are registered by whichever service sends first** (`auto.register.schemas` defaults to
  true). A producer bug can register an unreviewed schema in the shared registry.

The review's target fixes all of these at once:
- one subject per command record (`TopicRecordNameStrategy`);
- a shared `CommandHeader` as every command's first field;
- schemas registered from oms-contracts.

The write path, the event topics and their consumers do not change.

## What Changes

- **Contracts (Avro, BREAKING on the `commands` topic):**
  - **New header record.** `CommandHeader` has these fields:
    - `commandId` (string, required);
    - `correlationId` and `causationId` (optional);
    - `sentAt` (`timestamp-micros`);
    - `producer` (string);
    - `version` (default `1.0.0`).
  - **The eleven command records.** Each gets `header` as its first field and loses its top-level
    `type` and `version`. Fields the processor requires (e.g. `orderId`) become required. The nested
    `Order` and `Execution` records are unchanged.
  - **Removed:** `CommandMessage.avsc` (the envelope), `Command.avsc` and `Cmd.avsc`.
- **Contracts (OpenAPI, additive):** the `Command` base schema gains optional `commandId`,
  `correlationId`, `causationId` and `sentAt`. The four lifecycle commands already declare
  `commandId`, so they are unaffected. Command API `3.1.0`.
- **Wire format:** the value on `commands` is the command record itself. The subject is
  `commands-<record full name>` (`TopicRecordNameStrategy`); the key stays as today.
- **oms-core consumer:**
  - `CommandListener` receives bare records and dispatches on their class;
  - a `CommandHeaderMapper` copies the header into the command model, so
    `order_events.transaction` and `command_id` carry the header's ids for every command type;
  - an unknown record type goes to `commands.DLT`, as today.
- **Dead-letter path:** the recoverer gets a byte-array template, so `commands.DLT` keeps the
  original bytes and their schema id.
- **Producer, the exchange simulator:** publishes bare records with `TopicRecordNameStrategy`. The
  header is built from the `OrderMessage` being answered:
  - `commandId`: a new UUID;
  - `correlationId`: the root order id;
  - `causationId`: `orderId:eventId`;
  - `producer`: the application name.
- **Schema registration from oms-contracts:** a `registerSchemas` Gradle task checks
  compatibility with the registry and registers every command subject, plus the three event
  subjects (`oms_orders-value`, `oms_executions-value`, `oms_order_executions-value`). The services
  run with `auto.register.schemas=false`; the docker-compose dev setup sets it back to `true`, so
  local runs need no extra step.
- **Observability:**
  - a counter `oms.commands.consumed`, tagged with the record type and the outcome (applied,
    refused, failed);
  - `commandId` and `correlationId` in the MDC of every log line of a command's processing.
- **Deployment:** consumers first, after draining the topic. The simulator is the only producer.
  The SPEC-0039 runbook (drain, then a coordinated deploy) covers it; both changes can ship in the
  same window.

## Scope

### In scope

- Review §7.1 steps 1–8 and 10: contracts, compatibility and structural tests, registration task,
  simulator producer, oms-core consumer, dead-letter path, cut-over runbook, knowledge base.
- Step 9 in part: the consumed counter and the MDC fields.

### Out of scope

- A gauge for the depth of `commands.DLT` (step 9's third item). It needs a lag or end-offset poller
  that does not exist yet; follow-up.
- Changing what is deduplicated: the deduplication rules for accepts, fills and creates stay as
  they are (Open Questions).
- Moving the event topics to the record-name strategy or a shared topic (§7.1, "The same technique
  later").
- The command key change to `rootOrderId` (tree tickets SPEC-0022/0023).
- A compatibility period that accepts both the envelope and bare records (Open Questions).

## Acceptance Criteria

- **AC-1** — Given the oms-contracts build, when its schemas are checked, then:
  - `CommandHeader` exists with the fields listed above;
  - every record whose name ends in `Cmd` has `header` of type `CommandHeader` as its first field,
    and no top-level `type` or `version`;
  - `CommandMessage`, `Command` and `Cmd` no longer exist;
  - each command record is compatible with a committed baseline of itself.
- **AC-2** — Given `oms-cmd-api.yml`, when the `Command` schema is read, then it has optional
  `commandId`, `correlationId`, `causationId` and `sentAt` (date-time), and `info.version` is
  `3.1.0`.
- **AC-3** — Given oms-core consuming `commands` with the record-name strategy, when bare
  `OrderCreateCmd`, `OrderAcceptCmd`, `ExecutionCreateCmd` and `OrderCancelRequestCmd` records are
  produced, then each is applied as today. The `order_events` row of each carries the header's
  `commandId`, `correlationId`, `causationId` and `sentAt` in its stored command, and `command_id`
  equals the header's `commandId`.
- **AC-4** — Given a record of a type oms-core does not handle (or cannot deserialise) on
  `commands`, when it is consumed, then it is not retried. It lands on `commands.DLT` with a value
  byte-for-byte equal to the original, and the commands after it on the same partition are still
  applied.
- **AC-5** — Given the exchange simulator answering an order, when it sends an accept and fills,
  then:
  - each Kafka value is the bare command record, registered under
    `commands-<record full name>`, with the key unchanged;
  - its header has a UUID `commandId`, `correlationId` = the root order id, `causationId` =
    `<orderId>:<eventId>` of the message answered, and `producer` = the simulator's name;
  - the exchange workflow integration tests in oms-core pass end to end.
- **AC-6** — Given a Schema Registry, when `registerSchemas` runs, then:
  - it registers one subject per command record, plus `oms_orders-value`, `oms_executions-value`
    and `oms_order_executions-value`;
  - when the registry reports a schema as incompatible, the task fails, naming the subject, and
    registers nothing for it;
  - the services' configuration has `auto.register.schemas=false`, except in the docker-compose dev
    setup.
- **AC-7** — Given commands consumed by oms-core, when one is applied, one refused (e.g. a duplicate
  `commandId`) and one fails, then `oms.commands.consumed` counts each under its record type and
  outcome. The log lines of each command's processing carry its `commandId` and `correlationId`.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-contracts, oms-core, oms-exchange-simulator, oms-knowledge-base (on the ticket); oms-streaming-service and oms-mcp-server rebuild against the contracts jar (they do not read `commands`) |
| Contracts (OpenAPI / Avro) | **BREAKING (Avro, `commands` topic):** the envelope is removed, the records gain `header` and lose `type`/`version`, and the dead schemas are deleted. OpenAPI: additive `Command` base fields, `3.1.0` |
| Data (tables, migrations) | None. `order_events.transaction` (JSON) carries the new base fields; `command_id` gets the header's `commandId` for every command type |
| Events / Kafka topics | `commands`: bare records, one subject per record type, new value format; key unchanged. `commands.DLT`: original bytes. Event topics unchanged (registered by the new task) |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-core (consumer of `commands`) and the simulator (only producer) change together. Any external producer of `commands` (none known) must move to the record-name strategy and the header |
| Knowledge base | `interfaces/avro-messages.md` (envelope out, header and subjects in, runbook), `interfaces/kafka-topics.md` (subjects and strategy), `interfaces/command-api.md` or `oms-framework/openapi-contracts.md` (base fields), `capabilities/exchange-simulation.md`, `oms-framework/testing-patterns.md`, storyboard steps that show `CommandMessage` |

## Open Questions

- [resolved] Keep the envelope readable for one release (a dual-format consumer)? → assumption:
  **no**. The topic is drained before a consumers-first deploy, as the review recommends and as the
  SPEC-0039 runbook already requires. The alternative would leave `header` nullable in the schema
  for good, because Avro cannot tighten it later. **Please confirm at approval**, and say whether
  this ships in the same deployment window as SPEC-0039 (one drain for both).
- [resolved] Should deduplication by `commandId` extend to every command type now that every
  command has one? → assumption: **no, not in this ticket**. The header's `commandId` is stored in
  `command_id` for every event, so it becomes possible later. Lifecycle deduplication stays as it
  is; accepts are refused by their state precondition, fills by `(orderId, execId)`, creates by
  `(sessionId, clOrdId)`. Extending it changes which refusal a client sees; it can be its own
  ticket.
- [resolved] Required header fields? → `commandId`, `sentAt` and `producer` are required, the ids
  optional, as in the review. An external producer must therefore set a `commandId` on every
  command; today only lifecycle commands need one.
- [resolved] Where does `registerSchemas` run? → assumption: on demand against `REGISTRY_URL`
  (operators, and a CI job once there is a shared registry). The compose dev setup keeps
  auto-registration, so local runs need nothing extra. A Gradle task on `java.net.http` avoids a
  new build plugin (P-17, recorded in the design).
- [deferred] A gauge for the depth of `commands.DLT` → safe to defer: dead letters are logged
  today, and the gauge needs an offset poller of its own.
