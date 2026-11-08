# Verification — SPEC-0024: Build replay harness and load suite

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests below ran and passed in the `spec verify` run of 2026-11-08T10:55Z
(`evidence/oms-core-1.log`; oms-core `build/test-results/test/TEST-*.xml`, no `<failure>` or
`<skipped>` except the gated runner as designed).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Replay of stored commands into a fresh DB reproduces every snapshot; zero differences | `ReplayHarnessIntegrationTest#replaysCommandHistoryIntoFreshDatabaseWithZeroDifferences`: 9 events recorded through `CommandDispatcher` (create → accept → fills 30+20 → cancel; create → accept → fills 60+40), replayed into a new empty database, `assertNoDifferences()` passes, 9 of 9 compared, order ids kept, target has no `OutboxRelay` | PASS |
| AC-2 | Diff names each differing (orderId, version, field); harness reports the replay failed | `SnapshotDiffTest#reportsEachDifferingVersionAndField` (cumQty, state, resultingState at v3), `#reportsEventsMissingOnEitherSide`; `ReplayHarnessIntegrationTest#failsWithDiffWhenReplayDiverges` (tampered cumQty → `DiffItem(orderId, 3, cumQty, 999, 30)`, `assertNoDifferences()` throws naming "orderId v3 cumQty") | PASS |
| AC-3 | Rows without `schema_version` replay under the upcasting rule with a WARN naming the orders | `ReplayHarnessIntegrationTest#replaysLegacyRowsWithoutSchemaVersionAndWarns`: source `schema_version` nulled, replay has zero differences, `legacyOrderIds()` = both orders, the captured WARN names each, and the replayed rows are stamped | PASS |
| AC-4 | Golden fixtures decode to the current model as version 1, with type and orderId as in the fixture | `OrderEventSchemaVersionTest#readsLegacyFixtureAsVersionOneAndDecodesCommand` [create, execution]; `#legacyFixtureLosesNoFieldOnRead` [create, execution]: every fixture field and value survives decode and re-encode; `#refusesRowsFromANewerSchemaVersion`, `#readsStampedRowAsItsVersion` | PASS |
| AC-5 | Load suite against a running OMS + simulator writes a report with commands/s and p50/p95/p99 | `LoadReportWriterTest#writesThroughputAndLatencyPercentilesToFile`, `PrometheusSnapshotTest` (3 tests, percentiles from bucket deltas). Gated `LoadSuiteRunnerTest#runsScriptedFlowAndWritesReport` (skipped in CI by design) ran against the compose stack twice and passed, writing `oms-core/build/load-reports/load-baseline-20261108-103813.md` and `…-105001.md` | PASS |
| AC-6 | Committed baseline records configuration, throughput and p50/p95/p99 | `oms-core/docs/load-baseline-2026-11-08.md`: 500 orders, concurrency 8, 1 fill slice, 79.25 commands/s, percentiles of 4 SLA timers, matching the 10:38Z run report exactly; plus the second run's figures as variance, and provenance | PASS |

## Goal Assessment

The goal asked for four things, all delivered:
- **A replay runner.** It feeds `order_events.transaction` in `id` order into a fresh database
  and diffs the snapshots, so reproducing behaviour is now a test that fails with a named
  difference.
- **A load suite with the exchange simulator.** It records throughput and the SLA percentiles,
  with a committed baseline taken before the projection and tree work.
- **`schema_version` on stored events.**
- **Golden fixtures and the written-down upcasting rule.**

Gaps, named honestly and none material to the goal:
- **The upcasting rule is applied only on the test side** (`StoredEventDecoder`). Production
  readers decode the JSON directly. With version 1 the only version this changes nothing today,
  and oms-state-store.md now states that production readers must adopt the rule before the first
  bump. That is a follow-up, not part of this goal: the proposal places the harness in test scope.
- **The baseline is not tied to a commit.** It measured the morning's working tree, which
  included in-progress SPEC-0048 outbox work. The document says so and asks for a rerun once
  that is committed.
- **Single runs vary noticeably.** Two consecutive runs gave 79 and 104 commands/s. The document
  records both and recommends a warm-up plus the median of three runs.

What was left out on purpose, as the proposal says: replay with an older binary, a production
replay endpoint, reproducing Kafka publication, and running the load suite in CI.

## Policy Review

Reviewed against the SPEC-0024 changes in the working tree. The tree also holds other tickets'
uncommitted work, which is not judged here; the oms-ui P-14 warning belongs to that work.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | no OpenAPI or Avro change; no contract folder in oms-core |
| P-02 | Specification before code, generated models only | PASS | no model hand-written; `CommandSource` deliberately not extended, because it is published in oms-query-api.yml |
| P-03 | Never edit generated code | PASS | nothing under `build/generated` touched |
| P-04 | Contracts evolve compatibly | N/A | no contract change |
| P-05 | Every state change is recorded in the event log | PASS | the production change only stamps `schemaVersion` in `OrderEventAppender.appendOrderEvent`; replay goes through `CommandDispatcher`, so every replayed change is appended by the appender |
| P-06 | Kafka only through the transactional outbox | PASS | no publish path added; the replay target runs with `kafka.enabled=false` and has no relay (asserted in the AC-1 test) |
| P-07 | Schema changes through new Liquibase changesets | PASS | new `014-order-events-schema-version.yaml` (nullable column, rollback) included from the master; no existing changeset edited; entity matches (`ddl-auto: validate` in every integration context) |
| P-08 | Concurrency and idempotency are explicit | PASS | no concurrency semantics changed; the column touches neither `txNr` nor the unique constraints |
| P-09 | Commands and queries stay separate | PASS | the harness writes only through the command path and reads the event table with JDBC in test code |
| P-10 | State transitions go through the state machine and task pipeline | PASS | replay uses the existing dispatcher and processors; no new transition or task |
| P-11 | Layering and conventions | PASS | test code in `org.example.oms.replay` / `org.example.oms.load`; records, no field injection |
| P-12 | Jackson 3 only | PASS | `tools.jackson.*` mappers throughout; the `com.fasterxml.jackson.annotation` imports are the generated models' annotations, not new code |
| P-13 | Errors and validation follow the framework specs | N/A | no API surface or error mapping changed |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | every AC maps to a passing test above; the fixture round-trip test was written red first (it failed on 9 dropped fields) before the fixture was corrected. AC-6 is a committed document by nature, checked against the run report |
| P-15 | Observability | PASS | the harness logs a summary line per replay and a WARN naming legacy orders; the load suite reads the existing SLA timers and the `oms.commands.consumed` counter rather than adding measurements |
| P-16 | Security | PASS | no secrets; the runner is configured by environment variables only |
| P-17 | Simplicity and dependencies | PASS | no new library or module; the Prometheus text parsing is a small test-scope class |
| P-18 | Modules build standalone | PASS | only oms-core code changed; `./gradlew check` in oms-core passes alone (evidence) |
| P-19 | Documentation follows behaviour | PASS | oms-state-store.md (versioning, upcasting rule, production-reader caveat), testing-patterns.md (replay harness, golden fixtures, round-trip check), exchange-simulator.md §8 (load suite) match the code as built |

## Independent Review

The spec-reviewer agent's verdict was **MET**, with one major and five minor findings.

1. **[major] The golden-fixture test could not detect silent field loss.** The execution fixture
   held 8 fields that `cmd.Execution` never had, plus `avgPx` on the snapshot, and the test
   still passed.
   - **Fixed:** implement was reopened. `OrderEventSchemaVersionTest#legacyFixtureLosesNoFieldOnRead`
     was written first and failed on those 9 fields. The execution fixture now holds only fields
     the model can write, and the test passes.
2. **[minor] The design said "refusal ⇔ refusal", but the code reports any replayed command that
   is not applied.**
   - **Fixed:** the design text was updated as a change during implementation.
3. **[minor] The upcasting rule exists only in test code.**
   - **Documented:** oms-state-store.md now says production readers must adopt the rule before
     the first version bump. Kept as a follow-up.
4. **[minor] The baseline is not tied to a commit, and its tree included SPEC-0048 outbox work.**
   - **Documented:** the baseline document states its provenance and asks for a rerun with a
     commit sha. Kept as a follow-up, because commits are the maintainer's call.
5. **[minor] `OMS_LOAD_FILL_SLICES` only labelled the report.**
   - **Fixed:** the runner now asserts that Kafka commands applied equal
     filled orders × (1 + fill slices). A rerun against the stack passed (1000 = 500 × 2).
6. **[minor] A quantile in the +Inf bucket shows as the highest finite bound, unmarked.**
   - **Not fixed:** no observation in the baseline reached that bucket. Kept as a follow-up.

## Automated Evidence

`evidence/last-run.json`:
- ran 2026-11-08T10:55:48Z, result **pass**, fingerprint `c43bd527222a0b84`;
- modules oms-core and oms-knowledge-base;
- oms-core `./gradlew check` exit 0 after 301 s (`evidence/oms-core-1.log`): 615 tests, 0
  failures, 1 skipped (the gated `LoadSuiteRunnerTest`);
- policy check PASS, with one warning ([R07 P-14] oms-ui) that comes from other tickets' work in
  the tree.

## Follow-ups

- Production readers of `order_events` (Hibernate mapping, `OrderReplayService`) must decode
  through the upcasting rule before `OrderEventSchemaVersion.CURRENT` is first bumped, for example
  by promoting `StoredEventDecoder` to main code.
- Rerun the load suite once the current tree is committed. Record the commit sha in
  `oms-core/docs/load-baseline-2026-11-08.md` or a successor, as a warm-up plus the median of
  three runs.
- `LoadReportWriter`: mark percentiles that fall in the +Inf bucket as lower bounds (">= x").
- Investigate the asynchronous leg's drain rate (outbox relay → simulator → consumer). It, not
  the OMS command path, limits the baseline throughput.

## Verdict

Verdict: GOAL MET
