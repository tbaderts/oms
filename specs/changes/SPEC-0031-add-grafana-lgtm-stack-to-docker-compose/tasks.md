# Tasks — SPEC-0031: Add Grafana LGTM stack to docker-compose

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
> - [x] **T-1** Imperative summary (AC-1, AC-2)
>   - files: path/one.java, path/two.yaml
>   - verify: `./gradlew test --tests 'org.example.oms…SomeTest'` passes
> ```
>
> Every AC must be covered by at least one task, and every task needs a `verify:` line. Tasks may
> be added during implementation; record why under Notes.

## Tasks

- [x] **T-1** Write the failing LGTM smoke-test script `oms-core/scripts/lgtm-smoke-test.ps1` with one function per AC and FAIL output on the current broken stack (all ACs)
  - files: oms-core/scripts/lgtm-smoke-test.ps1
  - verify: `powershell -File oms-core/scripts/lgtm-smoke-test.ps1` runs and currently **FAILs** (AC-3/AC-5 fail: no datasources provisioned, no logs shipped) — the red baseline this ticket turns green
- [x] **T-2** Replace the empty `oms-core/loki-config.yml` **directory** with a real single-node Loki config (tsdb v13, filesystem under /loki, auth disabled, 7d retention via compactor) (AC-1)
  - files: oms-core/loki-config.yml
  - verify: `docker compose run --rm --no-deps loki -config.file=/etc/loki/loki-config.yaml -verify-config` succeeds against the new file
- [x] **T-3** Replace the empty `oms-core/promtail-config.yml` **directory** with a real promtail config (docker_sd over docker.sock, `compose_service` label, push to http://loki:3100/loki/api/v1/push) (AC-1, AC-5)
  - files: oms-core/promtail-config.yml
  - verify: `docker compose run --rm --no-deps promtail -config.file=/etc/promtail/promtail-config.yaml -check-syntax'; exit code 0 = parse OK
- [x] **T-4** Add `oms-core/tempo-config.yml` (local backend, OTLP grpc 4317 + http 4313 receivers, reporting off) (AC-1, AC-6)
  - files: oms-core/tempo-config.yml
  - verify: `docker compose run --rm --no-deps tempo -config.file=/etc/tempo/tempo-config.yaml -config.verify` succeeds
- [x] **T-5** Add Grafana datasource provisioning `oms-core/grafana/provisioning/datasources/oms.yml` with prometheus/loki/tempo datasources (AC-3)
  - files: oms-core/grafana/provisioning/datasources/oms.yml
  - verify: `docker compose run --rm --no-deps grafana --version` still exits 0 and `Test-Path oms-core/grafana/provisioning/datasources/oms.yml` is true; YAML loads (ConvertFrom-Yaml or docker compose config of a dry-run bind)
- [x] **T-6** Wire services into docker-compose: add `app-net` + `command:` + data volumes to `loki` and `promtail`, new `tempo` service (host 3200), `grafana` provisioning mount, new volumes `loki-storage`/`tempo-storage` (AC-2, AC-6)
  - files: docker-compose.yml
  - verify: `docker compose config --quiet` exits 0 and `docker compose ps --status restarting` is empty for the LGTM services after `docker compose up -d grafana prometheus loki promtail tempo`
- [x] **T-7** Switch the compose `oms-core` env override `TRACING_URL` from `http://jaeger:4317` to `http://tempo:4317` (AC-6)
  - files: docker-compose.yml
  - verify: `docker compose run --rm --no-deps oms-core printenv TRACING_URL` prints `http://tempo:4317`
- [x] **T-8** Fix the Prometheus scrape target in `oms-core/prometheus.yml` from `app:8090` to `oms-core:8090` (AC-4)
  - files: oms-core/prometheus.yml
  - verify: with the stack from T-6 up, `GET http://localhost:9090/api/v1/targets` (via the smoke script `Check-PrometheusTarget`) reports `health=up` for `oms-core:8090`
- [x] T-9 [docs] Update `CLAUDE.md` §Monitoring, `oms-knowledge-base/architecture/system-context.md` and `NFR-007-observability.md` with the LGTM endpoints (Tempo :3200, Grafana :3000, Loki :3100) and the working promtail→Loki flow (no AC — P-19)
- [x] **T-10** Run the full LGTM smoke test end-to-end (all ACs)
  - files: no files
  - verify: `powershell -File oms-core/scripts/lgtm-smoke-test.ps1` exits **0** with all 6 checks printing PASS (AC-1..AC-6)
- [x] **T-11** Run spec verify for SPEC-0031
  - files: no files
  - verify: `node specs/tools/spec.mjs verify SPEC-0031` exits 0

## Notes

- This ticket changes no Java/Gradle/contract code: tasks are config files, compose wiring and one
  PowerShell smoke script. The script **is** the automated test required by P-14 — written first
  (T-1) so every config task lands against a failing, then passing, check.
- Task ordering follows the design: configs (T-2..T-5) before compose wiring (T-6..T-7), because
  `docker compose config`/`up` is the gate for wiring tasks and needs real bind sources.
- T-2/T-3 require **replacing directories**: `oms-core/loki-config.yml` and `promtail-config.yml`
  exist today as empty *directories* created by Docker's missing bind-source handling. They must be
  removed (rmdir) before the config files can exist at those paths. Notes recorded here per the
  template's "tasks may be added" rule.
- Tempo image pin `2.10.10` is the design decision under P-17; already recorded in design.md →
  Alternatives & Decisions. No other image pins change.
- Grafana admin password stays env-provided (`GF_SECURITY_ADMIN_PASSWORD:-secret`) — not a file
  change, so no P-16 concern.

