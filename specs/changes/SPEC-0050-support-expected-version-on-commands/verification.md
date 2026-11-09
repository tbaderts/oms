# Verification — SPEC-0050: Support expected version on commands

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

Every test below ran and passed in the latest `spec verify` (`evidence/oms-core-1.log`,
`evidence/oms-contracts-1.log`), with no failure or skip.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | A command naming the current version applies and reports the version it produced | `ExpectedVersionIntegrationTest#matchingVersionApplies`: a REST fill with `expectedVersion` N gives 201 and `eventVersion` N + 1; a cancel request with N + 1 gives 200 and N + 2, equal to the last event's version | PASS |
| AC-2 | A stale version over REST: 400 naming both, nothing changed, REFUSED in the command log | `ExpectedVersionIntegrationTest#staleVersionIsRefusedOverRest`: a fill with N − 1 gets 400 FAILED with "Expected version N−1 … at version N" and no `eventVersion`; order version, events and executions are unchanged; exactly one REFUSED command-log row names both. A cancel request (a lifecycle command) with N − 1 is refused the same way and changes nothing. `CheckExpectedVersionTaskTest` (5) covers no version, equal, unequal, a create, and the task's place after deduplication | PASS |
| AC-3 | A stale version over Kafka: refused, counted, not dead-lettered; the current version applies | `ExpectedVersionIntegrationTest#staleVersionIsRefusedOverKafka`: the header's `expectedVersion` N − 1 is refused; `oms.commands.consumed{outcome=refused}` rises by exactly 1 (no retry); nothing on `commands-expected.DLT`; REFUSED naming both. The same fill with N applies. `CommandHeaderMapperTest` copies the header field | PASS |
| AC-4 | Without an expected version, commands behave as before | `ExpectedVersionIntegrationTest#noExpectedVersionAppliesAsBefore`: a fill without the field applies to an order at version 5. The whole existing suite passes (648 tests in oms-core), including `CommandControllerWebMvcTest` (17) and `OrderLifecycleCommandProcessorTest` (59) | PASS |
| AC-5 | A resent applied command is a duplicate, not a version mismatch | `ExpectedVersionIntegrationTest#aDuplicateIsReportedAsADuplicate`: a cancel request with commandId C and the current version applies; sending it again gives 409 `urn:oms:error:duplicate-command` | PASS |
| AC-6 | A create expects no version | `ExpectedVersionIntegrationTest#createExpectsNoVersion`: no field and 0 both create with `eventVersion` 1; 3 gives 400 naming 3 and 0, and no order with that `clOrdId` exists | PASS |
| AC-7 | Contracts: optional int64 fields, compatible Avro header, simulator unaffected, read-your-writes documented | `CommandBaseContractTest#expectedVersionAndEventVersionAreOptionalInt64` and `#versionIs340`; `CommandSchemaTest#headerFieldsAsSpecified`; `CommandCompatibilityTest` (13 records, `CommandHeader` embedded in each) compatible with the released baselines; oms-exchange-simulator `check` passed (39 s) without code change; the `OrderDto.eventVersion` description contains the read-your-writes rule (asserted by the same contract test) | PASS |

## Goal Assessment

The goal asks for four things, and each is delivered:
- **Expected version on commands.** An optional `expectedVersion` on the OpenAPI `Command` base and
  on the Avro `CommandHeader` with a null default (AC-7).
- **Refusal on mismatch.** A command whose expected version differs from the order's `txNr` is
  refused as a refusal, not a conflict: 400, acknowledged on Kafka, REFUSED in the command log
  (AC-2, AC-3). Duplicates are still reported as such (AC-5), and commands without the field are
  unchanged (AC-4).
- **The produced version.** It is in `CommandResult` as an additive `eventVersion` (AC-1, AC-6).
- **Read-your-writes, documented.** The query contract states it on `OrderDto.eventVersion`, and
  the knowledge base repeats it (AC-7).

Gaps a requester should know:
- **The Avro `CommandResult` is unchanged.** Nothing produces it, as the proposal decided.
- **No producer sets the field yet.** oms-ui and the exchange simulator do not set
  `expectedVersion`, which is out of scope.
- **Fill refusal wording.** REST answers for every refused fill now append their reason ("Execution
  processing failed: …"), not only for version refusals. That is more informative, and no client
  test pinned the old text.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | All contract changes are in oms-contracts |
| P-02 | Specification before code, generated models only | PASS | Spec first (T-1), then regenerated |
| P-03 | Never edit generated code | PASS | Regenerated only; see the stale-generation note below |
| P-04 | Contracts evolve compatibly | PASS | Optional fields; Avro default null; `CommandCompatibilityTest` passes; oms-cmd-api 3.4.0 and oms-query-api 2.5.0 |
| P-05 | Every state change is recorded in the event log | PASS | A refused command writes nothing (AC-2) |
| P-06 | Kafka only through the transactional outbox | PASS | No publishing change |
| P-07 | Schema changes through new Liquibase changesets | N/A | No schema change |
| P-08 | Concurrency and idempotency are explicit | PASS | The check runs under the row lock, after deduplication (order 75 then 80) |
| P-09 | Commands and queries stay separate | PASS | The query side gains documentation only |
| P-10 | State transitions go through the state machine and task pipeline | PASS | A pipeline task, before every state-changing task |
| P-11 | Layering and conventions | PASS | `CheckExpectedVersionTask` in `service.command.tasks`, a `@Component` like the others |
| P-12 | Jackson 3 only | N/A | No JSON code |
| P-13 | Errors and validation follow the framework specs | PASS | 400 FAILED `CommandResult` for the refusal; 409 Problem+JSON kept for duplicates |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | The contract test, the mapper test and the four new integration cases were run red first |
| P-15 | Observability | PASS | Refusals logged at WARN, counted, and in the command log with both versions |
| P-16 | Security | PASS | No secrets; nothing new exposed |
| P-17 | Simplicity and dependencies | PASS | One task, one mapper line, one controller line; no library |
| P-18 | Modules build standalone | PASS | oms-contracts and its four consumers ran `check` |
| P-19 | Documentation follows behaviour | PASS | command-api, query-api and avro-messages updated |

## Independent Review

The spec-reviewer agent returned **MET**, with no blocking or major finding. It rated AC-1, AC-3,
AC-4, AC-6 and AC-7 proven, and AC-2 and AC-5 weakly proven. Implement was reopened for its minor
findings (T-6), and verification was run again after the fixes.

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | minor | No test refused a lifecycle command on a stale version; no unit test of the task or its order | Fixed: a stale cancel request is refused in `staleVersionIsRefusedOverRest`, and `CheckExpectedVersionTaskTest` covers the cases and the order (80, after 75) |
| 2 | minor | AC-2's "one REFUSED row" was checked with `getLast()` | Fixed: the test counts REFUSED rows and requires 1 |
| 3 | minor | The REST message of every refused fill now appends its reason; on the fallback it would read "Execution processing failed: Execution processing failed" | Fixed the doubling. The added reason is kept on purpose (it tells any client why), recorded in Goal Assessment and tasks.md, and no in-repo client matches the old text |
| 4 | minor | "The order is new" was chosen by version 0, not by command type | Fixed: chosen for `OrderCreateCmd` only |
| 5 | minor | The stale embedded-schema problem after an incremental oms-contracts build was only a note | Listed under Follow-ups |
| 6 | process | verification.md was a template | It was being written during the review; it is complete now |

The reviewer also confirmed that AC-5's Kafka half is safe by construction. Deduplication (75)
runs before the version check (80) in both pipelines, which sort their tasks by order; the REST
half is tested.

## Automated Evidence

`spec verify SPEC-0050` ran at 2026-11-08T21:58:58Z with result **pass** (fingerprint
`3c7921f3a06e4c19`), after the review fixes (T-6).

| Module | Command | Exit | Time | Log |
|---|---|---|---|---|
| oms-contracts | `./gradlew check` | 0 | 2 s | `evidence/oms-contracts-1.log` |
| oms-core | `./gradlew check` | 0 | 466 s | `evidence/oms-core-1.log` |
| oms-streaming-service | `./gradlew check` | 0 | 4 s | `evidence/oms-streaming-service-1.log` |
| oms-mcp-server | `./gradlew check` | 0 | 3 s | `evidence/oms-mcp-server-1.log` |
| oms-exchange-simulator | `./gradlew check` | 0 | 3 s | `evidence/oms-exchange-simulator-1.log` |

- **oms-core tests.** 653 tests in 109 classes, none failed. One is skipped: the load suite,
  which runs only with `OMS_LOAD_SUITE=true`.
- **Policy check.** No errors or warnings.
- **Consumer modules.** They were up to date in this run: the contracts did not change after the
  first run (18:24Z), where all four built and passed against them (25 s, 19 s, 39 s).
- **Other sessions.** They paused their edits and builds in these modules for the run.

## Follow-ups

- **Stale embedded schemas.** An incremental oms-contracts build regenerated `CommandHeader`, but
  not the command records that embed it. Kafka commands were then serialized without the new
  field until a clean build. Make the Avro generation rebuild every schema when one changes, or
  document that schema changes need `./gradlew clean build` in oms-contracts.
- **Producers.** Send `expectedVersion` from oms-ui's command actions, so a trader acting on a stale
  row is told.

## Verdict

Verdict: GOAL MET
