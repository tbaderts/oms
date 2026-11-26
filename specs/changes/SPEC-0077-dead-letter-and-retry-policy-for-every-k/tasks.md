# Tasks — SPEC-0077: Dead-letter and retry policy for every Kafka client

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

- [x] **T-1** Update the outbox state and `maxAttempts` descriptions in the query API and regenerate (AC-7)
  - files: oms-contracts/src/main/openapi/oms-query-api.yml
  - verify: `cd oms-contracts && ./gradlew build` passes
- [x] **T-2** oms-core: add `kafka.errors` (`ErrorPolicyProperties`, `ErrorClassifier`, `DeadLetters`, `DeadLetterMetrics`) test-first (AC-3, AC-10)
  - files: oms-core/src/main/java/org/example/oms/kafka/errors/*, oms-core/src/main/resources/application.yml, oms-core/src/test/java/org/example/oms/kafka/errors/ErrorClassifierTest.java, oms-core/src/test/java/org/example/oms/kafka/errors/ErrorPolicyPropertiesTest.java, oms-core/src/test/java/org/example/oms/kafka/errors/DeadLettersTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.kafka.errors.*'` passes, incl. `ErrorClassifierTest#classifiesTable` and `ErrorPolicyPropertiesTest#defaultsAndBinding`
- [x] **T-3** oms-core: provision the dead-letter topics at startup test-first (AC-8)
  - files: oms-core/src/main/java/org/example/oms/kafka/errors/DeadLetterTopicProvisioner.java, oms-core/src/test/java/org/example/oms/integration/DeadLetterTopicsIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.DeadLetterTopicsIntegrationTest'` passes (`provisionedWithSourcePartitions`)
- [x] **T-4** oms-core: command consumer uses the window back-off, the classifier and `commands.oms-core.DLT` test-first (AC-1, AC-2, AC-3, AC-5, AC-8)
  - files: oms-core/src/main/java/org/example/oms/config/KafkaConsumerConfig.java, oms-core/src/main/resources/application.yml, oms-core/src/test/java/org/example/oms/integration/CommandErrorPolicyIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/CommandDeadLetterIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/CommandRetryBudgetIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/DeadLetterReaderIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.CommandErrorPolicyIntegrationTest' --tests 'org.example.oms.integration.CommandDeadLetterIntegrationTest' --tests 'org.example.oms.integration.CommandRetryBudgetIntegrationTest' --tests 'org.example.oms.integration.OrderVersionIntegrationTest' --tests 'org.example.oms.integration.DeadLetterReaderIntegrationTest'` passes
- [x] **T-5** oms-core: Liquibase changelog 020 for the outbox dead-letter columns and backfill test-first (AC-7)
  - files: oms-core/src/main/resources/db/changelog/020-outbox-dead-letter.yaml, oms-core/src/main/resources/db/changelog/db.changelog-master.yaml, oms-core/src/main/java/org/example/oms/model/OutboxMessage.java, oms-core/src/test/java/org/example/oms/integration/OutboxDeadLetterMigrationIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.OutboxDeadLetterMigrationIntegrationTest' --tests 'org.example.oms.integration.LiquibaseMigrationIntegrationTest'` passes
- [x] **T-6** oms-core: outbox relay retries by window with back-off, dead-letters non-retryable and expired rows, parks them and holds their aggregate test-first (AC-6, AC-7, AC-8)
  - files: oms-core/src/main/java/org/example/oms/service/OutboxRelay.java, oms-core/src/main/java/org/example/oms/service/OutboxDeadLetterPublisher.java, oms-core/src/main/java/org/example/oms/repository/OutboxRepository.java, oms-core/src/main/java/org/example/oms/config/KafkaProducerConfig.java, oms-core/src/test/java/org/example/oms/integration/OutboxDeadLetterIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/OutboxHoldIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.OutboxDeadLetterIntegrationTest' --tests 'org.example.oms.integration.OutboxHold*' --tests 'org.example.oms.integration.OutboxClaimIntegrationTest' --tests 'org.example.oms.service.OutboxRelay*'` passes
- [x] **T-7** oms-core: outbox inspector and gauges use the parked state (AC-7)
  - files: oms-core/src/main/java/org/example/oms/admin/OutboxInspector.java, oms-core/src/test/java/org/example/oms/integration/OutboxInspectorIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.OutboxInspectorIntegrationTest' --tests 'org.example.oms.api.AdminControllerWebMvcTest'` passes
- [x] **T-8** oms-core: Kafka client coverage test (AC-9)
  - files: oms-core/src/test/java/org/example/oms/kafka/errors/KafkaClientCoverageTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.kafka.errors.KafkaClientCoverageTest'` passes
- [x] **T-9** Simulator: copy `kafka.errors` with its tests and provision its dead-letter topics, test-first (AC-3, AC-8, AC-10)
  - files: oms-exchange-simulator/src/main/java/org/example/simulator/kafka/errors/*, oms-exchange-simulator/src/main/resources/application.yml, oms-exchange-simulator/src/test/java/org/example/simulator/kafka/errors/*
  - verify: `cd oms-exchange-simulator && ./gradlew test --tests 'org.example.simulator.kafka.errors.*'` passes
- [x] **T-10** Simulator: order consumer reads bytes, decodes in code, retries by window and dead-letters, test-first (AC-1, AC-2, AC-3)
  - files: oms-exchange-simulator/src/main/java/org/example/simulator/kafka/OrderMessageListener.java, oms-exchange-simulator/src/main/java/org/example/simulator/kafka/OrderMessageDecoder.java, oms-exchange-simulator/src/main/java/org/example/simulator/kafka/errors/KafkaErrorHandlingConfig.java, oms-exchange-simulator/src/main/resources/application.yml, oms-exchange-simulator/src/test/java/org/example/simulator/kafka/OrderListenerErrorPolicyIntegrationTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew test --tests 'org.example.simulator.kafka.OrderListenerErrorPolicyIntegrationTest' --tests 'org.example.simulator.kafka.ExchangeSimulatorKafkaIntegrationTest'` passes
- [x] **T-11** Simulator: asynchronous command sends with the producer window and dead-lettering, test-first (AC-6, AC-7)
  - files: oms-exchange-simulator/src/main/java/org/example/simulator/kafka/CommandGateway.java, oms-exchange-simulator/src/main/java/org/example/simulator/kafka/CommandDeadLetterPublisher.java, oms-exchange-simulator/src/main/java/org/example/simulator/engine/ExchangeEngine.java, oms-exchange-simulator/src/test/java/org/example/simulator/kafka/CommandGatewayTest.java, oms-exchange-simulator/src/test/java/org/example/simulator/kafka/CommandGatewayIntegrationTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew test --tests 'org.example.simulator.kafka.CommandGateway*' --tests 'org.example.simulator.engine.*'` passes
- [x] **T-12** Simulator: Kafka client coverage test (AC-9)
  - files: oms-exchange-simulator/src/test/java/org/example/simulator/kafka/errors/KafkaClientCoverageTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew test --tests 'org.example.simulator.kafka.errors.KafkaClientCoverageTest'` passes
- [x] **T-13** Streaming service: copy `kafka.errors` with its tests and provision its dead-letter topics, test-first (AC-3, AC-8, AC-10)
  - files: oms-streaming-service/src/main/java/org/example/streaming/kafka/errors/*, oms-streaming-service/src/main/resources/application.yml, oms-streaming-service/src/test/java/org/example/streaming/kafka/errors/*
  - verify: `cd oms-streaming-service && ./gradlew test --tests 'org.example.streaming.kafka.errors.*'` passes
- [x] **T-14** Streaming service: byte-array receivers, per-record retry window and dead letters, test-first (AC-1, AC-2, AC-3, AC-4)
  - files: oms-streaming-service/src/main/java/org/example/streaming/config/KafkaConfig.java, oms-streaming-service/src/main/java/org/example/streaming/service/KafkaEventStreamProvider.java, oms-streaming-service/src/main/java/org/example/streaming/kafka/errors/RecordErrorPolicy.java, oms-streaming-service/src/main/java/org/example/streaming/kafka/errors/StreamingDeadLetterPublisher.java, oms-streaming-service/src/main/java/org/example/streaming/kafka/AvroRecordDecoder.java, oms-streaming-service/src/test/java/org/example/streaming/kafka/StreamErrorPolicyIntegrationTest.java, oms-streaming-service/src/test/java/org/example/streaming/config/KafkaConfigTest.java
  - verify: `cd oms-streaming-service && ./gradlew test --tests 'org.example.streaming.kafka.StreamErrorPolicyIntegrationTest' --tests 'org.example.streaming.config.KafkaConfigTest'` passes, incl. `poisonRecordDeadLetteredAndStreamContinues`
- [x] **T-15** Streaming service: Kafka client coverage test (AC-9)
  - files: oms-streaming-service/src/test/java/org/example/streaming/kafka/errors/KafkaClientCoverageTest.java
  - verify: `cd oms-streaming-service && ./gradlew test --tests 'org.example.streaming.kafka.errors.KafkaClientCoverageTest'` passes
- [x] **T-16** Run each affected module's full check (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10)
  - files: (none)
  - verify: `./gradlew check` passes in oms-contracts, oms-core, oms-exchange-simulator and oms-streaming-service
- [x] **T-17** Update the knowledge base (P-19)
  - files: oms-knowledge-base/architecture/patterns/kafka-messaging.md, oms-knowledge-base/capabilities/event-publication.md, oms-knowledge-base/capabilities/functional-requirements/FR-024-retry-failed-publication.md, oms-knowledge-base/domain/model/outbox-message.md, oms-knowledge-base/architecture/context/exchange-simulator.md, oms-knowledge-base/architecture/context/streaming-service.md, oms-knowledge-base/domain/interfaces/query-api.md, oms-knowledge-base/ui/admin-ui.md, oms-knowledge-base/log.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports no errors
- [x] **T-18** Run spec verify
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0077` exits 0

## Notes

Order: contracts (T-1) first, then oms-core (T-2–T-8), the simulator (T-9–T-12) and the streaming
service (T-13–T-15); each service's `kafka.errors` package comes before its clients. The streaming
tests use a Testcontainers Kafka broker and a `mock://` schema registry (Testcontainers added to that
module, D-14). `provisionedWithSourcePartitions` and `listenerFactoryUsesThePolicy` live in each module's
error-policy integration test class.
