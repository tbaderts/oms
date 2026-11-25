# Tasks — SPEC-0070: Specify the executions query over stored fills

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

- [x] **T-1** oms-contracts: add `/executions/search` (`searchExecutions`) and the `ExecutionDto`, `PagedExecutionDto`, `ExecutionStatus` schemas to `oms-query-api.yml`; build, then regenerate the oms-core interfaces (AC-1, AC-5)
  - files: oms-contracts/src/main/openapi/oms-query-api.yml
  - verify: `cd oms-contracts && ./gradlew clean build` passes, and `cd oms-core && ./gradlew openApiGenerateQuery` produces `ExecutionsApi#searchExecutions` and `org.example.common.model.query.PagedExecutionDto`
- [x] **T-2** oms-core: `ExecutionSpecificationsTest` first, then `ExecutionSpecifications.dynamic` (same parser and operators as `OrderSpecifications`, over the execution fields) (AC-2)
  - files: oms-core/src/test/java/org/example/oms/service/ExecutionSpecificationsTest.java, oms-core/src/main/java/org/example/oms/service/ExecutionSpecifications.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.ExecutionSpecificationsTest'` passes
- [x] **T-3** oms-core: `ExecutionSearchIntegrationTest` (AC-1 to AC-5) first, then `ExecutionRepository` with `JpaSpecificationExecutor`, `ExecutionQueryService` (paging, sort whitelist), `QueryExecutionDtoMapper`, and `ExecutionViewController#searchExecutions` (AC-1, AC-2, AC-3, AC-4, AC-5)
  - files: oms-core/src/test/java/org/example/oms/integration/ExecutionSearchIntegrationTest.java, oms-core/src/main/java/org/example/oms/repository/ExecutionRepository.java, oms-core/src/main/java/org/example/oms/service/ExecutionQueryService.java, oms-core/src/main/java/org/example/oms/mapper/QueryExecutionDtoMapper.java, oms-core/src/main/java/org/example/oms/api/ExecutionViewController.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ExecutionSearchIntegrationTest'` passes
- [x] **T-4** oms-core: `ExecutionBlotterIntegrationTest` reads the new query; then retire `/api/executions`: `ExecutionSearchIntegrationTest#retiredEndpointIsGone` first, then delete `ExecutionController` and `ExecutionReadService` (AC-5, AC-7)
  - files: oms-core/src/test/java/org/example/oms/integration/ExecutionBlotterIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/ExecutionSearchIntegrationTest.java, oms-core/src/main/java/org/example/oms/api/ExecutionController.java, oms-core/src/main/java/org/example/oms/service/ExecutionReadService.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ExecutionSearchIntegrationTest' --tests 'org.example.oms.integration.ExecutionBlotterIntegrationTest'` passes
- [x] **T-5** oms-ui: rewrite the `OMSApiService.test.ts` executions case first (search path, filter params, paged shape), then `getExecutions` calls `/api/query/executions/search`; drop the raw-`Page` branch of `normalizePage` and its comment (AC-6)
  - files: oms-ui/frontend/src/services/OMSApiService.test.ts, oms-ui/frontend/src/services/OMSApiService.ts, oms-ui/frontend/src/components/Blotter.tsx
  - verify: `cd oms-ui/frontend && CI=true npx react-app-rewired test --watchAll=false src/services/OMSApiService src/components/Blotter` passes
- [x] **T-6** Knowledge base and docs: query API, REST read API, query engine, order-query capability, TD-3, `log.md`; oms-ui README and ARCHITECTURE mentions of `/api/executions` (AC-1, AC-6, AC-7)
  - files: oms-knowledge-base/domain/interfaces/query-api.md, oms-knowledge-base/domain/interfaces/rest-read-api.md, oms-knowledge-base/framework/query-engine.md, oms-knowledge-base/capabilities/order-query.md, oms-knowledge-base/architecture/technical-debt/technical-debt-register.md, oms-knowledge-base/log.md, oms-ui/README.md, oms-ui/docs/ARCHITECTURE.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports 0 errors, and `grep -rn "/api/executions" oms-knowledge-base oms-ui --include=*.md` lists only historical (SPEC) mentions
- [x] **T-7** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0070` exits 0

## Notes

- T-1 regenerates oms-core's `ExecutionsApi`, so `ExecutionViewController` stops compiling until T-3
  implements `searchExecutions`; T-2 runs only its unit test, which compiles once T-3's method
  exists — so T-3's controller method is stubbed (throws `UnsupportedOperationException`) at the
  end of T-1 to keep oms-core compiling. The stub is replaced in T-3.
