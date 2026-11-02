# Verification — SPEC-0025: Remodel the commands topic in Avro

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

The final `spec verify` (2026-11-01 19:36Z, after the review fixes of T-19) ran `check` in oms-contracts, oms-core,
oms-streaming-service, oms-mcp-server and oms-exchange-simulator, and the developer-cockpit
typecheck and tests. Every command exited 0. Every test named below is in that run's
`build/test-results` with no failure or skip. oms-contracts and the simulator were up to date from
the previous run with unchanged inputs.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | `CommandHeader` as specified; every `*Cmd` starts with `header`, has no `type`/`version`; envelope and dead schemas gone; each record compatible with its baseline | `CommandSchemaTest` (3): `headerFieldsAsSpecified` (names, order, types, null defaults, `timestamp-micros`, `version` default `1.0.0`); `everyCommandStartsWithHeader` (all 11 records discovered from `*Cmd.avsc`; no top-level `type`, `version` or `commandId`); `envelopeAndDeadSchemasAreGone` (no `.avsc`, no generated class). `CommandCompatibilityTest#readsBaseline` (11 cases against `compat/commands/<Record>.json`; an incompatible baseline was shown to fail, T-3). Red first (T-1). evidence/oms-contracts-1.log | PASS |
| AC-2 | OpenAPI `Command` base has optional `commandId`, `correlationId`, `causationId`, `sentAt` (date-time); version 3.1.0 | `CommandBaseContractTest#baseCarriesHeaderFields` (getters on `cmd.Command`, `sentAt` an `OffsetDateTime`, the four lifecycle commands inherit `getCommandId`), `#versionIs310` (from the packaged spec). The four new getters carry no `@NotNull`, only `type` does, so the fields are optional (T-19). The cockpit's `ApiCatalogService.test.ts` pins 3.1.0. Red first. evidence/oms-contracts-1.log, developer-cockpit-2.log | PASS |
| AC-3 | Bare create, accept, fill and cancel request over Kafka apply as before; each event stores the header ids and `sentAt`, and `command_id` equals the header `commandId` | `CommandHeaderIntegrationTest#headerReachesTheEventLog`: four bare records with distinct headers through the record-name strategy. The order is created, accepted, partly filled (cumQty 40) and PCXL; four events, each with `command_id` and the stored command's `commandId`/`correlationId`/`causationId`/`sentAt` (micros) equal to its header. It fails when the mapper skips `causationId` (checked by hand, T-9). Unit: `CommandHeaderMapperTest` (2), `CommandListenerTest` dispatch tests (header on every command type). evidence/oms-core-1.log | PASS |
| AC-4 | Unhandled or undecodable record: not retried, on `commands.DLT` byte for byte, following commands still applied | `CommandDeadLetterIntegrationTest#unhandledUndecodableAndGarbageKeepTheirBytes`: on one key, a `QuoteCreateCmd` (no handler), a `FutureCmd` (registered, no class) and five garbage bytes, then an accept. The order goes LIVE; exactly three dead letters for the key, each `assertArrayEquals` to what was produced; a further poll finds no extra (retried) copy, and `oms.commands.consumed{outcome=failed}` rose by exactly one for `QuoteCreateCmd` and two for `undecodable` (one attempt each; T-19). With the old Avro recoverer the test fails (72 vs 77 bytes; checked by hand, T-10). Non-retry: `UndecodableCommandException` and `IllegalArgumentException` are in the not-retryable list; `CommandListenerTest#countsAppliedRefusedFailed` counts one `failed` per such record. evidence/oms-core-1.log | PASS |
| AC-5 | Simulator sends bare records under `commands-<full name>`, key unchanged; header: UUID `commandId`, `correlationId` = root, `causationId` = `orderId:eventId`, `producer` = simulator; oms-core workflow tests pass | `ExchangeSimulatorKafkaIntegrationTest#unackOrder_producesAckThenSingleFill`: accept and fill are bare records under key orderId; both headers have a UUID `commandId`, `correlationId` = `ROOT-<orderId>`, `causationId` = `<orderId>:1`, `producer` = `oms-exchange-simulator`. `#commandsUseOneSubjectPerRecord`: the registry has `commands-…OrderAcceptCmd` and `commands-…ExecutionCreateCmd` and no `commands-value` (red first). `CommandHeadersTest` (3: UUID, deterministic lifecycle id kept, fallbacks). `ExchangeEngineTest#answersNameTheMessageTheyRespondTo`. oms-core `ExchangeWorkflowIntegrationTest` (14) on bare records. evidence/oms-exchange-simulator-1.log, oms-core-1.log | PASS |
| AC-6 | `registerSchemas` registers every command subject plus the three event subjects; an incompatible subject fails the run by name and registers nothing; `auto.register.schemas=false` except compose dev | `SchemaRegistrarTest` (3): exactly 14 subjects; a `KafkaAvroSerializer` with `auto.register.schemas=false` (record-name strategy for commands, topic-name for events) finds every id; with an incompatible `OrderAcceptCmd` version registered, the run throws naming that subject, and no subject's versions change. `SchemaRegistrationConfigTest` in oms-core and the simulator: `application.yml` resolves to `false` without `KAFKA_AUTO_REGISTER_SCHEMAS` and `true` with it; the simulator uses `TopicRecordNameStrategy`; `docker-compose.yml` sets it only for `oms-core` and `exchange-simulator`. evidence/oms-contracts-1.log, oms-core-1.log, oms-exchange-simulator-1.log | PASS |
| AC-7 | `oms.commands.consumed` counts applied, refused, failed by type; log lines carry `commandId` and `correlationId` | `CommandListenerTest#countsAppliedRefusedFailed`: applied, refused (duplicate result) and failed (`OrderCancelCmd`), failed `QuoteCreateCmd`, failed `undecodable`, one each. `#mdcCarriesCommandAndCorrelationId`: every event the listener logs has both MDC keys, the processor sees them, and they are cleared afterwards. `CommandListenerKafkaIntegrationTest#logLinesCarryCommandAndCorrelationId`: the printed "Processed OrderAcceptCmd" line of a Kafka command contains both ids (red before the log pattern, T-12). evidence/oms-core-1.log | PASS |

## Goal Assessment

The Goal, item by item:

- **Envelope replaced, one subject per command record with `TopicRecordNameStrategy`.** Done: the
  simulator's producer setting, `TestCommands` in the tests, and the subjects asserted in AC-5/AC-6.
- **`CommandHeader` first in every command, `type`/`version` removed.** Done (AC-1). The
  lifecycle records' own `commandId` moved into the header too, so a command carries one id
  (design decision).
- **`Command.avsc` and `Cmd.avsc` deleted.** Done (AC-1).
- **Header fields on the OpenAPI `Command` base.** Done (AC-2, 3.1.0, additive).
- **Registration from oms-contracts, `auto.register.schemas=false` in the services.**
  `registerSchemas` exists and is proven against a registry client (AC-6). The Goal says
  "in CI". There is no CI pipeline with a shared registry in this repository yet, so the task runs
  on demand; the proposal recorded this and it was approved. Compose dev keeps auto-registration.
- **`CommandListener` on bare records, header mapped.** Done (AC-3).
- **Byte-array template for the dead-letter recoverer.** Done, and widened: the whole command path
  reads bytes, so a known but unhandled type keeps its bytes too (AC-4, design decision).
- **Consumers first after a drain.** The runbook is in `interfaces/avro-messages.md`. The
  deployment itself is an operational step for the requester.

Left out on purpose, as approved: a gauge for the depth of `commands.DLT`; deduplication by
`commandId` for every command type (the id is now stored for all, which enables it later).

## Policy Review

Reviewed against the diff of the SPEC-0025 files (tasks.md lists them, with its Notes). The working
tree also holds uncommitted work of earlier, finished tickets; it is not judged here.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | New and changed `.avsc`, the OpenAPI change and the registrar are all in oms-contracts; `verifyContracts` passes |
| P-02 | Specification before code, generated models only | PASS | Schemas changed first (T-1–T-4); code uses generated `msg`/`cmd` classes; `CommandHeaderMapper` maps between generated types |
| P-03 | Never edit generated code | PASS | Regenerated with `./gradlew clean build`; nothing under `build/generated` edited |
| P-04 | Contracts evolve compatibly | EXCEPTION | Declared in design.md and approved: the BREAKING change on `commands` (envelope removed, fields removed and tightened), contained by the drained, consumers-first runbook. Each record now has its own baseline (`CommandCompatibilityTest`). OpenAPI additive, 3.1.0 |
| P-05 | Every state change is recorded in the event log | PASS | Unchanged events; the stored command now carries the header (AC-3) |
| P-06 | Kafka only through the transactional outbox | PASS | oms-core still publishes only via `OutboxRelay`; the dead-letter template only republishes failed inbound records, the existing DLT mechanism |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database change |
| P-08 | Concurrency and idempotency are explicit | PASS | Deduplication rules are unchanged except one narrow widening, documented in avro-messages.md: a lifecycle command reusing the id of an earlier create, accept or fill of the same order is now refused as a duplicate. `DeduplicateCommandTask` is still only in the lifecycle pipeline ( `OrderLifecycleCommandProcessorTest` and the workflow duplicate tests pass). The simulator keeps its deterministic lifecycle ids in the header. `(order_id, command_id)` stays unique, and a command appends at most one event per order |
| P-09 | Commands and queries stay separate | PASS | Command side only |
| P-10 | State transitions go through the state machine and task pipeline | PASS | The listener calls the same processors |
| P-11 | Layering and conventions | PASS | Kafka wiring in `config/`, mapper in `mapper/`, simulator `Cause` in `engine/` and `CommandHeaders` in `kafka/` |
| P-12 | Jackson 3 only | PASS | No Jackson use added in services (`CommandJsonConverter` unchanged) |
| P-13 | Errors and validation follow the framework specs | PASS | Kafka error path as documented in `error-handling.md` (updated): refusals acknowledged, faults retried then dead-lettered, undecodable and unknown records dead-lettered without retry |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC above; tests were written red first per task, with the noted exceptions where compilation forced the order (tasks.md Notes) |
| P-15 | Observability | PASS | `oms.commands.consumed{type,outcome}`; `commandId`/`correlationId` in the MDC and in the printed correlation block; trace propagation unchanged. R08 passes (the registrar's CLI output is outside `src/main`) |
| P-16 | Security | PASS | No secrets; registry URL from the environment; schemas registered by an explicit step instead of any producer |
| P-17 | Simplicity and dependencies | PASS | R10 warnings (`oms-contracts/build.gradle`, `docker-compose.yml`) are the source set and task and the compose variable recorded in design.md's Alternatives & Decisions; the registry client is already a dependency of every service and stays out of the published jar |
| P-18 | Modules build standalone | PASS | All five Java modules and the cockpit pass `check`/tests in verify |
| P-19 | Documentation follows behaviour | PASS | `interfaces/avro-messages.md`, `interfaces/kafka-topics.md`, `interfaces/command-api.md`, `capabilities/exchange-simulation.md`, `oms-framework/error-handling.md`, `oms-framework/testing-patterns.md`, `oms-contracts/README.md`; okf-check 0 errors, 0 warnings |

## Independent Review

**spec-reviewer** (2026-11-01 19:30Z), verdict MET. It found every AC proven. Its findings and how
each was resolved:

1. **[major] Host-native runs defaulted to `auto.register.schemas=false`.** Against a fresh
   registry, `bootRun` of oms-core would stall the outbox, and the standalone simulator could not
   send. **Fixed (T-19):**
   - `oms-core/.env`, imported by `application.yml`, sets `KAFKA_AUTO_REGISTER_SCHEMAS=true`;
   - the simulator README shows the variable for a standalone run;
   - avro-messages.md lists the three local modes and what fails without the variable.
2. **[minor] Collisions on `(order_id, command_id)`.** None in any normal path. An external Kafka
   producer reusing an id on one order, or sending one longer than 255 characters, gets a retried
   insert failure and a dead letter rather than a refusal. **Documented** in avro-messages.md
   (unique per order, at most 255). Making constraint violations non-retryable was rejected: the
   `(order_id, version)` race relies on the retry (`OrderEventAppender`).
3. **[minor] Deduplication widened slightly.** A lifecycle command reusing the id of an earlier
   create, accept or fill is refused. **Accepted and documented** (P-08 above, avro-messages.md).
4. **[minor] "Not retried" in AC-4 was proven only by timing.** **Fixed:** the test asserts one
   failed attempt per dead letter from the counter.
5. **[minor] AC-2's "optional" was not asserted.** **Fixed:** `@NotNull` is checked on the getters.
6. **[minor] A stale envelope comment in the simulator's `build.gradle`.** **Fixed.**
7. **[minor] The dead-letter producer factory was never closed.** **Fixed:** it is destroyed on
   shutdown. It stays out of the bean registry, because a second ProducerFactory bean would switch
   off Boot's own.
8. **[minor] The error handler's retry and DLT log lines carry no `commandId`/`correlationId`**:
   the MDC is cleared when the listener returns. **Follow-up.** The line names topic, partition
   and offset, which identify the record.
9. **[process] verification.md unfilled.** It was being drafted while the review ran; done.

The fixes were re-verified by the 19:36Z run.

## Automated Evidence

`evidence/last-run.json`, ran 2026-11-01T19:36:48Z, result **pass**, fingerprint
`6f1eaaa48674f723`. Policy check: PASS, no errors, two R10 warnings (build changes, recorded in
the design).

| Module | Command | Exit | Log |
|---|---|---|---|
| oms-contracts | `gradlew check` | 0 | evidence/oms-contracts-1.log |
| oms-core | `gradlew check` | 0 (251 tests) | evidence/oms-core-1.log |
| oms-streaming-service | `gradlew check` | 0 | evidence/oms-streaming-service-1.log |
| oms-mcp-server | `gradlew check` | 0 | evidence/oms-mcp-server-1.log |
| oms-exchange-simulator | `gradlew check` | 0 | evidence/oms-exchange-simulator-1.log |
| developer-cockpit | `npm run typecheck` | 0 | evidence/developer-cockpit-1.log |
| developer-cockpit | `npm test` | 0 | evidence/developer-cockpit-2.log |

The first verify attempt (19:13Z) failed one test. `ExchangeWorkflowIntegrationTest` read
`commands.DLT` as Avro and met the garbage dead letter of the new dead-letter test. It now reads
the topic as bytes (tasks.md Notes).

## Follow-ups

- Run the cut-over runbook (`interfaces/avro-messages.md`) when deploying, together with SPEC-0039's
  drain if both ship at once.
- Run `registerSchemas` from a CI job once a shared registry exists.
- A gauge for the depth of `commands.DLT` (deferred in the proposal).
- Carry `commandId`/`correlationId` onto the error handler's retry and dead-letter log lines
  (review finding 8).
- `mission-control/docs/architecture/mission-control-v2.md` still names `CommandMessage`, as a
  historical design note of another module.

## Verdict

Verdict: GOAL MET

All seven ACs pass with tests that ran in the final verify run. The reviewer's one major finding
and its cheap minor ones are fixed and re-verified. The rest are documented or listed as
follow-ups. The goal assessment has no material gap: CI registration and the DLT gauge were
deferred by approved decisions.
