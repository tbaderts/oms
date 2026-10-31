# Verification — SPEC-0034: Require sessionId in the order create contract

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

The final `spec verify` (after T-11 changed the contract) executed oms-core's tests: 37 classes,
191 tests, 0 failures, 0 skipped (the parameterised
`orderCreate_withoutSessionId_returns400ValidationFailed` reports as `[1]` missing and `[2]` `""`).
Each oms-core method below is in `oms-core/build/test-results/test/TEST-*.xml` with no `<failure>`
or `<skipped>`. The cockpit tests executed in the same run (`evidence/developer-cockpit-2.log`:
79 files, 484 passed, 2 skipped;
the two skips are symlink cases in `storyboardAssets.test.ts` and `StoryboardService.scan.test.ts`
that need file symlinks, unrelated to this ticket).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | `Order.required` has `sessionId`, `minLength: 1`, `info.version` 2.0.0 | `developer-cockpit/test/main/ApiCatalogService.test.ts` › `requires a non-empty sessionId on Order (SPEC-0034)` reads the real `oms-cmd-api.yml` and asserts all three (file passed, 6/6, developer-cockpit-2.log). Red before T-2 | PASS |
| AC-2 | Bean Validation flags a missing and an empty `order.sessionId` | `CommandModelValidationTest#orderCreateCmd_requiresSessionId`, `#orderCreateCmd_rejectsEmptySessionId` on the regenerated `cmd.OrderCreateCmd`. Red before T-2 | PASS |
| AC-3 | REST create without / with empty `sessionId` → 400 naming `sessionId`, nothing persisted | `CommandControllerWebMvcTest#orderCreate_withoutSessionId_returns400ValidationFailed` (missing and `""`): 400, `type` `urn:oms:error:validation-failed`, `errors['order.sessionId']`, processor never called. `OrderLifecycleIntegrationTest#orderCreateWithoutSessionId_isRejectedAndPersistsNothing` (Postgres): `orders`, `order_events`, outbox counts unchanged | PASS |
| AC-4 | Valid create → 201, status OK | `CommandControllerWebMvcTest#executeCommand_withOrderCreateCmd_returnsCreated` (body now carries `sessionId`) | PASS |
| AC-5 | Kafka create with null `sessionId` rejected as today; Avro and baselines unchanged | `CommandListenerTest#consume_rejectedOrderCreate_isAcknowledgedNotThrown` (the listener acknowledges a rejected create); `ValidateOrderTaskTest#execute_whenSessionIdMissing_returnsFailedValidation` (the task rejects it); no persistence follows from the pipeline order, validate before persist (`OrderCreateCommandProcessor`), as the design's test strategy states. `git diff --stat oms-contracts/src/main/avro oms-contracts/src/test/resources/compat` is empty; oms-contracts `check` (schema compatibility tests) exit 0. This is unchanged pre-existing behaviour, proven at unit level rather than end to end (review finding 5) | PASS |
| AC-6 | Cockpit starter body has `order.sessionId`; the check reports it missing | `developer-cockpit/test/renderer/api-schema.test.ts` › `OrderCreateCmd template carries sessionId and the check flags it missing (SPEC-0034)` (file passed, 11/11) | PASS |
| AC-7 | No bundled `OrderCreateCmd` example misses `order.sessionId` | `api-templates.test.ts` › starter templates pass the check (contract now enforces `sessionId`) and `oms-core rest.http create examples pass the contract check (SPEC-0034)` (file passed, 8/8); `CommandControllerWebMvcTest#swaggerOrderCreateExample_isAccepted` posts the `@ExampleObject` value → 201; `oms-cmd-api.yml request examples pass the contract check (SPEC-0034)` checks the contract's own request example (T-11, red before: no `sessionId`, non-Order fields) | PASS |

## Goal Assessment

The Goal: oms-core requires `order.sessionId` for `OrderCreateCmd`, but `oms-cmd-api.yml` did not
list it as required; mark it required and fix whatever breaks.

- The contract now requires it, with `minLength: 1`, and the version is bumped to `2.0.0` because
  the narrowing is breaking for clients that omitted it (AC-1).
- The generated model enforces it (AC-2), so HTTP requests without it now fail at the API boundary
  with the framework's `validation-failed` ProblemDetail naming the field, instead of reaching
  `ValidateOrderTask` (AC-3). Building that handler closed a gap: `error-handling.md` described it,
  but oms-core returned Spring's generic body.
- Kafka behaviour is unchanged (AC-5): Avro still allows a null `sessionId`, and
  `ValidateOrderTask` rejects it as before. That asymmetry is intentional and documented in FR-002.
- What broke was fixed: the WebMvc create test, the cockpit fixture (`ApiExplorer.templates.test.tsx`,
  see tasks.md Notes) and the bundled examples, now pinned by tests (AC-7), including the contract's
  own request example, which the review found and T-11 fixed.

No material gap between the Goal and what was delivered.

## Policy Review

Reviewed against `git diff` of the SPEC-0034 files (tasks.md lists them). The working tree also
holds uncommitted work of other tickets (SPEC-0018, done; SPEC-0031/0032's observability files and
`docker-compose.yml`; developer-cockpit dashboard work). Those are not judged here.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | The only contract edit is `oms-contracts/src/main/openapi/oms-cmd-api.yml` |
| P-02 | Specification before code, generated models only | PASS | Contract changed first (T-2), model regenerated; tests use the generated `cmd.OrderCreateCmd` |
| P-03 | Never edit generated code | PASS | `build/generated` regenerated by Gradle only |
| P-04 | Contracts evolve compatibly | PASS | Breaking narrowing declared in the proposal, versioned `2.0.0`, consumers (cockpit, Swagger examples, `rest.http`) updated and pinned by tests; Avro and compatibility baselines unchanged |
| P-05 | Every state change is recorded in the event log | N/A | No state change; a rejected create changes nothing (AC-3 asserts it) |
| P-06 | Kafka only through the transactional outbox | N/A | No message produced or changed; outbox count asserted unchanged |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database change |
| P-08 | Concurrency and idempotency are explicit | N/A | Duplicate key `(sessionId, clOrdId)` and `txNr` untouched; the contract now guarantees the key's first half |
| P-09 | Commands and queries stay separate | PASS | Only the command contract and command path changed |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No transitions; `ValidateOrderTask` unchanged |
| P-11 | Layering and conventions | PASS | Error mapping stays in `GlobalExceptionHandler` (override of `handleMethodArgumentNotValid`); controller logic unchanged |
| P-12 | Jackson 3 only | PASS | No Jackson usage added; the handler builds a `ProblemDetail` |
| P-13 | Errors and validation follow the framework specs | PASS | `validation-failed` ProblemDetail per `error-handling.md`: type `urn:oms:error:validation-failed`, title, `errors` keyed by field path, `errorCode` `OMS-VAL-002`, timestamp |
| P-14 | Test first, every AC proven by an automated test | PASS | Every AC has a test above; T-1 and T-4 were seen red before the change (tasks.md verify lines) |
| P-15 | Observability | PASS | Validation failures logged at WARN with the failing field names |
| P-16 | Security | PASS | Validation at the API boundary; the error body and log carry field names and validator messages, not submitted values |
| P-17 | Simplicity and dependencies | PASS | One schema edit, one handler override, tests; no new dependency. The tool's WARN on `docker-compose.yml` is SPEC-0031/0032's uncommitted change in the same tree, not this ticket |
| P-18 | Modules build standalone | PASS | `spec verify` ran oms-contracts, oms-core, oms-streaming-service, oms-mcp-server, oms-exchange-simulator and developer-cockpit in their own builds, all exit 0 |
| P-19 | Documentation follows behaviour | PASS | FR-002 (contract rule, HTTP vs Kafka rejection, tests), `openapi-contracts.md` (required `sessionId`, 2.0.0), `error-handling.md` (handler implemented), storyboard step `submit-order.md` (order ticket shape carries `sessionId`, T-11); `okf-check` 0 errors |

## Independent Review

Verdict MET, no blocking findings; one major and four minor:

1. **[major] The contract's own request example omitted `sessionId`.** `oms-cmd-api.yml`'s
   `executeCommand` example was an `OrderCreateCmd` with only `id` and `quantity`, so the contract
   documented a body its schema rejects, against the proposal's promise to fix every example.
   Confirmed. Fixed by reopening implement: T-11 added a cockpit test that checks every request
   example in the contract against it (red), then replaced the example with a valid order (green).
2. **[minor] Command bodies still send `version: "1.0.0"`** (cockpit `buildTemplate`, the
   `@ExampleObject`, tests) while `info.version` is now `2.0.0`. Not fixed: whether the body's
   `version` follows `info.version` is a contract-semantics decision outside this ticket's scope;
   nothing reads the field today. Listed under Follow-ups.
3. **[minor] Storyboard step `submit-order.md` omitted `sessionId`** from the order ticket shape.
   Fixed in T-11 (the `.excalidraw.svg` drawing is not regenerated; Follow-ups).
4. **[minor] `handleMethodArgumentNotValid` maps only field errors**, so a future class-level
   constraint would yield an empty `errors` map. Latent (no class-level constraints exist). Listed
   under Follow-ups.
5. **[minor] verification.md was still the template.** Resolved by this document. The reviewer
   also rated AC-5 as weak: it is pre-existing behaviour proven at unit level; see the AC-5 row.

## Automated Evidence

`evidence/last-run.json`, ran 2026-10-31T07:47:22Z (after T-11), result **pass**, fingerprint
`2fa576711cbbdfd5`.

| Module | Command | Exit | Log |
|---|---|---|---|
| oms-contracts | `./gradlew check` | 0 | evidence/oms-contracts-1.log |
| oms-core | `./gradlew check` | 0 (`test` executed: 37 classes, 191 tests, 0 failures, 0 skipped) | evidence/oms-core-1.log |
| oms-streaming-service | `./gradlew check` | 0 | evidence/oms-streaming-service-1.log |
| oms-mcp-server | `./gradlew check` | 0 | evidence/oms-mcp-server-1.log |
| oms-exchange-simulator | `./gradlew check` | 0 | evidence/oms-exchange-simulator-1.log |
| developer-cockpit | `npm run typecheck` | 0 | evidence/developer-cockpit-1.log |
| developer-cockpit | `npm test` | 0 (79 files, 484 passed, 2 skipped) | evidence/developer-cockpit-2.log |

Policy check: PASS, no errors, one WARN (`[R10 P-17] docker-compose.yml`, see P-17 above).

The earlier verify attempt (T-10, 07:06Z) failed only on SPEC-0018's then-unfinished
`QuerySearchIsolationIntegrationTest`; SPEC-0018 completed it before this run.

## Follow-ups

- Kafka still accepts an Avro `OrderCreateCmd` with a null `sessionId` and rejects it in
  `ValidateOrderTask`. Making the Avro field required is a schema-compatibility change of its own
  and was out of scope.
- Decide whether a command body's `version` follows the contract's `info.version` (now `2.0.0`);
  today the cockpit, the Swagger example and tests send `"1.0.0"`, and nothing reads it (review
  finding 2).
- `GlobalExceptionHandler.handleMethodArgumentNotValid`: include global (class-level) errors in
  `errors` once such constraints exist (review finding 4).
- Regenerate `submit-order.excalidraw.svg` so the drawing shows `sessionId` (review finding 3).

## Verdict

Verdict: GOAL MET

All seven ACs pass with tests that ran in the final verify run, the one major review finding is
fixed and pinned by a test, and the Goal assessment has no gap.
