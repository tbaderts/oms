# Verification — SPEC-0048: Make oms-core safe to run with several instances

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests below ran and passed in the latest `spec verify` (oms-core `./gradlew check`,
`evidence/oms-core-1.log`), with no failure or skip in `oms-core/build/test-results/test/`.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | 10 concurrent fills on one order all apply, FILLED, cumQty 100, contiguous versions | `TwoInstanceIntegrationTest#tenConcurrentFillsAllApply` (10 threads, every answer 201, no 409); `OrderVersionIntegrationTest#concurrentFillsThroughThePipelineOneWaitsThenApplies` | PASS |
| AC-2 | Conflicts retried past the budget, never dead-lettered; other failures dead-lettered after the budget | `OrderVersionIntegrationTest#kafkaFillRetriedAfterAConflict` (6 conflicts against a budget of 4, then applied, nothing on `commands.DLT`); `CommandRetryBudgetIntegrationTest#aRetryableNonConcurrencyFailureIsDeadLetteredAfterTheBudget` (retryable `IllegalStateException`, exactly `retry-attempts + 1` attempts, then one record on the DLT); `KafkaConsumerConfigTest` | PASS |
| AC-3 | One relay leader in health; only it publishes; takeover and publication within 10 s | `TwoInstanceIntegrationTest#exactlyOneRelayLeaderAndTakeover`: one leader in `/actuator/health/leadership`; the follower's `oms.outbox.drains` stays 0 although it staged the message; after the leader closes, takeover and publication share one 10 s budget. `LeadershipTest` (4 tests), `OutboxClaimIntegrationTest`, `OutboxRelayTest` (handover: re-check per batch, stop waits) | PASS |
| AC-4 | With a 10 s poll, a commit reaches Kafka within 1 s; a backlog beyond one batch drains without another poll | `OutboxNudgeIntegrationTest#commitIsPublishedWithoutWaitingForThePoll`, `#backlogLargerThanABatchDrainsInOneGo` | PASS |
| AC-5 | Topics created with their partition counts; listener concurrency = partitions of `commands`; a smaller topic left alone with a warning | `KafkaTopicProvisionerIntegrationTest#createsMissingTopicsAndSetsListenerConcurrency`, `#leavesASmallerExistingTopicAloneAndWarns` (WARN "has 2 partitions … configured 6"), `#instancesStartingTogetherAllProvisionWithoutError` | PASS |
| AC-6 | Both schedulers triggered: one EXP and one CLOSE per order; only the leader runs them | `TwoInstanceIntegrationTest#schedulersRunOnTheLeaderOnly`: one EXP and one CLOSE per order, one scheduled command of each in the command log, both instances trigger end of day at once behind a latch, the leader's `oms.end-of-day.orders{step}` ≥ 3 and the follower's 0. `EndOfDaySchedulerTest#aFollowerRunsNeitherJob` | PASS |
| AC-7 | Two consumers: no DLT, cumQty = sum of fills, per-key version order on each topic | `TwoInstanceIntegrationTest#contentionLeavesNothingDeadLettered`: nothing on `commands-two.DLT`; cumQty asserted for all 11 orders; every version in order on `orders`; one record per fill in version order on `oms_executions` and `oms_order_executions`. `OrderVersionTwoInstanceIntegrationTest`, `OutboxHoldTwoInstanceIntegrationTest` | PASS |

The stronger checks were confirmed to catch the faults they target:
- AC-3: with the follower allowed to drain, the test failed on the follower's `oms.outbox.drains`
  being 1.
- The concurrent provisioner test failed against the old provisioner.
- The claim test failed with `SKIP LOCKED`.
- The scheduler gate and the nudge were checked the same way during T-4 to T-7.

## Goal Assessment

The goal asks that two or more command instances run correctly and that publication no longer
waits for the poll. Each named part is delivered:
- lock-first fills, with the version check kept;
- unbounded concurrency retries outside the dead-letter budget;
- one relay leader by advisory lock, shown in health, with relay slices designed;
- the nudge and the drain loop, with the poll kept as the fallback;
- declared topics, with listener concurrency set from them;
- scheduler leadership;
- two-context tests, including OrderVersion, OutboxHold and contention.

The independent review found that "run correctly" did not hold during a leader handover. That was
fixed and is now tested (see Independent Review, finding 1).

Gaps a requester should know about:
- **Faster publication only on the leader.** Only commits on the relay leader get the faster
  publication. A follower's commits still wait for the leader's poll, 200 ms by default. This
  matches the goal's wording ("on its instance") and is documented in `event-publication.md`.
- **Detecting a dead leader.** How fast a dead leader's lock is freed depends on PostgreSQL's TCP
  keepalive settings. The operations note documents them.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contract change |
| P-02 | Specification before code, generated models only | N/A | No API or message change |
| P-03 | Never edit generated code | PASS | Nothing under `build/generated` touched |
| P-04 | Contracts evolve compatibly | N/A | Topics and records unchanged |
| P-05 | Every state change is recorded in the event log | PASS | The appender path is unchanged. Outbox saves now go through one `stage` method that also nudges |
| P-06 | Kafka only through the transactional outbox | PASS | The relay is the only publisher. The nudge only triggers it after commit |
| P-07 | Schema changes through new Liquibase changesets | N/A | No schema change |
| P-08 | Concurrency and idempotency are explicit | PASS | Fills lock the order row first, and the version check stays. Concurrency retries are idempotent (dedup on execId and state). One relay drainer, with a blocking claim during handover. Advisory locks for the relay and schedulers |
| P-09 | Commands and queries stay separate | PASS | Unchanged |
| P-10 | State transitions go through the state machine and task pipeline | PASS | Pipelines unchanged. Only how the fill loads its order changed |
| P-11 | Layering and conventions | PASS | Leadership service in `service.leadership`, config beans in `config`, constructor injection |
| P-12 | Jackson 3 only | N/A | No JSON code |
| P-13 | Errors and validation follow the framework specs | PASS | Answers unchanged; a conflict is still 409 on REST |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Table above. Review-driven tests were written red-first (claim, provisioner race, relay handover) |
| P-15 | Observability | PASS | Health group `leadership`; `oms.leadership.held{role}`; `oms.outbox.drains`; WARN and then ERROR logs on long concurrency retries; WARN on undersized topics |
| P-16 | Security | PASS | No secrets. The health group shows two booleans |
| P-17 | Simplicity and dependencies | PASS | No new library: advisory locks, Kafka `Admin`, Spring Kafka's error handler |
| P-18 | Modules build standalone | PASS | `spec verify` ran oms-core `./gradlew check` |
| P-19 | Documentation follows behaviour | PASS | `event-publication.md`, `kafka-topics.md`, `outbox-message.md`, `execution-processing.md` |

`spec verify` also warns R07 for oms-ui. That comes from uncommitted oms-ui changes that this
ticket did not make; oms-ui is not in its modules.

## Independent Review

The spec-reviewer agent returned NOT MET, with one blocking finding, three major and seven minor.
Implement was reopened (T-11 to T-15).

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | blocking | Two relays could drain at once during a handover, and `SKIP LOCKED` let the successor publish an aggregate's later rows first | Fixed. The claim waits (`FOR UPDATE`, no skip), proven red-first by `OutboxClaimIntegrationTest`. Leadership is re-checked before every batch. The relay is a `SmartLifecycle` that stops, and waits for its batch, before leadership is released (`OutboxRelayTest`) |
| 2 | major | A stale leadership connection was replaced without closing, so an orphaned session could keep the lock; no keepalive | Fixed. The connection is closed before reopening, opened with `tcpKeepAlive` and a 30 s socket timeout, and checked with `isValid(5)` (`LeadershipConnectionTest`). Operations note on `tcp_keepalives_*` |
| 3 | major | AC-3: "only the leader publishes" not asserted; the 10 s window was doubled | Fixed. The follower's `oms.outbox.drains` is asserted 0, and one 10 s budget covers takeover and publication |
| 4 | major | AC-7 checked version order on one topic of three | Fixed. All three topics are checked, and cumQty is asserted for every order |
| 5 | minor | AC-6 ran end of day sequentially, so a missing gate went unnoticed | Fixed. Both run at once behind a latch, with per-instance counters |
| 6 | minor | AC-2's second clause was proven only by proxy | Fixed by `CommandRetryBudgetIntegrationTest` |
| 7 | minor | Simultaneous starts logged a false ERROR | Fixed: `TopicExistsException` is success. The new test then exposed a second race, a describe before the broker knew the topic, which is retried within the timeout |
| 8 | minor | Unbounded concurrency retries write a FAILED command-log row each | Follow-up (below). Bounded in practice by the 5 s back-off cap. Not a correctness problem |
| 9 | minor | A REQUIRES_NEW transaction inside one that already registered gets no nudge | Follow-up. No current path stages rows that way; the cost is latency only, since the poll still publishes |
| 10 | minor | Dead `root` parameter in the contention test | Fixed |
| 11 | minor | verification.md was a template, and the recorded run reused cached results | Fixed. This file, and a fresh `spec verify` after the last code change |

The reviewer also called the test isolation fragile. It relies on Spring running a subclass's
`@DynamicPropertySource` before the base's. `OutboxNudgeIntegrationTest#runsInItsOwnDatabaseAndTopic`
guards that ordering. The full suite passes with it.

## Automated Evidence

`spec verify SPEC-0048` ran at 2026-11-08T10:37:38Z with result **pass** (fingerprint `ed2e3983ad123e5d`).

| Module | Command | Exit | Time | Log |
|---|---|---|---|---|
| oms-core | `./gradlew check` | 0 | 296 s | `evidence/oms-core-1.log` |

- **Tests.** 613 tests in 100 classes, none failed. One is skipped: SPEC-0024's
  `LoadSuiteRunnerTest`, which runs only with `OMS_LOAD_SUITE=true`. Every class in the AC table ran
  in this run, including TwoInstanceIntegrationTest (4), OrderVersionIntegrationTest (6),
  CommandRetryBudgetIntegrationTest (1), KafkaTopicProvisionerIntegrationTest (3),
  OutboxClaimIntegrationTest (1), OutboxRelayTest (21) and LeadershipTest (4).
- **Policy check.** No errors. One warning, R07 for oms-ui, which is not this ticket's change (see
  Policy Review).
- **Earlier runs.** A passing run at 10:29Z went stale when SPEC-0024 files landed in oms-core.
  Two runs before it failed because other builds deleted
  `oms-core/build` during the test task: a `clean build` in a VS Code terminal, and another session
  implementing SPEC-0024 in the same working tree. That session paused its oms-core builds and
  edits for this run.
- **What the tree contained.** The tree also held SPEC-0024's in-progress oms-core changes (changelog
  014, `OrderEventSchemaVersion`, replay and load test code), which were green in this run. They are not
  part of this ticket.

## Follow-ups

- **Command-log growth on long conflicts.** Concurrency retries each write a FAILED command-log
  row. Log only the first and the final attempt, or don't log a concurrency failure as FAILED
  (review finding 8).
- **Nudge in nested transactions.** Register the nudge per transaction rather than per thread
  resource, if a REQUIRES_NEW path ever stages outbox rows (review finding 9).
- **Retry budget across rebalances.** Spring Kafka counts a record's attempts per consumer, so a
  rebalance restarts a non-concurrency failure's retry budget. This is still bounded and predates
  this ticket. The full suite showed it once (8 attempts instead of 5) before the test waited for
  partition assignment.
- **Relay slices** (designed in `event-publication.md`), once one relay is the measured ceiling
  (SPEC-0024).

## Verdict

Verdict: GOAL MET
