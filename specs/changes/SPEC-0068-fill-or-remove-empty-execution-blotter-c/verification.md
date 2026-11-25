# Verification — SPEC-0068: Fill or remove empty execution blotter columns

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

Test results were checked in `build/test-results/test/TEST-*.xml` from the 2026-11-24 verify run:
0 failures, 0 skipped.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Metamodel offers exactly the 11 execution report fields, in order; none of the 11 removed | `MetamodelServiceTest#executionMetamodelOffersExecutionReportFieldsOnly` (exact ordered list, each removed name absent, `status` keeps enum values); `ExecutionBlotterIntegrationTest#metamodelEndpointServesExecIdPrimaryKey` (same exact list over HTTP) (evidence/oms-core-1.log) | PASS |
| AC-2 | `defaultColumns` is the 10-column list with `lastMkt`; every default is offered | `MetamodelServiceTest#executionMetamodelUsesExecIdAndResolvableDefaults`; `ExecutionBlotterIntegrationTest#metamodelEndpointServesExecIdPrimaryKey` (exact list over HTTP, defaults ⊆ fields) (evidence/oms-core-1.log) | PASS |
| AC-3 | Fills applied through the command API have every offered field and default column filled on `/api/executions` | `ExecutionBlotterIntegrationTest#executionReportFieldsAreFilled`: two fills over `/api/command/execute`; offered fields read from the live metamodel endpoint; `hasNonNull` on every field of both rows (evidence/oms-core-1.log) | PASS |
| AC-4 | Streaming `ExecutionDto` carries every default; streaming copy matches oms-core's | `OrderExecutionMapperTest#executionDtoCarriesAllBlotterDefaultColumns`: the 10-column copy (with `lastMkt`) is non-null on the serialized DTO (evidence/oms-streaming-service-1.log). The copy is identical to oms-core's `EXECUTION_DEFAULT_COLUMNS` by inspection; it is a hand-kept duplicate per design D3 (see review finding 1) | PASS |
| AC-5 | A saved removed field is skipped without error; the others show | `ColumnConfigService.test.ts` "skips a saved column that is no longer offered": `getColumnConfig('Execution', ['dayAvgPx','lastQty'])` does not throw and returns only `lastQty` (evidence/oms-ui-1.log, 230/230 passed) | PASS |
| AC-6 | All module checks pass; okf-check 0 errors | evidence/last-run.json: oms-core, oms-streaming-service, oms-ui (npm test, gradle check) all exit 0, policy check PASS. `node tools/okf-check/okf-check.mjs oms-knowledge-base` on 2026-11-24 after the KB edits: `205 concepts, 0 error(s), 36 warning(s)`, none of the warnings on `ui/admin-ui.md` or `log.md` (all pre-existing OMS-DRIFT/AGE items). The reviewer re-ran it independently with the same result | PASS |

## Goal Assessment

The goal is "fix the empty execution columns". The requester clarified (2026-11-17) that executions
should show execution report content (last/avg price, last qty, cum/leaves qty) and no order fields.
The execution blotter now offers only the FIX ExecutionReport fields the OMS records, plus `status`,
and AC-3 proves each of them has a value on real fills. `lastMkt`, which is always filled, became a
default column. The never-filled fields are no longer offered instead of being filled. That was the
approach agreed in the proposal's resolved questions. The requester would see no empty execution
columns, so the goal is met in spirit.

Deliberately left out (proposal, Out of scope): computing the day-order fields, making the simulator
send `LastCapacity`, and busts and corrections (SPEC-0030). `lastMkt` is filled because the simulator
sends it. A venue that omits LastMkt would leave that default column empty, which is acceptable
while the simulator is the only venue.

## Policy Review

The review is against the diff of the ticket's files (MetamodelService.java and the four test files
plus two KB pages). Other uncommitted changes in the tree belong to other tickets.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contract files touched |
| P-02 | Specification before code, generated models only | PASS | Proposal and design approved first; metamodel DTOs are existing hand-written oms-core types |
| P-03 | Never edit generated code | PASS | No generated files changed |
| P-04 | Contracts evolve compatibly | PASS | Metamodel response shape unchanged, only content; `/api/executions` and streaming payloads unchanged; the only consumer (oms-ui) skips unknown saved names (AC-5) |
| P-05 | Every state change is recorded in the event log | N/A | No state changes |
| P-06 | Kafka only through the transactional outbox | N/A | No messages |
| P-07 | Schema changes through new Liquibase changesets | N/A | No schema change |
| P-08 | Concurrency and idempotency are explicit | N/A | Static metadata built at startup |
| P-09 | Commands and queries stay separate | N/A | Neither API changes |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No transitions |
| P-11 | Layering and conventions | PASS | Change stays in `MetamodelService`, the existing home of blotter metadata |
| P-12 | Jackson 3 only | PASS | Tests use the existing `tools.jackson` `JsonNode`; no new mapping code |
| P-13 | Errors and validation follow the framework specs | PASS | A misconfigured field name is logged at error and skipped; the unit test's exact-list assertion catches it |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | AC-1 to AC-6 each have an automated check (table above) |
| P-15 | Observability | N/A | No runtime behaviour beyond the existing error log |
| P-16 | Security | N/A | No new input or exposure; fewer fields exposed in metadata |
| P-17 | Simplicity and dependencies | PASS | Two list constants; no dependencies |
| P-18 | Modules build standalone | PASS | Each module's tests hold their own expectations; each module's check passed standalone |
| P-19 | Documentation follows behaviour | PASS | `ui/admin-ui.md` "Executions columns" and `log.md` updated; no other current KB page claims `id` is selectable |

## Independent Review

spec-reviewer verdict: **MET**. All ACs proven, AC-4 rated "weak" for the list duplication, no
policy issues, no material goal gap. Findings (all minor):

1. **Streaming default-list copy is not compared automatically with oms-core's.** Accepted: this is
   design decision D3 (no shared constant for a display concern), as SPEC-0041 established. The two
   lists are identical today. Filed under Follow-ups as a cheap guard if wanted.
2. **The streaming service's own `/trade-blotter/metadata/executions` still lists `lastCapacity` and
   `creationDate`.** oms-ui does not call that endpoint (the reviewer found no non-test use), so the
   blotter is unaffected. It is out of the ticket's scope, so it goes under Follow-ups.
3. **In Live mode, a saved removed field that is not streamed (e.g. `dayAvgPx`) appears by raw name in
   the "History only" note** and stays in the saved layout. AC-5 holds, because no column is built and
   nothing throws, but the name still shows. A UI code change was out of the design (D4), so it goes
   under Follow-ups.
4. **The okf-check result is not in `last-run.json`.** Fixed by citing the run output under AC-6 above,
   confirmed by the reviewer's own run.
5. **verification.md was unfilled.** Fixed by this document.

## Automated Evidence

`evidence/last-run.json`, ran at 2026-11-24T05:13:26Z, result `pass`, fingerprint `573cc16f81ae2a16`.
Modules: oms-core, oms-streaming-service, oms-ui, oms-knowledge-base. The policy check (changes since
merge-base 10d8dc46) passed with no errors or warnings.

| Module | Command | Exit | Time |
|---|---|---|---|
| oms-core | `./gradlew check` | 0 | 548 s |
| oms-streaming-service | `./gradlew check` | 0 | 27 s |
| oms-ui | `npm test -- --watchAll=false --passWithNoTests` | 0 | 32 s |
| oms-ui | `../gradlew -p .. check` | 0 | 61 s |

The okf-check run is cited under AC-6.

## Follow-ups

- Live mode: drop saved column names that the metamodel no longer offers from the "History only" note
  and the saved layout (`streamedFields.ts` `splitColumns` / `mergeLiveSelection`).
- Align the streaming service's `/trade-blotter/metadata/executions` with the oms-core execution
  metamodel, or remove it if it is unused.
- Optional: a shared fixture or check so that the oms-core and streaming default-column copies cannot
  drift apart.
- Optional: make the exchange simulator send `LastCapacity` (FIX 29) and add it back to
  `EXECUTION_FIELDS`.

## Verdict

Verdict: GOAL MET
