# Design — SPEC-0033: Report telemetry from services via OpenTelemetry

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

The proposal was approved without notes, so its assumptions stand: logs over OTLP (stdout
scraping only for infrastructure), `/actuator/prometheus` kept where it exists, OTLP over HTTP, and
oms-ui out of scope.

**Today:**
- **oms-core:**
  - `build.gradle` has `micrometer-tracing-bridge-otel`, `opentelemetry-exporter-otlp` and
    `micrometer-registry-prometheus`.
  - `OmsConfig#otlpGrpcSpanExporter` is behind `tracing.enabled` (default false) and `tracing.url`.
  - Sampling: `management.tracing.sampling.probability: 0.1` (dev 1.0; compose
    `MANAGEMENT_TRACING_SAMPLING_PROBABILITY=1.0`).
  - Kafka: own `KafkaTemplate` beans (`KafkaProducerConfig#kafkaTemplate` for the outbox,
    `KafkaConsumerConfig#deadLetterTemplate`) and its own `ConcurrentKafkaListenerContainerFactory`.
    Observation is on none of them, so the `spring.kafka.*.observation-enabled` properties would not
    reach them.
  - Log pattern: Boot's default with a correlation block (SPEC-0025).
  - `spring.application.name: oms`.
- **oms-streaming-service:** actuator only. Kafka via reactor-kafka 1.3.25 `KafkaReceiver`
  (`KafkaConfig#orderMessageReceiver`, `#orderExecutionReceiver`), without observation.
- **oms-exchange-simulator:** actuator, Prometheus registry; `spring.kafka.template/listener.
  observation-enabled: true` (auto-configured template and listener).
- **oms-mcp-server:** no telemetry.
  - `logback-spring.xml`: file only in the `mcp`/`default` profiles (stdio), console and file in
    `local`/`dev`.
  - `spring.main.web-application-type: none`.
- **Alloy** (`oms-core/alloy-config.alloy`): an OTLP receiver feeds Tempo, Mimir and Loki. It
  scrapes `oms-core:8090/actuator/prometheus` (`job="oms-core"`), and `loki.source.docker` ships
  every compose container's stdout with the label `compose_service`.
- **Grafana:** the Tempo datasource's `tracesToLogsV2` filters Loki by `service_name` and trace id.
- **Compose:** `oms-core` has `TRACING_URL`, `TRACING_ENABLED`,
  `MANAGEMENT_TRACING_SAMPLING_PROBABILITY`; `oms-core/.env` has `TRACING_URL=http://localhost:4317`.
- **Smoke test** (`oms-core/scripts/lgtm-smoke-test.ps1`): AC-4 checks `up{job="oms-core"}` in
  Mimir; AC-5 checks `compose_service=oms-core` in Loki.
- **Spring Boot 4.1** offers `spring-boot-starter-opentelemetry`, which bundles:
  - `spring-boot-opentelemetry`: the SDK, resource and log export;
  - `spring-boot-micrometer-tracing-opentelemetry`: the bridge and OTLP span export;
  - `micrometer-registry-otlp`;
  - `opentelemetry-exporter-otlp`.

  Its properties, read from the 4.1.0 metadata:
  - `management.opentelemetry.resource-attributes.*`;
  - `management.opentelemetry.tracing.export.otlp.endpoint`, `management.tracing.export.otlp.enabled`;
  - `management.opentelemetry.logging.export.otlp.endpoint`, `management.logging.export.otlp.enabled`;
  - `management.otlp.metrics.export.url|enabled|step`;
  - `management.tracing.sampling.probability`.

  The Logback appender is not installed automatically.

**Read:** `non-functional-requirements/NFR-007-observability.md`, `architecture/system-context.md`,
`oms-framework/testing-patterns.md`, SPEC-0031/0032 (archived) for the stack.

**Closest example:** the simulator's Kafka observation properties, and Boot's documented
OpenTelemetry setup.

## Approach

**1. Dependencies (each of the four `build.gradle`):**
- `implementation 'org.springframework.boot:spring-boot-starter-opentelemetry'`
- `implementation 'io.opentelemetry.instrumentation:opentelemetry-logback-appender-1.0'`. The
  version comes from Boot's `opentelemetry-instrumentation-bom-alpha`; if it is not managed, it is
  pinned to the instrumentation version that matches Boot's OpenTelemetry SDK, recorded in
  Alternatives.
- oms-core drops the now-transitive `micrometer-tracing-bridge-otel` and
  `opentelemetry-exporter-otlp`, and keeps `micrometer-registry-prometheus`.
- The simulator keeps Prometheus. oms-streaming-service and oms-mcp-server get no Prometheus
  registry.

**2. Configuration (each `application.yml`, same block):**

```yaml
management:
  opentelemetry:
    resource-attributes:
      "[service.name]": oms-core            # per service
      "[service.namespace]": oms
      "[deployment.environment]": ${DEPLOYMENT_ENVIRONMENT:local}
    tracing.export.otlp.endpoint: ${OTLP_ENDPOINT:http://localhost:4318}/v1/traces
    logging.export.otlp.endpoint: ${OTLP_ENDPOINT:http://localhost:4318}/v1/logs
  tracing:
    sampling.probability: ${TRACING_SAMPLING_PROBABILITY:0.1}
    export.otlp.enabled: ${OTLP_EXPORT_ENABLED:false}
  logging.export.otlp.enabled: ${OTLP_EXPORT_ENABLED:false}
  otlp.metrics.export:
    enabled: ${OTLP_EXPORT_ENABLED:false}
    url: ${OTLP_ENDPOINT:http://localhost:4318}/v1/metrics
    step: 15s
```

- `OTLP_EXPORT_ENABLED` (default false) switches all three exports; `OTLP_ENDPOINT` is the Alloy
  base URL.
- Without them nothing is exported (AC-5). Micrometer's OTLP registry would otherwise push to
  `localhost:4318` by default.
- oms-core's `application-dev.yml` keeps sampling 1.0. The custom `tracing:` block,
  `OmsConfig#otlpGrpcSpanExporter` and its imports are removed.
- oms-core keeps `spring.application.name: oms`, used in its log correlation block and tags. The
  resource attribute sets `service.name: oms-core`, which is reversible and touches nothing else
  (proposal open question).

**3. Logback (each service):**
- `src/main/resources/logback-spring.xml` (oms-core, the simulator and the streaming service gain
  one) includes Boot's `defaults.xml` and `console-appender.xml`, adds an `OTEL` appender
  (`io.opentelemetry.instrumentation.logback.appender.v1_0.OpenTelemetryAppender`,
  `captureMdcAttributes=*`, `captureExperimentalAttributes=true`), and roots `CONSOLE` + `OTEL`.
  The console pattern, including oms-core's `logging.pattern.correlation`, is unchanged.
- oms-mcp-server's existing `logback-spring.xml` adds `OTEL` to both profile roots: stdio keeps
  `FILE` + `OTEL`, with no console.
- A `@Component OpenTelemetryLogging implements InitializingBean` in each service (package
  `…config` / `…observability`) calls `OpenTelemetryAppender.install(openTelemetry)` with the
  Boot-created `OpenTelemetry` bean. The appender buffers records logged before that and replays
  them on install.
- The trace and span ids of the current context are attached by the appender itself (the bridge
  makes the OpenTelemetry context current).

**4. Kafka observation:**
- **oms-core:** `KafkaProducerConfig#kafkaTemplate` and `KafkaConsumerConfig#deadLetterTemplate`
  call `setObservationEnabled(true)`; the listener factory sets
  `getContainerProperties().setObservationEnabled(true)`. Producer records carry `traceparent`, and
  a consumed command continues the producer's trace.
  - The outbox relay sends from a scheduled thread, so `oms_orders` records start a new trace there:
    the relay's producer span. The simulator continues that trace.
  - Linking the original command trace through the outbox (storing `traceparent` on the row) is out
    of scope (Alternatives).
- **oms-streaming-service:** both `ReceiverOptions` get `.withObservation(observationRegistry)`.
  Each received record's receive observation becomes a consumer span in the producer's trace.
- **oms-exchange-simulator:** already on.

**5. Compose and host:**
- `docker-compose.yml`:
  - `oms-core`, `streaming-service`, `exchange-simulator` and `mcp-server` get
    `OTLP_EXPORT_ENABLED: "true"`, `OTLP_ENDPOINT: http://alloy:4318`,
    `TRACING_SAMPLING_PROBABILITY: "1.0"`, `DEPLOYMENT_ENVIRONMENT: compose`, and
    `depends_on: alloy`;
  - `TRACING_URL`, `TRACING_ENABLED` and `MANAGEMENT_TRACING_SAMPLING_PROBABILITY` are removed.
- `oms-core/.env`: `TRACING_URL` becomes `OTLP_ENDPOINT=http://localhost:4318` and
  `OTLP_EXPORT_ENABLED=false`, with a comment that setting it true reports to the host's Alloy.

**6. Alloy:**
- The `prometheus.scrape "oms_core"` and `prometheus.remote_write "mimir"` blocks are removed.
- In `discovery.relabel "compose"`, a `drop` rule on
  `__meta_docker_container_label_com_docker_compose_service` matching
  `oms-core|streaming-service|exchange-simulator|mcp-server`. These services' logs arrive by OTLP
  only; infrastructure containers keep the stdout path.

**7. Smoke test:**
- AC-4 becomes "oms-core pushes metrics": the Mimir query `count({service_name="oms-core"})` or the
  OTLP-translated `target_info{service_name="oms-core"}` > 0.
- AC-5 becomes Loki `{service_name="oms-core"}` with a fresh line that carries a `trace_id`,
  produced by a REST command, plus "no `compose_service="oms-core"` line since start".
- A new check: Tempo `GET /api/search?tags=service.name%3Doms-core` returns a trace. The simulator
  is checked the same way.
- The container-stdout marker check moves to an infrastructure container (`postgres`).

## Contract Changes

None — no OpenAPI or Avro change. Kafka records gain the W3C `traceparent` header (a transport
header, not a contract field). Consumers ignore unknown headers.

## Data & Persistence

None — no table or migration.

## Events & Messaging

- **`order_events` (P-05):** unchanged.
- **Outbox (P-06):** unchanged. The relay's sends now carry `traceparent`; publication is still
  only through the outbox.
- **Kafka headers:** `traceparent` (and `tracestate` when present) on every record produced by
  oms-core and the simulator. Consumers in oms-core, the simulator and the streaming service
  continue the trace. Idempotency and ordering are unchanged.

## Domain, State & Orchestration

None — no domain change.

## Alternatives & Decisions

- **Spring Boot's `spring-boot-starter-opentelemetry`** — chosen over hand-made exporter beans
  (today's `OtlpGrpcSpanExporter`) or the OpenTelemetry Java agent.
  - It is Boot's supported path: one dependency set and properties for all three signals.
  - The agent would instrument outside Spring's observation model, and change every container
    image and the host runs.
- **`opentelemetry-logback-appender-1.0` with a small installer bean per service** — Boot's
  documented way to export logs; Boot does not install the appender. The installer is a few lines
  in each service; there is no shared library module for services (oms-contracts holds contracts
  only), so a copy per service is simpler than a new module.
- **Appender version pinned to `2.28.1-alpha`.** Boot 4.1.0 imports only `opentelemetry-bom`
  (SDK 1.62.0), not the instrumentation BOM, so it doesn't manage the appender. 2.28.x is the
  instrumentation release built on SDK 1.62.0; its BOM names `opentelemetry-bom` 1.62.0. Re-pin it
  whenever Boot upgrades the SDK.
- **One switch `OTLP_EXPORT_ENABLED` and one base URL `OTLP_ENDPOINT`** — chosen over Boot's three
  separate URLs per service. Turning the stack on or off is one setting, and each signal's path
  (`/v1/traces`, `/v1/metrics`, `/v1/logs`) is fixed.
- **Keep `spring.application.name: oms` in oms-core**, with `service.name` set as a resource
  attribute. Renaming the application would change the log correlation block and any tags based on
  it, for no gain in this ticket.
- **The outbox does not carry trace context.** The relay's send starts a new trace that the
  consumers continue (AC-3 is about the hop across Kafka). Carrying the command's trace through the
  outbox needs a column and the relay restoring the context; that is a follow-up.
- **Drop the services' stdout in Alloy** rather than keep both, which would duplicate every line in
  Loki under two label sets.
- **Metrics step 15 s**, so the smoke test and dashboards see fresh points without waiting for
  Micrometer's default minute.
- **P-17 build changes:**
  - one starter and one appender per service;
  - two explicit OpenTelemetry dependencies removed from oms-core;
  - compose environment and Alloy configuration changed.
- **Changed during implementation (T-7):** the simulator was not "already on". Its listener only
  enqueues each `OrderMessage` on the `exchange-engine` thread, so every answer started a new
  trace. `ExchangeEngine` now wraps that executor with Micrometer's
  `ContextScheduledExecutorService` (context-propagation, already on the classpath through the
  starter). Each task, including a delayed fill, runs in the observation context it was submitted
  from, and the commands carry the order's trace. No new dependency.
- **Changed during implementation (T-13):**
  - **Mimir labels.** Mimir's OTLP endpoint turns the resource into `job="oms/oms-core"` only. AC-6
    asks for metrics by `service_name`, so `oms-core/mimir-config.yml` now sets
    `limits.promote_otel_resource_attributes: "service.name,service.namespace,deployment.environment"`.
    Every series then carries `service_name`, `service_namespace` and `deployment_environment`, like
    Loki and Tempo.
  - **Smoke-test marker.** The infrastructure marker is written to the broker's stdout: postgres runs
    as a user that cannot write to its PID 1 stdout.
- **Changed during implementation (T-3):** oms-core's `OtlpExportIntegrationTest` and
  `MockOtlpReceiver` are in `org.example.oms.integration`. The test does not extend
  `AbstractKafkaPostgresIntegrationTest` (now public, for the `config` package tests): it reuses that
  class's containers and properties but reads its own command topic and consumer group. Otherwise the
  base class's property source would set the topic back to `commands` and its context would compete
  with the cached ones.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| A test context exports to a non-existent collector and logs errors or slows down | Export is off by default (`OTLP_EXPORT_ENABLED=false`); the test with a mock receiver turns it on explicitly |
| The appender is installed after early startup logs | The appender buffers those records and replays them on install; the console has them too |
| oms-mcp-server's stdio stream is polluted | Its stdio profile has no console appender; the OTEL appender writes to the network only. `McpLoggingConfigTest` asserts the stdio root has no console appender |
| Metric names change in Mimir (OTLP translation, `service_name` instead of `job="oms-core"`) | No provisioned dashboards exist; the smoke test and the KB use the new labels |
| The `logback-appender` artifact is unmanaged by Boot | Pinned explicitly to the instrumentation release matching Boot's SDK; noted at implementation |
| Kafka observation adds span overhead per record | Sampling stays at 10% outside dev and compose |

## Test Strategy

| AC | Level (unit / web-mvc / integration / e2e) | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | integration (context) per service | `TelemetryConfigurationTest#resourceAndNoCustomExporter` in oms-core (extends `AbstractKafkaPostgresIntegrationTest`), oms-exchange-simulator (`AbstractKafkaIntegrationTest`), oms-streaming-service and oms-mcp-server (their existing context set-up) | The context has the `OpenTelemetry` SDK and its `Resource` with `service.name` (per service), `service.namespace = oms` and `deployment.environment`. No `OtlpGrpcSpanExporter` bean of the application's own. The appender class is on the classpath and installed (`OpenTelemetryAppender` root appender present). oms-core: the `tracing.*` properties are gone |
| AC-2 | integration | `OtlpExportIntegrationTest#tracesMetricsAndLogsReachTheEndpoint` in oms-core, oms-exchange-simulator and oms-mcp-server, `OtlpExportIntegrationTest#orderUpdateIsReceivedInTheProducersTraceAndExported` in oms-streaming-service (added after review); a JDK `HttpServer` test helper `MockOtlpReceiver` | With `OTLP_EXPORT_ENABLED=true` and `OTLP_ENDPOINT` = the mock: after a REST command (oms-core), an order (simulator), an order update on Kafka (streaming) or an HTTP request (MCP server), POSTs arrive on `/v1/traces`, `/v1/metrics` and `/v1/logs`, each containing the `service.name` value (the payload is protobuf; the string is checked in the bytes) |
| AC-3 | integration + unit | `OtlpExportIntegrationTest#kafkaCommandContinuesTheProducersTrace` (oms-core); `ExchangeSimulatorKafkaIntegrationTest#commandsCarryTheOrdersTrace` (simulator); `KafkaConfigTest#receiversObserveRecords` and `OtlpExportIntegrationTest#orderUpdateIsReceivedInTheProducersTraceAndExported` (streaming); `ExchangeWorkflowIntegrationTest#publishedOrdersCarryTraceparent` | oms-core: a command with a `traceparent` of a known, sampled trace id is consumed, and the exported spans contain that trace id. Simulator: an `OrderMessage` with `traceparent` T yields commands whose `traceparent` has trace id T. Streaming: both `ReceiverOptions` have the observation registry, and an `OrderMessage` with `traceparent` T on an embedded broker yields an exported span with trace id T. oms-core's records on `orders` carry `traceparent` |
| AC-4 | integration + unit | `OtlpExportIntegrationTest#logRecordsCarryTraceAndMdc` (oms-core); `LoggingConfigTest#consoleKeepsTheCorrelationBlock`; `McpLoggingConfigTest#stdioProfileHasNoConsoleAppender` | A command consumed in a span logs "Processed OrderAcceptCmd". The exported `/v1/logs` payload contains its trace id bytes, severity text, the logger name and the MDC key `commandId` with its value. Console output still contains the correlation block. The mcp stdio root has `FILE` and `OTEL` only |
| AC-5 | integration (all suites) | Every existing suite in the four modules (run in verify); `TelemetryConfigurationTest#nothingExportedByDefault` | Without the variables, no `OtlpHttpSpanExporter`/`OtlpMeterRegistry` export is active (the enabled properties resolve to false), and the suites pass unchanged |
| AC-6 | e2e (manual, scripted) | `oms-core/scripts/lgtm-smoke-test.ps1` (updated), run against `docker compose up` in verify; output saved as a verification note | For oms-core and the simulator: metrics in Mimir by `service_name`, logs in Loki by `service_name` with a trace id and no `compose_service` copy, traces in Tempo; `postgres` stdout still in Loki |

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | No contract change |
| P-02 | Specification before code, generated models only | n/a | No API or message change |
| P-03 | Never edit generated code | n/a | None involved |
| P-04 | Contracts evolve compatibly | n/a | Only a transport header is added |
| P-05 | Every state change is recorded in the event log | n/a | No state change |
| P-06 | Kafka only through the transactional outbox | comply | The outbox stays the only publisher; only observation is enabled on its template |
| P-07 | Schema changes through new Liquibase changesets | n/a | No schema change |
| P-08 | Concurrency and idempotency are explicit | n/a | No change to processing; telemetry export is asynchronous and batched by the SDK |
| P-09 | Commands and queries stay separate | n/a | Infrastructure only |
| P-10 | State transitions go through the state machine and task pipeline | n/a | No transitions |
| P-11 | Layering and conventions | comply | Configuration in `config` packages and `application.yml`; one installer component per service |
| P-12 | Jackson 3 only | n/a | No Jackson use |
| P-13 | Errors and validation follow the framework specs | n/a | No error path changes |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Test Strategy; AC-6 by the scripted smoke test, as for SPEC-0032 |
| P-15 | Observability | comply | The point of the ticket: all services report traces, metrics and logs over OTLP, with trace context across Kafka |
| P-16 | Security | comply | No secrets; OTLP to the in-network Alloy; nothing new exposed |
| P-17 | Simplicity and dependencies | comply | Boot's own starter instead of hand-made beans; the appender is the one extra dependency; decisions above |
| P-18 | Modules build standalone | comply | Each service's own build; verified per module |
| P-19 | Documentation follows behaviour | comply | Knowledge Base Updates below, plus CLAUDE.md Monitoring |

## Knowledge Base Updates

- `non-functional-requirements/NFR-007-observability.md` — how each signal is reported (OTLP from
  every service), the switch and endpoint, trace context across Kafka, the outbox caveat.
- `architecture/system-context.md` — the telemetry paths: the four services push OTLP to Alloy;
  infrastructure stdout to Loki; no scrape.
- CLAUDE.md, Monitoring section — `OTLP_EXPORT_ENABLED`/`OTLP_ENDPOINT` instead of `TRACING_URL`;
  `service_name` labels; no `job="oms-core"` scrape.
