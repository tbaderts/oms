# Tasks — SPEC-0035: Add order-events endpoint to the query contract

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

- [x] **T-1** Write `OrderEventContractTest` (fails: classes missing), then add the `/orders/{orderId}/events` operation, `OrderEventDto` and `OrderEventType` to the query contract as in design.md → Contract Changes, and regenerate (AC-1)
  - files: oms-contracts/src/test/java/org/example/common/contracts/OrderEventContractTest.java, oms-contracts/src/main/openapi/oms-query-api.yml
  - verify: `cd oms-contracts && ./gradlew check` passes, including `OrderEventContractTest`
- [x] **T-2** Regenerate the oms-core API interfaces and confirm the generated interface for the new path (`OrdersApi#getOrderEvents`) and the type of `OrderEventDto.transaction`; record any deviation in design.md → Alternatives & Decisions (AC-1)
  - files: (generated only) oms-core/build/generated/src/main/java/org/example/common/api/
  - verify: `cd oms-core && ./gradlew openApiGenerateQuery` succeeds and the generated interface declares `getOrderEvents(String orderId)` returning `ResponseEntity<List<OrderEventDto>>`
- [x] **T-3** Write `OrderEventDtoMapperTest` (`eventKindsMatchContract`, `mapsEveryField`), then add the MapStruct `OrderEventDtoMapper` (uses `QueryOrderDtoMapper`) and make it green (AC-1, AC-2, AC-3)
  - files: oms-core/src/test/java/org/example/oms/mapper/OrderEventDtoMapperTest.java, oms-core/src/main/java/org/example/oms/mapper/OrderEventDtoMapper.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.mapper.OrderEventDtoMapperTest'` passes
- [x] **T-4** Write `OrderEventQueryIntegrationTest` (`returnsEventLogInVersionOrder`, `responseHasOnlyContractedProperties`, `unknownOrderReturnsEmptyArray`, `apiDocsDeclareEventLogOperation`, `oldPathIsGone`) and see it fail, then rewrite `OrderEventController` to `@RequestMapping("/api/query")`, `implements OrdersApi`, mapping through `OrderEventDtoMapper`, removing the old `/api/order-events` mapping and `@Hidden` (AC-1, AC-2, AC-3, AC-4, AC-5)
  - files: oms-core/src/test/java/org/example/oms/integration/OrderEventQueryIntegrationTest.java, oms-core/src/main/java/org/example/oms/api/OrderEventController.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.OrderEventQueryIntegrationTest'` passes
- [x] **T-5** Confirm no code consumer of the old path remains outside developer-cockpit (AC-5)
  - files: (none)
  - verify: `git grep -n --untracked "order-events/orderId" -- oms-core/src oms-ui oms-mcp-server/src oms-streaming-service/src` prints only `OrderEventQueryIntegrationTest` (the AC-5 test asserting `404`)
- [x] **T-6** In developer-cockpit, add a failing `eventsPath` test in `test/shared/apiExplorer.test.ts` and update the follow-up paths in `OmsHttpService.test.ts` / `apiExplorer.ipc.test.ts`, then derive `eventsPath` from `API_PREFIX.query` (`/api/query/orders/<encoded id>/events`) and update its comment (AC-6)
  - files: developer-cockpit/src/shared/apiExplorer.ts, developer-cockpit/test/shared/apiExplorer.test.ts, developer-cockpit/test/main/OmsHttpService.test.ts, developer-cockpit/test/main/apiExplorer.ipc.test.ts
  - verify: `cd developer-cockpit && npm test` passes
- [x] **T-7** Update the knowledge base and the cockpit spec pages listed in design.md → Knowledge Base Updates (AC-5, AC-6)
  - files: oms-knowledge-base/interfaces/query-api.md, oms-knowledge-base/interfaces/rest-read-api.md, oms-knowledge-base/capabilities/order-query.md, oms-knowledge-base/capabilities/event-sourcing-and-replay.md, developer-cockpit/spec/03-features.md, developer-cockpit/spec/04-backend-services.md
  - verify: `git grep -n "api/order-events" -- oms-knowledge-base/interfaces oms-knowledge-base/capabilities developer-cockpit/spec developer-cockpit/src` prints nothing, and `query-api.md` names `/api/query/orders/{orderId}/events`
- [x] **T-8** Run spec verify
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0035` exits 0

## Notes

- T-1 must land before T-2/T-3: oms-core compiles against the regenerated oms-contracts models
  through the composite build.
- T-4 depends on T-2 (generated `OrdersApi`) and T-3 (mapper).
- T-5's verify was made precise during implementation: plain `git grep` skips untracked files, and
  with them included the one match is the test that asserts the old path is gone, so that match is
  now named in the check instead of expecting no output.
- T-4 grew one class, `CommandJsonConverter`, see design.md → Alternatives & Decisions ("Changed
  during implementation").
