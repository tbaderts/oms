# Tasks — SPEC-0069: Carry the FIX instrument block on executions

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

- [x] **T-1** oms-contracts: add `symbol`, `securityId`, `securityIdSource` to the command `Execution` and `Execution.avsc`; extend `ExecutionCompatibilityTest` to read the baseline with the new schema and a new record with the baseline schema; clean build (AC-1, AC-8)
  - files: oms-contracts/src/main/openapi/oms-cmd-api.yml, oms-contracts/src/main/avro/Execution.avsc, oms-contracts/src/test/java/org/example/common/contracts/ExecutionCompatibilityTest.java
  - verify: `cd oms-contracts && ./gradlew clean build` passes, including `ExecutionCompatibilityTest`
- [x] **T-2** oms-core: migration test first (`ExecutionInstrumentMigrationIntegrationTest`), then changelog `019-execution-instrument.yaml` (columns + idempotent backfill), master include, and the three entity fields (AC-5)
  - files: oms-core/src/test/java/org/example/oms/integration/ExecutionInstrumentMigrationIntegrationTest.java, oms-core/src/main/resources/db/changelog/019-execution-instrument.yaml, oms-core/src/main/resources/db/changelog/db.changelog-master.yaml, oms-core/src/main/java/org/example/common/model/Execution.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ExecutionInstrumentMigrationIntegrationTest' --tests 'org.example.oms.integration.LiquibaseMigrationIntegrationTest'` passes
- [x] **T-3** oms-core tests: every fill a test builds carries its order's symbol (`TestCommands.fillOf`, `AbstractFillFlowIntegrationTest` helpers, the other test classes that build an `Execution` or fill JSON), so the coming validation refuses none of them (AC-3, AC-4)
  - files: oms-core/src/test/java/org/example/oms/integration/TestCommands.java, oms-core/src/test/java/org/example/oms/integration/AbstractFillFlowIntegrationTest.java, other oms-core test classes that build fills
  - verify: `cd oms-core && ./gradlew test` passes (no behaviour change yet)
- [x] **T-4** oms-core: `ValidateExecutionTaskTest` first, then the instrument-present and instrument-matches rules in `ValidateExecutionTask` (AC-3, AC-4)
  - files: oms-core/src/test/java/org/example/oms/service/execution/tasks/ValidateExecutionTaskTest.java, oms-core/src/main/java/org/example/oms/service/execution/tasks/ValidateExecutionTask.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.execution.tasks.ValidateExecutionTaskTest'` passes
- [x] **T-5** oms-core: `AvroMessageMapperTest#executionMessageCarriesInstrument` first, then `ExecutionMessageMapper` sets the three fields (AC-1)
  - files: oms-core/src/test/java/org/example/oms/mapper/AvroMessageMapperTest.java, oms-core/src/main/java/org/example/oms/mapper/ExecutionMessageMapper.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.mapper.AvroMessageMapperTest'` passes
- [x] **T-6** oms-core: `ExecutionInstrumentIntegrationTest` end to end over REST and `oms_executions`: stored and published (full, securityId-only), refused (missing, mismatched) with nothing changed and a REFUSED command_log row (AC-1, AC-2, AC-3, AC-4)
  - files: oms-core/src/test/java/org/example/oms/integration/ExecutionInstrumentIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ExecutionInstrumentIntegrationTest'` passes
- [x] **T-7** oms-exchange-simulator: `ExchangeEngineTest#fillCarriesTheOrdersInstrument` first, then an `Instrument` record, `SimOrder.instrument` set in `newOrder`, a `CommandSink.fill` argument, `CommandGateway.fill` setting the fields, `RecordingSink` recording them; extend `ExchangeSimulatorKafkaIntegrationTest` to assert the symbol on the sent command (AC-6)
  - files: oms-exchange-simulator/src/main/java/org/example/simulator/engine/Instrument.java, oms-exchange-simulator/src/main/java/org/example/simulator/engine/SimOrder.java, oms-exchange-simulator/src/main/java/org/example/simulator/engine/ExchangeEngine.java, oms-exchange-simulator/src/main/java/org/example/simulator/engine/CommandSink.java, oms-exchange-simulator/src/main/java/org/example/simulator/kafka/CommandGateway.java, oms-exchange-simulator/src/test/java/org/example/simulator/engine/ExchangeEngineTest.java, oms-exchange-simulator/src/test/java/org/example/simulator/engine/RecordingSink.java, oms-exchange-simulator/src/test/java/org/example/simulator/kafka/ExchangeSimulatorKafkaIntegrationTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew test` passes
- [x] **T-8** oms-core: `ExchangeWorkflowIntegrationTest` sends simulator-shaped fills with the symbol and asserts they are applied and stored with it (AC-6)
  - files: oms-core/src/test/java/org/example/oms/integration/ExchangeWorkflowIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ExchangeWorkflowIntegrationTest'` passes
- [x] **T-9** oms-core: `MetamodelServiceTest#executionMetamodelOffersInstrument` first, then `symbol`, `securityId` in `EXECUTION_FIELDS` and `symbol` in `EXECUTION_DEFAULT_COLUMNS` (AC-7)
  - files: oms-core/src/test/java/org/example/oms/service/MetamodelServiceTest.java, oms-core/src/main/java/org/example/oms/service/MetamodelService.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.MetamodelServiceTest'` passes
- [x] **T-10** oms-streaming-service: the default-column copy in `OrderExecutionMapperTest` gains `symbol` (red), then `ExecutionDto.symbol`/`securityId` mapped from the `OrderExecution` record (AC-7)
  - files: oms-streaming-service/src/test/java/org/example/streaming/mapper/OrderExecutionMapperTest.java, oms-streaming-service/src/main/java/org/example/streaming/model/ExecutionDto.java, oms-streaming-service/src/main/java/org/example/streaming/mapper/OrderExecutionMapper.java
  - verify: `cd oms-streaming-service && ./gradlew test --tests 'org.example.streaming.mapper.OrderExecutionMapperTest'` passes
- [x] **T-11** oms-ui: a `DetailPanel.test.tsx` case for an Instrument section first, then the execution layout gains it and no longer hides `symbol`, `securityId`, `securityIdSource` (AC-7)
  - files: oms-ui/frontend/src/components/DetailPanel.test.tsx, oms-ui/frontend/src/components/DetailPanel.tsx
  - verify: `cd oms-ui/frontend && CI=true npx react-app-rewired test --watchAll=false src/components/DetailPanel` passes
- [x] **T-12** Hand-sent fills carry a symbol: an `api-templates.test.ts` case for `{{symbol}}` first, then the cockpit resolves it from the followed order; the `lifecycle.http` fill uses `{{symbol}}`; the `oms-core/rest.http` fill carries `"symbol":"INTC"` (AC-6)
  - files: developer-cockpit/test/renderer/api-templates.test.ts, developer-cockpit/src/renderer/lib/api-templates.ts, developer-cockpit/api-templates/lifecycle.http, oms-core/rest.http
  - verify: `cd developer-cockpit && npm run typecheck && npm test` passes
- [x] **T-13** Knowledge base: execution model, execution processing, validation engine, streaming-service (if it lists DTO fields), `log.md` (AC-1, AC-3, AC-4)
  - files: oms-knowledge-base/domain/model/execution.md, oms-knowledge-base/capabilities/execution-processing.md, oms-knowledge-base/framework/validation-engine.md, oms-knowledge-base/architecture/context/streaming-service.md, oms-knowledge-base/log.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports no errors, and each changed page mentions SPEC-0069
- [x] **T-14** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0069` exits 0

## Notes

- T-3 comes before T-4 on purpose: test fixtures carry an instrument first, so turning the
  validation on breaks no unrelated test.
- T-1 needs a clean build of oms-contracts (the `ExecutionCreateCmd` schema embeds `Execution`);
  consumers pick up the new jar on their next build.
- Found by the first `spec verify`: `ExecutionBlotterIntegrationTest` (SPEC-0068) pins the execution
  field lists and asserts that every offered field is filled on applied fills. Its lists gained
  `symbol`/`securityId`, and its fills now carry a full instrument (a symbol-only fill legitimately
  leaves `securityId` empty). Covered by T-9's ACs; no new task.
