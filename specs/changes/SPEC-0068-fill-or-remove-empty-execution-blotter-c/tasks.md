# Tasks — SPEC-0068: Fill or remove empty execution blotter columns

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

- [x] **T-1** oms-core: offer only the execution report fields, in FIX order, with `lastMkt` among the defaults; test first (AC-1, AC-2)
  - files: oms-core/src/test/java/org/example/oms/service/MetamodelServiceTest.java, oms-core/src/main/java/org/example/oms/service/MetamodelService.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.MetamodelServiceTest'` passes
- [x] **T-2** oms-core: the metamodel over HTTP, and every offered field filled on applied fills; test first (AC-1, AC-2, AC-3)
  - files: oms-core/src/test/java/org/example/oms/integration/ExecutionBlotterIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ExecutionBlotterIntegrationTest'` passes
- [x] **T-3** oms-streaming-service: the copy of the default columns, with `lastMkt` (AC-4)
  - files: oms-streaming-service/src/test/java/org/example/streaming/mapper/OrderExecutionMapperTest.java
  - verify: `cd oms-streaming-service && ./gradlew test --tests 'org.example.streaming.mapper.OrderExecutionMapperTest'` passes
- [x] **T-4** oms-ui: a saved column that is no longer offered is skipped (AC-5)
  - files: oms-ui/frontend/src/services/ColumnConfigService.test.ts
  - verify: `cd oms-ui/frontend && CI=true npx react-app-rewired test --watchAll=false src/services/ColumnConfigService.test.ts` passes (the project runs Jest through react-app-rewired)
- [x] **T-5** Knowledge base: the execution columns in `ui/admin-ui.md`, and a log entry (AC-6)
  - files: oms-knowledge-base/ui/admin-ui.md, oms-knowledge-base/log.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports 0 errors
- [x] **T-6** Run spec verify (AC-6)
  - verify: `node specs/tools/spec.mjs verify SPEC-0068` exits 0

## Notes

T-4 pins existing UI behaviour, so its test may pass at once; that proves AC-5 and needs no code
change (design D4).
