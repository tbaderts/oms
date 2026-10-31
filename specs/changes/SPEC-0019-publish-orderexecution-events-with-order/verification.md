# Verification — SPEC-0019: Publish OrderExecution events with order context

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

The final `spec verify` (18:37Z, after the review fixes T-15 to T-17 and the dedup-key
documentation fix) executed the tests of every module: oms-core (41 classes, 210 tests),
oms-contracts (6 classes, 10 tests) and oms-streaming-service (6 classes, 23 tests), 0 failures,
0 skipped.

Each method below is in `<module>/build/test-results/test/TEST-*.xml` with no `<failure>` or
`<skipped>`, and each was read against its AC.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | `OrderExecution` with every listed field; `Execution` + `rootOrderId`, `orderVersion`; compatible with the old `Execution` both ways | oms-contracts `OrderExecutionSchemaTest#hasEveryContextFieldNullableWithNullDefault` (all 28 fields optional, `null` default, `tradeDate` an Avro `date`; the two `Execution` fields likewise); `ExecutionCompatibilityTest#newSchemaReadsBaselineAndBack` against `compat/Execution-baseline.json`, the schema before this change; `OrderExecutionCompatibilityTest#newSchemaReadsBaselineAndBack` guards the new record from here on (T-16). Red before T-2 (`OrderExecution.avsc` missing) | PASS |
| AC-2 | One `OrderExecution` per fill (REST and Kafka), key `O`, fill and order fields as of the fill, `orderVersion` = event version = `OrderMessage.eventId`, `tradeDate` = UTC date of `transactTime` | `OrderExecutionPublicationIntegrationTest#fillsOverRestAndKafka_publishOneOrderExecutionEach`: REST fill at `2026-10-30T23:30:00Z` (v3) and Kafka fill (v4); exactly 2 records, key `O`; `lastQty`/`lastPx` equal the `executions` rows; account, side, symbol, orderQty, price, cumQty, leavesQty, state equal the `order_events` snapshot at that version; an `orders` record with the same `eventId` exists; `tradeDate` 2026-10-30 for the REST fill (a date the staging time would not give), the UTC date of `transactTime` for the Kafka fill. Red before T-7 (0 records). Field mapping and the `createdAt` fallback also in `OrderExecutionMessageMapperTest` (Avro round trip) | PASS |
| AC-3 | `oms_executions` records carry `rootOrderId` `O` and the same `orderVersion` | `OrderExecutionPublicationIntegrationTest#executionRecords_carryRootOrderIdAndOrderVersion`; `AvroMessageMapperTest#executionMessage_carriesTheFillAndTheResultingPosition` and `#executionMessage_withoutOrder_usesTheOrderIdAsRoot` (outbox rows staged before this change) | PASS |
| AC-4 | Refused fills (duplicate `execId`, overfill) publish nothing; event count unchanged | `OrderExecutionPublicationIntegrationTest#refusedFills_publishNothing`: both REST fills refused (not 201), event count unchanged; after a later fill on the same order (same partition, staged after the refusals) is consumed, only the two applied fills are on `oms_order_executions` and `oms_executions`. A guard, not red-first: refusals already rolled back (tasks.md Notes). Outbox rows per applied fill: `EventSourcingIntegrationTest#acceptAndFill_appendSequencedEventsAndStageOutboxMessages` (7 = 3 order + 2×2 fill rows) | PASS |
| AC-5 | Child `C` with root `R`: every record on the three topics keyed `R`; an order without root keyed by its own id | `OrderExecutionPublicationIntegrationTest#childOrder_isKeyedByRootOnAllThreeTopics`: root and child each have 5 records across `orders`, `oms_executions`, `oms_order_executions`, all keyed `R`. Red before T-8 (child keyed by its own id). `ExchangeWorkflowIntegrationTest#fills_areKeyedByOrderIdOnBothTopics` still passes for root-less orders | PASS |
| AC-6 | Alternating fills on `R` and `C`: one partition, commit order, `orderVersion` strictly increasing per order | `OrderExecutionPublicationIntegrationTest#rootAndChildFills_arriveOnOnePartitionInCommitOrder`: 5 fills posted R, C, R, C, R; consumed from earliest on a 3-partition topic (created by `AbstractKafkaPostgresIntegrationTest`): one partition, exec ids in posting order by offset, versions increasing per order. Never observed red (the key from T-8 was already in place; tasks.md Notes) | PASS |
| AC-7 | Redelivered `(orderId, execId, orderVersion)` emitted once; a new `execId` with a higher version passes | oms-streaming-service `KafkaEventStreamProviderTest#orderExecutionRedelivery_isEmittedOnce`: X1@3, X1@3, X2@4 → exactly "X1 3", "X2 4", then nothing for 300 ms. Seen red with the dedup ineffective (both X1 emitted). `#sameExecIdOnTwoOrders_isNotARedelivery`: A/F1@3 and B/F1@3 both emitted and both cached (red before T-15: B dropped). On the real topic, `OrderExecutionPublicationIntegrationTest#relayRedelivery_carriesTheSameDedupKey`: a relay redelivery of the fill's outbox row yields two identical records on one partition, one after deduplicating on `(orderId, execId, orderVersion)` | PASS |
| AC-8 | `EXECUTIONS` and `ALL` blotter streams: fill event `EXECUTION_<execType>` with the order's fields | `TradeBlotterExecutionStreamTest#executionsAndAllStreams_carryOrderFields` (`[1] EXECUTIONS`, `[2] ALL`): real provider and controller; `eventType` `EXECUTION_F`; `order` orderId, symbol, side, account, orderQty, cumQty, leavesQty, state equal the record. Red before T-12 (`order` null) | PASS |

## Goal Assessment

The Goal (roadmap ticket B, review §5 items 1, 5, 6 and findings 15, 16):

- **`OrderExecution` with execution, order context, `orderVersion` and `tradeDate`, on
  `oms_order_executions`, keyed by `rootOrderId`, from the fill's transaction through the outbox.**
  Done (AC-1, AC-2, AC-4): a third outbox row per applied fill, in the same transaction.
- **`rootOrderId` and `orderVersion` on `Execution.avsc` with null defaults.** Done (AC-1, AC-3).
- **Key `oms_orders` and `oms_executions` by `rootOrderId`.** Done (AC-5), with the `orderId`
  fallback, so no existing key value changes until trees exist.
- **Streaming blotter shows fills with their order fields.** Done (AC-8): the streaming service
  reads `oms_order_executions`; fill events carry the order, and stream filters on order fields now
  apply to fills (they used to drop them because `order` was null).
- **Consumer-side Testcontainers test proving ordering and deduplication of the new topic.**
  `OrderExecutionPublicationIntegrationTest` consumes the real topic (Testcontainers Kafka and
  Postgres, 3 partitions). Ordering: one tree's fills on one partition in commit order (AC-6).
  Deduplication: a relay redelivery of a fill's outbox row arrives as an identical record on the
  same partition and collapses to one on `(orderId, execId, orderVersion)`
  (`relayRedelivery_carriesTheSameDedupKey`, added after review round 1). The streaming service's
  dedup on that key is proven at unit level (AC-7), including two orders sharing an `execId`.

Out of scope as agreed: the projection framework (SPEC-0020), trees (SPEC-0022/0023), busts and
corrections, oms-ui, and measuring the fill-path cost. `tradeDate` is the UTC date of
`transactTime`, as confirmed at proposal approval, not the venue-local date.

No material gap between the Goal and what was delivered.

## Policy Review

Reviewed against the diff of the SPEC-0019 files (tasks.md lists them). The working tree also holds
uncommitted work of other tickets (SPEC-0035's order-events endpoint, developer-cockpit work);
those are not judged here.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | `OrderExecution.avsc` and the `Execution.avsc` change are under `oms-contracts/src/main/avro` only |
| P-02 | Specification before code, generated models only | PASS | Schemas changed first (T-2); `msg.OrderExecution` and `msg.Execution` are generated; no hand-written message class |
| P-03 | Never edit generated code | PASS | Generated sources only regenerated |
| P-04 | Contracts evolve compatibly | PASS | All new fields nullable with `null` default; `ExecutionCompatibilityTest` both directions against the pre-change baseline; `OrderExecution-baseline.json` added for future changes; key change keeps per-order ordering and today's key values |
| P-05 | Every state change is recorded in the event log | PASS | No new state change; `orderVersion` is the fill's existing `order_events.version` |
| P-06 | Kafka only through the transactional outbox | PASS | `ORDER_EXECUTION` rows staged by `OrderEventAppender` in the fill's transaction; only `MessagePublisher` (via the relay) sends; `spec check` R04 clean |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database change: `outbox.aggregate_type` is `VARCHAR(32)` without a check constraint, both payload columns existed |
| P-08 | Concurrency and idempotency are explicit | PASS | Producer: `(orderId, execID)` unique, refused duplicates stage nothing (AC-4). Consumer: dedup on `(orderId, execId)` at `orderVersion` (AC-7, fixed in T-15 after review: it was keyed by `execId` alone); a redelivery after cache eviction is emitted again, documented in code and design |
| P-09 | Commands and queries stay separate | PASS | Command path stages messages; no query change |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No transition or pipeline change |
| P-11 | Layering and conventions | PASS | Avro mapping in `oms.mapper` next to the existing mappers; staging stays in `OrderEventAppender`; the root rule lives in the mapper so the mappers do not depend on a service; streaming mapping in `streaming.mapper`; constructor injection |
| P-12 | Jackson 3 only | PASS | No Jackson usage added |
| P-13 | Errors and validation follow the framework specs | N/A | No API error or validation change |
| P-14 | Test first, every AC proven by an automated test | PASS | Every AC has a test above. AC-1, AC-2, AC-3, AC-5, AC-7, AC-8 seen red first; AC-4 is a guard on existing behaviour and AC-6 was written after the key existed (tasks.md Notes) |
| P-15 | Observability | PASS | Publisher logs every type with key, partition, offset; streaming logs skipped duplicates at DEBUG with `orderId`, `execId`, `orderVersion`; relay metrics cover the new rows |
| P-16 | Security | PASS | No new input surface or secret; topic names from configuration / environment |
| P-17 | Simplicity and dependencies | PASS | No new library, table or service; `spec check` reports no warning |
| P-18 | Modules build standalone | PASS | `spec verify` ran oms-contracts, oms-core, oms-streaming-service, oms-mcp-server, oms-exchange-simulator, all exit 0 |
| P-19 | Documentation follows behaviour | PASS | `interfaces/kafka-topics.md`, `interfaces/avro-messages.md`, `domain/outbox-message.md`, `capabilities/event-publication.md`, `capabilities/real-time-streaming.md`, `oms-concepts/booking-integration.md` (§3.2, §12 E1–E3), `oms-concepts/streaming-architecture.md`; `okf-check` 0 errors, 0 warnings |

## Independent Review

**Round 1** (18:30Z), verdict NOT MET: no blocking finding, but a goal gap and two major findings.

1. **[major] Streaming dedup and cache keyed by `execId` alone**, which is unique per order only: a
   fill on order B reusing an `execId` of order A would be dropped as a redelivery. Confirmed.
   Fixed (T-15): keyed by `(orderId, execId)`; `sameExecIdOnTwoOrders_isNotARedelivery` red first.
2. **[major] `OrderExecution-baseline.json` unused**, so nothing guarded the new record. Confirmed.
   Fixed (T-16): `OrderExecutionCompatibilityTest`.
3. **[minor] AC-4's sentinel was on another order**, likely another partition, so it did not bound
   what was read from the refused order's partition. Fixed (T-17): the sentinel is a later fill on
   the same order.
4. **[minor] Blotter fill events replaced the order's `transactTime` with the fill's.** Fixed
   (T-15): `OrderDto.transactTime` left unset on fill events.
5. **[minor] Orders persisted with `rootOrderId` ≠ `orderId` would change key at deployment.** Not
   a code issue; recorded under Follow-ups.
6. **[minor] AC-2's Kafka-fill `tradeDate` check is computed from the record itself.** Accepted:
   the REST fill pins a near-midnight `transactTime`, and `OrderExecutionMessageMapperTest` covers
   the rule and its fallback.
7. **[minor] verification.md was unfilled** at review time. Filled.
- **Goal gap: no consumer-side Testcontainers test of deduplication.** Agreed. Fixed (T-17):
  `relayRedelivery_carriesTheSameDedupKey` on the real topic.

**Round 2** (18:40Z), verdict NOT MET until one documentation fix; every AC PROVEN, round-1
findings 1–4 and the goal gap resolved, 5 and 6 accepted.

1. **[blocking] The written dedup key was still `(execId, orderVersion)`** in the
   `OrderExecution.avsc` doc, five KB pages, a code comment and this file, while the code uses
   `(orderId, execId, orderVersion)`. A booking consumer following the docs would repeat round 1's
   bug. Confirmed. Fixed: all of them now name `(orderId, execId, orderVersion)` and say why; the
   change is recorded in design.md → Alternatives & Decisions. The doc string does not affect Avro
   compatibility (`OrderExecutionCompatibilityTest` passes). The approved proposal keeps its
   wording: AC-7 concerns one order, where both keys agree.
2. **[minor] `relayRedelivery_carriesTheSameDedupKey` rebuilds the row** and does the collapse in
   the test, not in a consumer. Accepted as described in the Goal Assessment: it proves what the
   topic carries; the consumer's drop is proven by the AC-7 unit tests.
3. **[minor] The cache key `orderId + "/" + execId` could collide if an id contains "/".**
   Accepted as theoretical: order ids are generated `ORD-<uuid>`.

The reviewer stated it would call the ticket MET once finding 1 is fixed.

## Automated Evidence

`evidence/last-run.json`, ran 2026-10-31T18:37:30Z, result **pass**, fingerprint
`66e65da39d871bc8`. Policy check: PASS, no errors, no warnings.

| Module | Command | Exit | Log |
|---|---|---|---|
| oms-contracts | `./gradlew check` | 0 (`test` executed: 6 classes, 10 tests, 0 failures) | evidence/oms-contracts-1.log |
| oms-core | `./gradlew check` | 0 (`test` executed: 41 classes, 210 tests, 0 failures, 0 skipped) | evidence/oms-core-1.log |
| oms-streaming-service | `./gradlew check` | 0 (`test` executed: 6 classes, 23 tests, 0 failures) | evidence/oms-streaming-service-1.log |
| oms-mcp-server | `./gradlew check` | 0 | evidence/oms-mcp-server-1.log |
| oms-exchange-simulator | `./gradlew check` | 0 | evidence/oms-exchange-simulator-1.log |

The first verify attempt (18:02Z) failed in oms-core: `EventSourcingIntegrationTest` still
expected the outbox rows of a fill before this change (fixed, 5→7 and 3→4), and SPEC-0035, running
in another session in the same working tree, had its red-first `OrderEventQueryIntegrationTest`
in place. The ticket was blocked until SPEC-0035 finished, then verified again (18:21Z, pass).
After review round 1, implement was reopened for T-15 to T-17 and verified a third time (18:32Z);
after round 2's documentation fix, a fourth time (18:37Z), all modules executing their tests.

## Follow-ups

- oms-ui: render the order fields that blotter fill events now carry, if the blotter does not
  already show `order` on execution rows.
- Measure the fill-path cost of the third outbox row and send with the load harness (SPEC-0024).
- A venue-local `tradeDate` (FIX 75) needs a venue time-zone table; today it is the UTC date.
- Settlement date is still not published (booking paper §3.2).
- Review finding 5: an order persisted before this change with a `rootOrderId` other than its
  own id would change key mid-life at deployment, so its records before and after could sit on
  different partitions. Check environments for `root_order_id <> order_id` before deploying; none
  is created by today's flows except an explicit `rootOrderId` in the create command.
- `oms-core/docs/architecture-review-2026-10-30.md` §5 item 6 still names `(execId, orderVersion)`
  as the booking dedup key; correct it to `(orderId, execId, orderVersion)` when the review is next
  revised (it is source material for this ticket, not changed here).

## Verdict

Verdict: GOAL MET

All eight ACs pass with tests that ran in the final verify run, every blocking and major review
finding is fixed (round 1: the per-order dedup key, the unguarded baseline, the dedup goal gap;
round 2: the documented dedup key), and the Goal assessment has no material gap.
