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
- [x] **T-6** Write the failing `ReplicaIntegrationTest`, then implement `ReplicaConfig` (the `@Replica` read-only data source and `JdbcTemplate`) and `ReplicaSchema` (Liquibase with context `replica`, then the subscription) (AC-4)
  - files: oms-core/src/test/java/org/example/oms/integration/ReplicaIntegrationTest.java, oms-core/src/main/java/org/example/oms/archive/ReplicaConfig.java, oms-core/src/main/java/org/example/oms/archive/Replica.java, oms-core/src/main/java/org/example/oms/archive/ReplicaSchema.java, oms-core/src/main/resources/application.yml
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
  - files: docker-compose.yml, oms-core/.env.example
  - verify: `docker compose config` validates, and `docker compose up -d postgres postgres-replica oms-core` then shows `[replica] subscription oms_history active` in the oms-core log
- [x] **T-11** Load measurement: a storage section in `LoadReport` (bytes and WAL per order, timed vacuum after a retention pass) and `RetentionProjection` with its unit test; run the suite against compose and record the report (AC-10)
  - files: oms-core/src/test/java/org/example/oms/load/LoadSuiteRunnerTest.java, oms-core/src/test/java/org/example/oms/load/LoadReport.java, oms-core/src/test/java/org/example/oms/load/RetentionProjection.java, oms-core/src/test/java/org/example/oms/load/RetentionProjectionTest.java
  - verify: `cd oms-core && ./gradlew test --tests '*RetentionProjectionTest'` passes, and an `OMS_LOAD_SUITE=true` run writes a report with the storage section and projection
- [x] **T-12** Knowledge base: the new `architecture/concepts/retention-and-archive.md`, and updates to `state-store.md`, `domain/model/order-event.md`, `domain/concepts/post-trade-analytics.md`, `architecture/context/market-adapter.md`, `capabilities/order-expiry-and-close.md` and `infrastructure/local-docker-stack.md` (AC-11)
  - files: oms-knowledge-base/architecture/concepts/retention-and-archive.md, oms-knowledge-base/architecture/concepts/state-store.md, oms-knowledge-base/domain/model/order-event.md, oms-knowledge-base/domain/concepts/post-trade-analytics.md, oms-knowledge-base/architecture/context/market-adapter.md, oms-knowledge-base/capabilities/order-expiry-and-close.md, oms-knowledge-base/infrastructure/local-docker-stack.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports no errors
- [ ] **T-13** Run the full oms-core check and spec verify (all ACs)
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0052` exits 0

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
