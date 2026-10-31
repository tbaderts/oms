# Proposal — SPEC-0032: Migrate LGTM stack to Alloy, Mimir, Tempo 3

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The goal is a local Grafana LGTM stack — Grafana, Loki, Tempo, **Mimir** and an OpenTelemetry-style
telemetry agent — on recent versions, without the components that are now obsolete. SPEC-0031
(done 2026-10-30, uncommitted) made the stack work, but built it on the parts this goal wants gone:

- **Promtail** (`grafana/promtail:3.6.11`) is the log shipper. Promtail reached end of life on
  2026-03-02 and is no longer maintained; Grafana Alloy is its official replacement
  (grafana.com/docs/alloy/latest/set-up/migrate/from-promtail/).
- **Prometheus** (`prom/prometheus:v3.13.2`) is the metrics store; the goal names Mimir. SPEC-0031
  rejected Mimir and an OTel agent as out of scope — this ticket reverses that decision on the
  requester's instruction.
- **Jaeger** (`jaegertracing/jaeger:2.20.0`) still runs beside Tempo and owns host port 4317, so
  host-native `bootRun` traces (`oms-core/.env` `TRACING_URL=http://localhost:4317`) land in Jaeger,
  not in Grafana. Two trace backends for one dev stack.
- **Versions are stale.** Latest releases on 2026-10-31: Grafana 13.3.0 (pinned 13.1.3), Loki 3.7.9
  (3.7.6), Tempo **3.1.1** (2.10.10 — SPEC-0031's design called 2.10 "latest stable", but Tempo 3
  is out), Mimir 3.2.4, Alloy v1.21.3.
- **oms-core emits no traces today** (found at design, 2026-10-31): SPEC-0031's Tempo held zero
  traces after 24 h of 30-second health checks. The boot jar lacks Spring Boot 4's tracing
  auto-configuration modules (`spring-boot-micrometer-tracing`, `…-tracing-opentelemetry`), so no
  tracer exists and the hand-written `OtlpGrpcSpanExporter` bean in `OmsConfig` is never used.
  That is a Gradle fix and belongs to SPEC-0033; this ticket only rewires where spans would go.
- There is no OTLP entry point other than Tempo's, so the follow-up SPEC-0033 (services report
  traces, metrics and logs over OTLP) has nowhere to send metrics and logs.

Affected: every developer running the compose stack, and SPEC-0033, which depends on this ticket.
Doing nothing leaves an unmaintained log shipper in the stack and two disconnected trace UIs.
Related: `NFR-007-observability.md`, `architecture/system-context.md`, SPEC-0031.

## What Changes

- **BREAKING (local dev only)**: the `promtail`, `prometheus` and `jaeger` compose services are
  removed, together with `oms-core/promtail-config.yml` and `oms-core/prometheus.yml`. The Jaeger UI
  (`:16686`) and Prometheus UI (`:9090`) go away; their data is reachable through Grafana instead.
  Breaks anyone with bookmarks or scripts against those ports (the SPEC-0031 smoke test is replaced).
- New **`alloy`** service (Grafana Alloy, pinned) is the single telemetry agent:
  - OTLP receiver on host and in-network ports **4317** (gRPC) and **4318** (HTTP) — it takes over
    host 4317 from Jaeger, so host-native and container apps both report to Alloy unchanged;
  - forwards traces → Tempo, metrics → Mimir, logs → Loki;
  - tails the compose containers' stdout through the Docker socket (Promtail's job), keeping the
    `compose_service` label;
  - scrapes `oms-core:8090/actuator/prometheus` and writes it to Mimir, so oms-core metrics keep
    flowing until SPEC-0033 moves the app to OTLP push.
- New **`mimir`** service (Grafana Mimir 3, pinned, single process, local filesystem storage) as the
  metrics store; its Prometheus-compatible API is published on host port **9009**.
- **`tempo`** moves to Tempo 3; Loki and Grafana move to the latest patch/minor releases.
- Grafana provisioning: the `Prometheus` datasource is replaced by a `Mimir` datasource
  (type prometheus); Loki and Tempo datasources stay, with trace→log and trace→metric links.
- The compose `oms-core` override `TRACING_URL` points at `http://alloy:4317`, and sets
  `MANAGEMENT_TRACING_SAMPLING_PROBABILITY=1.0` so every local request is traced (default 0.1).
- The SPEC-0031 smoke test is replaced by an LGTM smoke test covering the new ACs; `CLAUDE.md`
  Monitoring, `NFR-007` and `system-context.md` are updated.

## Scope

### In scope

- Root `docker-compose.yml` observability services: add `alloy` and `mimir`; upgrade `tempo`,
  `loki`, `grafana`; remove `promtail`, `prometheus`, `jaeger`.
- Config files under `oms-core/` (Alloy, Mimir, Tempo 3, Loki, Grafana provisioning); delete the
  Promtail and Prometheus configs.
- Compose env overrides for `oms-core` (OTLP endpoint, sampling) — environment only, no code.
- Smoke-test script and documentation (`CLAUDE.md`, `NFR-007`, `system-context.md`,
  `oms-core/src/main/resources/readme.txt`).

### Out of scope

- Any Java / Gradle change in a service: OTel starter, OTLP metrics and logs push, Logback
  appenders, removing the hand-written `OtlpGrpcSpanExporter` bean and the `tracing.*` properties —
  all **SPEC-0033**.
- Grafana dashboards (JSON) and alert rules.
- Long-term retention, object storage (S3/MinIO), multi-tenancy, HA — single-node dev stack only.
- Mimir's Kafka-based ingest-storage architecture (needs a Kafka path of its own).
- `developer-cockpit` and `mission-control` default URLs pointing at `localhost:9090` (settings
  defaults only; nothing queries them today) — follow-up if needed.
- Production / Kubernetes deployment.

## Acceptance Criteria

- **AC-1** — Given the repo checkout, when `docker compose config --format json` is run at the repo
  root, then it exits 0; its services include `alloy`, `mimir`, `tempo`, `loki` and `grafana` and do
  **not** include `promtail`, `prometheus` or `jaeger`; their images are pinned to exact versions no
  older than `grafana/alloy:v1.21.3`, `grafana/mimir:3.2.4`, `grafana/tempo:3.1.1`,
  `grafana/loki:3.7.9` and `grafana/grafana:13.3.0`; and `oms-core/promtail-config.yml` and
  `oms-core/prometheus.yml` no longer exist.
- **AC-2** — Given the observability containers are not running, when
  `docker compose up -d grafana loki tempo mimir alloy` is run, then it exits 0 and within 90 seconds
  all five are running with none restarting, and `GET` of `http://localhost:3100/ready`,
  `http://localhost:3200/ready`, `http://localhost:9009/ready` and `http://localhost:12345/-/ready`
  each return 200.
- **AC-3** — Given the stack from AC-2, when `GET http://localhost:3000/api/datasources` is called
  with basic auth `admin` / `secret`, then it returns exactly the provisioned datasources
  `Mimir` (type `prometheus`, url `http://mimir:9009/prometheus`), `Loki` (`http://loki:3100`) and
  `Tempo` (`http://tempo:3200`); and for each, `GET /api/datasources/uid/<uid>/health` returns
  status `OK`.
- **AC-4** — Given AC-2 plus `postgres` and `oms-core` running, when Mimir is queried with
  `GET http://localhost:9009/prometheus/api/v1/query?query=up{job="oms-core"}`, then within 90
  seconds the result contains a sample with value `1`.
- **AC-5** — Given AC-4, when `GET http://localhost:3100/loki/api/v1/label/compose_service/values`
  is called, then within 90 seconds the values include `oms-core` (container logs shipped by Alloy,
  not Promtail).
- **AC-6** — Given AC-2, when one span with a freshly generated trace id is posted as OTLP/JSON to
  the **host** endpoint `http://localhost:4318/v1/traces`, then the request returns 200 and within
  60 seconds `GET http://localhost:3200/api/v2/traces/<traceId>` returns that trace — proving the
  host-native path (Alloy → Tempo) that Jaeger used to own.
- **AC-7** — Given AC-4, when `docker compose exec -T oms-core printenv TRACING_URL` and
  `printenv MANAGEMENT_TRACING_SAMPLING_PROBABILITY` are run, then they print `http://alloy:4317`
  and `1.0`. (Delivery of oms-core's *own* spans to Tempo is proven in SPEC-0033: today oms-core
  emits no spans at all — see Why.)
- **AC-8** — Given AC-2, when one log record with a unique body is posted as OTLP/JSON to
  `http://localhost:4318/v1/logs` and metric `spec0032_smoke_total` is posted to
  `http://localhost:4318/v1/metrics`, then both return 200 and within 90 seconds the log line is
  returned by a Loki `query_range` and the metric by a Mimir `query` — proving the OTLP logs and
  metrics paths SPEC-0033 will use.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-core (observability config files, compose env overrides, smoke script — no Java), oms-knowledge-base (NFR-007, system-context); root `docker-compose.yml` is repo infra |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | none in Postgres. Local Loki/Tempo/Grafana data from SPEC-0031 is dev-only and may be recreated; Prometheus/Jaeger data is dropped with the services |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | none at runtime. Developers lose the Jaeger UI `:16686` and Prometheus UI `:9090` (use Grafana `:3000`). `developer-cockpit`/`mission-control` settings default `prometheusUrl=localhost:9090` becomes stale (out of scope). SPEC-0033 depends on the Alloy OTLP endpoint |
| Knowledge base | `NFR-007-observability.md`, `architecture/system-context.md`; also `CLAUDE.md` §Monitoring and `oms-core/src/main/resources/readme.txt` |

## Open Questions

- [resolved] Mimir instead of Prometheus? → yes, requester decision 2026-10-31 (reverses SPEC-0031's choice).
- [resolved] Which telemetry agent: OpenTelemetry Collector or Grafana Alloy? → assumption: Alloy. It is Grafana's distribution of the OTel Collector (OTLP in/out) and Promtail's official successor, so one agent covers OTLP and Docker log tailing. Swappable later for `otel/opentelemetry-collector-contrib` plus a separate log tailer if the requester prefers vanilla OTel.
- [resolved] Mimir deployment mode → assumption: monolithic (`-target=all`), classic ingester architecture (still supported in Mimir 3), filesystem storage, no Kafka ingest storage. Verified at design stage against the 3.2 docs.
- [resolved] Host ports → assumption: Alloy owns 4317/4318 (Jaeger removed) and its UI on 12345; Mimir on 9009; Tempo stays 3200, Loki 3100, Grafana 3000. Port 9090 is freed.
- [resolved] Trace sampling for local compose → assumption: `1.0` through a compose env override only; the application default (0.1) is unchanged.
- [resolved] Keep metrics flowing before SPEC-0033 → assumption: Alloy scrapes `/actuator/prometheus` and remote-writes to Mimir; SPEC-0033 removes the scrape when apps push OTLP.
- [resolved] Proving oms-core's own spans reach Tempo → moved to SPEC-0033 (reopened 2026-10-31): oms-core emits no spans until its Gradle build gets the Boot 4 tracing modules, which this ticket excludes. Here AC-6 proves the Alloy → Tempo path with a synthetic span and AC-7 the compose wiring.
- [deferred] Grafana dashboards → separate ticket; datasources and correlations are enough for this goal.
- [deferred] Update `developer-cockpit`/`mission-control` `prometheusUrl` defaults → nothing queries them today; safe to change when a feature does.
