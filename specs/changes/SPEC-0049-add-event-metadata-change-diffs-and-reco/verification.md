# Verification — SPEC-0049: Add event metadata, change diffs and reconciliation

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

Every test below ran and passed in the latest `spec verify` (`evidence/oms-core-1.log`,
`evidence/oms-contracts-1.log`), with no failure or skip.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Kafka command: header correlation and causation ids, producer as principal, source KAFKA | `EventMetadataIntegrationTest#kafkaCommandCarriesHeaderMetadata`: a fill sent with a header carrying `correlationId`, `causationId` and `producer` is stored with those three and `KAFKA` | PASS |
| AC-2 | REST: correlationId, source REST, no principal. Schedulers: SCHEDULER with the job principal | `EventMetadataIntegrationTest#restAndSchedulerCommandsCarryTheirOrigin`: the REST fill is stored with its `correlationId`, `REST` and a null principal; GTD expiry's EXP is stored with `SCHEDULER` and `oms-core:expiry`; end of day's CLOSE with `SCHEDULER` and `oms-core:end-of-day` | PASS |
| AC-3 | A partial fill lists exactly the changed fields, not `state` | `EventMetadataIntegrationTest#aFillRecordsExactlyTheChangedFields`: `cumQty` 0 → 40, `leavesQty` 100 → 60 and `txNr` are listed; `state` is not. The listed set equals the fields that differ between the snapshots before and after the fill, with instants compared to the microsecond. `OrderChangesTest#listsOnlyChangedFieldsWithOldAndNewValues` and `#numbersCompareByValue` | PASS |
| AC-4 | A create lists every set field from null; a version-only change lists only `txNr` | `EventMetadataIntegrationTest#aCreateListsEveryFieldItSet`: the create's `changes` equals the non-null fields of its snapshot, each with `from` null. `OrderChangesTest#onlyTheVersionChanged`, `#withoutABeforeEveryFieldSetIsListedFromNull` | PASS |
| AC-5 | The events endpoint returns the five fields; older events return them null | `EventMetadataIntegrationTest#theEventsEndpointReturnsMetadataAndChanges`: `GET /api/query/orders/{id}/events` returns `correlationId`, `causationId`, `source` `REST`, no principal, and `changes` as a JSON object. An event with the columns nulled, standing in for one recorded before SPEC-0049, returns all five null and its old fields unchanged. `#theEndpointReturnsChangesWithExactDecimals`: a `cumQty` of 1234567890.12345678 comes back exactly (it came back as 1234567890.1234567 before the review fix). `OrderEventQueryIntegrationTest` (8) and `OrderEventContractTest` pin the property set | PASS |
| AC-6 | The reconciler finds an inconsistent order and a gap, logs them, and reads zero after repair | `EventLogReconcilerIntegrationTest#findsAnInconsistencyAndAGapThenClears`: a healthy log reads 0 and 0. Then `cumQty` is edited by SQL on one order and version 2 of another is deleted: the gauges read 1 and 1, with WARNs naming the order and `cumQty`, and the order and `missing versions [2]`. The healthy order is not reported. After repair, both read 0 | PASS |
| AC-7 | Only the scheduler leader samples; one run samples at most the configured number | `TwoInstanceIntegrationTest#reconcilerRunsOnTheLeaderOnly`: the leader's `oms.event_log.sampled` grows and the follower's stays 0; it failed with the follower sampling 10 when the leader gate was removed. `EventLogReconcilerIntegrationTest#samplesAtMostTheConfiguredOrders`: with 3 recent and 2 random, one run samples at most 5 of the orders present | PASS |
| AC-8 | A row staged with an older schema publishes with the new field's default; rows without an id decode as before | `ProjectionSchemaEvolutionIntegrationTest#aRowStagedWithAnOlderSchemaStillPublishes`: a row encoded with `OrderExecution` minus `tradeDate`, registered as its own id, is published with its values and a null `tradeDate`, and is not failed. `#aStagedProjectionRowRecordsItsWriterSchemaId`: a fill's PROJECTION row carries the registry id. `AvroPayloadCodecTest#decodesWithWriterAndReaderSchemas` also shows the older payload cannot be read without the writer schema. Rows without an id: the existing projection publication tests pass unchanged | PASS |

## Goal Assessment

The goal asks for four things, and each is delivered:
- **Metadata on the event.** Correlation and causation ids, principal and source on `order_events`,
  filled from the Kafka header, the REST caller and the scheduler (AC-1, AC-2).
- **A `changes` diff.** Computed in the appender from the order as loaded and as saved (AC-3,
  AC-4).
- **Both on `OrderEventDto`, additively** (AC-5).
- **A scheduled reconciliation sampler.** It compares recent and random orders with replay and
  checks contiguity, with the two named gauges and a log line per mismatch (AC-6, AC-7).

The goal also asks for the writer schema id of PROJECTION payloads, decoded with writer and
reader schemas, so a deployment cannot hold an aggregate (AC-8).

Gaps a requester should know:
- **The REST principal stays null.** The goal says "the authenticated caller on REST", and oms-core
  has no REST authentication. The proposal resolved this as an assumption; the column fills when
  authentication exists.
- **Sub-microsecond drift.** Building the reconciler found that every order's row differs from
  its latest snapshot below a microsecond: a snapshot keeps the clock's nanoseconds, while
  Postgres rounds to microseconds. The reconciler compares at the database's precision, which is
  recorded in the design.
- **Incompatible record changes.** Rows staged before their schema id is known (the first
  moments after start) decode with the current class, as before. So the "publish pending
  PROJECTION rows before an incompatible change" rule still applies to those, and to any
  incompatible change.
- **The proposal was corrected twice.** AC-3 named a partially-filled state and then an order
  `avgPx`, neither of which exists. You re-approved each correction.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | The OpenAPI change is in `oms-contracts/src/main/openapi/oms-query-api.yml` |
| P-02 | Specification before code, generated models only | PASS | The spec was changed first (T-1) and `OrderEventDto` regenerated |
| P-03 | Never edit generated code | PASS | Nothing under `build/generated` was edited |
| P-04 | Contracts evolve compatibly | PASS | Five optional properties, additive; query API version 2.4.0. The consumer modules built and passed |
| P-05 | Every state change is recorded in the event log | PASS | Events gain metadata, and the reconciler checks P-05 at runtime |
| P-06 | Kafka only through the transactional outbox | PASS | Only `payload_schema_id` added; the relay is still the only publisher |
| P-07 | Schema changes through new Liquibase changesets | PASS | New changelog 016; 001 to 015 untouched |
| P-08 | Concurrency and idempotency are explicit | PASS | Versioning and dedup unchanged. The reconciler reads in one REPEATABLE_READ read-only transaction per order |
| P-09 | Commands and queries stay separate | PASS | Read-only query change; the reconciler only reads |
| P-10 | State transitions go through the state machine and task pipeline | PASS | Unchanged; the two load points only remember the loaded order |
| P-11 | Layering and conventions | PASS | The MapStruct mapper maps the DTO. `CommandContext` and `LoadedOrders` are static helpers on transaction resources, recorded in the design |
| P-12 | Jackson 3 only | PASS | `tools.jackson.databind` throughout |
| P-13 | Errors and validation follow the framework specs | PASS | No new API errors. Reconciler failures are logged and never affect commands |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Table above; each new test was run red before its code |
| P-15 | Observability | PASS | `oms.event_log.inconsistent`, `oms.event_log.gaps`, `oms.event_log.sampled`, WARN logs, and metadata on every event |
| P-16 | Security | PASS | No secrets. The principal holds producer or job names only |
| P-17 | Simplicity and dependencies | PASS | No new library: the Confluent schema-registry client was already a dependency |
| P-18 | Modules build standalone | PASS | oms-contracts and its consumers ran `check` in `spec verify` |
| P-19 | Documentation follows behaviour | PASS | Five knowledge-base pages updated (T-9) |

## Independent Review

The spec-reviewer agent returned **MET**, with no blocking finding. It rated:
- AC-1, AC-2, AC-3, AC-5, AC-6, AC-7 and AC-8 proven;
- AC-4 weakly proven.

It reported two major and eight minor findings. Implement was reopened (T-11), and verification
was run again after the fixes.

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | major | The endpoint parsed `changes` with doubles, so decimals were not returned "as stored" | Fixed: read with `USE_BIG_DECIMAL_FOR_FLOATS`. A new test was red with 1234567890.12345678 coming back as 1234567890.1234567, and is now green |
| 2 | major | The recent-orders sample aggregated the whole event log every run; there was no index on `time_stamp` | Fixed: a new changeset adds `idx_order_events_time_stamp`, and the query reads only the newest `recent × 20` events by time |
| 3 | minor | A registry 5xx while reading a writer schema was a definitive failure, which could hold an aggregate | Fixed: status ≥ 500 is transient |
| 4 | minor | Schema-id lookups were retried after every failure when no registry is reachable | Fixed: a failed lookup is not retried for a minute. The component stays unconditional because the relay's mapper depends on it; without a URL it does nothing |
| 5 | minor | The reconciler shares the one-thread scheduler with the relay's poll | Fixed: `spring.task.scheduling.pool.size: 2` |
| 6 | minor | AC-4's "only the version changed" half is proven by the diff function, not by a command | Accepted. No OMS command changes only the version: each one changes state, a quantity, a timestamp or the cancel state with it. The half is a property of the diff, which the appender applies unchanged; AC-3's and AC-4's integration tests run that same path end to end |
| 7 | minor | The query API version was not bumped | Fixed: 2.4.0, noted in `interfaces/query-api.md` |
| 8 | minor | `interfaces/query-api.md` did not list the new fields | Fixed |
| 9 | minor | Fully qualified class names were written inline instead of imported | Fixed in the six main classes |
| 10 | minor | verification.md was a template | It was being written during the review; it is complete now |

## Automated Evidence

`spec verify SPEC-0049` ran at 2026-11-08T18:06:33Z with result **pass** (fingerprint
`b9a7eaa4e3adce93`), after the review fixes (T-11).

| Module | Command | Exit | Time | Log |
|---|---|---|---|---|
| oms-core | `./gradlew check` | 0 | 382 s | `evidence/oms-core-1.log` |
| oms-contracts | `./gradlew check` | 0 | 1 s | `evidence/oms-contracts-1.log` |
| oms-streaming-service | `./gradlew check` | 0 | 21 s | `evidence/oms-streaming-service-1.log` |
| oms-mcp-server | `./gradlew check` | 0 | 18 s | `evidence/oms-mcp-server-1.log` |
| oms-exchange-simulator | `./gradlew check` | 0 | 37 s | `evidence/oms-exchange-simulator-1.log` |

- **oms-core tests.** 642 tests in 107 classes, none failed. One is skipped: the load suite, which
  runs only with `OMS_LOAD_SUITE=true`.
- **Policy check.** No errors or warnings.
- **Earlier runs.** The first run (17:38Z) failed on one pinned-property test in oms-core, since
  updated, and the second (17:46Z) passed before the review. All consumer modules rebuilt against
  the 2.4.0 contracts in this run.
- **Other sessions.** They paused their edits and builds in these modules for the run.

## Follow-ups

- **REST principal.** Fill it when REST authentication exists. The column and the DTO are ready.
- **`changes` in replay.** Add `changes` to the replay harness's snapshot diff, so replay also
  proves the diffs reproduce (suggested by the SPEC-0024 author).
- **Default sample sizes.** The defaults (50 recent, 10 random) are configuration defaults; only
  the configured bound is tested.
- **Writer schema ids at startup.** Warm the ids eagerly at startup, so the first PROJECTION rows
  after a start also carry them.

## Verdict

Verdict: GOAL MET
