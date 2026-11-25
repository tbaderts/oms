# Tasks — SPEC-0071: Stream orders and executions without service caches

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

- [x] **T-1** Snapshot client: `OmsQueryClientTest#fetchExecutionSnapshot_pagesTheSearchAndCountsMatches` first, then `OmsQueryClient.fetchExecutionSnapshot(filter, limit)` → `ExecutionSnapshot(rows, matching)` over `/api/query/executions/search` (AC-1)
  - files: oms-streaming-service/src/test/java/org/example/streaming/client/OmsQueryClientTest.java, oms-streaming-service/src/main/java/org/example/streaming/client/OmsQueryClient.java
  - verify: `cd oms-streaming-service && ./gradlew test --tests 'org.example.streaming.client.OmsQueryClientTest'` passes
- [x] **T-2** Execution record mapping and receiver: `ExecutionMessageMapperTest` (fields incl. instrument; blotter default columns) and `KafkaConfigTest#executionReceiverReadsOmsExecutionsFromLatest` first, then `mapper/ExecutionMessageMapper`, `KafkaConfig.executionReceiver` (`oms_executions`, `latest`), `application.yml` topic setting (AC-3)
  - files: oms-streaming-service/src/test/java/org/example/streaming/mapper/ExecutionMessageMapperTest.java, oms-streaming-service/src/test/java/org/example/streaming/config/KafkaConfigTest.java, oms-streaming-service/src/main/java/org/example/streaming/mapper/ExecutionMessageMapper.java, oms-streaming-service/src/main/java/org/example/streaming/config/KafkaConfig.java, oms-streaming-service/src/main/resources/application.yml
  - verify: `cd oms-streaming-service && ./gradlew test --tests 'org.example.streaming.mapper.ExecutionMessageMapperTest' --tests 'org.example.streaming.config.KafkaConfigTest'` passes
- [x] **T-3** Provider without caches: rewrite `KafkaEventStreamProviderTest` first (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6 cases from the design; cache, warm-up, eviction and redelivery cases removed), then `KafkaEventStreamProvider` (execution snapshot from the client, live from the `Execution` receiver, no caches, no fallback, no warm-up) and `EventStreamProvider` without the cache methods (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6)
  - files: oms-streaming-service/src/test/java/org/example/streaming/service/KafkaEventStreamProviderTest.java, oms-streaming-service/src/main/java/org/example/streaming/service/KafkaEventStreamProvider.java, oms-streaming-service/src/main/java/org/example/streaming/service/EventStreamProvider.java
  - verify: `cd oms-streaming-service && ./gradlew test --tests 'org.example.streaming.service.KafkaEventStreamProviderTest'` passes
- [x] **T-4** Remove the unused routes and cache leftovers: `TradeBlotterControllerRoutesTest` first, then `TradeBlotterController` (no `blotter.stream`, `orders.snapshot`, `executions.snapshot`), `StreamRequest`/`StreamType` if unused, `TestStreamController` `/orders/snapshot`, `ServiceStatus`/`MetadataController` cache sizes, `ExecutionDto.order`/`ExecutionEvent.order`, `OrderExecutionMapper`, `fetchRecentExecutions`, `buffer.max-size`/`warm-up-size` settings; delete or adjust their tests (`TradeBlotterExecutionStreamTest`, `OrderExecutionMapperTest`, `TestStreamControllerTest`, `MetadataServiceTest`, `StreamedFieldsTest` on `Execution`) (AC-3, AC-6)
  - files: oms-streaming-service/src/main/java/org/example/streaming/** (listed classes), oms-streaming-service/src/main/resources/application.yml, oms-streaming-service/src/test/java/org/example/streaming/** (listed tests)
  - verify: `cd oms-streaming-service && ./gradlew check` passes
- [x] **T-5** oms-ui: `StreamingBlotter.test.tsx` (bare execution row, redelivery counted once) and `RSocketStreamingService` test first, then `RowStore.has`, `takeRow` counting by key, removal of `subscribeToBlotter` and the `StreamRequest`/`StreamType` types (AC-7)
  - files: oms-ui/frontend/src/components/StreamingBlotter.test.tsx, oms-ui/frontend/src/components/StreamingBlotter.tsx, oms-ui/frontend/src/services/rowStore.ts, oms-ui/frontend/src/services/RSocketStreamingService.ts, oms-ui/frontend/src/services/RSocketStreamingService.test.ts, oms-ui/frontend/src/types/streaming.ts
  - verify: `cd oms-ui/frontend && CI=true npx react-app-rewired test --watchAll=false src/components/StreamingBlotter src/services` passes and `npx tsc --noEmit -p . --ignoreDeprecations 6.0` reports nothing
- [x] **T-6** Knowledge base: streaming service, real-time streaming, query API note, other pages on the cache/warm-up/`oms_order_executions` as the streaming source, `log.md` (AC-1, AC-3, AC-5, AC-6)
  - files: oms-knowledge-base/architecture/context/streaming-service.md, oms-knowledge-base/capabilities/real-time-streaming.md, oms-knowledge-base/domain/interfaces/query-api.md, oms-knowledge-base/log.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports 0 errors and `grep -rn "warm-up\|executionCache\|orderCache" oms-knowledge-base --include=*.md` finds only historical mentions
- [x] **T-7** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0071` exits 0

## Notes

- T-3 and T-4 change the provider's interface together; T-3 leaves the cache methods' callers
  (routes, status) compiling by removing them in the same build only if needed — if the build
  breaks between T-3 and T-4, T-4's removals are pulled forward and noted here.
- Review fixes (verify stage): live execution filters on `symbol`/`securityId`/`status`, `status` on
  `ExecutionDto` and in oms-ui's streamed Execution fields, `MetadataControllerStatusTest`, stale
  docs. The oms-ui tests that used `status` as their example of a history-only execution field
  (`streamedFields.test.ts`, `StreamingBlotter.test.tsx`) now use `creationDate` / keep `id`, since
  `status` is streamed.
