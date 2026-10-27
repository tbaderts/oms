# Tasks — SPEC-0001: Add exchange simulator with FIX execution workflow

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

## Tasks

- [x] **T-1** Capture the current resolved `CommandMessage` schema as a compatibility baseline and add the failing `CommandMessageCompatibilityTest` (with JUnit in oms-contracts) (AC-11)
  - files: oms-contracts/build.gradle, oms-contracts/src/test/resources/compat/CommandMessage-baseline.json, oms-contracts/src/test/java/org/example/common/contracts/CommandMessageCompatibilityTest.java
  - verify: `cd oms-contracts && ./gradlew test --tests '*CommandMessageCompatibilityTest'` runs. Before T-2 it also asserts that the four new command types exist as union branches, so it fails red.
- [x] **T-2** Add the four Avro command records and append them to the `CommandMessage` union; add the four OpenAPI schemas and discriminator mappings; extend `verifyContracts` to `oms-exchange-simulator`; regenerate (AC-9, AC-11)
  - files: oms-contracts/src/main/avro/OrderRejectCmd.avsc, oms-contracts/src/main/avro/OrderCancelCmd.avsc, oms-contracts/src/main/avro/OrderCancelRequestCmd.avsc, oms-contracts/src/main/avro/OrderCancelRejectCmd.avsc, oms-contracts/src/main/avro/CommandMessage.avsc, oms-contracts/src/main/openapi/oms-cmd-api.yml, oms-contracts/build.gradle
  - verify: `cd oms-contracts && ./gradlew check` passes, including `CommandMessageCompatibilityTest`, and the generated classes `org.example.common.model.{cmd,msg}.OrderCancelRequestCmd` etc. exist under build/generated
- [x] **T-19** Extend the command-API `Execution` schema with the fill fields (additive) and map them in `OrderMapper.toExecution` (`execId` → `execID`), test first with `OrderMapperExecutionTest` (AC-1, AC-2)
  - files: oms-contracts/src/main/openapi/oms-cmd-api.yml, oms-core/src/main/java/org/example/oms/mapper/OrderMapper.java, oms-core/src/test/java/org/example/oms/mapper/OrderMapperExecutionTest.java
  - verify: `cd oms-contracts && ./gradlew check` passes and `cd oms-core && ./gradlew test --tests '*OrderMapperExecutionTest'` passes
- [x] **T-20** Initialise `cumQty = 0` and `leavesQty = orderQty` for new orders in `SetOrderStateTask` (order-lifecycle.md §8.1), test first with `SetOrderStateTaskTest` (AC-3, AC-7, AC-8)
  - files: oms-core/src/main/java/org/example/oms/service/command/tasks/SetOrderStateTask.java, oms-core/src/test/java/org/example/oms/service/command/tasks/SetOrderStateTaskTest.java
  - verify: `cd oms-core && ./gradlew test --tests '*SetOrderStateTaskTest'` passes
- [x] **T-21** Map the Avro `ExecutionCreateCmd` to the command model with MapStruct instead of Jackson `convertValue`, which fails on Avro records (`getSchema()`), test first in `OrderMapperExecutionTest` and `CommandListenerTest` (AC-1, AC-2)
  - files: oms-core/src/main/java/org/example/oms/mapper/OrderMapper.java, oms-core/src/main/java/org/example/oms/config/CommandListener.java, oms-core/src/test/java/org/example/oms/mapper/OrderMapperExecutionTest.java, oms-core/src/test/java/org/example/oms/config/CommandListenerTest.java
  - verify: `cd oms-core && ./gradlew test --tests '*OrderMapperExecutionTest' --tests '*CommandListenerTest'` passes
- [x] **T-3** Add `Event.CXL_REQUEST`/`CXL_REJ`, add `event` and `lifecycleAction` to `OrderTaskContext`, and generalize `PublishOrderEventTask` to append the context event (default NEW_ORDER), test first (AC-7, AC-8)
  - files: oms-core/src/main/java/org/example/oms/model/Event.java, oms-core/src/main/java/org/example/oms/model/OrderTaskContext.java, oms-core/src/main/java/org/example/oms/service/command/tasks/PublishOrderEventTask.java, oms-core/src/test/java/org/example/oms/service/command/tasks/PublishOrderEventTaskTest.java
  - verify: `cd oms-core && ./gradlew test --tests '*PublishOrderEventTaskTest'` passes, with a new case asserting that the context event is used and the existing NEW_ORDER case still green
- [x] **T-4** Write the failing `OrderLifecycleCommandProcessorTest` (Mockito) for all four actions' success effects and every refusal in AC-9, then implement `LifecycleAction`, `OrderLifecycleCommandProcessor`, `LoadOrderTask`, `ValidateLifecycleActionTask`, `ApplyLifecycleActionTask` and `SaveOrderTask` (AC-4, AC-6, AC-7, AC-8, AC-9)
  - files: oms-core/src/main/java/org/example/oms/service/lifecycle/LifecycleAction.java, oms-core/src/main/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessor.java, oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/LoadOrderTask.java, oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/ValidateLifecycleActionTask.java, oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/ApplyLifecycleActionTask.java, oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/SaveOrderTask.java, oms-core/src/test/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessorTest.java
  - verify: `cd oms-core && ./gradlew test --tests '*OrderLifecycleCommandProcessorTest'` passes. Refusal cases verify that `OrderEventAppender` and `saveAndFlush` are never called.
- [x] **T-5** Wire the four commands into `CommandController` (200 OK / 400 FAILED), extending `CommandControllerWebMvcTest` first (AC-7, AC-9)
  - files: oms-core/src/main/java/org/example/oms/api/CommandController.java, oms-core/src/test/java/org/example/oms/api/CommandControllerWebMvcTest.java
  - verify: `cd oms-core && ./gradlew test --tests '*CommandControllerWebMvcTest'` passes, including `cancelRequest_success_returns200Ok` and `lifecycleCommand_failure_returns400Failed`
- [x] **T-6** Wire the four Avro commands into `CommandListener` (convert by constructor, log and acknowledge refusals), extending `CommandListenerTest` first (AC-10)
  - files: oms-core/src/main/java/org/example/oms/config/CommandListener.java, oms-core/src/test/java/org/example/oms/config/CommandListenerTest.java
  - verify: `cd oms-core && ./gradlew test --tests '*CommandListenerTest'` passes
- [x] **T-7** Write `ExchangeWorkflowIntegrationTest` (oms-core, extends `AbstractKafkaPostgresIntegrationTest`), driving the exact simulator command sequences over the `commands` topic, and fix whatever it exposes (AC-1, AC-2, AC-3, AC-4, AC-6, AC-7, AC-8, AC-10)
  - files: oms-core/src/test/java/org/example/oms/integration/ExchangeWorkflowIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/AbstractKafkaPostgresIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests '*ExchangeWorkflowIntegrationTest'` passes, and all methods named in the design's Test Strategy are present
- [x] **T-8** Run the full oms-core suite (event sourcing, replay, Liquibase, lifecycle) to confirm no regression
  - files: (none, verification only)
  - verify: `cd oms-core && ./gradlew check` passes
- [x] **T-9** Scaffold the `oms-exchange-simulator` module: settings.gradle with `includeBuild('../oms-contracts')`, build.gradle, Gradle wrapper, `ExchangeSimulatorApplication`, `SimulatorProperties`, application.yml, and include it in the root settings.gradle/build.gradle (AC-11)
  - files: oms-exchange-simulator/settings.gradle, oms-exchange-simulator/build.gradle, oms-exchange-simulator/gradlew, oms-exchange-simulator/gradlew.bat, oms-exchange-simulator/gradle/wrapper/*, oms-exchange-simulator/src/main/java/org/example/simulator/ExchangeSimulatorApplication.java, oms-exchange-simulator/src/main/java/org/example/simulator/config/SimulatorProperties.java, oms-exchange-simulator/src/main/resources/application.yml, settings.gradle, build.gradle
  - verify: `cd oms-exchange-simulator && ./gradlew build -x test` passes and the generated `org.example.common.model.msg.CommandMessage` from oms-contracts resolves
- [x] **T-10** Write the failing `OrderEvaluatorTest`, then implement `OrderEvaluator` (marketability, reference fill price, IOC flag, every reject rule) (AC-3, AC-4, AC-5)
  - files: oms-exchange-simulator/src/main/java/org/example/simulator/engine/OrderEvaluator.java, oms-exchange-simulator/src/main/java/org/example/simulator/engine/Evaluation.java, oms-exchange-simulator/src/test/java/org/example/simulator/engine/OrderEvaluatorTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew test --tests '*OrderEvaluatorTest'` passes
- [x] **T-11** Write the failing `FillSlicerTest`, then implement `FillSlicer` (AC-2)
  - files: oms-exchange-simulator/src/main/java/org/example/simulator/engine/FillSlicer.java, oms-exchange-simulator/src/test/java/org/example/simulator/engine/FillSlicerTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew test --tests '*FillSlicerTest'` passes (100/3 → 33,33,34; 2/3 → 1,1; sum equals qty; no zero slice)
- [x] **T-12** Write the failing `ExchangeEngineTest` against a recording `CommandSink` port, then implement `ExchangeEngine` (single-thread scheduler, in-memory orders, the UNACK and PCXL triggers, IOC remainder, cancel and cancel reject, dedupe) (AC-1, AC-2, AC-5, AC-6, AC-7, AC-8, AC-10)
  - files: oms-exchange-simulator/src/main/java/org/example/simulator/engine/ExchangeEngine.java, oms-exchange-simulator/src/main/java/org/example/simulator/engine/SimOrder.java, oms-exchange-simulator/src/main/java/org/example/simulator/engine/CommandSink.java, oms-exchange-simulator/src/test/java/org/example/simulator/engine/ExchangeEngineTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew test --tests '*ExchangeEngineTest'` passes, including all methods named in the design's Test Strategy
- [x] **T-13** Implement `CommandGateway` (a `CommandSink` that builds the Avro commands with scale-4 decimals and sends them keyed by orderId) and `OrderMessageListener` (MDC orderId), and add `ExchangeSimulatorKafkaIntegrationTest` (Testcontainers Kafka, mock registry) first (AC-1, AC-3, AC-4, AC-7)
  - files: oms-exchange-simulator/src/main/java/org/example/simulator/kafka/CommandGateway.java, oms-exchange-simulator/src/main/java/org/example/simulator/kafka/OrderMessageListener.java, oms-exchange-simulator/src/test/java/org/example/simulator/kafka/ExchangeSimulatorKafkaIntegrationTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew test --tests '*ExchangeSimulatorKafkaIntegrationTest'` passes
- [x] **T-14** Add `SimulatorMetrics` counters, wire them into the engine, and add `SimulatorMetricsIntegrationTest` and the orderId log assertion first (AC-12)
  - files: oms-exchange-simulator/src/main/java/org/example/simulator/metrics/SimulatorMetrics.java, oms-exchange-simulator/src/main/java/org/example/simulator/engine/ExchangeEngine.java, oms-exchange-simulator/src/test/java/org/example/simulator/metrics/SimulatorMetricsIntegrationTest.java, oms-exchange-simulator/src/test/java/org/example/simulator/engine/ExchangeEngineTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew test --tests '*SimulatorMetricsIntegrationTest' --tests '*ExchangeEngineTest'` passes
- [x] **T-15** Add the Dockerfile, the `exchange-simulator` service in docker-compose.yml, and README.md
  - files: oms-exchange-simulator/Dockerfile, oms-exchange-simulator/README.md, docker-compose.yml
  - verify: `docker compose config --quiet` exits 0 and lists the `exchange-simulator` service
- [x] **T-16** Update the knowledge base and rest.http examples (exchange-simulator.md new; order-lifecycle.md; execution-reporting.md)
  - files: oms-knowledge-base/oms-concepts/exchange-simulator.md, oms-knowledge-base/oms-concepts/order-lifecycle.md, oms-knowledge-base/oms-concepts/execution-reporting.md, oms-core/rest.http
  - verify: the three pages contain the FIX → command mapping, the cancel-request flow and the `CXL_REQUEST`/`CXL_REJ` events (grep shows each term)
- [x] **T-22** Add optional `commandId` to the four lifecycle Avro records and OpenAPI schemas, and regenerate (AC-10, AC-11)
  - files: oms-contracts/src/main/avro/OrderRejectCmd.avsc, oms-contracts/src/main/avro/OrderCancelCmd.avsc, oms-contracts/src/main/avro/OrderCancelRequestCmd.avsc, oms-contracts/src/main/avro/OrderCancelRejectCmd.avsc, oms-contracts/src/main/openapi/oms-cmd-api.yml
  - verify: `cd oms-contracts && ./gradlew check` passes (including `CommandMessageCompatibilityTest`)
- [x] **T-23** Add `DeduplicateCommandTask` to the lifecycle pipeline and pass `commandId` through `CommandListener`, test first with `OrderLifecycleCommandProcessorTest#duplicateCommandId_refusedWithoutWrites`, `CommandListenerTest` and `ExchangeWorkflowIntegrationTest#replayedCancelRequestAndReject_afterProcessing_haveNoSecondEffect`, plus replay assertions (AC-10)
  - files: oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/DeduplicateCommandTask.java, oms-core/src/main/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessor.java, oms-core/src/main/java/org/example/oms/config/CommandListener.java, oms-core/src/test/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessorTest.java, oms-core/src/test/java/org/example/oms/config/CommandListenerTest.java, oms-core/src/test/java/org/example/oms/integration/ExchangeWorkflowIntegrationTest.java
  - verify: `cd oms-core && ./gradlew check` passes
- [x] **T-24** Make the simulator send deterministic commandIds derived from the triggering OrderMessage eventId, test first with `ExchangeEngineTest#commandIdsAreDeterministicPerAnswer` (AC-10)
  - files: oms-exchange-simulator/src/main/java/org/example/simulator/engine/CommandSink.java, oms-exchange-simulator/src/main/java/org/example/simulator/engine/ExchangeEngine.java, oms-exchange-simulator/src/main/java/org/example/simulator/kafka/CommandGateway.java, oms-exchange-simulator/src/test/java/org/example/simulator/engine/RecordingSink.java, oms-exchange-simulator/src/test/java/org/example/simulator/engine/ExchangeEngineTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew test --tests '*ExchangeEngineTest'` passes
- [x] **T-25** Fix the review's minor findings: offset reset `latest` by default, overflow-safe `FillSlicer`, eviction of terminal orders in the engine, each with a test (AC-1, AC-10)
  - files: oms-exchange-simulator/src/main/resources/application.yml, oms-exchange-simulator/src/main/java/org/example/simulator/engine/FillSlicer.java, oms-exchange-simulator/src/main/java/org/example/simulator/engine/ExchangeEngine.java, oms-exchange-simulator/src/test/java/org/example/simulator/engine/FillSlicerTest.java, oms-exchange-simulator/src/test/java/org/example/simulator/engine/ExchangeEngineTest.java, oms-exchange-simulator/src/test/java/org/example/simulator/kafka/ExchangeSimulatorKafkaIntegrationTest.java, oms-exchange-simulator/src/test/java/org/example/simulator/metrics/SimulatorMetricsIntegrationTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew check` passes
- [x] **T-17** Run `./gradlew check` in every affected module and contracts consumer, including the simulator, which `specs/config.json` does not list yet (AC-11)
  - files: (none, verification only)
  - verify: `./gradlew check` passes in oms-contracts, oms-core, oms-streaming-service, oms-mcp-server and oms-exchange-simulator
- [x] **T-18** Run spec verify
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0001` exits 0

## Notes

- Contracts (T-1/T-2) come first because every oms-core and simulator task compiles against the
  generated classes.
- The oms-core half (T-3–T-8) and the simulator half (T-9–T-14) are independent after T-2; they
  meet only at the Kafka contract, which is what the paired integration tests (T-7, T-13) prove.
- `oms-exchange-simulator` is not yet registered in `specs/config.json`, so T-17 runs its check
  explicitly until a human adds it.
- **T-19 was added during implementation** (placed after T-2 because it is a contract change). While
  preparing T-7, it turned out that `ExecutionCreateCmd` cannot carry a fill: the OpenAPI `Execution`
  had only execId/orderId and the mapper ignored every field. See the design, Alternatives &
  Decisions, "Changed during implementation".
- **T-20 was added during implementation**: the create path left cumQty and leavesQty null,
  contrary to order-lifecycle.md §8.1. The cancel-request precondition and AC-3 depend on them.
- **T-21 was added during implementation**: `ExchangeWorkflowIntegrationTest` showed every Kafka
  `ExecutionCreateCmd` going to the DLT. `CommandListener` converted the Avro record with Jackson
  `convertValue`, which serializes Avro's `getSchema()` and throws. The unit test mocked the
  ObjectMapper and hid it. The same pattern exists for `OrderCreateCmd`; it is outside this
  ticket's ACs and is recorded as a follow-up.
- T-13: the planned `KafkaConfig` class was not needed; Spring Boot's Kafka auto-configuration
  with the properties in application.yml provides the template and listener container.
- **T-22 to T-25 were added after the independent review** (verify stage, round 1). A replayed
  cancel request or cancel reject was re-applied after a cancel reject, because state
  preconditions alone are not idempotent across a Kafka replay. The minor findings are bundled into
  T-25. T-17 and T-18 were unticked so that they run again after the fix.
