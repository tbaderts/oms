# Tasks — SPEC-0029: Model order expiry and close in state machine

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
`gt <Class>` = `cd oms-core && ./gradlew test --tests '*<Class>'`;
`st <Class>` = `cd oms-exchange-simulator && ./gradlew test --tests '*<Class>'`.

- [x] **T-1** Write `LifecycleCommandsContractTest#expireAndCloseInTheDiscriminator` red, and update the counts in `CommandSchemaTest` (13), `SchemaRegistrarTest` (16) and `CommandBaseContractTest` (3.2.0). Then add both OpenAPI schemas and mappings (3.2.0), the Avro records `OrderExpireCmd.avsc`/`OrderCloseCmd.avsc`, and their baselines; regenerate. Update the cockpit version pin (AC-7)
  - files: oms-contracts/src/test/java/org/example/common/contracts/LifecycleCommandsContractTest.java, oms-contracts/src/test/java/org/example/common/contracts/CommandSchemaTest.java, oms-contracts/src/test/java/org/example/common/contracts/registry/SchemaRegistrarTest.java, oms-contracts/src/test/java/org/example/common/contracts/CommandBaseContractTest.java, oms-contracts/src/main/openapi/oms-cmd-api.yml, oms-contracts/src/main/avro/OrderExpireCmd.avsc, oms-contracts/src/main/avro/OrderCloseCmd.avsc, oms-contracts/src/test/resources/compat/commands/OrderExpireCmd.json, oms-contracts/src/test/resources/compat/commands/OrderCloseCmd.json, developer-cockpit/test/main/ApiCatalogService.test.ts
  - verify: `cd oms-contracts && ./gradlew clean build` passes; `cd developer-cockpit && npx vitest run test/main/ApiCatalogService.test.ts` passes
- [x] **T-2** Write `OrderStateMachineConfigTest` (`productTransitionsAreExactly`, `onlyClosedIsTerminal`) and `OrderStateMachinesTest` red. Then replace the three configurations with `product()`, add the `OrderStateMachines` component, and inject it into `OrderAcceptCommandProcessor`, `SetOrderStateTask`, `DetermineOrderStateTask` and `ValidateLifecycleActionTask` (with their test constructors) (AC-1)
  - files: oms-core/src/test/java/org/example/common/state/OrderStateMachineConfigTest.java, oms-core/src/test/java/org/example/common/state/OrderStateMachinesTest.java, oms-core/src/main/java/org/example/common/state/OrderStateMachineConfig.java, oms-core/src/main/java/org/example/common/state/OrderStateMachines.java, the four users and their tests
  - verify: `gt OrderStateMachineConfigTest`, `gt OrderStateMachinesTest`, `gt OrderAcceptCommandProcessorTest`, `gt SetOrderStateTaskTest` and `gt OrderLifecycleCommandProcessorTest` pass
- [x] **T-3** Write `OrderLifecycleCommandProcessorTest` `expire_*` and `close_*` cases red (states allowed and refused, quantities, event, reason kept in the command). Then add `LifecycleAction.EXPIRE`/`CLOSE`, `Event.EXP`/`CLOSE`, the validation cases, and the processor mapping and `supports` (AC-2, AC-3)
  - files: oms-core/src/test/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessorTest.java, oms-core/src/main/java/org/example/oms/service/lifecycle/LifecycleAction.java, oms-core/src/main/java/org/example/oms/model/Event.java, oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/ValidateLifecycleActionTask.java, oms-core/src/main/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessor.java
  - verify: `gt OrderLifecycleCommandProcessorTest` passes
- [x] **T-4** Write `CommandListenerTest` cases for the Avro `OrderExpireCmd`/`OrderCloseCmd` red, then map them in `CommandListener` (AC-2, AC-3)
  - files: oms-core/src/test/java/org/example/oms/config/CommandListenerTest.java, oms-core/src/main/java/org/example/oms/config/CommandListener.java
  - verify: `gt CommandListenerTest` passes
- [x] **T-5** Write `OrderExpiryCloseIntegrationTest` (`expireOverRestAndKafka`, `closeLiveAndFinishedOrders`) and make it green (AC-2, AC-3)
  - files: oms-core/src/test/java/org/example/oms/integration/OrderExpiryCloseIntegrationTest.java
  - verify: `gt OrderExpiryCloseIntegrationTest` passes
- [x] **T-6** Write `EndOfDayIntegrationTest` (`gtdExpiryExpiresOnlyDueGtdOrders`, `endOfDayExpiresDayOrders`, `endOfDayClosesOrdersFinishedBeforeTheCutoff`, `stepsAreIdempotent`) and `EndOfDaySchedulerTest#cronAndZoneFromConfiguration` red. Then add the `OrderRepository` finders, `OrderExpiryService`, `EndOfDayService`, `EndOfDayScheduler`, the `oms.end-of-day.*` configuration and the test-only `config/application.yml` (AC-4, AC-5)
  - files: oms-core/src/test/java/org/example/oms/integration/EndOfDayIntegrationTest.java, oms-core/src/test/java/org/example/oms/service/endofday/EndOfDaySchedulerTest.java, oms-core/src/main/java/org/example/oms/repository/OrderRepository.java, oms-core/src/main/java/org/example/oms/service/endofday/OrderExpiryService.java, oms-core/src/main/java/org/example/oms/service/endofday/EndOfDayService.java, oms-core/src/main/java/org/example/oms/service/endofday/EndOfDayScheduler.java, oms-core/src/main/resources/application.yml, oms-core/src/test/resources/config/application.yml
  - verify: `gt EndOfDayIntegrationTest` and `gt EndOfDaySchedulerTest` pass
- [x] **T-7** Write `ExchangeEngineTest#finalStateStopsTheOrder` red, then mark a known order done when its message state is final (AC-6)
  - files: oms-exchange-simulator/src/test/java/org/example/simulator/engine/ExchangeEngineTest.java, oms-exchange-simulator/src/main/java/org/example/simulator/engine/ExchangeEngine.java
  - verify: `cd oms-exchange-simulator && ./gradlew check` passes
- [x] **T-8** Update the knowledge base: `oms-concepts/order-lifecycle.md`, a new `capabilities/order-expiry-and-close.md` (and the index), `interfaces/command-api.md`, `interfaces/avro-messages.md`, `capabilities/exchange-simulation.md`, `domain/order-state.md` (AC-1, AC-4, AC-5)
  - files: oms-knowledge-base/oms-concepts/order-lifecycle.md, oms-knowledge-base/capabilities/order-expiry-and-close.md, oms-knowledge-base/capabilities/index.md, oms-knowledge-base/interfaces/command-api.md, oms-knowledge-base/interfaces/avro-messages.md, oms-knowledge-base/capabilities/exchange-simulation.md, oms-knowledge-base/domain/order-state.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports 0 errors
- [x] **T-9** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0029` exits 0

- [x] **T-10** Review fixes, test first. Tests: `EndOfDayServiceTest` (a failing order does not stop expiry or close; failures counted), `EndOfDaySchedulerTest` (`H:mm` text, an invalid time names the property, own `end-of-day-` thread), the order without time in force in `EndOfDayIntegrationTest`, and the cancel reject on CLOSED (refused) and on EXP (recorded) in `OrderLifecycleCommandProcessorTest`. Then: the scheduler on its own `ThreadPoolTaskScheduler`, per-order `RuntimeException` handling with the `oms.end-of-day.orders`/`failures` metrics, `findDayOrderIds` (DAY or null), the cancel-reject rule, and the knowledge-base corrections and known gaps (AC-4, AC-5, AC-6)
  - files: oms-core/src/main/java/org/example/oms/service/endofday/*.java, oms-core/src/main/java/org/example/oms/repository/OrderRepository.java, oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/ValidateLifecycleActionTask.java, oms-core/src/test/java/org/example/oms/service/endofday/*.java, oms-core/src/test/java/org/example/oms/integration/EndOfDayIntegrationTest.java, oms-core/src/test/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessorTest.java, oms-knowledge-base/capabilities/order-expiry-and-close.md, oms-knowledge-base/interfaces/query-api.md, oms-knowledge-base/domain/order-event.md, oms-knowledge-base/oms-concepts/order-lifecycle.md
  - verify: the named tests pass; then `node specs/tools/spec.mjs verify SPEC-0029` exits 0

## Notes

- T-1 regenerates the contracts; oms-core compiles against the new models from T-3 on.
- T-1 also touched `developer-cockpit/api-templates/lifecycle.http` (starter templates for the two commands, required by the cockpit test that every command type has one) and `test/renderer/api-schema.test.ts` (9 command types).
- T-3 also extended the query API's `OrderEventType` (EXP, CLOSE; query API 2.1.0) and `OrderEventContractTest`: the event-log mapper did not compile otherwise. Recorded in design.md.
- After the second review, `EndOfDayIntegrationTest#endOfDayClosesOrdersFinishedBeforeTheCutoff` gained CXL and REJ fixtures and a check of the CLOSED `OrderMessage` on `orders` (AC-5 was rated weak).
