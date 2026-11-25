# Tasks — SPEC-0052: Partition the event log and archive closed orders

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

- [x] **T-1** Test infrastructure: the shared test Postgres gets `wal_level=logical`, a Docker network and alias `oms-primary`; add `ReplicaTestSupport` (a replica container on that network, plus `oms.replica.*` properties for a test context) (AC-4)
  - files: oms-core/src/test/java/org/example/oms/integration/AbstractKafkaPostgresIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/ReplicaTestSupport.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.LiquibaseMigrationIntegrationTest'` passes (the shared container still works)
- [x] **T-2** Write the failing `PartitionMigrationIntegrationTest` (a database at 016 with events in 3 months plus a null `time_stamp`, migrated to 017) (AC-1)
  - files: oms-core/src/test/java/org/example/oms/integration/PartitionMigrationIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests '*PartitionMigrationIntegrationTest'` fails because `order_events` is not partitioned (red)
- [x] **T-3** Changelog 017: the `order_event_keys` table and backfill, the partitioned `order_events` (monthly and default partitions, epoch marker, indexes, `pk_order_events_v2`), the key trigger, the unique constraints with today's names, and the publication (context `primary`); include it from the master; drop the unique constraints from the `OrderEvent` `@Table` annotation (AC-1, AC-2)
  - files: oms-core/src/main/resources/db/changelog/017-partition-order-events.yaml, oms-core/src/main/resources/db/changelog/db.changelog-master.yaml, oms-core/src/main/java/org/example/oms/model/OrderEvent.java
  - verify: `cd oms-core && ./gradlew test --tests '*PartitionMigrationIntegrationTest' --tests '*LiquibaseMigrationIntegrationTest' --tests '*CommandIdBackfillMigrationIntegrationTest'` passes
- [x] **T-4** Write `PartitionUniquenessIntegrationTest` (a version conflict and a duplicate command across months, through `OrderEventAppender`), make it green, and run the existing event-log suites unchanged (AC-1, AC-2)
  - files: oms-core/src/test/java/org/example/oms/integration/PartitionUniquenessIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests '*PartitionUniquenessIntegrationTest' --tests '*OrderLifecycleIntegrationTest' --tests '*OrderVersionIntegrationTest' --tests '*EventMetadataIntegrationTest' --tests '*ProjectionRebuildIntegrationTest' --tests '*EventLogReconcilerIntegrationTest' --tests '*OrderEventAppenderTest'` passes
- [x] **T-5** Write the failing `PartitionMaintenanceIntegrationTest` (ahead creation, the month boundary, dropping an emptied past partition and keeping one with a retained row), then implement `PartitionMaintenance` (AC-3, AC-8)
  - files: oms-core/src/test/java/org/example/oms/integration/PartitionMaintenanceIntegrationTest.java, oms-core/src/main/java/org/example/oms/archive/PartitionMaintenance.java
  - verify: `cd oms-core && ./gradlew test --tests '*PartitionMaintenanceIntegrationTest'` passes
- [x] **T-6** Write the failing `ReplicaIntegrationTest`, then implement `ReplicaConfig` (the `ReplicaDatabase` holder: read-only pool and `JdbcTemplate`) and `ReplicaSchema` (Liquibase with context `replica`, then the subscription) (AC-4)
  - files: oms-core/src/test/java/org/example/oms/integration/ReplicaIntegrationTest.java, oms-core/src/main/java/org/example/oms/archive/ReplicaConfig.java, oms-core/src/main/java/org/example/oms/archive/ReplicaDatabase.java, oms-core/src/main/java/org/example/oms/archive/ReplicaSchema.java, oms-core/src/main/resources/application.yml
  - verify: `cd oms-core && ./gradlew test --tests '*ReplicaIntegrationTest'` passes
- [x] **T-7** Write the failing `ArchivePreconditionsTest`, then implement `ArchivePreconditions` and the `AnalyticsHistoryCheck` interface (AC-7)
  - files: oms-core/src/test/java/org/example/oms/archive/ArchivePreconditionsTest.java, oms-core/src/main/java/org/example/oms/archive/ArchivePreconditions.java, oms-core/src/main/java/org/example/oms/archive/AnalyticsHistoryCheck.java
  - verify: `cd oms-core && ./gradlew test --tests '*ArchivePreconditionsTest'` passes
- [x] **T-8** Write the failing `RetentionJobIntegrationTest` (archive, untouched cases, replica mismatch or behind, replica unreachable, analytics precondition), then implement `ReplicaVerifier` and `RetentionJob` with their meters (AC-5, AC-6, AC-7)
  - files: oms-core/src/test/java/org/example/oms/integration/RetentionJobIntegrationTest.java, oms-core/src/main/java/org/example/oms/archive/ReplicaVerifier.java, oms-core/src/main/java/org/example/oms/archive/RetentionJob.java
  - verify: `cd oms-core && ./gradlew test --tests '*RetentionJobIntegrationTest'` passes
- [x] **T-9** Write `RetentionLeadershipIntegrationTest` (two instances; only the leader archives) and make it green (AC-9)
  - files: oms-core/src/test/java/org/example/oms/integration/RetentionLeadershipIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests '*RetentionLeadershipIntegrationTest'` passes
- [x] **T-10** docker-compose: the `postgres-replica` service (port 5433, volume, `REPLICA_DB_PASSWORD`), `max_slot_wal_keep_size=2GB` on the primary, and `oms.replica.*` environment for oms-core (AC-4)
  - files: docker-compose.yml
  - verify: `docker compose config` validates, and `docker compose up -d postgres postgres-replica oms-core` then shows `[replica] subscription oms_history active` in the oms-core log
- [x] **T-11** Load measurement: a storage section written next to the load report as `retention-<timestamp>.txt` (bytes and WAL per order, timed vacuum after a retention pass) and `RetentionProjection` with its unit test; run the suite against compose and record the report (AC-10)
  - files: oms-core/src/test/java/org/example/oms/load/LoadSuiteRunnerTest.java, oms-core/src/test/java/org/example/oms/load/RetentionProjection.java, oms-core/src/test/java/org/example/oms/load/RetentionProjectionTest.java
  - verify: `cd oms-core && ./gradlew test --tests '*RetentionProjectionTest'` passes, and an `OMS_LOAD_SUITE=true` run writes a report with the storage section and projection
- [x] **T-12** Knowledge base: the new `architecture/concepts/retention-and-archive.md`, and updates to `state-store.md`, `domain/model/order-event.md`, `domain/concepts/post-trade-analytics.md`, `capabilities/order-expiry-and-close.md` and `infrastructure/local-docker-stack.md` (AC-11)
  - files: oms-knowledge-base/architecture/concepts/retention-and-archive.md, oms-knowledge-base/architecture/concepts/state-store.md, oms-knowledge-base/domain/model/order-event.md, oms-knowledge-base/domain/concepts/post-trade-analytics.md, oms-knowledge-base/architecture/concepts/index.md, oms-knowledge-base/semantic-layer/okf-conventions.md, oms-knowledge-base/capabilities/order-expiry-and-close.md, oms-knowledge-base/infrastructure/local-docker-stack.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports no errors
- [x] **T-14** Write the failing `ReplicaIntegrationTest#replicationSurvivesClOrdIdReuseAfterArchiving`, then add changelog `018-replica-relaxed-keys.yaml` (context `replica`) dropping `uq_orders_session_cl_ord_id` on the replica only (AC-4, AC-5)
  - files: oms-core/src/test/java/org/example/oms/integration/ReplicaIntegrationTest.java, oms-core/src/main/resources/db/changelog/018-replica-relaxed-keys.yaml, oms-core/src/main/resources/db/changelog/db.changelog-master.yaml
  - verify: `cd oms-core && ./gradlew test --tests '*ReplicaIntegrationTest'` passes
- [x] **T-15** Write the failing `ReplicaIntegrationTest#replicationSurvivesAProjectionRebuild`, then rebuild projections in place: `Projection.retainOnly(keys)` replaces `clear()`, and `ProjectionRebuilder` upserts, then removes the rows it did not reproduce (AC-4)
  - files: oms-core/src/test/java/org/example/oms/integration/ReplicaIntegrationTest.java, oms-core/src/main/java/org/example/oms/projection/Projection.java, oms-core/src/main/java/org/example/oms/projection/OrderExecutionProjection.java, oms-core/src/main/java/org/example/oms/projection/ProjectionRebuilder.java
  - verify: `cd oms-core && ./gradlew test --tests '*ReplicaIntegrationTest' --tests '*ProjectionRebuildIntegrationTest' --tests '*ProjectionIntegrationTest'` passes
- [x] **T-16** Write the failing `ReplicaIntegrationTest#maintenanceDropsAnEmptiedPartitionAndTheReplicaKeepsItsRows`, and add `lock_timeout` to the partition detach (AC-8)
  - files: oms-core/src/test/java/org/example/oms/integration/ReplicaIntegrationTest.java, oms-core/src/main/java/org/example/oms/archive/PartitionMaintenance.java
  - verify: `cd oms-core && ./gradlew test --tests '*ReplicaIntegrationTest' --tests '*PartitionMaintenanceIntegrationTest'` passes
- [x] **T-17** Write the failing `RetentionJobIntegrationTest#failingOrdersDoNotStarveNewerOnes`, then make `RetentionJob` remember failures and order candidates by them; move the version read inside the failure handling (AC-5, AC-6)
  - files: oms-core/src/test/java/org/example/oms/integration/RetentionJobIntegrationTest.java, oms-core/src/main/java/org/example/oms/archive/RetentionJob.java
  - verify: `cd oms-core && ./gradlew test --tests '*RetentionJobIntegrationTest' --tests '*RetentionLeadershipIntegrationTest'` passes
- [x] **T-18** AC-10 reporting: `RetentionProjection` gives no verdict on an unmeasured vacuum and rejects negative growth; the suite reports bytes per order held as a cross-check, and storage is measured over 5,000 orders; re-run the suite and record the figures and the method in verification.md (AC-10)
  - files: oms-core/src/test/java/org/example/oms/load/RetentionProjection.java, oms-core/src/test/java/org/example/oms/load/RetentionProjectionTest.java, oms-core/src/test/java/org/example/oms/load/LoadSuiteRunnerTest.java
  - verify: `cd oms-core && ./gradlew test --tests '*RetentionProjectionTest'` passes, and 5,000-order suite runs, with and without the retention pass, write their reports
- [x] **T-19** KB: `retention-and-archive.md` states the replica's relaxed clOrdId key, in-place projection rebuilds, failure-aware retries and the accepted orphan `command_log` case (AC-11)
  - files: oms-knowledge-base/architecture/concepts/retention-and-archive.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports no errors
- [x] **T-20** Second review: measure AC-10 storage and WAL once the run's orders are CLOSED (retention pass measures vacuum only); storage optional in `RetentionProjection`; re-run 5,000-order storage and retention-pass runs (AC-10)
  - files: oms-core/src/test/java/org/example/oms/load/LoadSuiteRunnerTest.java, oms-core/src/test/java/org/example/oms/load/RetentionProjection.java, oms-core/src/test/java/org/example/oms/load/RetentionProjectionTest.java
  - verify: `cd oms-core && ./gradlew test --tests '*RetentionProjectionTest'` passes, and both 5,000-order runs write their reports
- [x] **T-21** Second review, minors: `RetentionJob` maps any per-order exception to `error` and goes on; a blocked partition drop ends the run's drops; changeset 018 gets a publisher precondition and an idempotent rollback; tests for the rebuild's stale-row delete and the blocked drop; KB notes (AC-4, AC-5, AC-8, AC-11)
  - files: oms-core/src/main/java/org/example/oms/archive/RetentionJob.java, oms-core/src/main/java/org/example/oms/archive/PartitionMaintenance.java, oms-core/src/main/resources/db/changelog/018-replica-relaxed-keys.yaml, oms-core/src/test/java/org/example/oms/integration/RetentionJobIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/ProjectionRebuildIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/PartitionMaintenanceIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/OrderExecutionProjectionRenameMigrationTest.java, oms-knowledge-base/architecture/concepts/retention-and-archive.md
  - verify: `cd oms-core && ./gradlew test --tests '*RetentionJobIntegrationTest' --tests '*ProjectionRebuildIntegrationTest' --tests '*PartitionMaintenanceIntegrationTest' --tests '*OrderExecutionProjectionRenameMigrationTest'` passes
- [x] **T-22** Third review: AC-10 re-measured on a clean history (storage over budget, reported); WAL optional in `RetentionProjection`; the suite reports orders held by state and the replica size; the lock-row race maps to `changed`; the blocked-drop test has two partitions (AC-5, AC-8, AC-10)
  - files: oms-core/src/test/java/org/example/oms/load/RetentionProjection.java, oms-core/src/test/java/org/example/oms/load/RetentionProjectionTest.java, oms-core/src/test/java/org/example/oms/load/LoadSuiteRunnerTest.java, oms-core/src/main/java/org/example/oms/archive/RetentionJob.java, oms-core/src/test/java/org/example/oms/integration/PartitionMaintenanceIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests '*PartitionMaintenanceIntegrationTest' --tests '*RetentionProjectionTest' --tests '*RetentionJobIntegrationTest'` passes, and the clean-history storage and retention-pass runs write their reports
- [x] **T-23** Retention 30 days (requester, 2026-11-17): the default `oms.retention.closed-order-days` in application.yml and in the `@Value` defaults of `RetentionJob` and `PartitionMaintenance`; `RetentionProjection.proposed` at 30 days, with its test; the KB pages; re-measure AC-10 storage on a clean history (AC-10, AC-11)
  - files: oms-core/src/main/resources/application.yml, oms-core/src/main/java/org/example/oms/archive/RetentionJob.java, oms-core/src/main/java/org/example/oms/archive/PartitionMaintenance.java, oms-core/src/test/java/org/example/oms/load/RetentionProjection.java, oms-core/src/test/java/org/example/oms/load/RetentionProjectionTest.java, oms-knowledge-base/architecture/concepts/retention-and-archive.md, oms-knowledge-base/domain/concepts/post-trade-analytics.md
  - verify: `cd oms-core && ./gradlew test --tests '*RetentionProjectionTest'` passes, `okf-check` reports no errors, and a clean-history storage run writes its report
- [x] **T-13** Run the full oms-core check and spec verify (all ACs)
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0052` exits 0 after `./gradlew cleanTest`

## Notes

- **Order of work:**
  - T-1 first, because every replica test needs it.
  - T-3 is the risky step: the existing suites in T-4 prove nothing broke before anything new is
    layered on.
  - T-10 and T-11 need the running stack.

## Notes

<!-- Optional: sequencing constraints, tasks added during implementation and why. -->
- **Cross-class flake, reported by peer session oms-bb (SPEC-0067), now fixed.**
  - **Symptom.** `RetentionLeadershipIntegrationTest` failed in 2 of 2 full-suite runs, and running
    the three archive classes together made `RetentionJobIntegrationTest`'s first test time out
    waiting for replication.
  - **Cause.** Each archive class subscribed its world on one shared replica server and never dropped
    the subscription, so later classes' initial table sync queued behind PostgreSQL's default of 4
    logical-replication workers.
  - **Fix** (tests only):
    - higher replication worker, slot and WAL-sender limits on the test containers;
    - an `@AfterAll` subscription drop per archive class;
    - a 60 s replication wait.
  - **Evidence.** The three classes pass together (10/10). The full oms-core suite passes: 684
    tests, 0 failures, 1 pre-existing skip.
- **Second leadership flake: a race in the test itself.**
  - **Symptom.** After `cleanTest`, a full suite run failed once at the leadership test's
    archived wait (15 s).
  - **Cause.** With retention at 0 days, the leader archives the order as soon as the replica holds
    it. After that, `awaitReplicated` can no longer see primary and replica match. The 15 s archive
    budget also had to cover scheduler-leadership acquisition by one of two fresh contexts.
  - **Fix** (test only). The test no longer calls `awaitReplicated`. It waits up to the 60 s
    replication budget for the order to leave the primary, then asserts that the replica still
    holds it.
  - **Evidence.** The three archive classes pass together.
- **Reopened after the independent review** (verify stage): T-14 to T-19 fix its findings (see design, "Changed during verification"). T-13 moves to the end again.
