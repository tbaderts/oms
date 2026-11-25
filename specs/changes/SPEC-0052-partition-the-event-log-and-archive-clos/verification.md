# Verification — SPEC-0052: Partition the event log and archive closed orders

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests below ran and passed in the latest `spec verify` run (`./gradlew check` after
`./gradlew cleanTest`; log `evidence/oms-core-1.log`, results in
`oms-core/build/test-results/test/TEST-*.xml`).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | `order_events` partitioned by month; existing events kept unchanged; app behaves as before | `PartitionMigrationIntegrationTest#migratesExistingEventsIntoMonthlyPartitionsUnchanged` (DB at 016 with events in 3 months plus a null time stamp, migrated to 017: `relkind = 'p'`, range on `time_stamp`, rows present in their months' partitions, keys backfilled). Unchanged suites green: `OrderLifecycleIntegrationTest`, `OrderVersionIntegrationTest`, `EventMetadataIntegrationTest`, `ProjectionRebuildIntegrationTest`, `EventLogReconcilerIntegrationTest`, `CommandIdBackfillMigrationIntegrationTest`, `LiquibaseMigrationIntegrationTest`, `OrderEventAppenderTest` (note 1) | PASS |
| AC-2 | Same `(order_id, version)` or `(order_id, command_id)` in another month is refused as today | `PartitionUniquenessIntegrationTest#sameVersionInAnotherMonthIsAVersionConflict`, `#sameCommandIdInAnotherMonthIsADuplicateCommand` (through the real `OrderEventAppender`, seed in another partition, nothing extra written), `#deletedEventsFreeTheirKeys`, `#aNewVersionAndCommandAreAppendedAndKeyed` | PASS |
| AC-3 | Partitions two months ahead; a month-boundary event lands in the new month | `PartitionMaintenanceIntegrationTest#createsPartitionsTwoMonthsAhead`, `#eventAtAMonthBoundaryLandsInTheNewMonth` | PASS |
| AC-4 | Replica holds every history table's rows; keeps rows deleted or partitions dropped on the primary | `ReplicaIntegrationTest#replicaReceivesInsertsAndUpdates` (row-for-row `row_to_json` equality in all six tables, `CLOSED` state replicated), `#replicaKeepsRowsDeletedOnThePrimary`, `#replicaKeepsRowsOfAPartitionDroppedOnThePrimary`, and since the review `#replicationSurvivesClOrdIdReuseAfterArchiving` and `#replicationSurvivesAProjectionRebuild` | PASS |
| AC-5 | A CLOSED order past retention whose record the replica holds is archived; recent, open and outbox-pending orders are not | `RetentionJobIntegrationTest#archivesAnOrderClosedBeyondRetention` (rows gone from the primary, all kept on the replica, `oms.retention.archived` equals the number archived in the run), `#leavesRecentOpenAndOutboxPendingOrders`, `#failingOrdersDoNotStarveNewerOnes` | PASS |
| AC-6 | Replica unreachable, behind or different: nothing deleted, failures counted, WARN names order and reason, archived once it matches | `RetentionJobIntegrationTest#refusesWhenTheReplicaIsDifferentThenArchivesOnceItMatches`, `#refusesWhenTheReplicaIsBehindThenArchivesOnceCaughtUp`, `#refusesWhenTheReplicaIsUnreachable` (WARN checked in captured output) (note 2) | PASS |
| AC-7 | Analytics precondition: refuses when required and not confirmed; not consulted by default | `ArchivePreconditionsTest#analyticsCheckOffByDefault`, `#refusesWithoutAConfirmingCheckWhenRequired`, `#allowsWhenRequiredAndConfirmed`; `RetentionJobIntegrationTest#analyticsPreconditionBlocksWhenRequired` | PASS |
| AC-8 | An emptied past month is dropped and its rows stay on the replica; a month with a retained row stays | `PartitionMaintenanceIntegrationTest#dropsAnEmptiedPastPartitionAndKeepsOneWithARetainedRow`, `#keepsPastPartitionsInsideTheRetentionPeriod`; since the review `ReplicaIntegrationTest#maintenanceDropsAnEmptiedPartitionAndTheReplicaKeepsItsRows` (maintenance drops it, the replica still holds the event and its key) (note 3) | PASS |
| AC-9 | With two instances only the scheduler leader archives | `RetentionLeadershipIntegrationTest#onlyTheSchedulerLeaderArchives` | PASS |
| AC-10 | Load suite: a year at the proposed volume within the storage and vacuum budgets; figures recorded here | `RetentionProjectionTest` (7 tests) plus the manual clean-history load runs (note 4): storage 8.6 GB against 25 GB at the 30-day retention, vacuum 0.7 s against 600 s a day | PASS |
| AC-11 | KB states retention period, full-history replica without deletes, verify-before-delete, analytics precondition off, no history beyond retention | `oms-knowledge-base/architecture/concepts/retention-and-archive.md`; `okf-check`: 0 errors | PASS |

**Notes:**

1. **AC-1, content comparison.** The migration test compares `id`, `order_id`, `version`, `event`,
   `command_id` and `time_stamp`, not every column. The migration copies rows with
   `INSERT … SELECT *` from a `LIKE` table, so no column can be transformed. The only value it
   writes is the epoch marker for null time stamps, and that is asserted.
2. **AC-6, "behind".** It is tested with the subscription disabled, so the replica is missing all of
   the order's rows, not just some. The verifier compares per-table counts and checksums, so a
   partial gap fails the same comparison, as the "different" test shows for one changed row.
3. **AC-8, how the partition is emptied.** It is emptied by the same `DELETE` statements
   `RetentionJob` issues, not by a full archive run. A real order's events can't be dated into a past
   month without bypassing the application. Archiving itself is proven by AC-5.
4. **AC-10, the load measurement.** Stack: docker compose, with oms-core and the replica on.
   - **Retention.** The requester set it to 30 days on 2026-11-17 (re-approved proposal). At the
     first assumption of 90 days, storage measured over budget (below).
   - **Clean history.** Before each storage run the primary held no orders: leftovers were closed
     and archived by oms-core, so the replica holds them. Its history tables were then compacted
     with `VACUUM FULL`.
   - **Measurement.** The suite ran 5,000 orders from create to CLOSED (the full baseline shape) with
     nothing archived during the run, and measured storage and WAL after they closed. Nothing else is
     held, so growth and density measure the same thing.

   | Report (`oms-core/build/load-reports/`) | Mode | Orders | Per order | Steady state, 30 days = 600,000 orders (budget 25 GB) | Vacuum per day (budget 600 s) | WAL per order |
   |---|---|---|---|---|---|---|
   | `retention-2026-11-17T14-41-41…txt` | storage, clean history | 5,000, all CLOSED | 14,260 B growth; 14,367 B density | **8.56 GB, within** (66% headroom) | not measured | 31,114 B |
   | `retention-2026-11-17T14-49-52…txt` | retention pass, oms-core at 0 days | 5,000, closed and archived | | not measured | **0.7 s, within** | not measured |

   - **Storage: PASS.** A CLOSED order takes 14.3 to 14.4 KB. That is 8.6 GB for the 600,000
     orders of a 30-day retention, against 25 GB.
     - **The 8.6 GB is the retained rows, not the peak on disk.** A month's `order_events`
       partition is dropped only when it is empty and has ended more than 30 days ago. Space that
       archiving frees inside it isn't reused, because new events go to the current month.
     - **The peak** comes just before an old month is dropped. The primary then holds that month's
       partition at full size as well as the following month: up to about two months of
       `order_events`. That adds about 20,000 × 31 × 9.7 KB ≈ 6 GB, for a peak of about 15 GB.
     - **Still within budget:** about 60% of the 25 GB. This peak is derived from the code and the
       per-table bytes, not measured over a month.
   - **Where the bytes go**, per CLOSED order, from the 13:10 clean run:

     | Table | Bytes | Share |
     |---|---|---|
     | `order_events` | 9,671 | 67% (four events, each with a full order snapshot) |
     | `command_log` | 1,416 | |
     | `order_event_keys` | 1,263 | |
     | `executions` | 701 | |
     | `orders` | 693 | |
     | `order_execution_projection` | 660 | |

     Compacted with `VACUUM FULL`, the total is 13,376 B.
   - **Vacuum: PASS.** 0.7 s a day against 600 s.
     - **It's a proxy:** a manual `VACUUM` of the history tables after archiving, per archived order,
       scaled linearly.
     - **It's conservative here:** the pass also archived the storage run's 5,000 orders, so it
       vacuumed about 10,000 orders' rows, divided by 5,000.
     - **It's not a full-scale measurement,** but with that margin the conclusion holds.
   - **WAL:** 31 KB per order, about 227 GB a year at 20,000 orders a day (information).
   - **Replica:** 674 MB of history for 48,426 orders, about 14 KB per order. It only grows: about
     100 GB a year at 20,000 orders a day.
   - **At the first assumption, 90 days:** the same clean-history method (13:10 run, 14,298 B per
     order) gave 25.74 GB. That is 3% over the budget, which led to the requester's decision.
   - **Superseded runs, for the record. None was on a clean history:**
     - 10.9 to 12.7 KB: 7,505 unclosed FILLED orders also held;
     - 10.9 to 11.7 KB: measured before the CLOSE step;
     - 12.9 to 17.4 KB: 500-order runs after `VACUUM FULL`;
     - 10.6, −0.2 and 0 KB: early 500-order runs, distorted by free-space reuse.

## Goal Assessment

The goal: order_events, executions, command_log and the projection tables must not grow without
bound. Partition order_events by month, keeping its uniqueness. Archive closed orders' history past a
configurable retention to cold storage, driven by CLOSE, and detach emptied partitions. Measure a
year against the budgets. Document the retention policy and analytics' role.

- **Bounded growth.** Met. CLOSED orders past `oms.retention.closed-order-days` (30) are deleted
  from all six history tables once the replica is verified to hold them, and emptied month
  partitions are dropped (AC-5, AC-8).
- **Partitioning with uniqueness kept.** Met (AC-1, AC-2). The constraint names are unchanged, so
  the appender is unchanged.
- **Cold storage.** Per the requester's 2026-11-16 decision, this is a logical PostgreSQL replica
  that ignores deletes, which SPEC-0021 will reuse for CQRS reads. After review it also survives the
  ordinary operations that would have halted it: clOrdId reuse and projection rebuilds.
- **Measurement: met at the agreed retention.** The SPEC-0024 load suite measured it on a clean
  history (note 4):
  - **At the first assumption of 90 days,** storage was 3% over the 25 GB budget. Reported, not
    adjusted.
  - **The requester's decision:** a 30-day retention, so 8.6 GB against 25 GB.
  - **Vacuum** is far within its budget.
  - **Shrinking the events stays a lever:** two-thirds of the bytes are the per-event order
    snapshots (Follow-ups).
- **Documentation.** `retention-and-archive.md` covers the retention policy. On analytics: the goal
  says post-trade analytics keeps its own history. The requester refined this on 2026-11-16:
  analytics is only planned, so its hold is a pluggable precondition, off. The KB states that, and
  that the replica holds the full history meanwhile. The KB does not claim analytics already keeps
  its own history, because it doesn't yet.

No material gap remains between the goal, as refined by the requester (2026-11-16 decisions, and the
30-day retention of 2026-11-17), and what is built.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contract change |
| P-02 | Specification before code, generated models only | N/A | No API or message model |
| P-03 | Never edit generated code | PASS | Nothing under `build/generated` touched |
| P-04 | Contracts evolve compatibly | N/A | No contract change |
| P-05 | Every state change is recorded in the event log | PASS | Archiving changes no order state; it deletes history only after the replica holds it |
| P-06 | Kafka only through the transactional outbox | PASS | Nothing published; orders with pending outbox rows are not archived |
| P-07 | Schema changes through new Liquibase changesets | PASS | New changelogs 017 and 018; 001–016 unchanged. The primary now runs context `primary` (`spring.liquibase.contexts`) |
| P-08 | Concurrency and idempotency are explicit | PASS | Uniqueness kept across partitions through the key table; the delete locks the order and re-checks state and version; an order gone meanwhile counts as `changed`. On the replica only, `uq_orders_session_cl_ord_id` is dropped, because it can't hold for an append-only history. Orphan `command_log` race documented in the KB |
| P-09 | Commands and queries stay separate | PASS | Queries unchanged; the replica is not yet read by queries (SPEC-0021) |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No transition |
| P-11 | Layering and conventions | PASS | `org.example.oms.archive` package; leader-only scheduled jobs follow `EventLogReconciler` |
| P-12 | Jackson 3 only | PASS | No Jackson use added |
| P-13 | Errors and validation follow the framework specs | N/A | No API errors; job failures are counted and logged |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | AC-1 to AC-9 by integration and unit tests, each new one red first (the review's fixes too). AC-10 by the manual load runs plus the unit-tested projection, as SPEC-0024 defines; AC-11 by review and okf-check |
| P-15 | Observability | PASS | `oms.retention.archived`, `oms.retention.failures{reason}`, `oms.retention.partitions_dropped`, gauge `oms.retention.eligible`; WARN per refused order |
| P-16 | Security | PASS | Credentials and conninfo from the environment only. The replica pool connects as the replica's owner (it creates the subscription), so read-only is a session default, not a privilege boundary. Accepted for the experimentation stack and documented in the KB; follow-up below |
| P-17 | Simplicity and dependencies | PASS | No new library; one compose service on the existing image |
| P-18 | Modules build standalone | PASS | oms-core `check` green on its own |
| P-19 | Documentation follows behaviour | PASS | KB pages listed in the design, plus the review's additions to `retention-and-archive.md` |

## Independent Review

**First review: spec-reviewer, verdict NOT MET.** The findings and how each was resolved:

1. **[blocking] A projection rebuild halted replication.** It deleted everything (not replicated)
   and re-inserted with new ids, so the replica refused them on the natural key.
   - Fixed: rebuilds now run in place (`Projection.retainOnly`), so rows keep their ids and replicate
     as updates.
   - Test: `ReplicaIntegrationTest#replicationSurvivesAProjectionRebuild`. It failed before the fix.
2. **[blocking] clOrdId reuse after archiving halted replication.**
   - Fixed: changelog `018-replica-relaxed-keys` drops `uq_orders_session_cl_ord_id` on the replica
     only, with a rollback. The primary runs context `primary`, so it keeps the constraint, and the
     test asserts both sides.
   - Test: `#replicationSurvivesClOrdIdReuseAfterArchiving`. It failed before the fix.
3. **[blocking] AC-10 was not recorded or reproducible.** Fixed: re-measured over 5,000 orders with a
   density cross-check and a measured vacuum. The figures, method and caveats are in note 4.
4. **[major] The projection gave a verdict on unmeasured or negative figures.** Fixed: an unmeasured
   vacuum gives "no verdict", and negative growth is rejected. Tests: `RetentionProjectionTest`.
5. **[major] Failing orders could starve the batch.**
   - Fixed: failures are remembered, and never-failed orders go first.
   - Test: `RetentionJobIntegrationTest#failingOrdersDoNotStarveNewerOnes`. It failed before the fix.
6. **[minor] The version read sat outside the failure handling.** Fixed: an order gone meanwhile
   counts as `changed`.
7. **[minor] A `command_log` row could commit after verification.** Accepted and documented in the
   KB: the row still replicates, and the primary keeps an orphan.
8. **[minor] DETACH ran without a lock timeout.** Fixed: `lock_timeout = 5s` in its own
   transaction, retried next run.
9. **[minor] The design and tasks drifted from the code.** Fixed: the PK naming, the
   `ReplicaDatabase` holder and the tasks' file lists are corrected.
10. **[minor] Commit 10d8dc4 mixes SPEC-0067 work.** Not this ticket's code; noted for the
    maintainer. Future commits should hold one ticket each.
- **P-16 (doubtful) and the AC-1 and AC-8 weak spots:** see the Policy Review and notes 1 and 3.

**Second review: spec-reviewer, verdict NOT MET.** It confirmed first-review items 1, 2, 4, 5, 6, 8
and 9 as fixed. Its findings and how each was resolved:

1. **[major] AC-10 storage and WAL were measured before the orders were closed.**
   - Fixed: the suite now closes the run's orders and waits for CLOSED before it measures.
     `RetentionProjection` takes storage as optional, and the retention pass reports it as not
     measured.
   - Re-measured over 5,000 orders: 19.6 to 22.9 GB, within 25 GB (note 4).
   - Test: `RetentionProjectionTest#unmeasuredStorageHasNoVerdict`.
2. **[minor] `retainOnly`'s delete path had no test.** Fixed:
   `ProjectionRebuildIntegrationTest#rebuild_keepsRowIdsAndRemovesRowsNoFillReproduces` shows the
   ids are kept and an orphan row is deleted. A stale-row delete builds one statement with a clause
   per row, and the JDBC driver caps parameters at about 32k. That only matters for a heavily corrupt
   projection, so it is accepted.
3. **[minor] Only `EmptyResultDataAccessException` was handled per order.**
   - Fixed: `run()` maps any per-order exception to `error` and goes on.
   - Test: `RetentionJobIntegrationTest#anOrderSpecificErrorDoesNotAbortTheRun`. It failed before
     the fix.
4. **[minor] Changeset 018 on a Liquibase run without contexts.**
   - Fixed: a precondition marks it as run on any database publishing `oms_history`, and the
     rollback is idempotent.
   - Test: `OrderExecutionProjectionRenameMigrationTest` now asserts the key survives a context-less
     update, and its rollback test passes.
5. **[minor] The lock-timeout path had no test.**
   - Added `PartitionMaintenanceIntegrationTest#aBlockedDropGivesUpAndTheNextRunDropsIt`.
   - It exposed that a run waited 5 s per empty partition (20 s in the test), so a blocked drop now
     ends the run's drops: at most 5 s per run.
6. **[minor] The failure memory's limits.** Accepted and documented in the KB: it is bounded at
   10,000 orders, and an order archived by another leader stays remembered until a restart.
7. **[minor] The report files didn't match the code.** Fixed: AC-10 cites only the two runs made with
   the current code. The superseded runs are listed as such.

**Third review: spec-reviewer, verdict NOT MET.** It confirmed the second round's code fixes as
correct and tested. Its findings and how each was resolved:

1. **[blocking] The density figure was not an upper bound.**
   - **The problem:** the measurement held 7,505 unclosed FILLED orders besides the run's 5,000, so
     the honest range straddled the budget.
   - **Resolved by re-measuring on a clean history (note 4):** 25.7 GB, **over** the 25 GB budget.
     That was reported as AC-10 FAIL, not adjusted away. It was later resolved by the requester's
     30-day retention decision; AC-10 now passes at 8.6 GB (note 4).
   - The suite now prints the orders held by state, and marks a density over mixed states as not a
     per-CLOSED-order figure.
2. **[minor] The replica size was not recorded.** Fixed: the suite reports it, and it is in note 4
   (538 MB for 38,426 orders).
3. **[minor] The test count for `RetentionProjectionTest` was wrong.** Corrected to 7.
4. **[minor] Unmeasured WAL was printed as 0.** Fixed: WAL is optional in `RetentionProjection`, as
   storage and vacuum are. `#unmeasuredStorageHasNoVerdict` asserts "WAL not measured".
5. **[minor] An order deleted before the row lock counted as `error`.** Fixed: it now counts as
   `changed`.
6. **[minor] The blocked-drop test had only one partition.** Fixed: it now has two empty past months
   and asserts a single lock timeout per run. It runs in 5.3 s.

**Final review (after the 30-day decision): spec-reviewer, verdict MET**, provided its two
documentation findings were fixed. Its findings and how each was resolved:

1. **[major, docs] The Goal Assessment still said 90 days.** Fixed: it says 30. Code, config and KB
   were already clean.
2. **[major, AC-10] 8.6 GB is the retained rows, not the peak on disk.** A month's partition is
   dropped only once it is empty and older than the retention period, so up to about two months of
   `order_events` sit on disk. Fixed: note 4 gives the peak, about 15 GB, still within 25 GB.
3. **[minor] The third-review history contradicted the AC table.** Fixed: the history now says the
   FAIL was later resolved by the 30-day decision.
4. **[minor] The design described a `VACUUM` of `order_events` only.** Fixed: the design says the
   history tables, as the code does.
5. **[minor] The two `changed` race paths in `RetentionJob` have no test.** These are an order gone
   at the version read, and gone at the row lock. Accepted: they are hard to reach and the effect is
   harmless (counted, retried, then gone). Listed under Follow-ups.
6. **[minor] `RetentionProjection` hard-codes 30 days.** Accepted for a load-test helper. Listed
   under Follow-ups, so it is changed together with the default.

The reviewer also confirmed:
- every cited test ran and passed in the snapshot (694 tests, 0 failures);
- note 4 matches the reports exactly;
- the automated evidence matches `last-run.json`;
- no source or KB file changed after the run.

It noted that the automated policy check only covers changes since commit 10d8dc4, which already
held most of SPEC-0052. The reviews judged those policies against the code by hand.

## Automated Evidence

`evidence/last-run.json`, run at 2026-11-17T14:59:02Z after `./gradlew cleanTest`, so every test
actually ran, after the last code change (the 30-day defaults):
- **Result:** `pass`, fingerprint `919380148a82f390`.
- **Modules:** oms-core and oms-knowledge-base.
- **Policy check:** changes since main (merge-base 10d8dc46). 0 errors, 0 warnings.
- **`oms-core ./gradlew check`:** exit 0 after 466 s, log `evidence/oms-core-1.log`. Test results:
  694 tests, 0 failures, 0 errors, 1 skipped. The skip is `LoadSuiteRunnerTest`, which runs only with
  `OMS_LOAD_SUITE=true`; it was run by hand for AC-10 (note 4).
- **Earlier failed runs, all fixed:**
  - the leadership test raced with 0-day retention (a test fix; see tasks.md Notes);
  - changeset 018 had no rollback (`OrderExecutionProjectionRenameMigrationTest`).
- **KB:** `okf-check`: 205 concepts, 0 errors.

## Follow-ups

- **SPEC-0021** must supersede ADR-003 when queries move to the replica. It should also give the
  replica a least-privilege reader, separate from the owner that creates the subscription (P-16).
- **Vacuum at full scale:** a run against a database seeded to about 600,000 orders would replace
  the linear proxy (note 4).
- **Smaller events:** `order_events` is two-thirds of the bytes per order, because every event carries
  a full order snapshot. Slimming or compressing the snapshot is the lever for a longer retention.
- **The replica's growth** (about 100 GB a year at the proposed volume) is unbounded by design. A
  retention or tiering policy for it, if wanted, belongs with SPEC-0021.
- **Replica partition layout** (new months land in its default partition) belongs to SPEC-0021.
- **Tests for the two `changed` races in `RetentionJob`** (order gone at the version read, or at the
  row lock). They are hard to reach and harmless; a stubbed precondition that deletes the order could
  cover them.
- **`RetentionProjection` hard-codes the 30-day retention.** Change it together with
  `oms.retention.closed-order-days`.

## Verdict

Verdict: GOAL MET

Every acceptance criterion passes with evidence, every policy is reviewed, and four independent
reviews found nothing open that blocks. At the requester's 30-day retention, storage is 8.6 GB of
retained rows (peak about 15 GB) against 25 GB, and vacuum is about 0.7 s a day against 10 minutes.
The first assumption of 90 days was over the storage budget, which is recorded in note 4.
