# Tasks — SPEC-0041: Align executions blotter fields and keys with orders

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

- [x] **T-1** Correct the `avgPx` doc in the Execution and OrderExecution Avro schemas and rebuild contracts (AC-3)
  - files: oms-contracts/src/main/avro/Execution.avsc, oms-contracts/src/main/avro/OrderExecution.avsc
  - verify: `cd oms-contracts && ./gradlew build` passes, and `git diff oms-contracts/src/main/avro` shows only `doc` lines changed
- [x] **T-2** Rename entity field `execID` → `execId` (with `@Column(name = "execid")`), drop `executionId`, rename `existsByOrderIdAndExecID` → `existsByOrderIdAndExecId`, simplify `OrderMapper.toExecution`, and update every main/test reference (AC-2)
  - files: oms-core/src/main/java/org/example/common/model/Execution.java, oms-core/src/main/java/org/example/oms/repository/ExecutionRepository.java, oms-core/src/main/java/org/example/oms/mapper/OrderMapper.java, oms-core/src/main/java/org/example/oms/mapper/ExecutionMessageMapper.java, oms-core/src/main/java/org/example/oms/mapper/OrderExecutionMessageMapper.java, oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java, oms-core/src/main/java/org/example/oms/projection/ProjectionRebuilder.java, oms-core/src/main/java/org/example/oms/service/execution/**, oms-core/src/main/java/org/example/oms/api/CommandController.java, oms-core/src/main/java/org/example/oms/config/CommandListener.java, oms-core/src/test/java/** (rename-only adjustments listed in design Test Strategy)
  - verify: `cd oms-core && ./gradlew compileJava compileTestJava` passes, and `grep -rn "execID\|executionId" oms-core/src/main/java` matches only `secondaryExecID` and MetamodelService (fixed in T-3)
- [x] **T-3** Write `MetamodelServiceTest#executionMetamodelUsesExecIdAndResolvableDefaults` (red), then set Execution `primaryKey("execId")` and defaults `execId, orderId, execType, lastQty, lastPx, cumQty, leavesQty, avgPx, transactTime` (AC-1, AC-7)
  - files: oms-core/src/test/java/org/example/oms/service/MetamodelServiceTest.java, oms-core/src/main/java/org/example/oms/service/MetamodelService.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.MetamodelServiceTest'` passes
- [x] **T-4** Write `CalculateOrderQuantitiesTaskTest#avgPxIsVolumeWeightedOverAppliedFills` (red), then add `ExecutionRepository.sumNotionalByOrderId`, `OrderTaskContext.calculatedAvgPx`, and compute avgPx (scale 8, HALF_EVEN) in `CalculateOrderQuantitiesTask`, logging it (AC-2)
  - files: oms-core/src/test/java/org/example/oms/service/execution/tasks/CalculateOrderQuantitiesTaskTest.java, oms-core/src/main/java/org/example/oms/repository/ExecutionRepository.java, oms-core/src/main/java/org/example/oms/model/OrderTaskContext.java, oms-core/src/main/java/org/example/oms/service/execution/tasks/CalculateOrderQuantitiesTask.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.execution.tasks.CalculateOrderQuantitiesTaskTest'` passes
- [x] **T-5** Write `ExecutionBlotterIntegrationTest` (metamodel endpoint, REST execId+avgPx, projection + Kafka avgPx, duplicate fill) (red), then copy `calculatedAvgPx` onto the execution in `PersistExecutionTask` after the duplicate check (AC-1, AC-2, AC-3, AC-4)
  - files: oms-core/src/test/java/org/example/oms/integration/ExecutionBlotterIntegrationTest.java, oms-core/src/main/java/org/example/oms/service/execution/tasks/PersistExecutionTask.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ExecutionBlotterIntegrationTest'` passes
- [x] **T-6** Run the full oms-core suite after the rename and avgPx changes (AC-2, AC-4)
  - files: (none)
  - verify: `cd oms-core && ./gradlew check` passes
- [x] **T-7** Write `OrderExecutionMapperTest#executionDtoCarriesAllBlotterDefaultColumns` and `MetadataServiceTest#executionMetadataHasNoExecutionId` (red), then remove `executionId` from `ExecutionDto` and `MetadataService` (AC-7)
  - files: oms-streaming-service/src/test/java/org/example/streaming/mapper/OrderExecutionMapperTest.java, oms-streaming-service/src/test/java/org/example/streaming/service/MetadataServiceTest.java, oms-streaming-service/src/main/java/org/example/streaming/model/ExecutionDto.java, oms-streaming-service/src/main/java/org/example/streaming/service/MetadataService.java
  - verify: `cd oms-streaming-service && ./gradlew check` passes
- [x] **T-8** Write `services/rowId.test.ts` (red), then add `services/rowId.ts` (`rowIdOf`) (AC-5, AC-6)
  - files: oms-ui/frontend/src/services/rowId.test.ts, oms-ui/frontend/src/services/rowId.ts
  - verify: `cd oms-ui/frontend && npx react-scripts test --watchAll=false src/services/rowId.test.ts` passes
- [x] **T-9** Use `rowIdOf` for `getRowId` and the execution `dataMap` key in `StreamingBlotter`, set `getRowId` in `Blotter`, and drop `executionId` from `StreamingExecutionDto` (AC-5, AC-6)
  - files: oms-ui/frontend/src/components/StreamingBlotter.tsx, oms-ui/frontend/src/components/Blotter.tsx, oms-ui/frontend/src/types/streaming.ts
  - verify: `cd oms-ui/frontend && npx tsc --noEmit -p .` exits 0 and `npm test -- --watchAll=false --passWithNoTests` passes
- [x] **T-10** Update the knowledge base: execution identity/avgPx, execution processing, FR-013, admin UI executions blotter, Avro avgPx meaning
  - files: oms-knowledge-base/domain/execution.md, oms-knowledge-base/capabilities/execution-processing.md, oms-knowledge-base/functional-requirements/FR-013-apply-fills.md, oms-knowledge-base/ui/oms-admin-ui_spec.md, oms-knowledge-base/interfaces/avro-messages.md
  - verify: `grep -rn "does not compute an average price\|executionId\`, \`execID" oms-knowledge-base` returns nothing, and each listed page mentions `execId` or `avgPx` as specified in the design
- [x] **T-12** Write component tests that drive the real `StreamingBlotter` and `Blotter` (AG Grid stubbed) and assert the row ids they produce for two fills of one order and for one execId on two orders (AC-5, AC-6)
  - files: oms-ui/frontend/src/components/StreamingBlotter.test.tsx, oms-ui/frontend/src/components/Blotter.test.tsx
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false src/components/StreamingBlotter.test.tsx src/components/Blotter.test.tsx` passes, and fails when `getRowId` is reverted to `params.data.orderId || params.data.id`
- [x] **T-13** Make the rounding test discriminate HALF_EVEN from HALF_UP with an exact tie at the 9th decimal (AC-2)
  - files: oms-core/src/test/java/org/example/oms/service/execution/tasks/CalculateOrderQuantitiesTaskTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.execution.tasks.CalculateOrderQuantitiesTaskTest'` passes
- [x] **T-14** Cross-reference the copied default-column list between oms-core MetamodelService and the oms-streaming-service test (AC-7)
  - files: oms-core/src/main/java/org/example/oms/service/MetamodelService.java
  - verify: the comment in `buildExecutionMetadata` names `OrderExecutionMapperTest`; `cd oms-core && ./gradlew compileJava` passes
- [x] **T-15** Remove stale `execID`/`executionId` entity-field descriptions from the remaining docs
  - files: oms-knowledge-base/oms-framework/domain-model_spec.md, oms-knowledge-base/oms-concepts/execution-reporting.md, oms-knowledge-base/domain/index.md, CLAUDE.md, oms-streaming-service/docs/FILTERED_STREAMING.md
  - verify: `grep -rnwE "execID|executionId"` over those files matches only intentional references (ExecutionBust/Whack command fields, history notes)
- [x] **T-11** Run spec verify
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0041` exits 0

## Notes

- T-2 is a pure rename and must compile before any behaviour task starts. It changes no behaviour,
  so it has no red test of its own: T-5's integration test (`/api/executions` has `execId` and no
  `execID`/`executionId`) is the observable check of its effect.
- T-3 depends on T-2: the reflected fields must already be named `execId` for the test to pass.
- T-4 also replaced the stale `CalculateOrderQuantitiesTask` example in
  `oms-core/.../service/execution/README.md`: it used a no-arg constructor and an `Order.avgPx`
  that never existed.
- T-7 also removed the `executionId` accessor from `FilterService.EXECUTION_ACCESSORS`
  (oms-streaming-service). It read the removed DTO field, and a filter on it could only ever
  match null.
- T-8 verify ran as `CI=true npm test -- --watchAll=false src/services/rowId.test.ts`: the module's
  test script is `react-app-rewired test`, not `react-scripts`. Result: 5 passed.
- T-9 verify: plain `npx tsc --noEmit -p .` fails on two pre-existing tsconfig deprecations
  (TS5107 `moduleResolution=node10`, TS5101 `baseUrl`; `tsconfig.json` is unchanged by this
  ticket) before it type-checks anything.
  - With `--ignoreDeprecations 6.0` it exits 0, with no type errors.
  - `npm test -- --watchAll=false --passWithNoTests` (the module's configured verify): 9 suites,
    40 tests passed.
  - The tsconfig deprecations are recorded as a follow-up, not fixed here.
- T-12 to T-15 were added after the independent review (verify stage, round 1):
  - The `rowIdOf` unit tests did not cover the components' wiring (major finding). T-12's component
    tests fail if `getRowId` / the row-map key are reverted to the old keying: all 3 failed with
    the old code in place and pass with the fix.
  - The rounding test now has an exact tie that HALF_UP would round differently.
  - The copied default-column list is cross-referenced from `MetamodelService`.
  - Further docs still described the removed `execID`/`executionId` fields. The two `.executionId(…)`
    builder calls left in `oms-concepts/execution-reporting.md` belong to a conceptual
    `ExecutionEvent` in an unbuilt part of that spec, not to the Execution entity.
