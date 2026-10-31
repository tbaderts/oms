# Proposal — SPEC-0031: Add Grafana LGTM stack to docker-compose

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The goal is to start the Grafana LGTM observability stack (Loki, Grafana, Tempo, plus the already-pinned Prometheus as the metrics backend) from the root `docker-compose.yml`. Today the stack is broken or missing: `docker-compose.yml` defines a `loki` service and a `promtail` service, but both bind-mount `./oms-core/loki-config.yml` and `./oms-core/promtail-config.yml`, which exist only as **empty directories** Docker created from missing bind sources — promtail ships nothing and Loki falls back to baked-in defaults. Neither service declares `networks:`, so both land on the compose default network, unreachable from Grafana and unable to reach the app services. Tempo does not exist (traces go to Jaeger), and Grafana is a bare install with no provisioned datasources. Prometheus is running but scrapes host `app:8090`, which does not exist on `app-net`, so it collects nothing but itself. All of this is documented in the own architecture review (`mission-control/docs/architecture/mission-control-v2.md`, F4 and enablers E1/E5), and `NFR-007` calls it "partial". Developers must be able to `docker compose up -d` the observability stack and read metrics, logs and traces in one Grafana place.

## What Changes

- `oms-core/loki-config.yml` and `oms-core/promtail-config.yml` become real config files (replacing the empty directories), and `loki` and `promtail` join `app-net` so Grafana and promtail can reach Loki.
- New `tempo` service (pinned image, own `tempo-config.yml`) with an OTLP receiver; its UI/API is published on host port 3200 only, because Jaeger already owns the host OTLP port 4317.
- The compose `oms-core` env override `TRACING_URL` switches from `http://jaeger:4317` to `http://tempo:4317` (env override only; `oms-core/.env` and the Jaeger service stay for host-native dev).
- Grafana gets datasource provisioning (`oms-core/grafana/provisioning/datasources/`): Prometheus, Loki and Tempo, so a freshly started Grafana is usable without manual setup.
- `oms-core/prometheus.yml`: broken scrape target `app:8090` becomes `oms-core:8090`.
- New compose volumes `loki-storage` and `tempo-storage`; a repeatable smoke-test script; doc updates (Grafana/Loki/Tempo URLs and endpoints).

## Scope

### In scope

- The LGTM services in the root `docker-compose.yml`: service configs, networks, volumes, ports, Grafana datasource provisioning, the Prometheus scrape-target fix, a smoke-test script, and matching docs/knowledge-base updates.

### Out of scope

- Mimir (Prometheus is the metrics store) and an OTel Collector.
- Removing Jaeger; changes to `oms-core/.env` or host-native tracing.
- Grafana dashboards (JSON) — later ticket; this one ships datasources only.
- App-side observability enablers E2/E3/E4 from the architecture review (observation annotations, Kafka observation, traceparent through the outbox) — separate tickets.
- Replacing promtail with Grafana Alloy; the Mission Control port move (F5).

## Acceptance Criteria

- **AC-1** — Given the repo checkout, when `docker compose config --quiet` is run at the repo root, then it exits 0; and `oms-core/loki-config.yml`, `oms-core/promtail-config.yml`, `oms-core/tempo-config.yml` and the Grafana provisioning file exist as files (not directories), each a valid YAML document with a non-empty root mapping.
- **AC-2** — Given the LGTM containers are not running, when `docker compose up -d grafana prometheus loki promtail tempo` is run, then it exits 0 and within 60 seconds `docker compose ps --status running` lists all five services as running with none restarting; and `docker compose exec -T promtail cat /etc/promtail/promtail-config.yaml` and `docker compose exec -T loki cat /etc/loki/loki-config.yaml` print non-empty config.
- **AC-3** — Given the stack from AC-2 is up, when `GET http://localhost:3000/api/datasources` is called with Grafana basic auth `admin` / the `GF_SECURITY_ADMIN_PASSWORD` default (`secret`), then it returns 200 with provisioned datasources of types `prometheus`, `loki` and `tempo` whose URLs are `http://prometheus:9090`, `http://loki:3100` and `http://tempo:3200`.
- **AC-4** — Given `oms-core` is also up, when `GET http://localhost:9090/api/v1/targets` is called, then the `oms` job target `oms-core:8090` reports `health = up`.
- **AC-5** — Given AC-2 plus `oms-core` running, within 60 seconds of oms-core writing its first log lines, when `GET http://localhost:3100/loki/api/v1/label/compose_service/values` is called, then the response lists `oms-core` among the label values, proving the promtail → Loki log flow.
- **AC-6** — Given AC-2, when `GET http://localhost:3200/ready` is called, then Tempo responds ready; and `docker compose exec -T oms-core printenv TRACING_URL` prints `http://tempo:4317`.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-core (observability configs + scripts); root `docker-compose.yml` is repo infra, not a registered module — modules stay `oms-core` |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | none — new compose volumes `loki-storage`, `tempo-storage` only; no database changes |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | none — infra addition only; Grafana at http://localhost:3000 becomes usable (admin / `GF_SECURITY_ADMIN_PASSWORD`) |
| Knowledge base | `NFR-007-observability.md` implementation state, `architecture/system-context.md` (Tempo), `CLAUDE.md` Monitoring section |

## Open Questions

- [resolved] Prometheus vs Mimir as the "metrics" leg of LGTM → assumption: keep Prometheus (already pinned and running); Mimir would be a duplicate metrics store, rejected under P-17 simplicity.
- [resolved] Tempo vs Jaeger for traces → assumption: keep the Jaeger service for host-native dev (`oms-core/.env` flows), add Tempo, and point the compose `oms-core` env override `TRACING_URL` at it so container traces land in Grafana.
- [resolved] Where the new configs live → assumption: in `oms-core/`, in the paths `docker-compose.yml` already mounts (`prometheus.yml`, `loki-config.yml`, `promtail-config.yml`, new `tempo-config.yml`, `grafana/provisioning/`), following the existing pattern.
- [deferred] Promtail → Grafana Alloy migration → promtail is already pinned in compose and works once configured; switching scrape agents is a separate infra decision.
