# Verification — SPEC-0077: Dead-letter and retry policy for every Kafka client

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

The four consumers are oms-core `commands` (core), the simulator's `oms_orders` listener (sim), and
the streaming service's two receivers (stream). Tests ran in the `spec verify` recorded in
`evidence/last-run.json`; logs `evidence/<module>-1.log`, results in each module's
`build/test-results/test`.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Retryable failure retried with back-off, processed once, offset committed only after success, no DLT | core `CommandErrorPolicyIntegrationTest#retryableFailureRetriedThenProcessedOnce`; sim `OrderListenerErrorPolicyIntegrationTest#retryableFailureRetriedThenProcessedOnce`; stream `StreamErrorPolicyIntegrationTest#retryableFailureRetriedThenEmittedOnce` (orders) and `#retryableFillFailureRetriedThenEmittedOnce` (executions). Each: handler called 3 times, effect once, nothing on the DLT. Core, sim and stream (orders) also read the group's committed offset while the record fails (never past it) and after success (past it). Back-off timing: `ErrorPolicyPropertiesTest#windowBackOffStopsOnceTheWaitsReachRetryFor` in each module | PASS |
| AC-2 | Past the window → `<topic>.<service>.DLT` with key, value bytes, failure headers; next record processed | `#retryableFailurePastWindowDeadLettered` in the three classes (stream on executions): DLT record, original topic/partition/offset headers, exception message, `dlt-source=consumer`, `dlt-service`, the metric +1, next record processed; sim and stream compare the value bytes exactly. Core `CommandRetryBudgetIntegrationTest#aRetryableNonConcurrencyFailureIsDeadLetteredAfterTheBudget`. Exception class header: `DeadLettersTest#producerFailureHeadersMatchSpringsNames`, `#consumerFailureHeadersUseSpringsNamesAndTheRecordsOrigin` (stream); Spring writes it for core and sim | PASS |
| AC-3 | Non-retryable (NPE, permission, undeserializable) dead-lettered on first failure, next processed | `#nonRetryableFailureDeadLetteredAtOnce` in the three classes (core: NPE and SQLState 42501, each called once; sim: NPE and undecodable bytes; stream: NPE on orders) and stream `#nonRetryableFillFailureDeadLetteredAtOnce` (executions); core `CommandDeadLetterIntegrationTest#unhandledUndecodableAndGarbageKeepTheirBytes`; classification of every listed type incl. `AccessDeniedException`, `AuthorizationException`, 42501: `ErrorClassifierTest#classifiesTable` in each module | PASS |
| AC-4 | Undeserializable `oms_orders` record in the streaming service → DLT, a later order still reaches a subscriber | stream `StreamErrorPolicyIntegrationTest#poisonRecordDeadLetteredAndStreamContinues` (source topic is the test's isolated orders topic; naming rule identical) | PASS |
| AC-5 | Concurrency conflict never dead-lettered | core `CommandErrorPolicyIntegrationTest#concurrencyConflictNeverDeadLettered` (conflict outlasts the 3 s window, fill applied, DLT empty); `OrderVersionIntegrationTest#kafkaFillRetriedAfterAConflict` | PASS |
| AC-6 | Producer: retryable then success → delivered once, no DLT; outbox broker outage never dead-letters | core `OutboxDeadLetterIntegrationTest#retryableFailureThenSuccessDeliveredOnce`, `#transientOutageNeverDeadLettered`; sim `CommandGatewayIntegrationTest#pausedBrokerDeliveredOnceWithinWindow` (real broker paused), `#producerDeliveryTimeoutFollowsRetryFor`; `ErrorPolicyPropertiesTest` producer timeouts in each module; `OutboxMessageRetryWindowTest` | PASS |
| AC-7 | Producer: non-retryable, or retryable past the window → DLT with headers and `dlt-source: producer`; outbox row parked, aggregate held | core `OutboxDeadLetterIntegrationTest#nonRetryableSendDeadLetteredAndAggregateHeld` (Avro bytes, fqcn, source topic, `dlt-source=producer`, metric, later rows held, other aggregates sent), `#retryableFailurePastWindowDeadLettered`, `#deadLetterRefusedLeavesRowStuck`; `OutboxRelayTest` (6 SPEC-0077 tests); sim `CommandGatewayTest#nonRetryableSendDeadLettered`, `#deadLetterCarriesTheAvroBytesAndProducerHeaders`, `#anUnserializableCommandIsDeadLetteredAsJson`, `#deadLetterFailureCountedAndLogged`. The simulator's "past the window" case is the client's own `delivery.timeout.ms = retry-for` (`#producerDeliveryTimeoutFollowsRetryFor`), whose failure takes the same path | PASS |
| AC-8 | DLTs exist at startup with ≥ source partitions; each dead letter counted | core `DeadLetterTopicsIntegrationTest#provisionedWithSourcePartitions`, `#aSourceCreatedLaterIsProvisionedThen` (cold start); sim and stream `#provisionedWithSourcePartitions`; the metric in the AC-2/3/7 tests and `DeadLettersTest#countsByServiceTopicSideAndRootCause` | PASS |
| AC-9 | Coverage test finds every Kafka client and fails on an unwired one | `KafkaClientCoverageTest#everyKafkaClientIsCoveredOrExempt`, `#aNewClientIsReported` in each module; `#listenerFactoryUsesThePolicy` in core and sim | PASS |
| AC-10 | Window and back-off configurable and documented, same defaults everywhere | `ErrorPolicyPropertiesTest#defaultsAndBinding`, `#theServiceYamlNamesItselfAndUsesTheSharedDefaults`, `#rejectsSettingsThatWouldBreakAConsumer` in each module; the commented `kafka.error-policy` block in the three `application.yml`; KB `architecture/patterns/kafka-messaging.md` | PASS |

## Goal Assessment

The goal asked that every Kafka consumer and producer in every service has dead-letter logic, that
retryable failures are retried for a configurable time, and that failures that cannot succeed (null
pointer, permission denied) go to a DLT.

- **Every client is covered.** oms-core (command consumer, outbox), the exchange simulator (order
  consumer, command producer) and the streaming service (both receivers) follow one policy, and a
  coverage test per module fails the build when a new client is not wired to it. oms-mcp-server and
  oms-ui have no Kafka clients.
- **Configurable retry time.** `kafka.error-policy.retry-for` (default 2 minutes) and the back-off
  settings, identical in the three services, with environment variables.
- **Non-retryable to DLT.** Null pointers, permission errors (file, SQL 42501, Kafka authorization,
  Spring Security) and undecodable records are dead-lettered on the first failure. The streaming
  service no longer stops on a record it cannot decode.
- **Differences from the proposal's wording the requester should know** (recorded in design.md):
  `IllegalStateException` is retryable (D-8); a (de)serialization error caused by an I/O error (the
  schema registry down) is retryable (D-13); a concurrency conflict in oms-core is never
  dead-lettered (AC-5, as before); an outbox broker outage never dead-letters.
- **Left out on purpose** (proposal Scope): resending from a DLT, and moving the old `commands.DLT`
  records to `commands.oms-core.DLT`.

No material gap between the goal and what was built.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | Only descriptions in `oms-contracts/src/main/openapi/oms-query-api.yml`; no service contract folder (oms-contracts `check` passed) |
| P-02 | Specification before code, generated models only | PASS | Contract descriptions updated first (T-1); no hand-written API models |
| P-03 | Never edit generated code | PASS | Regenerated by the oms-contracts build |
| P-04 | Contracts evolve compatibly | PASS | Descriptions only; enum values, fields and types unchanged |
| P-05 | Every state change is recorded in the event log | N/A | No order state changes; outbox columns are delivery bookkeeping |
| P-06 | Kafka only through the transactional outbox | PASS | Events still only through `OutboxRelay`; the outbox's dead letters are sent through `MessagePublisher` (`DeadLetterSender`, D-15). Policy rule R04 passes |
| P-07 | Schema changes through new Liquibase changesets | PASS | New `020-outbox-dead-letter.yaml` with tag and rollbacks; 001–019 untouched (R05 passes); `OutboxDeadLetterMigrationIntegrationTest#stuckRowsStayStuck` |
| P-08 | Concurrency and idempotency are explicit | PASS | Outbox rows changed only by the single relay leader (SPEC-0048); records acknowledged only after handling or dead-lettering; possible duplicate dead letters documented (D-21 note, Event Publication) |
| P-09 | Commands and queries stay separate | PASS | No new endpoints; query API descriptions only |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No order transitions |
| P-11 | Layering and conventions | PASS | `kafka.errors` package per service, wiring in config classes, constructor injection, Lombok `@Slf4j` |
| P-12 | Jackson 3 only | PASS | JSON dead-letter document uses `tools.jackson.databind.json.JsonMapper`; R03 passes |
| P-13 | Errors and validation follow the framework specs | PASS | Every failure ends retried, delivered or dead-lettered and logged; refused dead letters are counted (`kafka.dead.letters.failed`), never swallowed |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC traced above to passing tests |
| P-15 | Observability | PASS | `kafka.dead.letters{service,topic,side,exception}`, `kafka.dead.letters.failed`; ERROR log per dead letter; no `printStackTrace` (D-16, R08 passes) |
| P-16 | Security | PASS | No secrets; stack traces in headers bounded (20 frames per throwable, 8 KB); permission errors are not retried |
| P-17 | Simplicity and dependencies | PASS | Only new dependencies: Testcontainers test scope in oms-streaming-service (D-14), answering the R10 warning |
| P-18 | Modules build standalone | PASS | `./gradlew check` passed in oms-contracts, oms-core, oms-streaming-service, oms-mcp-server, oms-exchange-simulator |
| P-19 | Documentation follows behaviour | PASS | KB: kafka-messaging, event-publication, FR-024, outbox-message, exchange-simulator, streaming-service, query-api, admin-ui, log; okf-check 0 errors |

## Independent Review

The spec-reviewer agent judged the goal **met**, with these findings:

1. **[major, process] Stale evidence, blank verification.md.** Fixed: `spec verify` re-run after the
   last code change; this document.
2. **[major] Dead-letter topic provisioning was all-or-nothing and only at startup**, so on a fresh
   stack (oms-core creates its topics after Liquibase) the simulator or streaming service could start
   with no DLTs. Fixed (D-18): per-source provisioning, background retry every 10 s until the source
   exists; `DeadLetterTopicsIntegrationTest#aSourceCreatedLaterIsProvisionedThen`.
3. **[minor] The simulator dead-lettered on the producer's network thread.** Fixed (D-20): a virtual
   thread per outcome; `CommandGatewayTest#deadLetteringRunsOffTheCompletingThread`.
4. **[minor] The outbox's Avro dead letter would always fall back to JSON in production**
   (`auto.register.schemas=false`, DLT subject never registered). Fixed (D-19): serialized under the
   source topic's subject and sent as bytes.
5. **[minor] A locally timed-out dead-letter send can produce a duplicate.** Accepted and documented
   (Event Publication, "Duplicate dead letters"); a DLT is an operator inbox, a duplicate there is
   harmless.
6. **[minor] Changelog 020's backfill assumes 10 attempts.** Accepted and documented (Event
   Publication, "Rolling out SPEC-0077"): 10 was the old default, and a deployment that ran with
   another `OUTBOX_MAX_ATTEMPTS` is told to check its parked rows after the upgrade.
7. **[minor] `max-interval <= retry-for` not validated; a transient failure did not restart the
   window.** Fixed (D-21): validation in the three copies (`ErrorPolicyPropertiesTest`), and
   `OutboxMessage.recordTransientFailure` clears the window (`OutboxMessageRetryWindowTest`).
8. **[minor] Orphaned Javadoc in `OutboxMessage`.** Fixed.

The reviewer also noted the AC-1 offset-commit proof and the executions variants of the streaming
AC-1/AC-3 tests as gaps in the evidence it reviewed; both were added before this verify run.

## Automated Evidence

`evidence/last-run.json`, ran 2026-11-26T06:34Z after the last code change, result **PASS**:

| Module | Command | Exit | Time |
|---|---|---|---|
| oms-contracts | `gradlew check` | 0 | 7 s |
| oms-core | `gradlew check` | 0 | 603 s |
| oms-streaming-service | `gradlew check` | 0 | 61 s |
| oms-mcp-server | `gradlew check` | 0 | 21 s |
| oms-exchange-simulator | `gradlew check` | 0 | 121 s |

- Policy check: PASS, no errors. One warning, R10 (P-17), for the `oms-streaming-service/build.gradle`
  change, answered by D-14 (test-scope Testcontainers).
- JUnit results: no failures in any module; the only skipped test is oms-core's environment-gated
  `LoadSuiteRunnerTest`.
- Earlier rounds of this stage: the first verify failed on R04 (P-06) and R08 (P-15), fixed by D-15
  and D-16; the second on a provisioning race in `StreamErrorPolicyIntegrationTest`, fixed by D-17.
  One oms-core full run before verify had a timing failure in the unchanged
  `KafkaTopicProvisionerIntegrationTest#instancesStartingTogetherAllProvisionWithoutError`; it passed
  three isolated reruns and every later full run.
- `node tools/okf-check/okf-check.mjs oms-knowledge-base`: 0 errors.

## Follow-ups

- Resend from a dead-letter topic (operator action in oms-ui), out of scope here.
- Optionally drop the old `commands.DLT` topic once its records have been looked at.

## Verdict

Verdict: GOAL MET
