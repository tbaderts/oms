# Tasks — SPEC-0033: Report telemetry from services via OpenTelemetry

> **Stage 3 of 3 — the executable plan.** The implement stage works top to bottom and ticks each
> box only when its `verify:` check passes.

## Tasks

### oms-core

- [x] **T-1** Write `TelemetryConfigurationTest` (resource attributes, no own span exporter, nothing exported by default); swap oms-core's explicit `micrometer-tracing-bridge-otel`/`opentelemetry-exporter-otlp` for `spring-boot-starter-opentelemetry` + `opentelemetry-logback-appender-1.0`; remove `OmsConfig#otlpGrpcSpanExporter` and the `tracing.*` properties; add the `management.opentelemetry/tracing/logging/otlp` block (AC-1, AC-5)
  - files: oms-core/build.gradle, oms-core/src/main/java/org/example/oms/config/OmsConfig.java, oms-core/src/main/resources/application.yml, oms-core/src/main/resources/application-dev.yml, oms-core/src/test/java/org/example/oms/config/TelemetryConfigurationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.config.TelemetryConfigurationTest'` passes
- [x] **T-2** Add `logback-spring.xml` (Boot defaults + CONSOLE + OTEL with MDC capture) and the `OpenTelemetryLogging` installer; `LoggingConfigTest` asserts the root has CONSOLE and OTEL, the OTEL appender is installed, and the console keeps the correlation block (AC-1, AC-4)
  - files: oms-core/src/main/resources/logback-spring.xml, oms-core/src/main/java/org/example/oms/config/OpenTelemetryLogging.java, oms-core/src/test/java/org/example/oms/config/LoggingConfigTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.config.LoggingConfigTest' --tests 'org.example.oms.config.TelemetryConfigurationTest'` passes
- [x] **T-3** Write `MockOtlpReceiver` and `OtlpExportIntegrationTest#tracesMetricsAndLogsReachTheEndpoint` (export on, endpoint = mock; a REST command yields POSTs on `/v1/traces`, `/v1/metrics`, `/v1/logs` containing `oms-core`) and make it green (AC-2)
  - files: oms-core/src/test/java/org/example/oms/integration/MockOtlpReceiver.java, oms-core/src/test/java/org/example/oms/integration/OtlpExportIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.OtlpExportIntegrationTest'` passes
- [x] **T-4** Write `OtlpExportIntegrationTest#kafkaCommandContinuesTheProducersTrace` and `ExchangeWorkflowIntegrationTest#publishedOrdersCarryTraceparent`, then enable observation on `KafkaProducerConfig#kafkaTemplate`, `KafkaConsumerConfig#deadLetterTemplate` and the listener container factory (AC-3)
  - files: oms-core/src/main/java/org/example/oms/config/KafkaProducerConfig.java, oms-core/src/main/java/org/example/oms/config/KafkaConsumerConfig.java, oms-core/src/test/java/org/example/oms/integration/OtlpExportIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/ExchangeWorkflowIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.OtlpExportIntegrationTest' --tests 'org.example.oms.integration.ExchangeWorkflowIntegrationTest'` passes
- [x] **T-5** Write `OtlpExportIntegrationTest#logRecordsCarryTraceAndMdc` (a consumed command's exported log record has its trace id, severity, logger and `commandId`) and make it green (AC-4)
  - files: oms-core/src/test/java/org/example/oms/integration/OtlpExportIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.OtlpExportIntegrationTest'` passes

### oms-exchange-simulator

- [x] **T-6** Same setup in the simulator: starter + appender, the config block (`service.name: oms-exchange-simulator`), `logback-spring.xml`, the installer; `TelemetryConfigurationTest` (AC-1, AC-5)
  - files: oms-exchange-simulator/build.gradle, oms-exchange-simulator/src/main/resources/application.yml, oms-exchange-simulator/src/main/resources/logback-spring.xml, oms-exchange-simulator/src/main/java/org/example/simulator/config/OpenTelemetryLogging.java, oms-exchange-simulator/src/test/java/org/example/simulator/config/TelemetryConfigurationTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew test --tests 'org.example.simulator.config.TelemetryConfigurationTest'` passes
- [x] **T-7** Write the simulator's `OtlpExportIntegrationTest` (an order yields traces, metrics and logs at a mock receiver) and `ExchangeSimulatorKafkaIntegrationTest#commandsCarryTheOrdersTrace` (an `OrderMessage` with `traceparent` T yields commands with trace id T); make them green (AC-2, AC-3)
  - files: oms-exchange-simulator/src/main/java/org/example/simulator/engine/ExchangeEngine.java, oms-exchange-simulator/src/test/java/org/example/simulator/telemetry/MockOtlpReceiver.java, oms-exchange-simulator/src/test/java/org/example/simulator/telemetry/OtlpExportIntegrationTest.java, oms-exchange-simulator/src/test/java/org/example/simulator/kafka/ExchangeSimulatorKafkaIntegrationTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew test --tests 'org.example.simulator.telemetry.OtlpExportIntegrationTest' --tests 'org.example.simulator.kafka.ExchangeSimulatorKafkaIntegrationTest'` passes

### oms-streaming-service

- [x] **T-8** Same setup in the streaming service (`service.name: oms-streaming-service`); `TelemetryConfigurationTest` (AC-1, AC-5)
  - files: oms-streaming-service/build.gradle, oms-streaming-service/src/main/resources/application.yml, oms-streaming-service/src/main/resources/logback-spring.xml, oms-streaming-service/src/main/java/org/example/streaming/config/OpenTelemetryLogging.java, oms-streaming-service/src/test/java/org/example/streaming/config/TelemetryConfigurationTest.java
  - verify: `cd oms-streaming-service && ./gradlew test --tests 'org.example.streaming.config.TelemetryConfigurationTest'` passes
- [x] **T-9** Write `KafkaConfigTest#receiversObserveRecords`, then add `.withObservation(observationRegistry)` to both `ReceiverOptions` in `KafkaConfig` (AC-3)
  - files: oms-streaming-service/src/main/java/org/example/streaming/config/KafkaConfig.java, oms-streaming-service/src/test/java/org/example/streaming/config/KafkaConfigTest.java
  - verify: `cd oms-streaming-service && ./gradlew test --tests 'org.example.streaming.config.KafkaConfigTest'` passes

### oms-mcp-server

- [x] **T-10** Same setup in the MCP server (`service.name: oms-mcp-server`): starter + appender, config block, OTEL added to both profile roots of the existing `logback-spring.xml` (stdio: FILE + OTEL, no console), the installer; `TelemetryConfigurationTest` and `McpLoggingConfigTest#stdioProfileHasNoConsoleAppender` (AC-1, AC-4, AC-5)
  - files: oms-mcp-server/build.gradle, oms-mcp-server/src/main/resources/application.yml, oms-mcp-server/src/main/resources/logback-spring.xml, oms-mcp-server/src/main/java/org/example/mcp/OpenTelemetryLogging.java, oms-mcp-server/src/test/java/org/example/mcp/TelemetryConfigurationTest.java, oms-mcp-server/src/test/java/org/example/mcp/McpLoggingConfigTest.java
  - verify: `cd oms-mcp-server && ./gradlew test --tests 'org.example.mcp.TelemetryConfigurationTest' --tests 'org.example.mcp.McpLoggingConfigTest'` passes

### Stack wiring

- [x] **T-11** Compose and host env: the four services get `OTLP_EXPORT_ENABLED`, `OTLP_ENDPOINT=http://alloy:4318`, `TRACING_SAMPLING_PROBABILITY`, `DEPLOYMENT_ENVIRONMENT` and `depends_on: alloy`; drop `TRACING_*`; `oms-core/.env` swaps `TRACING_URL` for `OTLP_ENDPOINT`/`OTLP_EXPORT_ENABLED` (AC-6)
  - files: docker-compose.yml, oms-core/.env
  - verify: `docker compose config --quiet` exits 0 and a search for `TRACING_URL` and `TRACING_ENABLED` in docker-compose.yml and oms-core/.env finds nothing
- [x] **T-12** Alloy: remove the `oms_core` scrape and `remote_write`; drop the four app services in `discovery.relabel "compose"` (AC-6)
  - files: oms-core/alloy-config.alloy
  - verify: `docker compose up -d --force-recreate alloy`, then Alloy's `http://localhost:12345/-/ready` returns 200
- [x] **T-13** Update the smoke test (metrics by `service_name`, Loki `service_name` with trace id and no `compose_service` copy, Tempo search by `service.name`, for oms-core and the simulator; infrastructure stdout (the broker's) still in Loki) and run it against the rebuilt stack (AC-6)
  - files: oms-core/scripts/lgtm-smoke-test.ps1, oms-core/mimir-config.yml
  - verify: `docker compose up -d --build`, then `powershell -File oms-core/scripts/lgtm-smoke-test.ps1` exits 0

### Regression and docs

- [x] **T-14** Run every module's full test suite (AC-5)
  - files: (none)
  - verify: `./gradlew test` passes in oms-core, oms-exchange-simulator, oms-streaming-service and oms-mcp-server
- [x] **T-15** Knowledge base and CLAUDE.md: NFR-007, system-context, CLAUDE.md Monitoring
  - files: oms-knowledge-base/non-functional-requirements/NFR-007-observability.md, oms-knowledge-base/architecture/system-context.md, CLAUDE.md, oms-core/README.md
  - verify: a search for `TRACING_URL` and `job="oms-core"` in CLAUDE.md and oms-knowledge-base finds nothing, and the pages name `OTLP_EXPORT_ENABLED` and `service_name`

### Review findings (added during implementation)

- [x] **T-17** Streaming service export test: an `OrderMessage` with a `traceparent` on an embedded broker yields a span with that trace id, plus metrics and logs, at a mock OTLP receiver (AC-2, AC-3)
  - files: oms-streaming-service/src/test/java/org/example/streaming/telemetry/MockOtlpReceiver.java, oms-streaming-service/src/test/java/org/example/streaming/telemetry/OtlpExportIntegrationTest.java
  - verify: `cd oms-streaming-service && ./gradlew test --tests 'org.example.streaming.telemetry.OtlpExportIntegrationTest'` passes, and fails with `.withObservation` removed from `KafkaConfig`
- [x] **T-18** MCP server export test: an HTTP request yields traces, metrics and logs at a mock OTLP receiver (AC-2)
  - files: oms-mcp-server/src/test/java/org/example/mcp/telemetry/MockOtlpReceiver.java, oms-mcp-server/src/test/java/org/example/mcp/telemetry/OtlpExportIntegrationTest.java
  - verify: `cd oms-mcp-server && ./gradlew test --tests 'org.example.mcp.telemetry.OtlpExportIntegrationTest'` passes
- [x] **T-19** Wording and coverage: the appender buffers early records (installers, design); NFR-007's trace chain; the appender pin in design Alternatives; LoggingConfigTest message; smoke test checks Mimir for all four services (AC-6)
  - files: oms-*/src/main/java/org/example/**/OpenTelemetryLogging.java, specs/changes/SPEC-0033-report-telemetry-from-services-via-opent/design.md, oms-knowledge-base/non-functional-requirements/NFR-007-observability.md, oms-core/src/test/java/org/example/oms/config/LoggingConfigTest.java, oms-core/scripts/lgtm-smoke-test.ps1
  - verify: `powershell -File oms-core/scripts/lgtm-smoke-test.ps1` exits 0, and the four module suites pass
- [x] **T-16** Run spec verify
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0033` exits 0

## Notes

- Each module builds standalone; its tasks run in that module only.
- T-12 and T-13 need the docker stack; no other task does.
- T-3 to T-5: the oms-core export test and its mock receiver live in `org.example.oms.integration`
  (not `…telemetry`), next to the shared container setup they reuse. The test has its own context
  and command topic; extending `AbstractKafkaPostgresIntegrationTest` would let that class's
  property source set the topic back to `commands`, shared with the cached contexts.
- T-7: the simulator hands every OrderMessage to its `exchange-engine` thread, so its answers
  started new traces. `ExchangeEngine` now wraps that executor with Micrometer's
  `ContextScheduledExecutorService`; recorded in design.md under "Changed during implementation".
