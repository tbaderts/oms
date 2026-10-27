# Tasks — SPEC-0003: Store venue reject reason on the order

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

- [x] **T-1** Capture the current resolved `OrderMessage` schema as a baseline and add `OrderMessageCompatibilityTest`, failing red on a check that `rejectReason` exists (AC-8)
  - files: oms-contracts/src/test/resources/compat/OrderMessage-baseline.json, oms-contracts/src/test/java/org/example/common/contracts/OrderMessageCompatibilityTest.java
  - verify: `cd oms-contracts && ./gradlew test --tests '*OrderMessageCompatibilityTest'` runs; before T-2 it fails only on the missing-field check
- [x] **T-2** Add optional `rejectReason` to `OrderMessage.avsc` (appended last) and to the query API `Order` schema, then regenerate (AC-6, AC-8)
  - files: oms-contracts/src/main/avro/OrderMessage.avsc, oms-contracts/src/main/openapi/oms-query-api.yml
  - verify: `cd oms-contracts && ./gradlew check` passes, including `OrderMessageCompatibilityTest`
- [x] **T-3** Add `rejectReason` to the `Order` entity and Liquibase changelog `005-order-reject-reason.yaml` (changeset `013-order-reject-reason`), included in the master changelog (AC-1, AC-6)
  - files: oms-core/src/main/java/org/example/common/model/Order.java, oms-core/src/main/resources/db/changelog/005-order-reject-reason.yaml, oms-core/src/main/resources/db/changelog/db.changelog-master.yaml
  - verify: `cd oms-core && ./gradlew test --tests '*EventSourcingIntegrationTest'` passes (Liquibase plus Hibernate `validate` against Postgres)
- [x] **T-4** Change the `OrderLifecycleCommandProcessorTest` assertions (reject, cancel reject, truncation) and add `cancel_withReason_doesNotTouchTextOrRejectReason` and `cancelRequest_clearsAnEarlierRejectReason` (red); then add `ReasonEffect` to `LifecycleAction`, rename the context key to `REASON` and apply the effect in `ApplyLifecycleActionTask` (green) (AC-1, AC-2, AC-3, AC-4, AC-5)
  - files: oms-core/src/main/java/org/example/oms/service/lifecycle/LifecycleAction.java, oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/ApplyLifecycleActionTask.java, oms-core/src/main/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessor.java, oms-core/src/test/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessorTest.java
  - verify: `cd oms-core && ./gradlew test --tests '*OrderLifecycleCommandProcessorTest'` passes
- [x] **T-5** Map `rejectReason` into `OrderMessage` (`OrderMessageMapper`), and extend `ExchangeWorkflowIntegrationTest` first: assertions for reject and cancel reject, plus the new `reject_reasonReachesOrdersTopicAndQueryApi` (AC-1, AC-2, AC-6)
  - files: oms-core/src/main/java/org/example/oms/mapper/OrderMessageMapper.java, oms-core/src/test/java/org/example/oms/integration/ExchangeWorkflowIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests '*ExchangeWorkflowIntegrationTest'` passes
- [x] **T-6** Add `MetamodelServiceTest#orderMetamodelIncludesRejectReason` to assert the field the blotter column selector uses (AC-7)
  - files: oms-core/src/test/java/org/example/oms/service/MetamodelServiceTest.java
  - verify: `cd oms-core && ./gradlew test --tests '*MetamodelServiceTest'` passes
- [x] **T-7** oms-streaming-service: write `OrderMessageMapperTest#mapsRejectReason` and `MetadataServiceTest#orderMetadataListsRejectReason` (red), then add the field to `OrderDto`, the mapper and `MetadataService` (AC-7)
  - files: oms-streaming-service/src/main/java/org/example/streaming/model/OrderDto.java, oms-streaming-service/src/main/java/org/example/streaming/mapper/OrderMessageMapper.java, oms-streaming-service/src/main/java/org/example/streaming/service/MetadataService.java, oms-streaming-service/src/test/java/org/example/streaming/mapper/OrderMessageMapperTest.java, oms-streaming-service/src/test/java/org/example/streaming/service/MetadataServiceTest.java
  - verify: `cd oms-streaming-service && ./gradlew check` passes
- [x] **T-8** oms-ui: write `DetailPanel.test.tsx#showsRejectReasonInStatusSection` (red), then add `rejectReason` to `types/streaming.ts` and to the detail panel's Status group, labelled "Reject Reason" (AC-7)
  - files: oms-ui/frontend/src/types/streaming.ts, oms-ui/frontend/src/components/DetailPanel.tsx, oms-ui/frontend/src/components/DetailPanel.test.tsx
  - verify: `cd oms-ui/frontend && CI=true npx react-app-rewired test --watchAll=false` passes
- [x] **T-9** Add the reason to the lifecycle apply log line (AC-6)
  - files: oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/ApplyLifecycleActionTask.java
  - verify: `cd oms-core && ./gradlew test --tests '*OrderLifecycleCommandProcessorTest'` still passes, and the log statement includes `rejectReason`
- [x] **T-10** Update the knowledge base: order-lifecycle.md, exchange-simulator.md, execution-reporting.md, domain-model_spec.md
  - files: oms-knowledge-base/oms-concepts/order-lifecycle.md, oms-knowledge-base/oms-concepts/exchange-simulator.md, oms-knowledge-base/oms-concepts/execution-reporting.md, oms-knowledge-base/oms-framework/domain-model_spec.md
  - verify: grep finds `rejectReason` in each of the four pages
- [x] **T-12** Review fixes: a reject or cancel reject without text clears an earlier reason, the truncation test proves the first 255 characters are kept, and the stale §4.2 line in order-lifecycle.md is fixed (AC-1, AC-5)  - files: oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/ApplyLifecycleActionTask.java, oms-core/src/test/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessorTest.java, oms-knowledge-base/oms-concepts/order-lifecycle.md  - verify: `cd oms-core && ./gradlew test --tests '*OrderLifecycleCommandProcessorTest'` passes, including `reject_withoutText_clearsAnEarlierReason`
- [x] **T-11** Run spec verify (AC-8)
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0003` exits 0

## Notes

- The oms-exchange-simulator needs no code change. It already sends reasons, and
  `ExchangeSimulatorKafkaIntegrationTest#unknownSymbol_producesRejectOnly` asserts them. It is
  rebuilt by T-11 as a consumer of oms-contracts.
- oms-mcp-server picks up the regenerated query model; it is covered by T-11's consumer builds.
- T-6 passed on first run: the reflection-based metamodel picked the field up from the entity added in T-3, so the test is a regression guard for the blotter column, not a red-green step.
- T-7 also changed `StreamingServiceApplicationTests` to use random RSocket and HTTP ports: it bound port 7000, which clashes with a locally running streaming-service container, and failed `check` for that reason only.
- T-12 was added after the independent review (minor findings 1 to 3). Finding 4 (a UTF-16 surrogate pair split by truncation) is recorded as a follow-up.
