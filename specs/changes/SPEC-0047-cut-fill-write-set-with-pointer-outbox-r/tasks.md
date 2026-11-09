# Tasks — SPEC-0047: Cut fill write set with pointer outbox rows

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

- [x] **T-1** Write `FillWriteSetIntegrationTest#oneFillWritesLess` and measure the baseline on the unchanged code: one fill through the pipeline (Kafka off, own database), Hibernate `Statistics` prepared-statement count, `nextval` count, outbox bytes, and the event's snapshot size. Record the baseline as constants in the test and in Notes. The test's target assertions are then red (AC-7)
  - files: oms-core/src/test/java/org/example/oms/integration/FillWriteSetIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/SqlCounter.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.FillWriteSetIntegrationTest'` runs; the baseline figures it prints are recorded in Notes, and it fails only on the target assertions
- [x] **T-2** Add the WAL probe to the load suite: `OMS_LOAD_DB_URL`/`_USER`/`_PASSWORD` with the compose defaults; `pg_current_wal_lsn()` before and after the run; `LoadReport` and `LoadReportWriter` show WAL bytes and WAL bytes per order (test first in `LoadReportWriterTest`) (AC-9)
  - files: oms-core/src/test/java/org/example/oms/load/LoadSuiteRunnerTest.java, oms-core/src/test/java/org/example/oms/load/LoadReport.java, oms-core/src/test/java/org/example/oms/load/LoadReportWriter.java, oms-core/src/test/java/org/example/oms/load/LoadReportWriterTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.load.LoadReportWriterTest'` passes
- [x] **T-3** Measure the "before" side: build the oms-core image from the unchanged tree (`docker compose up -d --build oms-core`, simulator `SIMULATOR_FILL_SLICES=1`), one warm-up run and three measured runs of the load suite at 500 orders, concurrency 8, 1 slice. Coordinate with any other session using the stack. Keep the four reports and record the three runs and their medians in Notes (AC-9)
  - files: none in the source tree (reports under oms-core/build/load-reports, copied to the ticket's evidence/ by the human or referenced by path)
  - verify: three before-side reports exist with throughput, OMS processing p95 and WAL bytes per order, and their medians are in Notes
- [x] **T-4** Pool the sequences and enable batching: write `PooledSequenceIntegrationTest#sixtyRowsCostAtMostTwoSequenceCalls` (red); add changelog 015 (both changesets) to the master; `allocationSize = 50` on `Order`, `Execution`, `OrderEvent`, `OrderExecutionProjectionRow`; `hibernate.id.optimizer.pooled.preferred: pooled-lo`, `jdbc.batch_size: 50`, `order_inserts`, `order_updates` in application.yml (AC-6)
  - files: oms-core/src/main/resources/db/changelog/015-pointer-outbox-and-pooled-sequences.yaml, oms-core/src/main/resources/db/changelog/db.changelog-master.yaml, oms-core/src/main/java/org/example/common/model/Order.java, oms-core/src/main/java/org/example/common/model/Execution.java, oms-core/src/main/java/org/example/oms/model/OrderEvent.java, oms-core/src/main/java/org/example/oms/model/OrderExecutionProjectionRow.java, oms-core/src/main/resources/application.yml, oms-core/src/test/java/org/example/oms/integration/PooledSequenceIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.PooledSequenceIntegrationTest' --tests 'org.example.oms.integration.OrderVersionIntegrationTest'` passes
- [x] **T-5** Add `orderId`/`execId` to `OutboxMessage` and the per-order version guard to `claimPending`, test first with `OutboxClaimIntegrationTest#rowsOfAnOrderAreClaimedInVersionOrder` (red without the guard) (AC-5)
  - files: oms-core/src/main/java/org/example/oms/model/OutboxMessage.java, oms-core/src/main/java/org/example/oms/repository/OutboxRepository.java, oms-core/src/test/java/org/example/oms/integration/OutboxClaimIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.OutboxClaimIntegrationTest' --tests 'org.example.oms.integration.OutboxHoldIntegrationTest'` passes
- [x] **T-6** Resolve payloads on the drain thread: new `OutboxPayloads` (legacy rows from payload columns, pointer rows from `OrderEventRepository.findByOrderIdAndVersion` and `ExecutionRepository.findByOrderIdAndExecId`, failures naming order and version); `ExecutionMessageMapper.toExecutionMessage(execution, rootOrderId, version)`; `MessagePublisher.publishAsync(row, record)` only sends; `OutboxRelay.drainBatch` resolves before chaining and fails a row whose resolution failed. Tests first: `PointerOutboxIntegrationTest#legacyPayloadRowsStillPublish` and `#aPointerWithNoTargetFailsAndHoldsItsAggregate`; adapt `MessagePublisherTest` and `OutboxRelayTest` (AC-3, AC-4)
  - files: oms-core/src/main/java/org/example/oms/service/OutboxPayloads.java, oms-core/src/main/java/org/example/oms/service/MessagePublisher.java, oms-core/src/main/java/org/example/oms/service/OutboxRelay.java, oms-core/src/main/java/org/example/oms/mapper/ExecutionMessageMapper.java, oms-core/src/main/java/org/example/oms/repository/OrderEventRepository.java, oms-core/src/test/java/org/example/oms/integration/PointerOutboxIntegrationTest.java, oms-core/src/test/java/org/example/oms/service/MessagePublisherTest.java, oms-core/src/test/java/org/example/oms/service/OutboxRelayTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.PointerOutboxIntegrationTest' --tests 'org.example.oms.service.MessagePublisherTest' --tests 'org.example.oms.service.OutboxRelayTest'` passes
- [x] **T-7** Stage pointer rows: `appendOrderEvent` and `appendExecutionEvent` set `orderId`/`execId` and no payloads; `StagedMessage` gains `orderId` and PROJECTION rows carry it. Tests first: `PointerOutboxIntegrationTest#aFillStagesPointerRowsAndOneSnapshot` and `#pointerRowsPublishTheSameRecordsAsPayloadRows`; adapt `OrderEventAppenderTest` and `ProjectTaskTest` (AC-1, AC-2)
  - files: oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java, oms-core/src/main/java/org/example/oms/projection/StagedMessage.java, oms-core/src/main/java/org/example/oms/projection/OrderExecutionProjection.java, oms-core/src/test/java/org/example/oms/integration/PointerOutboxIntegrationTest.java, oms-core/src/test/java/org/example/oms/service/OrderEventAppenderTest.java, oms-core/src/test/java/org/example/oms/service/execution/tasks/ProjectTaskTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.PointerOutboxIntegrationTest' --tests 'org.example.oms.service.OrderEventAppenderTest' --tests 'org.example.oms.service.execution.tasks.ProjectTaskTest' --tests 'org.example.oms.integration.OrderExecutionPublicationIntegrationTest'` passes
- [x] **T-8** Make `FillWriteSetIntegrationTest` green against the T-1 baseline (AC-7)
  - files: oms-core/src/test/java/org/example/oms/integration/FillWriteSetIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.FillWriteSetIntegrationTest'` passes
- [x] **T-9** Keep replay valid under pooled ids: `ReplayHarnessIntegrationTest#replayHoldsBackAVersionWhoseIdComesFirst` (red), then `ReplayHarness` holds back an event until its predecessor version of the same order is replayed (AC-8)
  - files: oms-core/src/test/java/org/example/oms/replay/ReplayHarness.java, oms-core/src/test/java/org/example/oms/replay/ReplayHarnessIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.replay.*'` passes
- [x] **T-10** Extend `TwoInstanceIntegrationTest#contentionLeavesNothingDeadLettered`: assert some order's `order_events` ids are out of version order (pooled ids interleaved), and every published `OrderMessage` and `Execution` equals the mapper's output for the stored snapshot or execution of that version (AC-8)
  - files: oms-core/src/test/java/org/example/oms/integration/TwoInstanceIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.TwoInstanceIntegrationTest' --tests 'org.example.oms.integration.OrderVersionTwoInstanceIntegrationTest' --tests 'org.example.oms.integration.OutboxHoldTwoInstanceIntegrationTest'` passes
- [x] **T-11** Measure the "after" side exactly as in T-3, against an image built from the changed tree; record the three runs and medians in Notes and compare with T-3 (AC-9)
  - files: none in the source tree (reports under oms-core/build/load-reports)
  - verify: three after-side reports exist and Notes holds the before/after medians of WAL bytes per order, OMS processing p95 and throughput
- [x] **T-12** Update the knowledge base: outbox-message, transactional-outbox, event-publication, event-sourcing, oms-state-store, domain-model_spec, exchange-simulator §8, testing-patterns (AC-1, AC-5, AC-9)
  - files: oms-knowledge-base/domain/outbox-message.md, oms-knowledge-base/architecture/transactional-outbox.md, oms-knowledge-base/capabilities/event-publication.md, oms-knowledge-base/architecture/event-sourcing.md, oms-knowledge-base/oms-framework/oms-state-store.md, oms-knowledge-base/oms-framework/domain-model_spec.md, oms-knowledge-base/oms-concepts/exchange-simulator.md, oms-knowledge-base/oms-framework/testing-patterns.md
  - verify: grep finds `order_id` and `pooled-lo` in outbox-message.md / domain-model_spec.md, and `OMS_LOAD_DB_URL` in exchange-simulator.md
- [x] **T-13** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0047` exits 0

- [x] **T-14** From the independent review: document the upgrade and rollback rules for pointer rows in event-publication.md (finding 1); in PointerOutboxIntegrationTest compare against the order entity the old code staged (finding 2), add an EXECUTION pointer whose execution is missing to the AC-4 test (finding 3), and make its cleanup one bulk delete (finding 6) (AC-2, AC-4)
  - files: oms-knowledge-base/capabilities/event-publication.md, oms-core/src/test/java/org/example/oms/integration/PointerOutboxIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.PointerOutboxIntegrationTest'` passes and grep finds "Rolling out SPEC-0047" in event-publication.md
- [x] **T-15** Rerun spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0047` exits 0

## Notes

- T-1 and T-3 must run on the unchanged code: they produce the "before" figures that AC-7 and AC-9 compare against.
- T-3 and T-11 need the compose stack and Docker, and oms-core Gradle runs. Other sessions may share the working tree and the stack, so check with ListAgents and agree a quiet window first.
- The relay guard (T-5) lands before pointer staging (T-7), so pointer rows are never published without the ordering safety net.
- T-1 baseline (2026-11-08, unchanged code, second fill on a live order, Kafka off): 20 prepared statements, 7 sequence calls, 3557 bytes in the fill's outbox rows, order snapshot 1144 bytes. Targets: statements <= 20 - (7 - new sequence calls); outbox bytes <= 3557 - 2 x snapshot.
- T-3 before side (2026-11-08, image sha256:730399e47f29, the unchanged tree; 500 orders, concurrency 8, 1 slice; reports in load-runs/before/, the 111811 run is the discarded warm-up):
  | Run | Throughput (cmd/s) | OMS processing p95 (ms) | WAL bytes per order |
  |---|---|---|---|
  | 1 (111840) | 83.59 | 3.15 | 23940.64 |
  | 2 (111903) | 91.14 | 2.17 | 23784.99 |
  | 3 (111924) | 91.32 | 2.45 | 23989.60 |
  | **Median** | **91.14** | **2.45** | **23940.64** |
- T-8 after (same test): 15 prepared statements (baseline 20), 4 sequence calls (baseline 7: the 4 left are outbox_seq x3 and command_log_seq, both kept at 1), 863 outbox bytes (baseline 3557; target <= 1269).
- T-11 first after side (image sha256:f059f7b75a2b on the compose database after changelog 015; reports in load-runs/after/, 113941 is the warm-up):
  | Run | Throughput (cmd/s) | OMS processing p95 (ms) | WAL bytes per order |
  |---|---|---|---|
  | 1 (114011) | 86.84 | 3.38 | 27244.58 |
  | 2 (114034) | 92.87 | 3.15 | 19670.62 |
  | 3 (114055) | 93.84 | 2.10 | 19583.20 |
  | **Median** | **92.87** | **3.15** | **19670.62** |
  Not a fair comparison with T-3: the before container had run about 14 minutes when measured, while the after container was freshly started with one warm-up run, and its first run still shows startup effects (WAL and p95). The baseline document asks for a freshly started stack. A clean A/B followed: each image on a fresh container and a fresh, empty database, with identical settings (OTLP off), one warm-up and three runs.
- T-11 clean A/B (11:42-11:46Z; each image on a fresh container and a fresh empty database, identical settings, OTLP off; first run of each side is the discarded warm-up; reports in load-runs/ab-before/ and load-runs/ab-after/):
  | Side | Run | Throughput (cmd/s) | OMS processing p95 (ms) | WAL bytes per order |
  |---|---|---|---|---|
  | before (730399e47f29) | 1 / 2 / 3 | 87.57 / 101.60 / 112.10 | 4.40 / 1.57 / 1.23 | 23801.86 / 24187.02 / 23605.15 |
  | before | **median** | **101.60** | **1.57** | **23801.86** |
  | after (f059f7b75a2b) | 1 / 2 / 3 | 103.83 / 109.38 / 116.72 | 1.75 / 1.31 / 1.17 | 20144.13 / 19324.19 / 19223.65 |
  | after | **median** | **109.38** | **1.31** | **19324.19** |
  WAL bytes per order -18.8%, every after run below every before run. p95 -17% and throughput +7.7% by median, but both sides speed up run by run as the JVM warms, so those two are within the run-to-run spread; only the write-volume drop is clear of noise. The compose oms-core was restored afterwards (image f059f7b75a2b on the compose database).
- T-13 first full run: 3 failures. EventSourcingIntegrationTest#stagedMessages_carryTheFillAndTheResultingPosition read the staged payloads, which pointer rows no longer carry; it now checks the records the rows resolve to (what the relay publishes), same assertions. Two TwoInstanceIntegrationTest cases could not create their databases: "too many clients already". The suite keeps every cached context's pool open, and this ticket added three contexts. The shared test Postgres now allows 300 connections, and the two Kafka-off measuring contexts use pools of 3.
- T-13 second full run: 2 failures, both test races that the suite's new timing exposed. CommandRetryBudgetIntegrationTest (SPEC-0048) waited until all six partitions were assigned, but five consumers can own six partitions while the sixth is still joining; its join moved the retried record and restarted the budget (8 attempts). It now waits until each of the six consumers owns one partition. OutboxHoldIntegrationTest's cleanup deleted the stuck row first, releasing the row behind it to the relay, which then deleted it under the cleanup; the cleanup is now one bulk delete.
- T-13 third full run: all 624 tests passed (1 skipped: the env-gated load suite), but the policy check failed R04 (P-06): OutboxPayloads used MessagePublisher for the payload-row mapping. That mapping moved to a new OutboxRecordMapper (mapper package), used by OutboxPayloads and by MessagePublisher's one-argument publishAsync; OutboxPayloads no longer touches the publisher.
