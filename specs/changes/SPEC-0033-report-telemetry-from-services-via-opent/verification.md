# Verification — SPEC-0033: Report telemetry from services via OpenTelemetry

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

Test classes ran and passed in the final suite run (`build/test-results/test/TEST-*.xml` of each
module: oms-core 325, oms-streaming-service 27, oms-exchange-simulator 56, oms-mcp-server 125
tests, no failures or skips) and in `spec verify` (evidence/*-1.log).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Starter and appender everywhere; no own exporter or `tracing.*`; resource with `service.name`, `service.namespace=oms`, `deployment.environment` | `TelemetryConfigurationTest#resourceAndNoCustomExporter` in all four modules (oms-core also asserts that `tracing.enabled`/`tracing.url` and `otlpGrpcSpanExporter` are gone); `LoggingConfigTest#rootLogsToTheConsoleAndOpenTelemetry` (oms-core); `McpLoggingConfigTest#stdioProfileHasNoConsoleAppender`. Each `build.gradle` has `spring-boot-starter-opentelemetry` and `opentelemetry-logback-appender-1.0` | PASS |
| AC-2 | Spans, metrics and log records reach the configured endpoint with the resource attributes | `OtlpExportIntegrationTest` in all four modules, against `MockOtlpReceiver`: oms-core and the simulator `#tracesMetricsAndLogsReachTheEndpoint`, oms-mcp-server `#tracesMetricsAndLogsReachTheEndpoint` (HTTP request), oms-streaming-service `#orderUpdateIsReceivedInTheProducersTraceAndExported` (Kafka record). Traces, metrics and logs arrive, and the metrics carry `service.name`, `service.namespace` and `deployment.environment` | PASS |
| AC-3 | The trace crosses Kafka: simulator → oms-core, oms-core → `oms_orders` → simulator, oms-core → streaming | `OtlpExportIntegrationTest#kafkaCommandContinuesTheProducersTrace` (oms-core consumer in the producer's trace); `ExchangeSimulatorKafkaIntegrationTest#commandsCarryTheOrdersTrace` (the simulator's answers carry the order's trace across its engine thread); `ExchangeWorkflowIntegrationTest#publishedOrdersCarryTraceparent` (the outbox's records carry `traceparent`); oms-streaming-service `OtlpExportIntegrationTest#orderUpdateIsReceivedInTheProducersTraceAndExported` (red with `.withObservation` removed) and `KafkaConfigTest#receiversObserveRecords`. Live: the smoke test's Tempo trace spans oms-core and oms-exchange-simulator. The reviewer also found Tempo traces with root "oms_orders send" and an oms-streaming-service consumer span | PASS |
| AC-4 | The exported log record carries trace/span ids, severity, logger and MDC; console readable; mcp stdio stdout clean | `OtlpExportIntegrationTest#logRecordsCarryTraceAndMdc` (trace id, "Processed OrderAcceptCmd", logger `org.example.oms.config.CommandListener`, INFO, `commandId` key and value); `LoggingConfigTest#consoleKeepsTheCorrelationBlock`; `McpLoggingConfigTest#stdioProfileHasNoConsoleAppender` (stdio root is FILE + OTEL only). Live Loki records show `trace_id`, `span_id`, `severity_text`, `scope_name`, `thread_name`, `commandId`, `correlationId`/`orderId` | PASS |
| AC-5 | No endpoint → nothing exported, nothing fails; every existing suite passes | `TelemetryConfigurationTest#nothingExportedByDefault` in all four modules (no `SpanExporter`, `LogRecordExporter` or `OtlpMeterRegistry` bean). All four full suites pass; existing tests changed only in visibility (`AbstractKafkaPostgresIntegrationTest` public) and by added methods | PASS |
| AC-6 | Smoke test: Mimir by `service_name`, Loki once each with `service_name` and trace ids, Tempo traces; infrastructure logs still in Loki | `powershell -File oms-core/scripts/lgtm-smoke-test.ps1` against the rebuilt compose stack: exit 0, "ALL CHECKS PASS". S33-AC-6 checks: OTLP env in oms-core and the simulator, no `TRACING_URL`; oms-core and simulator log records in Loki by `service_name`, in one trace; no `compose_service` stream for them; the Tempo trace contains both services; Mimir series by `service_name` for all four services; no fresh `up{job="oms-core"}`; the broker's stdout marker in Loki | PASS |

## Goal Assessment

The goal was for the services to report through OpenTelemetry, with logging that fits the Grafana
stack. All four Spring services now use Boot's OpenTelemetry starter and push traces, metrics and
logs over OTLP to Alloy:
- every signal carries the same resource;
- every Kafka hop carries the trace context;
- log records reach Loki once, with trace ids and the MDC, so Grafana's trace-to-logs link (by
  `service_name` and `trace_id`) matches them.

The requester would see this working in the live stack. One order's publication is a single Tempo
trace across oms-core, the simulator and the streaming service, with every service's logs and
metrics findable by `service_name`.

What is left out on purpose:
- **The outbox starts a new trace.** The request that changes an order and that change's
  publication are separate traces (design, Alternatives; NFR-007).
- **oms-ui** (proposal scope).
- **The mcp-server over stdio** produces log records and metrics but no request spans. Its tools
  are not observed; only its HTTP mode has server spans.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contract change |
| P-02 | Specification before code, generated models only | N/A | No API or message model change |
| P-03 | Never edit generated code | PASS | No generated code touched |
| P-04 | Contracts evolve compatibly | N/A | Only the W3C `traceparent` transport header is added to Kafka records |
| P-05 | Every state change is recorded in the event log | N/A | No state change logic touched |
| P-06 | Kafka only through the transactional outbox | PASS | The outbox template only gained `setObservationEnabled(true)`; publication paths unchanged |
| P-07 | Schema changes through new Liquibase changesets | N/A | No schema change |
| P-08 | Concurrency and idempotency are explicit | PASS | Processing unchanged. The simulator's engine stays single-threaded; its executor wrapper only restores context per task |
| P-09 | Commands and queries stay separate | N/A | Infrastructure only |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No transitions |
| P-11 | Layering and conventions | PASS | Configuration in `config` packages and `application.yml`; one small installer per service |
| P-12 | Jackson 3 only | PASS | oms-core's new test uses `tools.jackson.databind.json.JsonMapper` |
| P-13 | Errors and validation follow the framework specs | N/A | No error path changes |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Each test was written red first, including the Kafka-trace tests before observation was enabled. AC-6 is covered by the scripted smoke test, as in SPEC-0032 |
| P-15 | Observability | PASS | The point of the ticket |
| P-16 | Security | PASS | No secrets; OTLP to the in-network Alloy; nothing new exposed |
| P-17 | Simplicity and dependencies | PASS | Boot's starter replaces the hand-made exporter. The appender pin and the context-propagation use are recorded in design.md (Alternatives, Changed during implementation). `spec verify`'s R10 warnings point at these decisions |
| P-18 | Modules build standalone | PASS | `spec verify` runs `check` per module; each passed |
| P-19 | Documentation follows behaviour | PASS | NFR-007, architecture/system-context, CLAUDE.md Monitoring, oms-core README |

## Independent Review

The spec-reviewer agent ran two rounds.

**Round 1: MET, with one major and five minor findings, all fixed.**
1. *Major: no export test for oms-streaming-service and oms-mcp-server.*
   - Added `OtlpExportIntegrationTest` to both.
   - The streaming one sends a record with a `traceparent` through an embedded broker. It fails when
     the receiver observation is removed.
   - The smoke test now checks Mimir for all four services.
2. *The streaming hop was proven only through `ReceiverOptions`.* Covered by the new streaming test.
3. *NFR-007 claimed one trace through step 4.* Reworded: each outbox publication starts its own
   trace.
4. *"Early records are dropped" was wrong.* The appender buffers early records and replays them;
   the installer javadocs and the design's Risks table now say so.
5. *The appender version pin was not in design Alternatives.* Added.
6. *A misleading assertion message in `LoggingConfigTest`.* Reworded.

**Round 2: MET, no goal gap, two minor findings.**
1. *The export tests matched only `service.name`.* Fixed: the metrics awaits in all four tests now
   also require `service.namespace` and `deployment.environment`.
2. *The mcp test runs in HTTP mode, not stdio.* Accepted: over stdio there are no HTTP requests to
   trace. AC-2 says "when it handles a request", and the stdio logging profile is used in the test.

## Automated Evidence

`node specs/tools/spec.mjs verify SPEC-0033` (evidence/last-run.json): the policy check passed for
the changes since main. Five R10/P-17 warnings for build or compose changes are recorded in
design.md. `gradlew check` exited 0 in oms-core, oms-streaming-service, oms-exchange-simulator and
oms-mcp-server (evidence/<module>-1.log).

The LGTM smoke test was run separately against the docker-compose stack and exited 0.

## Follow-ups

- **Trace through the outbox:** store the `traceparent` on the outbox row and restore it in the
  relay, so a request's trace continues into its publication.
- **Doubled ids in Loki:** exported log records carry the trace and span ids twice, from the MDC
  (`traceId`, `spanId`) and from OpenTelemetry (`trace_id`, `span_id`). The MDC copies could be
  excluded by listing the captured MDC keys instead of `*`.
- **MCP tool calls are not observed,** so stdio runs produce no spans.

## Verdict

Verdict: GOAL MET
