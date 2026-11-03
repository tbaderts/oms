# Proposal — SPEC-0033: Report telemetry from services via OpenTelemetry

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

[Ticket Goal](./ticket.md): the services should report through OpenTelemetry, and logging should
fit the Grafana stack (SPEC-0031/0032: Alloy as the single agent, then Mimir, Loki and Tempo).

**What the services do today:**

| Service | Traces | Metrics | Logs |
|---|---|---|---|
| oms-core | Hand-made `OtlpGrpcSpanExporter` bean (`OmsConfig`) behind a custom `tracing.enabled` flag; Kafka observation not enabled, so traces stop at the topic | Prometheus registry, scraped by Alloy (`job="oms-core"`) | Plain console text, scraped from the container's stdout by Alloy's Docker discovery |
| oms-streaming-service | None | Actuator only, no registry; nothing collects it | Console text, stdout scrape |
| oms-exchange-simulator | None, although its Kafka observation is on | Prometheus registry, nobody scrapes it | Console text, stdout scrape |
| oms-mcp-server | None | None | File only (stdout must stay clean for the MCP stdio transport); never reaches Loki |

**Consequences:**
- Only oms-core's traces and metrics reach the stack.
- A trace ends where Kafka begins.
- Logs reach Loki only from compose containers, never from a host-native `bootRun`, and as
  unstructured lines. Grafana's trace-to-logs link (filter by `service_name` and trace id) cannot
  match them, because the scraped lines carry neither.
- The Alloy config already says the oms-core scrape is to go "once the app pushes OTLP"
  (SPEC-0032).

## What Changes

- **One OpenTelemetry setup in every Spring service** (oms-core, oms-streaming-service,
  oms-exchange-simulator, oms-mcp-server), using Spring Boot 4.1's
  `spring-boot-starter-opentelemetry` instead of hand-made beans:
  - **traces:** the Micrometer→OpenTelemetry bridge, OTLP export;
  - **metrics:** Micrometer's OTLP registry, pushed;
  - **logs:** every log record exported over OTLP through OpenTelemetry's Logback appender.
- **A common resource on every signal:**
  - `service.name`: `oms-core`, `oms-streaming-service`, `oms-exchange-simulator`,
    `oms-mcp-server`;
  - `service.namespace` = `oms`;
  - `deployment.environment`.

  Configured in the same way in each service.
- **One endpoint setting per service**, the OTLP endpoint of the local Alloy:
  - docker-compose: `http://alloy:4318`;
  - host-native: `http://localhost:4318`.

  Without an endpoint (tests, a laptop with no stack), export is off and the service runs
  unchanged. The custom `tracing.enabled`/`tracing.url` properties and the `OtlpGrpcSpanExporter`
  bean are removed.
- **Traces across Kafka:** observation is enabled on every Kafka template and listener, so a trace
  continues from producer to consumer. For example, the simulator's command reaches oms-core in
  the same trace.
- **Logs fit Loki:**
  - each record carries severity, logger, thread, `trace_id`/`span_id` when in a span, and the MDC
    entries (for example oms-core's `commandId` and `correlationId`) as attributes;
  - console output stays human-readable;
  - oms-mcp-server's stdout stays clean in stdio mode (the appender writes nothing to stdout).
- **Grafana stack (Alloy):**
  - the oms-core Prometheus scrape is removed, since metrics now arrive by OTLP;
  - Docker log discovery stops shipping the four services' stdout, to avoid duplicates, and keeps
    shipping the infrastructure containers (Postgres, Kafka, …);
  - the trace-to-logs link works on `service_name` and trace id;
  - the LGTM smoke test checks the new paths.
- **Docs:** the observability and operations pages of the knowledge base, and CLAUDE.md's
  Monitoring section.

## Scope

### In scope

The four Spring services (dependencies, configuration, Logback, Kafka observation), the Alloy
configuration and the compose environment, the smoke test, the knowledge base and CLAUDE.md's
Monitoring section.

### Out of scope

- oms-ui (its frontend and its small Spring host): browser telemetry is a separate decision.
- Dashboards and alerts; none are provisioned today.
- Sampling policy: unchanged (oms-core 10% in production, 100% in dev and compose); the other
  services follow the same settings.
- Changing what the services log, beyond its transport and attributes.

## Acceptance Criteria

- **AC-1** — Given each of the four services, when its build and configuration are inspected,
  then:
  - it uses `spring-boot-starter-opentelemetry` and the OpenTelemetry Logback appender;
  - no service defines its own span exporter bean or the `tracing.enabled`/`tracing.url`
    properties;
  - its context starts with an OpenTelemetry SDK whose resource has the expected `service.name`,
    `service.namespace = oms` and `deployment.environment`.
- **AC-2** — Given a service with an OTLP endpoint configured, when it handles a request (or a
  Kafka record, for the consumers), then spans, metrics and log records reach that endpoint over
  OTLP, each with the service's resource attributes.
- **AC-3** — Given the exchange simulator answering an order over Kafka, when oms-core consumes the
  command, then oms-core's consumer span is in the same trace as the simulator's producer span
  (the trace context crosses Kafka). The same holds for oms-core → `oms_orders` → simulator and
  oms-core → streaming service.
- **AC-4** — Given a service with an OTLP endpoint, when a log line is written inside a span with
  MDC entries, then the exported log record
  carries:
  - the span's trace and span ids;
  - severity and logger;
  - the MDC entries (for example `commandId`) as attributes.

  The console output still shows the human-readable line. oms-mcp-server in stdio mode writes
  nothing to stdout.
- **AC-5** — Given no OTLP endpoint (the default in tests and without the stack), when a service
  starts and runs, then nothing is exported and nothing fails or blocks. Every existing test suite
  passes unchanged.
- **AC-6** — Given the docker-compose stack, when the LGTM smoke test runs, then for oms-core and
  the exchange simulator:
  - their metrics are in Mimir by `service_name` (the old `job="oms-core"` scrape is gone);
  - their logs are in Loki with `service_name` and trace ids, once each, with no copy from container
    stdout;
  - their traces are in Tempo.

  Infrastructure container logs still reach Loki.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-core, oms-streaming-service, oms-exchange-simulator, oms-mcp-server, oms-knowledge-base; `docker-compose.yml` and the Alloy config (`oms-core/alloy-config.alloy`), the smoke test (`oms-core/scripts/lgtm-smoke-test.ps1`) |
| Contracts (OpenAPI / Avro) | None |
| Data (tables, migrations) | None |
| Events / Kafka topics | None in content; records gain W3C trace headers (`traceparent`) where observation was off. Consumers ignore unknown headers |
| Consumers (oms-ui, oms-mcp-server, downstream) | None functionally. Grafana users find logs by `service_name` instead of `compose_service`, and metrics by `service_name` instead of `job="oms-core"` |
| Knowledge base | Observability / operations pages (Grafana stack, logging, metrics, tracing), CLAUDE.md Monitoring section |

## Open Questions

- [resolved] Logs over OTLP or scraped from stdout? → assumption: **OTLP**.
  - Reasons: it works for host-native runs too; it carries trace ids and attributes that Grafana's
    trace-to-logs link uses; and it is the same transport as traces and metrics.
  - Stdout scraping stays for infrastructure containers only.
  - **Please confirm at approval.** The alternative is structured JSON on stdout, scraped by Alloy,
    which would leave host-native runs out of Loki.
- [resolved] Keep `/actuator/prometheus`? → assumption: **yes, where it exists** (oms-core, the
  simulator), for local inspection. Nothing scrapes it any more, so nothing is counted twice.
- [resolved] OTLP over HTTP (4318) or gRPC (4317)? → **HTTP**, Spring Boot's default; Alloy
  receives both.
- [resolved] oms-core's `spring.application.name` is `oms`, while its `service.name` will be
  `oms-core`, to match the module and the compose service. The design decides whether to rename
  the application or only set the resource attribute.
