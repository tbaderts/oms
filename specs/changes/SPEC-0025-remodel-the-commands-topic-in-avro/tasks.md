# Tasks — SPEC-0025: Remodel the commands topic in Avro

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

- [x] **T-1** Write `CommandSchemaTest` (`headerFieldsAsSpecified`, `everyCommandStartsWithHeader`, `envelopeAndDeadSchemasAreGone`) and `CommandBaseContractTest` (`baseCarriesHeaderFields`, `versionIs310`) red (AC-1, AC-2)
  - files: oms-contracts/src/test/java/org/example/common/contracts/CommandSchemaTest.java, oms-contracts/src/test/java/org/example/common/contracts/CommandBaseContractTest.java
  - verify: `ct CommandSchemaTest` and `ct CommandBaseContractTest` fail: no `CommandHeader`, records still start with `type`, the envelope still exists, the base has no `correlationId`, and the version is 3.0.0
- [x] **T-2** Add `CommandHeader.avsc`, rewrite the eleven `*Cmd.avsc` records as in the design table, and delete `CommandMessage.avsc`, `Command.avsc`, `Cmd.avsc`, `CommandMessageCompatibilityTest` and `compat/CommandMessage-baseline.json`. Move `DecimalPrecisionContractTest` to the bare `OrderCreateCmd` (AC-1)
  - files: oms-contracts/src/main/avro/CommandHeader.avsc, oms-contracts/src/main/avro/*Cmd.avsc, oms-contracts/src/main/avro/CommandMessage.avsc, oms-contracts/src/main/avro/Command.avsc, oms-contracts/src/main/avro/Cmd.avsc, oms-contracts/src/test/java/org/example/common/contracts/CommandMessageCompatibilityTest.java, oms-contracts/src/test/resources/compat/CommandMessage-baseline.json, oms-contracts/src/test/java/org/example/common/contracts/DecimalPrecisionContractTest.java
  - verify: `cd oms-contracts && ./gradlew clean build -x test` passes, and `ct CommandSchemaTest` and `ct DecimalPrecisionContractTest` pass
- [x] **T-3** Write `CommandCompatibilityTest` (parameterised `readsBaseline` over every `*Cmd`) and write the eleven baselines `compat/commands/<Record>.json` from the new class schemas (AC-1)
  - files: oms-contracts/src/test/java/org/example/common/contracts/CommandCompatibilityTest.java, oms-contracts/src/test/resources/compat/commands/*.json
  - verify: `ct CommandCompatibilityTest` passes with 11 cases. Changing a baseline field to an incompatible type makes it fail (checked once by hand, then reverted)
- [x] **T-4** Add `commandId`, `correlationId`, `causationId` and `sentAt` to the OpenAPI `Command` base, remove `commandId` from the four lifecycle schemas, and set `info.version` to 3.1.0. Update the cockpit's pinned version test if it pins 3.0.0 (AC-2)
  - files: oms-contracts/src/main/openapi/oms-cmd-api.yml, developer-cockpit/test/main/ApiCatalogService.test.ts
  - verify: `cd oms-contracts && ./gradlew clean build` passes (incl. `CommandBaseContractTest`); `cd developer-cockpit && npx vitest run test/main/ApiCatalogService.test.ts` passes
- [x] **T-5** Write `SchemaRegistrarTest` (`registersEveryCommandAndEventSubject`, `serializerWithoutAutoRegisterFindsTheId`, `incompatibleSubjectFailsAndRegistersNothing`) red, then add the `registry` source set, `SchemaRegistrar` (two phases, class schemas) and the `registerSchemas` JavaExec task (AC-6)
  - files: oms-contracts/build.gradle, oms-contracts/src/registry/java/org/example/common/contracts/registry/SchemaRegistrar.java, oms-contracts/src/test/java/org/example/common/contracts/registry/SchemaRegistrarTest.java
  - verify: `ct SchemaRegistrarTest` passes; `cd oms-contracts && ./gradlew build` passes, and the jar has no `registry` classes (`jar tf build/libs/*.jar | grep -c registry/SchemaRegistrar` prints 0)
- [x] **T-6** Write `CommandHeaderMapperTest` red, then add `mapper/CommandHeaderMapper`. Make `OrderEventAppender.commandIdOf` read the base `getCommandId()` (AC-3)
  - files: oms-core/src/test/java/org/example/oms/mapper/CommandHeaderMapperTest.java, oms-core/src/main/java/org/example/oms/mapper/CommandHeaderMapper.java, oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java
  - verify: `gt CommandHeaderMapperTest` passes, and `gt DeduplicateCommandTaskTest` still passes (if absent, `gt OrderLifecycleCommandProcessorTest`)
- [x] **T-7** Rewrite `CommandListenerTest` for bare records (dispatch per record with the header mapped, unknown type throws, undecodable throws `UndecodableCommandException`) red. Then add `config/CommandDecoder` and `UndecodableCommandException`, change `CommandListener` to `consume(ConsumerRecord<String, byte[]>)` → `handle(SpecificRecord, Instant)`, and type `KafkaConsumerConfig` `<String, byte[]>` with the `deadLetterTemplate` (AC-3, AC-4)
  - files: oms-core/src/test/java/org/example/oms/config/CommandListenerTest.java, oms-core/src/main/java/org/example/oms/config/CommandDecoder.java, oms-core/src/main/java/org/example/oms/config/UndecodableCommandException.java, oms-core/src/main/java/org/example/oms/config/CommandListener.java, oms-core/src/main/java/org/example/oms/config/KafkaConsumerConfig.java, oms-core/src/main/resources/application.yml
  - verify: `gt CommandListenerTest` passes
- [x] **T-8** Add `integration/TestCommands` (header builder, record-name-strategy template), set `KAFKA_AUTO_REGISTER_SCHEMAS=true` in `AbstractKafkaPostgresIntegrationTest`, set `auto.register.schemas: ${KAFKA_AUTO_REGISTER_SCHEMAS:false}` in oms-core `application.yml`, and move every integration test that sends commands to bare records (AC-3, AC-5)
  - files: oms-core/src/test/java/org/example/oms/integration/TestCommands.java, oms-core/src/test/java/org/example/oms/integration/AbstractKafkaPostgresIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/AbstractFillFlowIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/CommandListenerKafkaIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/ExchangeWorkflowIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/OrderExecutionPublicationIntegrationTest.java, oms-core/src/main/resources/application.yml
  - verify: `cd oms-core && ./gradlew compileTestJava` passes; `gt CommandListenerKafkaIntegrationTest`, `gt ExchangeWorkflowIntegrationTest` and `gt OrderExecutionPublicationIntegrationTest` pass
- [x] **T-9** Write `CommandHeaderIntegrationTest#headerReachesTheEventLog` (create → accept → partial fill → cancel request, each with its own header) and make it green (AC-3)
  - files: oms-core/src/test/java/org/example/oms/integration/CommandHeaderIntegrationTest.java
  - verify: `gt CommandHeaderIntegrationTest` passes, and fails if `CommandHeaderMapper` skips `causationId` (checked once by hand, then reverted)
- [x] **T-10** Write `CommandDeadLetterIntegrationTest#unhandledUndecodableAndGarbageKeepTheirBytes` red against the old recoverer if it is still reachable, else straight to green. Fix whatever it shows in the dead-letter path (AC-4)
  - files: oms-core/src/test/java/org/example/oms/integration/CommandDeadLetterIntegrationTest.java, oms-core/src/main/java/org/example/oms/config/KafkaConsumerConfig.java
  - verify: `gt CommandDeadLetterIntegrationTest` passes: three byte-identical dead letters, each delivered once, and the following accept is applied
- [x] **T-11** Write `CommandListenerTest#countsAppliedRefusedFailed` and `#mdcCarriesCommandAndCorrelationId` red, then add the `oms.commands.consumed` counter and the MDC to `CommandListener` (AC-7)
  - files: oms-core/src/test/java/org/example/oms/config/CommandListenerTest.java, oms-core/src/main/java/org/example/oms/config/CommandListener.java
  - verify: `gt CommandListenerTest` passes
- [x] **T-12** Write `CommandListenerKafkaIntegrationTest#logLinesCarryCommandAndCorrelationId` red, then set `logging.pattern.correlation` in oms-core `application.yml` (AC-7)
  - files: oms-core/src/test/java/org/example/oms/integration/CommandListenerKafkaIntegrationTest.java, oms-core/src/main/resources/application.yml
  - verify: `gt CommandListenerKafkaIntegrationTest` passes
- [x] **T-13** Write `CommandHeadersTest` red, then add simulator `engine/Cause`, the `Cause` parameter on `CommandSink` (`ExchangeEngine`, `RecordingSink`, `ExchangeEngineTest`), and `kafka/CommandHeaders`. `CommandGateway` sends bare records (AC-5)
  - files: oms-exchange-simulator/src/test/java/org/example/simulator/kafka/CommandHeadersTest.java, oms-exchange-simulator/src/main/java/org/example/simulator/engine/Cause.java, oms-exchange-simulator/src/main/java/org/example/simulator/engine/CommandSink.java, oms-exchange-simulator/src/main/java/org/example/simulator/engine/ExchangeEngine.java, oms-exchange-simulator/src/main/java/org/example/simulator/kafka/CommandHeaders.java, oms-exchange-simulator/src/main/java/org/example/simulator/kafka/CommandGateway.java, oms-exchange-simulator/src/test/java/org/example/simulator/engine/RecordingSink.java, oms-exchange-simulator/src/test/java/org/example/simulator/engine/ExchangeEngineTest.java
  - verify: `st CommandHeadersTest` and `st ExchangeEngineTest` pass
- [x] **T-14** Extend `ExchangeSimulatorKafkaIntegrationTest` (bare values, header content, `#commandsUseOneSubjectPerRecord`) red, then set the simulator producer's `TopicRecordNameStrategy` and `auto.register.schemas: ${KAFKA_AUTO_REGISTER_SCHEMAS:false}`, and the variable in `AbstractKafkaIntegrationTest` (AC-5, AC-6)
  - files: oms-exchange-simulator/src/test/java/org/example/simulator/kafka/ExchangeSimulatorKafkaIntegrationTest.java, oms-exchange-simulator/src/test/java/org/example/simulator/AbstractKafkaIntegrationTest.java, oms-exchange-simulator/src/main/resources/application.yml
  - verify: `cd oms-exchange-simulator && ./gradlew check` passes
- [x] **T-15** Write the `SchemaRegistrationConfigTest` in oms-core and in the simulator (yml resolves `false` without the variable and `true` with it; compose sets it only for `oms-core` and `exchange-simulator`) red, then set `KAFKA_AUTO_REGISTER_SCHEMAS: "true"` in `docker-compose.yml` (AC-6)
  - files: oms-core/src/test/java/org/example/oms/config/SchemaRegistrationConfigTest.java, oms-exchange-simulator/src/test/java/org/example/simulator/SchemaRegistrationConfigTest.java, docker-compose.yml
  - verify: `gt SchemaRegistrationConfigTest` and `st SchemaRegistrationConfigTest` pass; `docker compose config -q` exits 0
- [x] **T-16** Check that oms-streaming-service and oms-mcp-server still build against the new contracts jar (AC-1)
  - files: (none expected; fixes as the compiler reports them)
  - verify: `cd oms-streaming-service && ./gradlew check` and `cd oms-mcp-server && ./gradlew check` pass
- [x] **T-17** Update the knowledge base and contracts README: `interfaces/avro-messages.md` (header, subjects, registration, cut-over runbook), `interfaces/kafka-topics.md`, `interfaces/command-api.md`, `capabilities/exchange-simulation.md`, `oms-framework/error-handling.md`, `oms-framework/testing-patterns.md`, `oms-contracts/README.md` (AC-1, AC-4, AC-5, AC-6)
  - files: oms-knowledge-base/interfaces/avro-messages.md, oms-knowledge-base/interfaces/kafka-topics.md, oms-knowledge-base/interfaces/command-api.md, oms-knowledge-base/capabilities/exchange-simulation.md, oms-knowledge-base/oms-framework/error-handling.md, oms-knowledge-base/oms-framework/testing-patterns.md, oms-contracts/README.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports 0 errors, and `grep -rl CommandMessage oms-knowledge-base oms-contracts/README.md` prints nothing
- [x] **T-18** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0025` exits 0

- [x] **T-19** Review fixes: host-native runs auto-register (`oms-core/.env`, simulator README), the avro-messages registration and commandId notes, `CommandDeadLetterIntegrationTest` asserts one failed attempt per dead letter, `CommandBaseContractTest` asserts the base fields are optional, the dead-letter producer is closed on shutdown, the stale simulator build comment (AC-4, AC-2, AC-6)
  - files: oms-core/.env, oms-exchange-simulator/README.md, oms-exchange-simulator/build.gradle, oms-knowledge-base/interfaces/avro-messages.md, oms-core/src/test/java/org/example/oms/integration/CommandDeadLetterIntegrationTest.java, oms-contracts/src/test/java/org/example/common/contracts/CommandBaseContractTest.java, oms-core/src/main/java/org/example/oms/config/KafkaConsumerConfig.java
  - verify: `ct CommandBaseContractTest` and `gt CommandDeadLetterIntegrationTest` pass, then `node specs/tools/spec.mjs verify SPEC-0025` exits 0
## Notes

- T-2 deletes the envelope, which breaks the oms-core and simulator compile until T-7/T-8 and T-13.
  Tasks in those modules start from a compile failure, which is the expected red.
- `./gradlew clean build` in oms-contracts after any `.avsc` change: generated classes embed the
  schemas of the records they reference.
- T-6/T-7 were verified after T-8: the test sources only compile once every integration test has
  left the envelope.
- T-8 touched two more kinds of test than listed: `DecimalPrecisionIntegrationTest` also sends
  commands, and the tests that read the event topics (`ExchangeWorkflow…`, `OrderExecutionPublication…`,
  `DecimalPrecision…`, `ProjectionIntegrationTest`, `ProjectionRebuildIntegrationTest`) build their
  consumers from the application's consumer factory, whose value deserializer is now
  `ByteArrayDeserializer`. They pass `TestCommands.avroValues()` as consumer overrides.
- First `spec verify` (T-18) failed one test: `ExchangeWorkflowIntegrationTest#duplicateCommandId_overKafka_isAcknowledgedNotDeadLettered`
  read `commands.DLT` with the Avro override that T-8 had given it, and the garbage dead letter of
  `CommandDeadLetterIntegrationTest` (same broker, full suite) could not be decoded. The test only
  checks keys; it now reads the topic as bytes.
