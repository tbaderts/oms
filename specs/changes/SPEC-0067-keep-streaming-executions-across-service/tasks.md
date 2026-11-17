# Tasks — SPEC-0067: Keep streaming executions across service restarts

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

- [x] **T-1** Add the optional `order` parameter (`oldest` | `newest`) to `getExecutions` and regenerate (AC-4)
  - files: oms-contracts/src/main/openapi/oms-query-api.yml
  - verify: `cd oms-contracts && ./gradlew build` passes, and `cd oms-core && ./gradlew openApiGenerateQuery` gives `ExecutionsApi.getExecutions` an `order` parameter
- [x] **T-2** oms-core: `order=newest` sorts newest first, the default is unchanged, and an unknown value gives 400, test first (AC-4)
  - files: oms-core/src/test/java/org/example/oms/integration/ExecutionViewQueryIntegrationTest.java, oms-core/src/main/java/org/example/oms/service/ExecutionOrder.java, oms-core/src/main/java/org/example/oms/service/OrderExecutionProjectionQueryService.java, oms-core/src/main/java/org/example/oms/api/ExecutionViewController.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ExecutionViewQueryIntegrationTest'` passes
- [x] **T-3** Streaming: `OmsQueryClient.fetchRecentExecutions` maps fills with their order, test first (AC-1, AC-5)
  - files: oms-streaming-service/src/test/java/org/example/streaming/client/OmsQueryClientTest.java, oms-streaming-service/src/main/java/org/example/streaming/client/OmsQueryClient.java
  - verify: `cd oms-streaming-service && ./gradlew test --tests 'org.example.streaming.client.OmsQueryClientTest'` passes
- [x] **T-4** Streaming: warm the execution cache at startup with retry; no duplicate live events; filters apply, test first (AC-1, AC-2, AC-3, AC-5, AC-6)
  - files: oms-streaming-service/src/test/java/org/example/streaming/service/KafkaEventStreamProviderTest.java, oms-streaming-service/src/main/java/org/example/streaming/service/KafkaEventStreamProvider.java, oms-streaming-service/src/main/resources/application.yml
  - verify: `cd oms-streaming-service && ./gradlew test --tests 'org.example.streaming.service.KafkaEventStreamProviderTest'` passes
- [x] **T-5** Knowledge base: streaming service, query API, FR-054 and a log entry (AC-7)
  - files: oms-knowledge-base/architecture/context/streaming-service.md, oms-knowledge-base/domain/interfaces/query-api.md, oms-knowledge-base/capabilities/functional-requirements/FR-054-serve-fills-with-order.md, oms-knowledge-base/log.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports 0 errors
- [x] **T-6** Run spec verify (AC-7)
  - verify: `node specs/tools/spec.mjs verify SPEC-0067` exits 0

## Notes

T-2 needs T-1 (the generated interface). T-3 and T-4 do not need oms-core to run: the provider test
mocks `OmsQueryClient`, and the client test stubs the HTTP exchange.

T-5: FR-054 was left unchanged. The design made it conditional ("if the page lists the parameters"),
and it lists none.

T-6: the first two `spec verify` runs failed with `OutOfMemoryError: Java heap space` in oms-core's
test JVM, which has Gradle's default 512 MB. The test heap is now 2 GB; see design.md, "Changed
during implementation". The review fixes (see design.md, "After the independent review") were made
after that, so `spec verify` runs again.
