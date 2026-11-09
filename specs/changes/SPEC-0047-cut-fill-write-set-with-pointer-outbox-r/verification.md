# Verification — SPEC-0047: Cut fill write set with pointer outbox rows

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

Unless stated otherwise, every test below ran and passed in the latest `spec verify`
(`evidence/oms-core-1.log`), with no failure or skip in `oms-core/build/test-results/test/`.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | A fill's ORDER and EXECUTION rows are pointers; the snapshot is written once | `PointerOutboxIntegrationTest#aFillStagesPointerRowsAndOneSnapshot`: with the relay paused, both rows carry `order_id` and `aggregate_version`, the EXECUTION row also carries `exec_id`, and neither row has a payload. Exactly one `order_events` row with a snapshot exists for the version | PASS |
| AC-2 | Pointer rows publish records equal to the pre-change ones | `PointerOutboxIntegrationTest#pointerRowsPublishTheSameRecordsAsPayloadRows`: for one fill, each pointer row and its pre-change payload form resolve to `equals` records with the same key and version. `TwoInstanceIntegrationTest#contentionLeavesNothingDeadLettered`: every published `OrderMessage` and `Execution` equals the mapper's output for the stored snapshot or execution of its version | PASS |
| AC-3 | Rows staged before the upgrade still publish as before | `PointerOutboxIntegrationTest#legacyPayloadRowsStillPublish`: ORDER and EXECUTION rows in the pre-change form are published, and the records on `orders` and `oms_executions` equal their payloads' mapping. `MessagePublisherTest` (7) is unchanged and passes | PASS |
| AC-4 | A pointer with no target fails, names the order and version, holds its aggregate | `PointerOutboxIntegrationTest#aPointerWithNoTargetFailsAndHoldsItsAggregate`: `last_error` names the order and "version 9001"; attempts reach `max-attempts`; the row behind it is never attempted; nothing at or behind it is published | PASS |
| AC-5 | Rows with ids out of version order are published in version order | `OutboxClaimIntegrationTest#rowsOfAnOrderAreClaimedInVersionOrder`: versions 2, 1, 3 saved in that id order. The first claim takes only version 1; the next takes 2 then 3; an in-order order and a legacy row keep id order. The test failed before the guard was added | PASS |
| AC-6 | 60 rows of each entity cost at most 2 `nextval` calls per sequence; ids unique | `PooledSequenceIntegrationTest#sixtyRowsCostAtMostTwoSequenceCalls`: each of the four sequences, counted by a statement inspector, takes at most 2 calls; 60 unique ids. The first id is the low end of the first block (pooled-lo). It failed with 60 calls before the change | PASS |
| AC-7 | One fill: statements down by the sequence trips saved; outbox bytes down by two snapshots | `FillWriteSetIntegrationTest#oneFillWritesLess`. The baseline was measured by this test on the unchanged code (T-1) and is recorded in the test: 20 statements, 7 sequence calls, 3557 outbox bytes, 1144-byte snapshot. Now 15 statements (at most 20 − 3 allowed), 4 sequence calls, 863 outbox bytes (at most 1269 allowed) | PASS |
| AC-8 | Two instances, interleaved pooled ids: per-order order on three topics, records match, no DLT | `TwoInstanceIntegrationTest#contentionLeavesNothingDeadLettered`: some order's event ids are asserted out of version order, so the blocks did interleave. Every version is in order on `orders`, and one record per fill is in version order on `oms_executions` and `oms_order_executions`. Records equal the stored rows; nothing on `commands-two.DLT`; cumQty right for all 11 orders. `ReplayHarnessIntegrationTest#replayHoldsBackAVersionWhoseIdComesFirst` keeps replay valid when an order's ids are out of version order | PASS |
| AC-9 | Load suite before and after: write volume and p95 lower, throughput not lower | Manual runs of `LoadSuiteRunnerTest` (the suite is gated by `OMS_LOAD_SUITE`; it is skipped in `check` by design), with the WAL probe proven by `LoadReportWriterTest#writesWalBytesPerOrder`. Clean A/B results are below; reports are in `load-runs/ab-before/` and `load-runs/ab-after/` | PASS |

**AC-9 in detail.** Both sides used the baseline's shape: 500 orders, concurrency 8, 1 fill slice,
on the same host. Each side ran on a fresh container and a fresh, empty database with identical
settings, with one discarded warm-up run and the median of three.

| Median of three runs | Before (image 730399e47f29) | After (image f059f7b75a2b) | Change |
|---|---|---|---|
| WAL bytes per order | 23,802 | 19,324 | −18.8% |
| OMS processing p95 (ms) | 1.57 | 1.31 | −17% |
| Throughput (commands/s) | 101.60 | 109.38 | +7.7% |

- **Write volume.** Lower in every after run than in every before run.
- **Latency and throughput.** Better by median, as AC-9 requires. Both sides speed up from run to
  run as the JVM warms, so these gains are within the run-to-run spread. They are not a
  demonstrated speed-up.
- **The first pair, not used.** An earlier pair of runs (`load-runs/before/`, `load-runs/after/`)
  is recorded in tasks.md but not used. Its before container had been warm for 14 minutes, while
  its after container was freshly started, which the baseline document's protocol rules out. That
  pair showed a higher after p95 (3.15 against 2.45 ms).

## Goal Assessment

The goal asks for four things:
- the snapshot serialized once instead of three times;
- few sequence round trips;
- ORDER and EXECUTION outbox rows as pointers read back at publish time, with PROJECTION rows
  self-contained;
- per-key ordering protected by version, and proof with the SPEC-0024 harness of better latency
  and write volume and unchanged per-key order with several instances.

**Delivered.**
- **One serialization.** The fill's only JSON copy of the order is the event snapshot (AC-1, AC-7:
  outbox bytes 3557 → 863).
- **Pooled sequences.** They cut sequence calls from 7 to 4. The remaining four are the outbox and
  command-log sequences, kept at 1 by the approved scope (AC-6, AC-7).
- **Read back, legacy kept.** Records are read back and equal the old ones (AC-2, AC-3).
- **Ordering safety net.** One order's rows are claimed in version order (AC-5).
- **Several instances.** Per-key order holds there, with ids proven to interleave (AC-8).
- **Write volume.** The load suite shows it falls by about a fifth (AC-9).

**Gaps a requester should know.**
- **Latency.** The latency improvement is real by median but within noise at the baseline's load,
  where the command path is not the bottleneck. The proposal deferred this risk explicitly.
- **`root_order_id` on executions** was already stored by SPEC-0044, so this ticket only uses it.
- **Id order.** Pooled ids make id order no longer commit order across instances. Replay was
  adapted. The blotter's newest-first sort is now approximate across instances, which is
  documented as a consequence, not changed.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contract change |
| P-02 | Specification before code, generated models only | N/A | Records come from the generated Avro classes as before |
| P-03 | Never edit generated code | PASS | Nothing generated touched |
| P-04 | Contracts evolve compatibly | N/A | Records and keys unchanged (AC-2, AC-3) |
| P-05 | Every state change is recorded in the event log | PASS | Appender unchanged in what it records. The event snapshot is now the source of the published order |
| P-06 | Kafka only through the transactional outbox | PASS | Rows staged in the command transaction. Only `OutboxRelay` uses `MessagePublisher`. An R04 finding (`OutboxPayloads` depending on the publisher) was fixed by moving the mapping to `OutboxRecordMapper`; the policy check now reports no errors |
| P-07 | Schema changes through new Liquibase changesets | PASS | New changelog 015; 001 to 014 untouched |
| P-08 | Concurrency and idempotency are explicit | PASS | Version check and unique `(order_id, version)` kept. Per-order version guard in the claim. SPEC-0048 claim rules kept (`FOR UPDATE`, no skip). Pointer reads happen in the claiming transaction |
| P-09 | Commands and queries stay separate | PASS | No query change |
| P-10 | State transitions go through the state machine and task pipeline | PASS | Pipelines unchanged |
| P-11 | Layering and conventions | PASS | `OutboxPayloads` in `service`, `OutboxRecordMapper` in `mapper`, finders in `repository`; constructor injection |
| P-12 | Jackson 3 only | PASS | No new JSON code; snapshots are read through the existing Hibernate JSON mapping |
| P-13 | Errors and validation follow the framework specs | PASS | API answers unchanged. A resolution failure is recorded on the row like other outbox failures |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Each behaviour test was seen red first (T-1, T-4, T-5, T-7, T-9). AC-9 is a scripted, recorded run of SPEC-0024's load suite, which needs the running stack by design |
| P-15 | Observability | PASS | Resolution failures go through `last_error`, `oms.outbox.stuck` and logs. The load report gains WAL bytes |
| P-16 | Security | PASS | No secrets. The load probe's password defaults to the compose development value and can be overridden |
| P-17 | Simplicity and dependencies | PASS | No new library. Two small new classes |
| P-18 | Modules build standalone | PASS | oms-core `check` in `spec verify` |
| P-19 | Documentation follows behaviour | PASS | Eight knowledge-base pages updated (T-12) |

## Independent Review

The spec-reviewer agent returned **MET**, with no blocking finding. It rated:
- AC-1, AC-3, AC-5, AC-6, AC-7, AC-8 and AC-9 proven;
- AC-2 and AC-4 weakly proven.

It reported one major and six minor findings. Implement was reopened for the major one and three
minor ones (T-14), and verification was run again after them.

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | major | A rolling deploy with a pre-SPEC-0047 relay leader, or a rollback, leaves pointer rows that older code fails as "no payload" and eventually holds. Rolling back changelog 015 drops the pointer columns | Fixed in the documentation: "Rolling out SPEC-0047, and rolling it back" in `capabilities/event-publication.md` says to stop old instances (or keep them off relay leadership) before new ones take commands; to drain the outbox to zero before a code or 015 rollback; and how to release rows already held. Enforcing it in code would need the old code to change, which is not possible |
| 2 | minor | AC-2's expected record was built from the stored snapshot, the same source the pointer reads | Fixed: the payload form now carries the order entity as saved by the fill, which is what the old code staged; the records are still equal |
| 3 | minor | AC-4's missing-execution branch was untested | Fixed: the AC-4 test adds an EXECUTION pointer to a missing execution and asserts its error names the execution, the order and the version |
| 4 | minor | `MessagePublisher` builds its own `OutboxRecordMapper`; its one-argument `publishAsync` is used only by tests | Follow-up (below). Behaviour is unaffected; the relay always resolves through `OutboxPayloads` |
| 5 | minor, speculative | The claim guard's inversion probe may cost k² index probes for an order with many pending rows | Follow-up (below), with an `EXPLAIN` check. Inversions are the rare safety-net case, and the plain case is one probe |
| 6 | minor | The pointer test's cleanup could race the relay, as the hold test's did | Fixed: one bulk delete |
| 7 | minor | AC-7's baseline is recorded constants, not reproducible from the repository | Accepted. The baseline was measured by the same test on the unchanged code (T-1), and the figures are recorded in the test, tasks.md and here |

The reviewer also noted that AC-8 interleaves `order_events` ids but not outbox ids, since
`outbox_seq` stays at 1. The claim guard is therefore exercised by AC-5's direct test, not by
the two-instance run.

## Automated Evidence

`spec verify SPEC-0047` ran at 2026-11-08T12:28:48Z with result **pass** (fingerprint
`102ac862aa9296f6`), after the review fixes (T-14).

| Module | Command | Exit | Time | Log |
|---|---|---|---|---|
| oms-core | `./gradlew check` | 0 | 346 s | `evidence/oms-core-1.log` |

- **Tests.** 624 tests in 103 classes, none failed. One is skipped: `LoadSuiteRunnerTest`, which
  runs only with `OMS_LOAD_SUITE=true`.
- **Policy check.** No errors, no warnings.
- **Earlier runs** (tasks.md Notes, T-13). They failed on:
  - a test still reading staged payloads;
  - test-database connection exhaustion from the added contexts;
  - two test races the new timing exposed;
  - the R04 policy rule.

  Each was fixed, and the run above is after the last code change.
- **Other work in the tree.** It holds SPEC-0024's and SPEC-0048's uncommitted work too. Other
  sessions paused their edits and builds in oms-core and oms-knowledge-base for this run.

## Follow-ups

- **Blotter sort.** Its newest-first default sorts by `id`, which pooled ids make approximate
  across instances. Sort by a time column if that matters to traders.
- **Schema-validation coupling.** Older oms-core images cannot start against a database migrated
  by changelog 015, because Hibernate's startup check rejects the sequence increments. A rollback
  of the deployment must also roll back changeset `015-pooled-sequences`, as its rollback block
  does.
- **Publisher clean-up.** Inject `OutboxRecordMapper` into `MessagePublisher`, and move the tests of
  the one-argument `publishAsync` to `OutboxRecordMapper` or `OutboxPayloads` (review finding 4).
- **Claim guard cost.** Run `EXPLAIN` on `claimPending` with a few hundred pending rows for one
  order. If it is slow, add `topic` to `idx_outbox_order_version` or rewrite the inversion probe with
  a window function (review finding 5).
- **Clearer latency proof.** A heavier load shape, where the command path is the bottleneck, would
  show the latency effect more clearly than the baseline's shape.

## Verdict

Verdict: GOAL MET
