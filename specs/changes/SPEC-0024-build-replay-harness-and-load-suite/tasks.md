# Tasks — SPEC-0024: Build replay harness and load suite

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

- [x] **T-1** Add changelog 014-order-events-schema-version.yaml and the `schemaVersion` field on `OrderEvent` (AC-3, AC-4)
  - files: oms-core/src/main/resources/db/changelog/014-order-events-schema-version.yaml, oms-core/src/main/resources/db/changelog/db.changelog-master.yaml, oms-core/src/main/java/org/example/oms/model/OrderEvent.java
  - verify: the oms-core migration test passes with the new changelog applied and the entity matches the migrated schema
- [x] **T-2** Add the `OrderEventSchemaVersion` constants holder and stamp `schemaVersion` in `OrderEventAppender` with its unit test written first (AC-4)
  - files: oms-core/src/main/java/org/example/oms/model/OrderEventSchemaVersion.java, oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java, oms-core/src/test/java/org/example/oms/service/OrderEventAppenderTest.java
  - verify: every appended event asserts `schemaVersion == OrderEventSchemaVersion.CURRENT` and `./gradlew test` in oms-core passes that test class
- [x] **T-3** Commit the golden-file fixtures of legacy event JSON, add `StoredEventDecoder` (the upcasting rule) and `OrderEventSchemaVersionTest` reading each fixture through it as version 1 (AC-4)
  - files: oms-core/src/test/resources/fixtures/order-events/, oms-core/src/test/java/org/example/oms/replay/StoredEventDecoder.java, oms-core/src/test/java/org/example/oms/replay/StoredEvent.java, oms-core/src/test/java/org/example/oms/model/OrderEventSchemaVersionTest.java
  - verify: each fixture decodes to the current Command/Order model with type and orderId as in the fixture, and that test class passes in oms-core
- [x] **T-4** Add `SnapshotDiff` with its failing unit test first: diff items name orderId, version and field; aggregate summary; missing-side rows reported (AC-2)
  - files: oms-core/src/test/java/org/example/oms/replay/SnapshotDiffTest.java, oms-core/src/test/java/org/example/oms/replay/OrderSnapshotHistory.java, oms-core/src/test/java/org/example/oms/replay/SnapshotDiff.java
  - verify: `./gradlew test --tests 'org.example.oms.replay.SnapshotDiffTest'` in oms-core passes
- [x] **T-5** Add `ReplayTarget` (test scope): a second context on a fresh database with `kafka.enabled=false`, so it has no listener and no relay, and the replay origin (REST, principal `replay`) (AC-1, AC-3)
  - files: oms-core/src/test/java/org/example/oms/replay/ReplayTarget.java
  - verify: `./gradlew compileTestJava` in oms-core passes; T-7's integration test starts the target and asserts no `OutboxRelay` bean exists in it
- [x] **T-6** Add `ReplayHarness` (JDBC reader with legacy upcast and WARN log, second-context runner, `ReplayResult.assertNoDifferences()`) (AC-1, AC-3)
  - files: oms-core/src/test/java/org/example/oms/replay/ReplayHarness.java, oms-core/src/test/java/org/example/oms/replay/ReplayResult.java, oms-core/src/test/java/org/example/oms/replay/OrderSnapshotHistory.java
  - verify: `./gradlew compileTestJava` in oms-core passes (the harness's behaviour proves itself through T-7's integration test)
- [x] **T-7** Add `ReplayHarnessIntegrationTest`: real history create → accept → fills → cancel replayed with zero differences; a seeded deviation fails with a named diff; legacy rows replay with the WARN (AC-1, AC-2, AC-3)
  - files: oms-core/src/test/java/org/example/oms/replay/ReplayHarnessIntegrationTest.java
  - verify: `./gradlew test --tests 'org.example.oms.replay.ReplayHarnessIntegrationTest'` in oms-core passes all three tests (zero-difference replay, divergent replay fails, legacy replay warns and succeeds)
- [x] **T-8** Add `LoadReport` and `LoadReportWriter` with the unit test asserting throughput and p50/p95/p99 percentiles appear in the written file (AC-5)
  - files: oms-core/src/test/java/org/example/oms/load/LoadReport.java, oms-core/src/test/java/org/example/oms/load/LoadReportWriter.java, oms-core/src/test/java/org/example/oms/load/LoadReportWriterTest.java
  - verify: `./gradlew test --tests 'org.example.oms.load.LoadReportWriterTest'` in oms-core passes
- [x] **T-9** Add the gated `LoadSuiteRunnerTest` (`OMS_LOAD_SUITE=true`) reading the SLA histograms from `/actuator/prometheus` (percentiles from this run's bucket deltas, `PrometheusSnapshot`) and writing the baseline report (AC-5)
  - files: oms-core/src/test/java/org/example/oms/load/LoadSuiteRunnerTest.java, oms-core/src/test/java/org/example/oms/load/PrometheusSnapshot.java, oms-core/src/test/java/org/example/oms/load/PrometheusSnapshotTest.java
  - verify: the oms-core test suite passes with the gate closed (the runner is skipped), and a manual gated run against the compose stack produces a report file
- [x] **T-10** Run the load suite once against the compose stack and commit the baseline document `oms-core/docs/load-baseline-<date>.md` with configuration, throughput and percentiles (AC-6)
  - files: oms-core/docs/load-baseline-2026-11-08.md
  - verify: the committed document states order count, concurrency, fill slices, measured commands/s and latency p50/p95/p99; read back against the run report
- [x] **T-11** Update the knowledge base: upcasting rule in oms-state-store.md, replay harness and golden fixtures in testing-patterns.md, load suite in exchange-simulator.md (AC-3, AC-4, AC-5)
  - files: oms-knowledge-base/oms-framework/oms-state-store.md, oms-knowledge-base/oms-framework/testing-patterns.md, oms-knowledge-base/oms-concepts/exchange-simulator.md
  - verify: the three pages state the rule and tooling as implemented; grep shows no leftover placeholder text
- [x] **T-12** Run `spec verify`
  - files:
  - verify: `node specs/tools/spec.mjs verify SPEC-0024` exits 0

## Notes

- No contracts phase: the design keeps every contract stable; `schema_version` is an oms-core
  database column.
- T-7 is the red→green heart of the replay: T-4 to T-6 exist to make it expressible, T-1 to T-3
  to make it version-safe.
- T-9's verification has two halves: CI must stay green with the gate closed, and the manual
  gated run is what T-10 commits as the baseline.
- Ticket modules were narrowed to `oms-core, oms-knowledge-base` by design decision (the
  exchange simulator participates unchanged).
- Changed during implementation (see design.md, Alternatives & Decisions): T-3 gains
  `StoredEventDecoder` so the fixtures and the harness share one upcasting rule; T-5 no longer
  adds `CommandOrigin.replay()` (the source enum is published in oms-query-api.yml) or an
  `outbox.relay.enabled` property (`kafka.enabled=false` already removes the listener and relay),
  and becomes the test-side `ReplayTarget`.
- Verify-stage review (finding 1, major) reopened implement: `OrderEventSchemaVersionTest` gained
  `legacyFixtureLosesNoFieldOnRead` (red on 9 fields the model never had), and the execution
  fixture was made faithful to the model. Minor findings fixed alongside: the runner checks that
  Kafka commands applied match the configured fill slices; design text on refusals; production
  readers caveat in oms-state-store.md; baseline provenance and run-to-run variance.
