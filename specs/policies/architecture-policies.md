# OMS Architecture Policies

These are the rules every spec ticket is designed against (`design.md` → Policy Compliance) and
verified against (`verification.md` → Policy Review). They condense `CLAUDE.md` and the
`oms-knowledge-base/` framework specs into checkable statements.

Each policy has:

- **Rule** — what must be true.
- **Why** — the failure it prevents.
- **Check** — `auto` rules in [`rules.json`](rules.json) run in `spec check` / `spec verify` /
  CI; `review` questions are answered by the agent and by the independent `spec-reviewer`.

Status vocabulary: in design, `comply` · `n/a` · `exception`; in verification, `PASS` · `N/A` ·
`EXCEPTION`. An `exception` always needs a justification and forces human approval of the design.
An `EXCEPTION` in verification is only valid if the design declared it.

To add a policy: append a `### P-NN — Title` section here (the heading format is parsed), and add
an `auto` rule to `rules.json` when it can be checked mechanically. New tickets pick it up
automatically; existing tickets fail their next gate until they address it.

---

## Contracts

### P-01 — Contracts live only in oms-contracts

- **Rule:** OpenAPI specs and Avro schemas are edited only under `oms-contracts/src/main/{openapi,avro}`.
  No service module has its own `src/main/openapi/` or `src/main/avro/`.
- **Why:** a schema edited in one place only produces messages no consumer can deserialize.
- **Check:** auto `R01`; PreToolUse hook blocks writes to stray contract folders.

### P-02 — Specification before code, generated models only

- **Rule:** API or message changes start with the OpenAPI/Avro change, then models are regenerated
  (`cd oms-contracts && ./gradlew build`; `cd oms-core && ./gradlew openApiGenerateCmd openApiGenerateQuery`).
  Classes in `org.example.common.model.{cmd,query,msg}` are never hand-written.
- **Why:** hand-written DTOs drift from the contract that clients and consumers rely on.
- **Check:** auto `R02`; review: does the task order put contract changes first?

### P-03 — Never edit generated code

- **Rule:** nothing under `build/generated*` is edited. Change the spec or the generator config.
- **Why:** edits vanish on the next build and hide contract drift.
- **Check:** PreToolUse hook blocks it; review.

### P-04 — Contracts evolve compatibly

- **Rule:** Avro changes are backward compatible (new fields have defaults, no removals or renames,
  no type narrowing). OpenAPI changes are additive; a breaking change is marked **BREAKING** in the
  proposal, versioned, and lists the consumers it breaks (oms-ui, oms-mcp-server, downstream).
- **Why:** producers and consumers deploy independently; Schema Registry enforces compatibility
  at runtime, too late to fix cheaply.
- **Check:** review (diff of `oms-contracts/src/main/**`).

## Event sourcing, messaging and data

### P-05 — Every state change is recorded in the event log

- **Rule:** each change to an order's state appends to `order_events` through `OrderEventAppender`
  in the same transaction, with the next per-order `version`, the command, resulting state and
  snapshot. Replay (`OrderReplayService`) must still reproduce the state.
- **Why:** the event log is the audit trail and the replay source; a silent write breaks both.
- **Check:** review; integration test for new state changes (see `EventSourcingIntegrationTest`).

### P-06 — Kafka only through the transactional outbox

- **Rule:** the command path stages messages in the outbox (`OutboxMessage`); only `OutboxRelay`
  (via `MessagePublisher`) publishes to Kafka. No `KafkaTemplate` in services or processors.
- **Why:** publishing directly lets the database and Kafka disagree after a failure.
- **Check:** auto `R04`.

### P-07 — Schema changes through new Liquibase changesets

- **Rule:** every schema change is a new numbered changelog file included from
  `db.changelog-master.yaml`. Applied changesets are never edited. Hibernate never generates schema
  (`ddl-auto: validate`); entities must match the migrated schema.
- **Why:** editing an applied changeset breaks checksums in every existing database.
- **Check:** auto `R05`, `R06`; `LiquibaseMigrationIntegrationTest` must pass.

### P-08 — Concurrency and idempotency are explicit

- **Rule:** order updates use optimistic locking (`txNr`); commands are idempotent (duplicate
  delivery has no second effect); natural keys have unique constraints (e.g. `(orderId, execID)`).
- **Why:** Kafka redelivers and clients retry; without these, fills and state are double-applied.
- **Check:** review; tests for duplicate command/execution delivery when the change touches them.

## Application structure

### P-09 — Commands and queries stay separate

- **Rule:** writes go through the command API and command processors; the query API is read-only and
  never mutates state. Command and query models stay separate even though they share tables.
- **Why:** keeps the read path scalable on replicas and the write path auditable.
- **Check:** review.

### P-10 — State transitions go through the state machine and task pipeline

- **Rule:** order state changes use the configured state machine and the task orchestration pipeline
  (validate → set state → persist → publish), e.g. `SetOrderStateTask`, not ad-hoc setters in
  controllers or services. New transitions are added to the state machine configuration.
- **Why:** illegal transitions and skipped validation are the most expensive OMS bugs.
- **Check:** review against `oms-framework/state-machine-framework_spec.md` and
  `task-orchestration-framework_spec.md`.

### P-11 — Layering and conventions

- **Rule:** thin controllers → services → repositories. MapStruct for entity/DTO mapping, Lombok for
  boilerplate, constructor injection, packages `org.example.<module>.<layer>`. Follow the closest
  existing example rather than inventing a new pattern.
- **Why:** consistency is what lets humans and agents change the code safely.
- **Check:** review.

### P-12 — Jackson 3 only

- **Rule:** use `tools.jackson.*` for data binding. Only `com.fasterxml.jackson.annotation` (kept by
  Jackson 3) may be imported from `com.fasterxml`.
- **Why:** mixing Jackson 2 and 3 mappers gives inconsistent serialization and classpath conflicts.
- **Check:** auto `R03` (new lines only; known legacy: `JsonHelper`).

### P-13 — Errors and validation follow the framework specs

- **Rule:** API errors are RFC 7807 Problem+JSON; validation follows
  `oms-framework/validation-rules.md` and `error-handling.md`. No swallowed exceptions.
- **Why:** clients (UI, MCP, FIX gateways) depend on one error shape.
- **Check:** review.

## Quality

### P-14 — Test first, every acceptance criterion is proven by an automated test

- **Rule:** each AC maps to at least one automated test written before the implementation is
  complete. Unit tests (JUnit 5, Mockito) for logic; Testcontainers integration tests for
  persistence, Kafka and migrations (`AbstractKafkaPostgresIntegrationTest`). Production code
  changes come with test changes in the same module.
- **Why:** an AC without a test is an opinion, and the verify stage cannot confirm it.
- **Check:** auto `R07` (warn); review: does each cited test really assert the AC?

### P-15 — Observability

- **Rule:** structured SLF4J logging that includes `orderId` / correlation id where available; no
  `System.out` or `printStackTrace`. New flows expose Micrometer metrics, and trace context
  propagates across Kafka.
- **Why:** production issues in an OMS must be diagnosable from logs, metrics and traces alone.
- **Check:** auto `R08`; review.

### P-16 — Security

- **Rule:** no secrets in code or config; use environment variables. Validate input at API and
  message boundaries. Respect entitlements where the API defines them.
- **Why:** repositories leak; secrets in them are compromised.
- **Check:** auto `R09` (warn); review.

### P-17 — Simplicity and dependencies

- **Rule:** implement the smallest change that meets the acceptance criteria. No new framework,
  library or infrastructure component without a decision recorded in design.md
  (Alternatives & Decisions) stating what was rejected and why.
- **Why:** every dependency is a long-term cost; speculative generality is a defect.
- **Check:** auto `R10` (warn on build/dependency changes); review.

### P-18 — Modules build standalone

- **Rule:** the composite build stays intact: each affected module passes `./gradlew check` on its
  own, and a contracts change is verified against every consumer (`impacts` in `specs/config.json`).
- **Why:** modules deploy independently; a green build in one hides a broken consumer.
- **Check:** `spec verify` runs each affected module and its consumers.

### P-19 — Documentation follows behaviour

- **Rule:** when domain concepts, lifecycle or behaviour change, the matching page in
  `oms-knowledge-base/` is updated in the same ticket. Generated OpenWiki pages are not hand-edited.
- **Why:** the knowledge base is what agents and new team members read first; stale docs mislead both.
- **Check:** auto `R11` (warn); review against design.md → Knowledge Base Updates.
