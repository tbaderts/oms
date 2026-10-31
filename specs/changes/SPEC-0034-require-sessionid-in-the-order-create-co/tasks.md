# Tasks — SPEC-0034: Require sessionId in the order create contract

> **Stage 3 of 3 — the executable plan.** The implement stage works top to bottom and ticks each
> box only when its `verify:` check passes. Keep tasks small (one focused change, about one
> red→green cycle) and in dependency order:
>
> 1. Contracts (oms-contracts) and regeneration
> 2. Migration (new Liquibase changelog)
> 3. Behaviour, one task per AC or slice: write the failing test, implement, make it green
> 4. Wiring: API, messaging, configuration
> 5. Observability (logs, metrics)
> 6. Knowledge base and docs
> 7. Full verification (`spec verify`)
>
> Format, which the gate parses:
>
> ```
> - [ ] **T-1** Imperative summary (AC-1, AC-2)
>   - files: path/one.java, path/two.yaml
>   - verify: `./gradlew test --tests 'org.example.oms…SomeTest'` passes
> ```
>
> Every AC must be covered by at least one task, and every task needs a `verify:` line. Tasks may
> be added during implementation; record why under Notes.

## Tasks

- [x] **T-1** Write the failing contract tests: `ApiCatalogService.test.ts` › `requires a non-empty sessionId on Order (SPEC-0034)` and `CommandModelValidationTest#orderCreateCmd_requiresSessionId` / `#orderCreateCmd_rejectsEmptySessionId` (AC-1, AC-2)
  - files: developer-cockpit/test/main/ApiCatalogService.test.ts, oms-core/src/test/java/org/example/oms/api/CommandModelValidationTest.java
  - verify: both new tests run and fail on the current contract (`cd developer-cockpit && npx vitest run test/main/ApiCatalogService.test.ts` reports the new test failing; `cd oms-core && ./gradlew test --tests 'org.example.oms.api.CommandModelValidationTest'` reports the two new methods failing)
- [x] **T-2** Make `Order.sessionId` required with `minLength: 1`, bump `info.version` to `2.0.0`, and regenerate (AC-1, AC-2)
  - files: oms-contracts/src/main/openapi/oms-cmd-api.yml
  - verify: `cd oms-contracts && ./gradlew build` passes (schema compatibility tests included, Avro baselines untouched), and the T-1 tests now pass: `cd developer-cockpit && npx vitest run test/main/ApiCatalogService.test.ts` and `cd oms-core && ./gradlew test --tests 'org.example.oms.api.CommandModelValidationTest'`
- [x] **T-3** Fix the create test that breaks under the new contract: add `sessionId` to the body in `CommandControllerWebMvcTest#executeCommand_withOrderCreateCmd_returnsCreated` (AC-4)
  - files: oms-core/src/test/java/org/example/oms/api/CommandControllerWebMvcTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.api.CommandControllerWebMvcTest.executeCommand_withOrderCreateCmd_returnsCreated'` passes (201, status OK)
- [x] **T-4** Write failing `CommandControllerWebMvcTest#orderCreate_withoutSessionId_returns400ValidationFailed` (missing and `""`), then override `handleMethodArgumentNotValid` in `GlobalExceptionHandler` with the `error-handling.md` validation-failed ProblemDetail (`errors` map, `OMS-VAL-002`, warn log with field names only) (AC-3)
  - files: oms-core/src/test/java/org/example/oms/api/CommandControllerWebMvcTest.java, oms-core/src/main/java/org/example/oms/api/GlobalExceptionHandler.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.api.CommandControllerWebMvcTest'` passes, and the new test failed before the handler change
- [x] **T-5** Write `OrderLifecycleIntegrationTest#orderCreateWithoutSessionId_isRejectedAndPersistsNothing`: POST a create without `sessionId`, expect 400 validation-failed, with `orders`, `order_events` and `outbox` counts unchanged (AC-3)
  - files: oms-core/src/test/java/org/example/oms/integration/OrderLifecycleIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.OrderLifecycleIntegrationTest'` passes
- [x] **T-6** Write `CommandListenerTest#consume_rejectedOrderCreate_isAcknowledgedNotThrown`: the processor rejects a create whose order has a null `sessionId`, and `consume` returns normally (AC-5)
  - files: oms-core/src/test/java/org/example/oms/config/CommandListenerTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.config.CommandListenerTest' --tests 'org.example.oms.service.command.tasks.ValidateOrderTaskTest'` passes, and `git diff --stat oms-contracts/src/main/avro oms-contracts/src/test/resources/compat` is empty
- [x] **T-7** Add the cockpit template test `OrderCreateCmd template carries sessionId and the check flags it missing (SPEC-0034)` to `api-schema.test.ts` (AC-6)
  - files: developer-cockpit/test/renderer/api-schema.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/renderer/api-schema.test.ts` passes
- [x] **T-8** Pin the bundled examples: add `oms-core rest.http create examples pass the contract check (SPEC-0034)` to `api-templates.test.ts` and `CommandControllerWebMvcTest#swaggerOrderCreateExample_isAccepted` (reads the `@ExampleObject` value by reflection and posts it); fix any example that fails (AC-7)
  - files: developer-cockpit/test/renderer/api-templates.test.ts, oms-core/src/test/java/org/example/oms/api/CommandControllerWebMvcTest.java
  - verify: `cd developer-cockpit && npx vitest run test/renderer/api-templates.test.ts` and `cd oms-core && ./gradlew test --tests 'org.example.oms.api.CommandControllerWebMvcTest'` pass
- [x] **T-9** Update the knowledge base: FR-002 (contract rule, HTTP vs Kafka rejection, tests), `openapi-contracts.md` (required `sessionId`, version 2.0.0), and `error-handling.md` (validation-failed handler implemented) (AC-3, AC-5)
  - files: oms-knowledge-base/functional-requirements/FR-002-validate-new-orders.md, oms-knowledge-base/oms-framework/openapi-contracts.md, oms-knowledge-base/oms-framework/error-handling.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` passes, and `grep -n sessionId oms-knowledge-base/functional-requirements/FR-002-validate-new-orders.md` shows the contract rule
- [x] **T-10** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0034` exits 0
- [x] **T-11** Write `api-templates.test.ts` › `oms-cmd-api.yml request examples pass the contract check (SPEC-0034)` (red: the `executeCommand` example has no `sessionId` and non-Order fields), then replace the example with a valid `OrderCreateCmd`; add `sessionId` to the storyboard `submit-order` step's order ticket shape (AC-7; found by the independent review)
  - files: developer-cockpit/test/renderer/api-templates.test.ts, oms-contracts/src/main/openapi/oms-cmd-api.yml, oms-knowledge-base/storyboards/order-lifecycle/place-and-fill-order/steps/submit-order.md
  - verify: `cd developer-cockpit && npx vitest run test/renderer/api-templates.test.ts` passes, and `cd oms-contracts && ./gradlew build` passes
- [x] **T-12** Run spec verify again
  - verify: `node specs/tools/spec.mjs verify SPEC-0034` exits 0

## Notes

- T-1 lands before T-2 so that the contract tests are seen failing first (P-14). T-3 depends on T-2,
  because the regenerated model is what makes the old create body invalid.
- No Liquibase, messaging or observability phase: the design has no data, event or metric
  changes, and the only log line is part of T-4.
- Found during T-10: the `ApiExplorer.templates.test.tsx` fixture built an `OrderCreateCmd` without
  `sessionId`, so the new contract gave it a finding. Fixed by adding `"sessionId":"cockpit"`, the
  same value as the starter templates (part of "fix what breaks", AC-7).
- T-10 is blocked by `QuerySearchIsolationIntegrationTest`, which SPEC-0018 left red on purpose
  (T-14, blocked). It is in the shared working tree, so `oms-core check` fails for every ticket
  until SPEC-0018 is unblocked or the test is set aside. It is not caused by this ticket.
