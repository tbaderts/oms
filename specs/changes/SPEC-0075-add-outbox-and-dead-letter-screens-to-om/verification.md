# Verification — SPEC-0075: Add outbox and dead-letter screens to oms-ui

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests below ran and passed in the latest `spec verify`, which runs `check` in oms-contracts,
oms-core and the contract consumers, and `npm test` plus `check` in oms-ui (see Automated Evidence).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Summary: pending, stuck, held and the oldest pending age; stuck equals `oms.outbox.stuck`, the age agrees with `oms.outbox.oldest.age`; the tab shows the four | `OutboxInspectorIntegrationTest#summaryCountsStatesAndMatchesTheGauges` (committed stuck and held rows; stuck equals the gauge; age within 2 s of the gauge and about 3600 s; pending counted inside a rolled-back transaction), `#summaryOfAnEmptyOutbox`; `AdminControllerWebMvcTest#outboxSummary`; `OutboxView.test.tsx` "shows the summary…" | PASS |
| AC-2 | STUCK, HELD and PENDING like the relay, with every field | `OutboxInspectorIntegrationTest#derivesStuckHeldAndPendingLikeTheRelay` (the stuck row; a later row of the same topic and key HELD; another key PENDING; the same key on another topic PENDING; fields checked); `AdminControllerWebMvcTest#outboxMessagesByStateWithPageMetadata`; `OutboxView.test.tsx` "lists messages…", "shows the execution and the message type…" | PASS |
| AC-3 | State filter, oldest first, paged (size at most 200), with the total; the tab's filter does the same | `OutboxInspectorIntegrationTest#filtersByStateOldestFirstAndPages`; `AdminControllerWebMvcTest#rejectsInvalidStatePageOrSize` (an unknown state, a negative page, size 201 → 400); `OutboxView.test.tsx` "filters by state", "pages through the messages" | PASS |
| AC-4 | Empty outbox: everything published, counts 0 | `OutboxView.test.tsx` "says that an empty outbox has published everything"; `OutboxInspectorIntegrationTest#summaryOfAnEmptyOutbox` | PASS |
| AC-5 | Detail: every field; a payload as a JSON tree; a pointer message shows its target | `OutboxInspectorIntegrationTest#detailDecodesAPayloadAndShowsAPointer` (a PROJECTION row decoded through `AvroJson`; a pointer row's order and version), `#unknownIdIsEmpty`; `AdminControllerWebMvcTest#outboxMessageWithPayload`, `#unknownOutboxMessageIs404`; `OutboxView.test.tsx` "opens a message with its payload…", "shows what a pointer message points to", "says so when a message was published meanwhile", "shows the message opened last…"; `AvroJsonTest` (logical types to JSON) | PASS |
| AC-6 | Every `.DLT` topic with its record count; the tab lists them | `DeadLetterReaderIntegrationTest#listsDeadLetterTopicsWithCounts` (the world's DLT holds exactly the 3 records produced; only `.DLT` topics; the command topic absent); `AdminControllerWebMvcTest#deadLetterTopicsAndRecords`; `DeadLetterView.test.tsx` "lists the dead-letter topics with their counts" | PASS |
| AC-7 | A dead-lettered command returned newest first, with partition, offset, time, key, the original topic, partition and offset, the exception class and message, and the payload as JSON (Avro) or text or hex; at most `limit` | `DeadLetterReaderIntegrationTest#readsRecordsWithFailureDetailsAndDecodedPayload` (the real listener dead-letters an unknown Avro type, text and bytes; AVRO, TEXT and BINARY newest first; key; the original topic; original partition@offset equal to where each was produced; the exception class from the headers; the decoded payload; hex; limit 2); `DeadLetterReaderTest` (`decodesSpringsDeadLetterHeaders`, `anEmptyValueIsEmpty`, `anUndecodableAvroValueFallsBackToHexWithTheReason`); `DeadLetterView.test.tsx` "shows the first topic's latest records…", "opens a record with its decoded payload and headers", "shows a text payload as text" | PASS |
| AC-8 | Reading twice gives the same records, and no consumer group offset is committed | `DeadLetterReaderIntegrationTest#readingTwiceIsIdempotentAndCommitsNothing` (the same partition@offset lists; `Admin.listGroups()` unchanged); the reader's consumer has no `group.id`, auto-commit off, and assign and seek only | PASS |
| AC-9 | Broker unreachable: 503 within 10 s with a problem body; the tab shows the error with Retry; the Outbox tab keeps working | `DeadLetterReaderTest#unreachableBrokerFailsWithinTheBound` (preemptive 10 s per call, about 8 s each), `#decodingStopsWhenTheRequestsTimeIsSpent`, `#theRegistryClientIsBounded`, `#disabledKafkaIsUnavailable`; `AdminControllerWebMvcTest#kafkaUnavailableIs503Problem` (503 `application/problem+json` with the cause); `DeadLetterView.test.tsx` "shows an error with retry…"; `App.operations.test.tsx` "keeps the Outbox tab working while the dead letters fail" | PASS |
| AC-10 | No topic or no records: an empty state, not an empty table | `DeadLetterView.test.tsx` "shows an empty state without dead-letter topics", "reads another topic when selected" ("No records on other.DLT") | PASS |
| AC-11 | The KB describes it: the outbox page, FR-024, dead letters, the oms-ui spec and the API reference | `domain/model/outbox-message.md`, `capabilities/functional-requirements/FR-024-retry-failed-publication.md`, `capabilities/event-publication.md`, `architecture/patterns/kafka-messaging.md` (dead letters: the better page than `event-streaming.md`, see design), `ui/admin-ui.md` §9, `domain/interfaces/query-api.md` (Operations); `okf-check` 0 errors | PASS |

## Goal Assessment

The goal: tabs in oms-ui to help manage the platform.
- **The outbox:** see the state of its messages, and whether any are pending or blocked.
- **Dead-letter topics:** a screen to look at them.
- **Resending:** left open by the requester, as now or a follow-up.

What is built against each part:
- **The Outbox tab.** It shows every waiting message's state: pending, stuck, or held (the goal's
  "blocked": waiting behind a stuck message). It shows the counts and the oldest waiting age, and
  the message detail. The states are derived with the relay's own predicates, so the tab and the
  relay never disagree.
- **The Dead letters tab.** It lists every `.DLT` topic and shows the latest records. Each record
  has the failure (exception, original position) and its value decoded, all read without consuming
  anything.
- **Resending, and replaying or removing stuck messages:** deferred to a follow-up ticket, as
  resolved in the approved proposal (Open Questions). Both tabs are read-only.

No material gap remains. The requester raised the open part themselves and decided it at the
proposal gate.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | Paths and schemas only in `oms-contracts/src/main/openapi/oms-query-api.yml` |
| P-02 | Specification before code, generated models only | PASS | Contract first (T-1), and the reviewer confirmed it predates the code. DTOs and `AdminApi` are generated; oms-ui types mirror them by convention |
| P-03 | Never edit generated code | PASS | Regenerated only |
| P-04 | Contracts evolve compatibly | PASS | Additive: new tag, paths and schemas; 2.6.0 → 2.7.0; the consumers' `check` passes |
| P-05 | Every state change is recorded in the event log | N/A | Read-only |
| P-06 | Kafka only through the transactional outbox | N/A | Nothing published |
| P-07 | Schema changes through new Liquibase changesets | N/A | No schema change |
| P-08 | Concurrency and idempotency are explicit | PASS | Lock-free reads, so the relay's claims never wait on them. A message published between reads answers 404. DLT reads are idempotent with no group commit (AC-8). Stale UI answers are dropped |
| P-09 | Commands and queries stay separate | PASS | Query API only |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No transition |
| P-11 | Layering and conventions | PASS | Controller → `OutboxInspector` and `DeadLetterReader` → JDBC, repository and Kafka clients; MapStruct `AdminDtoMapper`; package `org.example.oms.admin`; SPEC-0058 style rules pass |
| P-12 | Jackson 3 only | PASS | `tools.jackson` only (`AvroJson`, `DeadLetterReader`) |
| P-13 | Errors and validation follow the framework specs | PASS | `ProblemDetail` for 400 (validation), 404 (`AdminNotFoundException`, scoped to the operator API after review) and 503 (`DeadLetterUnavailableException`) |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Each slice red first (tasks); AC-1 to AC-10 have automated tests, AC-11 is reviewed. Gaps the review named were covered (finding 5) |
| P-15 | Observability | PASS | MVC request metrics and traces cover the endpoints. Kafka failures are logged at WARN with the topic. The screens complement the outbox gauges, and the pending-count difference is documented |
| P-16 | Security | PASS | Only `*.DLT` topics can be read (contract `@Pattern`, controller and reader); an unknown topic is 404. No secrets, read-only. Values render as text nodes. No entitlements exist (proposal) |
| P-17 | Simplicity and dependencies | PASS | No new dependency; one `AvroJson` helper |
| P-18 | Modules build standalone | PASS | `spec verify` ran oms-contracts, oms-core, oms-streaming-service, oms-mcp-server, oms-exchange-simulator and oms-ui |
| P-19 | Documentation follows behaviour | PASS | KB pages under AC-11, kept in step with the review fixes |

## Independent Review

**spec-reviewer, verdict MET.** Every AC was proven, with no blocking issues. Its findings and how
each was resolved:

1. **[major] Schema-registry decoding was unbounded.** Fixed in two ways:
   - the deserializer has 2 s connect and read timeouts;
   - once the request's 8 s deadline has passed, values are no longer decoded but shown as hex with
     the reason.

   Tests: `DeadLetterReaderTest#theRegistryClientIsBounded` and
   `#decodingStopsWhenTheRequestsTimeIsSpent`.
2. **[minor] A global `NoSuchElementException` → 404 handler** would hide bugs elsewhere. Fixed: a
   dedicated `AdminNotFoundException`, thrown only by the operator API.
3. **[minor] The reader ignores the Spring Kafka properties** other than the bootstrap servers.
   Deferred: harmless while the stack has no Kafka security, and recorded in the design and
   Follow-ups.
4. **[minor] The tab's "pending" differs from the `oms.outbox.pending` gauge,** which counts all
   rows. Documented in the tab's help text, `outbox-message.md` and `query-api.md`.
5. **[minor] Untested branches:** empty values, failed Avro falling back to hex, odd headers, exact
   original offsets and the exception class. Added: four `DeadLetterReaderTest` cases, and exact
   offsets and the exception class in `DeadLetterReaderIntegrationTest`.

   The outbox detail's payload-decode-failure branch is still covered only by its code path. It
   needs a corrupted payload row, so it is accepted as low risk.
6. **[minor] A message published between the inspector's two reads** was shown as a pointer. Fixed:
   it now answers 404 ("published meanwhile").
7. **[minor] The Outbox table had no Exec column,** and Type showed the aggregate type. Fixed: an
   Exec column, and Type shows the message type with the aggregate type in its title. Tested.
8. **[minor] No stale-response guard on the detail.** Fixed and tested ("shows the message opened
   last…").
9. **[minor] `OutboxMessageDetailDto` is flat rather than `allOf`.** Recorded in the design: the
   generator handles `allOf` awkwardly with `@SuperBuilder`.
10. **[process] verification.md was unfilled.** Done (this document).

## Automated Evidence

`evidence/last-run.json`, run at 2026-11-25T10:28:06Z after `./gradlew cleanTest` and after the last code
change, so every test ran:
- **Result:** `pass`, fingerprint `2a36fd02b868d8d9`.
- **Policy check:** 0 errors, 0 warnings.
- **Module checks,** all exit 0:
  - `oms-contracts` `check`;
  - `oms-core` `check` (497 s): 752 tests, 0 failures, 0 errors, 1 skipped (`LoadSuiteRunnerTest`,
    which runs only with `OMS_LOAD_SUITE=true`);
  - the contract consumers: `oms-streaming-service`, `oms-mcp-server` and `oms-exchange-simulator`
    `check`;
  - `oms-ui` `npm test`: 44 suites, 345 tests; `oms-ui` `gradlew check`.
- **Logs:** `evidence/<module>-1.log`, and `evidence/oms-ui-2.log` for the oms-ui Gradle check.
- **Also run:** `tsc --noEmit` on oms-ui (with `--ignoreDeprecations 6.0`, the SPEC-0074 follow-up)
  exits 0, and `okf-check` reports 0 errors.

## Follow-ups

- **Resending dead-letter records, and replaying or removing stuck outbox messages,** as one
  write-capable operator ticket. It needs aggregate-order rules, and idempotency for commands that
  may since have been applied.
- **Build the reader's Kafka clients from the full Spring Kafka properties** (security,
  TLS/SASL) once the stack uses them (review finding 3).
- **A test with a corrupted outbox payload,** for the detail's `payloadError` branch.
- **Commit SPEC-0074 together with or before this ticket:** both tabs use its `JsonTree` and the
  shared formatting.

## Verdict

Verdict: GOAL MET

Every acceptance criterion passes with tests that check its then-clause, every policy is reviewed,
and the independent review's findings are fixed or recorded as follow-ups. Operators now see the
outbox's pending, stuck and held messages and the dead-letter topics' records in oms-ui, read-only,
with resending left to the agreed follow-up.
