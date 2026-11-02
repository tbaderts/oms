# Tasks — SPEC-0026: Isolate failing aggregates in the outbox relay

> **Stage 3 of 3 — the executable plan.** The implement stage works top to bottom and ticks each
> box only when its `verify:` check passes. Keep tasks small (one focused change, about one
> red→green cycle) and in dependency order:
>
> 1. Contracts (oms-contracts) and regeneration
> 2. Migration (new Liquibase changelog)
> 3. Behaviour, one task per AC or slice: write the failing test, implement, make it green
> 4. Wiring: API, messaging, configuration
> 5. Observability (logs, metrics)
> 6. Knowledge base and docs
> 7. Full verification (`spec verify`)
>
> Format, which the gate parses:
>
> ```
> - [ ] **T-1** Imperative summary (AC-1, AC-2)
>   - files: path/one.java, path/two.yaml
>   - verify: `./gradlew test --tests 'org.example.oms…SomeTest'` passes
> ```
>
> Every AC must be covered by at least one task, and every task needs a `verify:` line. Tasks may
> be added during implementation; record why under Notes.

## Tasks

Shortcut used in `verify:` lines: `gt <Class>` = `cd oms-core && ./gradlew test --tests '*<Class>'`.

- [x] **T-1** Write `LiquibaseMigrationIntegrationTest#outboxHasTopicAggregateIndex` red, then add `009-outbox-aggregate-index.yaml` (changeset 020, rollback) and include it in the master changelog (AC-4)
  - files: oms-core/src/test/java/org/example/oms/integration/LiquibaseMigrationIntegrationTest.java, oms-core/src/main/resources/db/changelog/009-outbox-aggregate-index.yaml, oms-core/src/main/resources/db/changelog/db.changelog-master.yaml
  - verify: `gt LiquibaseMigrationIntegrationTest` passes
- [x] **T-2** Write `MessagePublisherTest` for `publishAsync` red (returns the template's future; a mapping failure gives a failed future or throws; the key is `aggregateId`), then add `publishAsync`, remove the blocking `publish` and `kafka.send-timeout-seconds` if unused (AC-3)
  - files: oms-core/src/test/java/org/example/oms/service/MessagePublisherTest.java, oms-core/src/main/java/org/example/oms/service/MessagePublisher.java, oms-core/src/main/resources/application.yml
  - verify: `gt MessagePublisherTest` passes
- [x] **T-3** Rewrite `OutboxRelayTest` for `publishAsync`: `drain_publishesAndRemovesEachMessage`, `drain_whenPublishFails_keepsTheMessageAndCountsTheAttempt`, `drain_whenNothingPending_doesNothing`, `failureHoldsOnlyItsAggregate`, `rowsOfOneAggregateAreSentInIdOrderAfterEachAck`, `synchronousFailureStopsTheAggregate`, `asynchronousFailureStopsTheAggregate`, `aggregatesAreInFlightTogether`, `oldestAgeIsZeroWhenNothingPending`; see the new ones fail (AC-1, AC-2, AC-3, AC-5)
  - files: oms-core/src/test/java/org/example/oms/service/OutboxRelayTest.java
  - verify: `gt OutboxRelayTest` fails on the new per-aggregate, concurrency and gauge tests
- [x] **T-4** Implement the relay: group by `(topic, aggregateId)`, acknowledgement-gated chains on the `outbox-relay-send` executor, `closed` flag, deadline `kafka.outbox.drain-timeout-ms`, outcomes applied on the drain thread, executor shut down on `@PreDestroy` (AC-1, AC-2, AC-3)
  - files: oms-core/src/main/java/org/example/oms/service/OutboxRelay.java, oms-core/src/main/resources/application.yml
  - verify: `gt OutboxRelayTest` passes except `oldestAgeIsZeroWhenNothingPending`
- [x] **T-5** Add `OutboxRepository.findOldestPendingCreatedAt` and the `oms.outbox.oldest.age` gauge (seconds) (AC-5)
  - files: oms-core/src/main/java/org/example/oms/repository/OutboxRepository.java, oms-core/src/main/java/org/example/oms/service/OutboxRelay.java
  - verify: `gt OutboxRelayTest` passes
- [x] **T-6** Write `OutboxHoldIntegrationTest` (`rowsBehindAStuckRowAreHeld`, `oldestAgeGaugeReportsTheHeldRow`) red, then add the held-aggregate `NOT EXISTS` condition to `claimPending` (AC-4, AC-5)
  - files: oms-core/src/test/java/org/example/oms/integration/OutboxHoldIntegrationTest.java, oms-core/src/main/java/org/example/oms/repository/OutboxRepository.java
  - verify: `gt OutboxHoldIntegrationTest` passes, and `gt OrderExecutionPublicationIntegrationTest` and `gt ExchangeWorkflowIntegrationTest` pass
- [x] **T-7** Update the knowledge base: `capabilities/event-publication.md`, `domain/outbox-message.md`, `architecture/transactional-outbox.md` (AC-1, AC-4, AC-5)
  - files: oms-knowledge-base/capabilities/event-publication.md, oms-knowledge-base/domain/outbox-message.md, oms-knowledge-base/architecture/transactional-outbox.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports 0 errors
- [x] **T-8** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0026` exits 0

- [x] **T-9** Review fixes, test first. `OutboxRelayTest` gains:
  - `timeoutLeavesUnfinishedRowsUntouched` (a future that never completes: A1 not charged and not deleted, A2 not sent, B published);
  - `lateAcknowledgementAfterTheDrainChangesNothing`;
  - `sameKeyOnAnotherTopicIsAnotherAggregate`;
  - `failureWithoutMessageRecordsItsType`.

  `OutboxHoldIntegrationTest` proves stuck rows are left out of the age. Then: charge only definitive failures, a virtual-thread executor with graceful shutdown, `max.block.ms` 10 s, and a null-message fallback (AC-1, AC-2, AC-5)
  - files: oms-core/src/test/java/org/example/oms/service/OutboxRelayTest.java, oms-core/src/test/java/org/example/oms/integration/OutboxHoldIntegrationTest.java, oms-core/src/main/java/org/example/oms/service/OutboxRelay.java, oms-core/src/main/resources/application.yml
  - verify: `gt OutboxRelayTest` and `gt OutboxHoldIntegrationTest` pass
- [x] **T-10** Knowledge base after review: FR-023 and FR-024 (and the requirements index) describe per-aggregate order and isolation; the rollout note on stuck rows; only definitive failures cost an attempt (AC-1, AC-4)
  - files: oms-knowledge-base/functional-requirements/FR-023-relay-outbox-in-order.md, oms-knowledge-base/functional-requirements/FR-024-retry-failed-publication.md, oms-knowledge-base/functional-requirements/index.md, oms-knowledge-base/capabilities/event-publication.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports 0 errors
- [x] **T-11** Run spec verify again
  - verify: `node specs/tools/spec.mjs verify SPEC-0026` exits 0
- [x] **T-12** Second review, test first: `OutboxRelayTest#retriableFailureCostsNoAttempt`, `#unreachableRegistryCostsNoAttempt` and `#aggregateWithASendStillInFlightIsSkipped`. Then: classify transient failures (`OutboxRelay.isTransient`, `OutboxMessage.recordTransientFailure`), track in-flight aggregates across drains, correct design step 4 and the `max.block.ms` comment, and update the KB (event-publication, FR-024) (AC-1, AC-2, AC-4)
  - files: oms-core/src/test/java/org/example/oms/service/OutboxRelayTest.java, oms-core/src/main/java/org/example/oms/service/OutboxRelay.java, oms-core/src/main/java/org/example/oms/model/OutboxMessage.java, oms-core/src/main/resources/application.yml, oms-knowledge-base/capabilities/event-publication.md, oms-knowledge-base/functional-requirements/FR-024-retry-failed-publication.md
  - verify: `gt OutboxRelayTest` passes (16 tests), okf-check reports 0 errors
- [x] **T-13** Run spec verify after the second review
  - verify: `node specs/tools/spec.mjs verify SPEC-0026` exits 0

- [x] **T-14** Third review: mark the aggregate in flight before checking `closed` (no two drains send one row), and document the batch-fill and misconfigured-topic limits in event-publication.md (AC-2)
  - files: oms-core/src/main/java/org/example/oms/service/OutboxRelay.java, oms-knowledge-base/capabilities/event-publication.md
  - verify: `gt OutboxRelayTest` passes, okf-check 0 errors
- [x] **T-15** Run spec verify after the third review
  - verify: `node specs/tools/spec.mjs verify SPEC-0026` exits 0

## Notes

- T-4 makes the existing ordering test obsolete by design: "stop the batch" becomes "stop the
  aggregate" (approved proposal).
- T-2 to T-5 were verified together: removing the blocking `publish` breaks the relay's compile until T-4, and T-4 needs the repository method of T-5 to compile. `OrderExecutionPublicationIntegrationTest` also called `publish` (a redelivery test) and now awaits `publishAsync`.
