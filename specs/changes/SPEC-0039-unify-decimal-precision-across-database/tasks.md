# Tasks — SPEC-0039: Unify decimal precision across database, Avro and OpenAPI

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

Shortcuts used in `verify:` lines:
`ct <Class>` = `cd oms-contracts && ./gradlew test --tests '*<Class>'`;
`gt <Class>` = `cd oms-core && ./gradlew test --tests '*<Class>'`.

- [x] **T-1** Write `DecimalPrecisionContractTest` (`everyAvroDecimalIs18By8AndNoDoubleRemains`, `aNineDecimalValueCannotBeSerialised`, `everyPriceAndQuantityInTheApiModelsIsBoundedTo10By8`) red (AC-1, AC-6)
  - files: oms-contracts/src/test/java/org/example/common/contracts/DecimalPrecisionContractTest.java
  - verify: `ct DecimalPrecisionContractTest` fails on the doubles in `Order`/`Quote`/`QuoteRequest`, the scale-2/4 decimals, and the missing `@Digits`
- [x] **T-2** Change the Avro schemas to `decimal(18,8)` (`Order`, `Quote`, `QuoteRequest`, `OrderMessage`, `Execution`, `OrderExecution`), regenerate the four compatibility baselines as the new major version and name SPEC-0039 in their tests (AC-1, AC-6)
  - files: oms-contracts/src/main/avro/Order.avsc, oms-contracts/src/main/avro/Quote.avsc, oms-contracts/src/main/avro/QuoteRequest.avsc, oms-contracts/src/main/avro/OrderMessage.avsc, oms-contracts/src/main/avro/Execution.avsc, oms-contracts/src/main/avro/OrderExecution.avsc, oms-contracts/src/test/resources/compat/OrderMessage-baseline.json, oms-contracts/src/test/resources/compat/CommandMessage-baseline.json, oms-contracts/src/test/resources/compat/Execution-baseline.json, oms-contracts/src/test/resources/compat/OrderExecution-baseline.json, oms-contracts/src/test/java/org/example/common/contracts/OrderMessageCompatibilityTest.java, oms-contracts/src/test/java/org/example/common/contracts/CommandMessageCompatibilityTest.java, oms-contracts/src/test/java/org/example/common/contracts/ExecutionCompatibilityTest.java, oms-contracts/src/test/java/org/example/common/contracts/OrderExecutionCompatibilityTest.java
  - verify: `ct DecimalPrecisionContractTest` passes its two Avro methods, and `ct '*CompatibilityTest'` passes
- [x] **T-3** Write `CommandControllerWebMvcTest#overPrecisePrice_isRejected` (red: 201), then add the `@Digits(integer = 10, fraction = 8)` extension and the bound sentence to the 9 command and 16 query fields, set `oms-cmd-api` 3.0.0 and `oms-query-api` 2.0.0, regenerate, and update the cockpit's pinned version test (AC-1, AC-4)
  - files: oms-core/src/test/java/org/example/oms/api/CommandControllerWebMvcTest.java, oms-contracts/src/main/openapi/oms-cmd-api.yml, oms-contracts/src/main/openapi/oms-query-api.yml, developer-cockpit/test/main/ApiCatalogService.test.ts
  - verify: `cd oms-contracts && ./gradlew build` passes (all of `DecimalPrecisionContractTest`), `gt CommandControllerWebMvcTest` passes, `cd developer-cockpit && npx vitest run test/main/ApiCatalogService.test.ts` passes
- [x] **T-4** Make oms-core compile and its existing unit tests pass against the new contracts (Avro builders that used doubles, test helpers at scale 4) (AC-7)
  - files: oms-core/src/test/java (helpers and Avro builders as the compiler reports them), oms-core/src/main/java (if any mapper needs it)
  - verify: `cd oms-core && ./gradlew compileTestJava` passes and `gt AvroMessageMapperTest`, `gt OrderExecutionMessageMapperTest`, `gt MessagePublisherTest` pass
- [x] **T-5** Write `LiquibaseMigrationIntegrationTest#priceAndQuantityColumnsAreNumeric18By8` and `DecimalPrecisionMigrationIntegrationTest` (`existingValuesSurviveUnchanged`, `valueBeyondPrecision_failsTheMigrationNamingTheColumn`) red, then add `008-decimal-precision.yaml` (018 tag, 019 check + alter, rollback) and include it (AC-2, AC-3)
  - files: oms-core/src/test/java/org/example/oms/integration/LiquibaseMigrationIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/DecimalPrecisionMigrationIntegrationTest.java, oms-core/src/main/resources/db/changelog/008-decimal-precision.yaml, oms-core/src/main/resources/db/changelog/db.changelog-master.yaml
  - verify: `gt LiquibaseMigrationIntegrationTest` and `gt DecimalPrecisionMigrationIntegrationTest` pass
- [x] **T-6** Write `DecimalPrecisionIntegrationTest` (`eightDecimalsSurviveEveryLayer`, `kafkaOrderCreateKeepsEightDecimals`) red (rounded `cumQty`/`leavesQty`), then set `CalculateOrderQuantitiesTask` to scale 8 with `RoundingMode.UNNECESSARY` and fix any shared test helper still at scale 4 (AC-5, AC-6)
  - files: oms-core/src/test/java/org/example/oms/integration/DecimalPrecisionIntegrationTest.java, oms-core/src/main/java/org/example/oms/service/execution/tasks/CalculateOrderQuantitiesTask.java, oms-core/src/test/java/org/example/oms/integration/AbstractFillFlowIntegrationTest.java
  - verify: `gt DecimalPrecisionIntegrationTest`, `gt ExchangeWorkflowIntegrationTest` and `gt OrderExecutionPublicationIntegrationTest` pass
- [x] **T-7** Exchange simulator and streaming service against the new contracts: simulator `DECIMAL_SCALE` and `QUANTITY_SCALE` to 8, fix what their tests show (AC-7)
  - files: oms-exchange-simulator/src/main/java/org/example/simulator/kafka/CommandGateway.java, oms-exchange-simulator/src/main/java/org/example/simulator/engine/FillSlicer.java, oms-exchange-simulator/src/test/java (as needed), oms-streaming-service/src/test/java (as needed)
  - verify: `cd oms-exchange-simulator && ./gradlew check` and `cd oms-streaming-service && ./gradlew check` pass
- [x] **T-8** Update the knowledge base: `interfaces/avro-messages.md` (precision, new major version, deployment runbook), `oms-framework/openapi-contracts.md`, `oms-framework/validation-rules.md`, `domain/order.md` / `domain/execution.md` where they state types, `oms-concepts/projections.md` (link the runbook) (AC-1, AC-4)
  - files: oms-knowledge-base/interfaces/avro-messages.md, oms-knowledge-base/oms-framework/openapi-contracts.md, oms-knowledge-base/oms-framework/validation-rules.md, oms-knowledge-base/domain/order.md, oms-knowledge-base/domain/execution.md, oms-knowledge-base/oms-concepts/projections.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports 0 errors
- [x] **T-9** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0039` exits 0
- [x] **T-10** Review fixes in tests: `DecimalPrecisionMigrationIntegrationTest#integerDigitsBeyondPrecision_failsTheMigrationNamingTheColumn` (an 11-integer-digit `executions.last_qty`); the missing layer assertions in `DecimalPrecisionIntegrationTest` (view and execution quantities, `lastQty` on both fill topics); `OrderMapperTest#toCmdOrder_mapsDecimalsAndIsoTimes` (review findings 1, 4, 7) (AC-3, AC-5, AC-6)
  - files: oms-core/src/test/java/org/example/oms/integration/DecimalPrecisionMigrationIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/DecimalPrecisionIntegrationTest.java, oms-core/src/test/java/org/example/oms/mapper/OrderMapperTest.java
  - verify: `gt DecimalPrecisionMigrationIntegrationTest`, `gt DecimalPrecisionIntegrationTest` and `gt OrderMapperTest` pass
- [x] **T-11** Review fixes in docs: runbook says old records are misread (wrong scale), not refused, and that the Schema Registry does not check decimal scale; `domain/order-quantities.md` and `oms-framework/oms-state-store.md` state decimal(18,8) and no rounding; simulator Javadocs say scale 8 (review findings 2, 3, 5, 8) (AC-1)
  - files: oms-knowledge-base/interfaces/avro-messages.md, oms-knowledge-base/domain/order-quantities.md, oms-knowledge-base/oms-framework/oms-state-store.md, oms-exchange-simulator/src/main/java/org/example/simulator/kafka/CommandGateway.java, oms-exchange-simulator/src/main/java/org/example/simulator/engine/FillSlicer.java
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports 0 errors and `cd oms-exchange-simulator && ./gradlew check` passes
- [x] **T-12** Run spec verify again
  - verify: `node specs/tools/spec.mjs verify SPEC-0039` exits 0

## Notes

<!-- Optional: sequencing constraints, tasks added during implementation and why. -->

- Implementation notes:
  - T-1: the test did not compile at first (`Order.setPrice` took a `Double`), which is the defect
    itself; the three methods were seen failing individually after the schema change regenerated the
    classes (T-2: Avro methods green; API method red until T-3).
  - T-2: `CommandMessage` embeds its members' schemas at generation time and was stale after the
    `.avsc` changes until a clean build (SPEC-0018's follow-up); `./gradlew clean build` was needed.
    `SchemaCompatibility` ignores logical types, so only `CommandMessageCompatibilityTest` (double →
    decimal) failed before the baselines were regenerated; `DecimalPrecisionContractTest` is what
    guards the scale.
  - T-6 found and fixed a pre-existing defect: creating an order over Kafka always failed in
    `CommandListener` (`convertValue` on an Avro record); now mapped with `OrderMapper.toCmdOrder`
    (design.md → Alternatives & Decisions).
  - T-7 and T-9: tests that compared `BigDecimal` with `equals` at scale 4 (simulator helpers,
    `OrderLifecycleIntegrationTest`) failed on `10.0000` vs `10.00000000`: same value, new scale. The
    simulator helpers use `FillSlicer.QUANTITY_SCALE`; the oms-core assertions use `compareTo`. The
    migration test keeps exact-scale assertions on purpose (they check what the cast returns).
  - T-8: `domain/order.md` and `domain/execution.md` state no types, so they were not changed.
