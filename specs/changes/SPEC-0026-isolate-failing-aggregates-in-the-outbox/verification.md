# Verification — SPEC-0026: Isolate failing aggregates in the outbox relay

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

The final `spec verify` ran on 2026-11-02 at 06:52Z, after three review rounds. It ran
`gradlew check` in oms-core: 267 tests, no failures, no skips. Every test named below is in that
run (`oms-core/build/test-results`, 06:51–06:52Z). Log: `evidence/oms-core-1.log`.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | A's first row fails → B's rows published and deleted, no later A row sent, A1 keeps its row with attempts+1 and the error | `OutboxRelayTest#failureHoldsOnlyItsAggregate`: A1, B1, A2, B2 interleaved, A1 fails. B1 and B2 are sent and deleted; A2 is never sent and has attempts 0; A1 has attempts 1 and its error recorded. Red first against the stop-the-batch relay (T-3) | PASS |
| AC-2 | One aggregate's rows reach the broker in id order; never one past an earlier unpublished one, for failures at send and at acknowledgement | `OutboxRelayTest`: `#rowsOfOneAggregateAreSentInIdOrderAfterEachAck` (A2 is not sent until A1's future completes); `#synchronousFailureStopsTheAggregate` and `#asynchronousFailureStopsTheAggregate`; `#timeoutLeavesUnfinishedRowsUntouched` and `#lateAcknowledgementAfterTheDrainChangesNothing` (no next row after the drain stops waiting); `#aggregateWithASendStillInFlightIsSkipped` (no resend while an earlier send is unsettled, so duplicates stay in order); `#sameKeyOnAnotherTopicIsAnotherAggregate`. On a real broker with 3 partitions: `OrderExecutionPublicationIntegrationTest` (6), `ExchangeWorkflowIntegrationTest` (14) | PASS |
| AC-3 | Rows of different aggregates in flight together; drain time about the slowest chain, not the sum; end-to-end publication unchanged | `OutboxRelayTest#aggregatesAreInFlightTogether`: 20 aggregates each acknowledged after 200 ms. The drain finishes under 2 s (sequential would take 4 s), and more than one send is in flight at once. `MessagePublisherTest#publishAsync_returnsBeforeTheBrokerAcknowledges`. The integration suites above publish keyed and in order | PASS |
| AC-4 | Behind a stuck row, later rows of the aggregate stay unpublished; others published; stuck still counted | `OutboxHoldIntegrationTest#rowsBehindAStuckRowAreHeld` (Postgres and Kafka): a planted row with attempts = max holds order A's accept row (attempts 0, still in the outbox, never on `orders`). Another order is published, and `oms.outbox.stuck` ≥ 1. Red first, when the accept was published past the stuck row (T-6). `LiquibaseMigrationIntegrationTest#outboxHasTopicAggregateIndex` covers the claim index | PASS |
| AC-5 | `oms.outbox.oldest.age`: seconds since the oldest row still to be published, 0 when none, on `/actuator/prometheus` | `OutboxHoldIntegrationTest#oldestAgeGaugeReportsTheHeldRow`: 1 ≤ age < 3600 with an hour-old stuck row present, so stuck rows are left out; `oms_outbox_oldest_age_seconds` appears on `/actuator/prometheus`. `OutboxRelayTest#oldestAgeIsZeroWhenNothingPending`: 0 when empty, ≥ 5 for a row 5 s old | PASS |

## Goal Assessment

The Goal asked for three things:
- skip only the failed aggregate's rows for the rest of the batch;
- send the batch asynchronously and await it;
- add a gauge for the oldest pending row's age.

All three are delivered and proven (AC-1, AC-3, AC-5). Two approved decisions go further:
- **A stuck row holds its aggregate (AC-4).** Its later rows are no longer published out of
  order.
- **Isolation is per topic and key.**

The review rounds made the result robust against outages. They showed that a timeout, or a broker
or registry being unreachable, must not spend attempt budgets; otherwise an outage would hold
every order. Now only a definitive failure, a problem with the message itself, costs an attempt.
Within one aggregate, duplicates after a timeout arrive in order.

Known limit (documented in `capabilities/event-publication.md`, follow-up below): isolation works
within a batch. If the 100 oldest pending rows all belong to aggregates that cannot progress, for
example on a leaderless partition, newer aggregates wait until they recover. This lies outside the
one-poison-message case the Goal and the review's finding describe. The reviewer recommended a
follow-up ticket rather than holding this one. Several relay instances remain out of scope, as
approved.

## Policy Review

Reviewed against the diff of the SPEC-0026 files (tasks.md lists them). The working tree also
holds uncommitted work of earlier, finished tickets. The policy check's R10 warnings on
`docker-compose.yml` and two `build.gradle` files come from SPEC-0025, not from this ticket.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contract change |
| P-02 | Specification before code, generated models only | N/A | No API or message change |
| P-03 | Never edit generated code | N/A | None involved |
| P-04 | Contracts evolve compatibly | N/A | Topics, keys, payloads unchanged |
| P-05 | Every state change is recorded in the event log | N/A | Event log untouched |
| P-06 | Kafka only through the transactional outbox | PASS | The relay is still the only publisher. A row is deleted only after its acknowledgement, in the claiming transaction |
| P-07 | Schema changes through new Liquibase changesets | PASS | `009-outbox-aggregate-index.yaml` (changeset 020, rollback), included last; 001–008 untouched |
| P-08 | Concurrency and idempotency are explicit | PASS | Per-aggregate chains gated by acknowledgement; at most one unsettled send per aggregate across drains; entities mutated only on the drain thread; at-least-once with in-order duplicates; transient failures cost no attempt; single-instance assumption documented |
| P-09 | Commands and queries stay separate | N/A | Publication infrastructure |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No transitions |
| P-11 | Layering and conventions | PASS | `service/` (relay, publisher), `repository/` (queries), `model/` (`recordTransientFailure`) |
| P-12 | Jackson 3 only | N/A | No Jackson use |
| P-13 | Errors and validation follow the framework specs | PASS | Every failure is recorded on its row (`lastError`, attempts for definitive ones) and logged; nothing swallowed |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC above. The tests of each change, review fixes included, were red first |
| P-15 | Observability | PASS | `oms.outbox.oldest.age` (seconds) added; pending and stuck gauges kept; error logs, plus warnings for transient failures and unfinished aggregates; `@Observed` publish span kept |
| P-16 | Security | N/A | No input or exposure change |
| P-17 | Simplicity and dependencies | PASS | JDK `CompletableFuture` and virtual threads only; no build change in this ticket |
| P-18 | Modules build standalone | PASS | oms-core `check` in verify |
| P-19 | Documentation follows behaviour | PASS | `capabilities/event-publication.md` (relay, limits, rollout note), `domain/outbox-message.md`, `architecture/transactional-outbox.md`, FR-023, FR-024 and the requirements index; okf-check reports 0 errors and 0 warnings |

## Independent Review

The spec-reviewer ran three rounds.

**Round 1 (NOT MET).**
- **[blocking]** A drain timeout charged an attempt to the first unfinished row of every chain,
  even rows never sent. A Kafka outage of a few minutes would have exhausted and held every
  pending aggregate. **Fixed:** unfinished rows are untouched.
- **[major]** The timeout and shutdown paths were untested. **Fixed:** timeout and late-ack tests.
- **[minor]** The single shared send thread coupled aggregates. **Fixed:** virtual threads.
- **[minor]** Shutdown was abrupt. **Fixed:** graceful shutdown.
- **[minor]** FR-023 and FR-024 were stale. **Fixed.**
- **[minor]** No rollout note for stuck rows left by the old relay. **Fixed:** added.
- **[minor]** A test comment claimed coverage of the topic in the key that did not exist.
  **Fixed:** two-topic test.
- **[minor]** A null error message was recorded as null. **Fixed:** falls back to the exception
  type.
- **[minor]** A constant `hashCode` in the outcome maps. Informational, harmless at 100 rows.

**Round 2 (NOT MET).**
- **[blocking]** A send blocked on missing metadata during an outage fails with Kafka's retriable
  `TimeoutException` within the drain and was still charged. **Fixed:** transient failures (a Kafka
  `RetriableException` or an I/O error in the cause chain) record `lastError` but cost no attempt.
- **[minor]** A send still blocked from an earlier drain could land a duplicate after a newer row.
  **Fixed:** aggregates with an unsettled send are skipped.
- **[minor]** `max.block.ms` is shared by every producer. **Documented.**
- **[minor]** Design step 4 contradicted the code. **Corrected.**

**Round 3 (MET).**
- **[major]** Blocked aggregates with 100 or more of the oldest rows can fill every batch.
  **Documented as a limit; follow-up.**
- **[minor]** A race window between the `closed` check and the in-flight mark. **Fixed (T-14):**
  marked before the check.
- **[minor]** A misconfigured topic is transient and never becomes stuck. **Documented.**
- **[info]** An aggregate is skipped until its future settles, which the producer guarantees
  within `delivery.timeout.ms`. **Accepted.**

The fixes of every round were re-verified; the last run is the one above.

## Automated Evidence

`evidence/last-run.json`, ran 2026-11-02T06:52:55Z, result **pass**, fingerprint
`b3eba034ec21a665`. Policy check: PASS, no errors. The three R10 warnings concern SPEC-0025's
files.

| Module | Command | Exit | Log |
|---|---|---|---|
| oms-core | `gradlew check` | 0 (267 tests) | evidence/oms-core-1.log |

## Follow-ups

- **Claim per-aggregate heads**, so blocked aggregates cannot fill a batch. For example, use
  `row_number() over (partition by topic, aggregate_id)` in the claim, or exclude in-flight and
  transiently failing keys (review round 3, finding 1).
- **Alert on `oms.outbox.oldest.age`** in Grafana; it is the signal for held or blocked
  aggregates.
- **An operator tool to replay or delete stuck rows** (out of scope in the proposal).
- **Several relay instances:** partition the claim by aggregate before scaling out.
- **Before deploying,** run the rollout check in `capabilities/event-publication.md`.

## Verdict

Verdict: GOAL MET

All five ACs pass with tests from the final verify run. The independent review's final verdict is
MET, and every blocking finding of the earlier rounds is fixed and re-verified. The remaining
batch-fill limit is outside the Goal's case; it is documented and listed as a follow-up.
