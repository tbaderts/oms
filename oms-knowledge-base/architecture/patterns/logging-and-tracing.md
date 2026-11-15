---
type: Pattern
title: "Logging and Tracing"
description: "How a service logs, traces and correlates work in the OMS: the correlation block on every log line, commandId and correlationId in the MDC, OTLP export of traces, logs and metrics to Alloy, and how a trace crosses Kafka and the outbox."
tags: [pattern, logging, tracing, opentelemetry, correlation, observability]
status: draft
updated: "2026-11-14T12:00:00Z"
sources:
  - resource: "repo:oms-core/src/main/resources/application.yml"
  - resource: "repo:oms-core/src/main/resources/logback-spring.xml"
  - resource: "repo:oms-core/src/main/java/org/example/oms/config/OpenTelemetryLogging.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/config/CommandListener.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/config/KafkaConsumerConfig.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/config/LoggingConfigTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/config/TelemetryConfigurationTest.java"
---
# Logging and Tracing

**Use this pattern in every Spring service** (oms-core, the streaming service, the exchange
simulator, the MCP server). Where the telemetry goes and how to look at it:
[Observability](../../infrastructure/observability.md).

## Every log line is correlated

The log pattern starts with a correlation block (`logging.pattern.correlation`):

```
[<service>,<traceId>,<spanId>,<commandId>,<correlationId>]
```

- `traceId` and `spanId` come from Micrometer Tracing (the current span).
- `commandId` and `correlationId` come from the MDC. `CommandListener` puts them there for the
  duration of one Kafka command and removes them afterwards; they are empty on other lines.
- Put an id into the MDC only for the scope of the work it belongs to, in a `try`/`finally`.

## Telemetry export

- Traces, logs and metrics are exported over OTLP/HTTP to Grafana Alloy when
  `OTLP_EXPORT_ENABLED=true` (compose sets it; host-native runs default to off), at
  `OTLP_ENDPOINT` (`http://alloy:4318` in compose, `http://localhost:4318` on the host).
- Logs reach OTLP through the `OTEL` appender in `logback-spring.xml`, which `OpenTelemetryLogging`
  connects to the SDK at startup. It exports the MDC as attributes and the current trace and span
  ids, so Loki lines link to Tempo traces.
- Sampling is `TRACING_SAMPLING_PROBABILITY` (0.1 by default, 1.0 in compose).
- Everything is labelled `service_name`. Nothing scrapes `/actuator/prometheus` any more: metrics are
  pushed.

## Crossing service boundaries

- **HTTP.** Spring's observed `RestClient`/`WebClient` propagate the W3C `traceparent` header.
- **Kafka.** Templates and listener containers have observation enabled
  (`setObservationEnabled(true)`, or `observation-enabled: true` in the simulator), so the
  consumer's span continues the producer's trace.
- **The outbox breaks the trace on purpose.** A command's trace ends at commit; the relay publishes
  later, on its own thread, in a new trace. To follow one business flow across it, use the ids that
  travel with the data: `commandId`, `correlationId` and `causationId` (stored on every event,
  SPEC-0049) rather than the trace id.

## Do and don't

- Do log at INFO what a support engineer needs to follow one order (command received, applied or
  refused, published), with the order id in the message.
- Don't log whole payloads or secrets; the command is already in `order_events` and `command_log`.
- Don't create a logger configuration per service: copy `logback-spring.xml` and
  `OpenTelemetryLogging` ([Service Template](service-template.md)).
