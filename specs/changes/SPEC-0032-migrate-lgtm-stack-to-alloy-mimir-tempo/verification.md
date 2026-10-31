# Verification — SPEC-0032: Migrate LGTM stack to Alloy, Mimir, Tempo 3

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All ACs are compose-level and HTTP-observable, so the proof is
`oms-core/scripts/lgtm-smoke-test.ps1`: one function per AC, exit 0 only when every check passes.
This follows the SPEC-0031 precedent recorded in design.md. Runs on 2026-10-31 with the final
script (sha1 `f10f0554`, after the verify-round-1 fixes):

- **Cold start**: the five LGTM containers were removed first (`docker compose rm -sf grafana
  loki tempo mimir alloy`). Exit 0, 37/37 checks PASS (full output under Appendix).
- **Warm re-run** straight afterwards: exit 0, 37/37 checks PASS.
- **Red baseline** on the SPEC-0031 stack (T-1): exit 1, with AC-1, 2, 3, 4, 6, 7 and 8 failing.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | compose config valid; alloy/mimir/tempo/loki/grafana present, promtail/prometheus/jaeger absent; images ≥ the minimum versions; promtail and prometheus configs deleted | `lgtm-smoke-test.ps1#Check-Config`, 13 checks PASS: `docker compose config --format json` exit 0; service-set include and exclude; each image matches `<repo>:v?X.Y.Z` with `[version] ≥` the minimum (alloy v1.21.3, mimir 3.2.4, tempo 3.1.1, loki 3.7.9, grafana 13.3.0); both files absent; `alloy validate`, `loki -verify-config` and `tempo -config.verify` exit 0 | PASS |
| AC-2 | `up -d` of the five exits 0; within 90 s all running, none restarting; four `/ready` endpoints return 200 | `#Remove-ObsoleteContainers` + `#Wait-StackHealthy`, 7 checks PASS, including `RestartCount` = 0 for all five (this catches crash loops that a `State` snapshot misses), and including from a cold start (Mimir is the slowest at about 20–36 s) | PASS |
| AC-3 | Grafana datasources are exactly Mimir (prometheus, `http://mimir:9009/prometheus`), Loki and Tempo, each with health `OK` | `#Check-GrafanaDatasources`, 4 checks PASS: name set equals `Loki,Mimir,Tempo` with type and URL per name; `/api/datasources/uid/{oms-mimir,oms-loki,oms-tempo}/health` status OK. The old `Prometheus` datasource in the `grafana-storage` volume was removed by `deleteDatasources` | PASS |
| AC-4 | Mimir `up{job="oms-core"}` returns value 1 within 90 s | `#Check-MimirScrape`, 2 checks PASS (`oms-core:8090=1`). This cannot come from old data: Mimir is new, and Prometheus used job `oms` | PASS |
| AC-5 | Loki `compose_service` values include `oms-core` within 90 s, shipped by Alloy | `#Check-LokiLabels`, 3 checks PASS: label values include `oms-core`, and a unique marker written to oms-core's container stdout (`/proc/1/fd/1`) after the Promtail containers were removed is returned by `query_range {compose_service="oms-core"} \|= "<marker>"`. That exact line can only have been shipped by Alloy | PASS |
| AC-6 | OTLP/JSON span posted to host `:4318/v1/traces` returns 200; Tempo `/api/v2/traces/<id>` returns it within 60 s | `#Check-HostTracePath`, 2 checks PASS. Random 128-bit trace id; asserts 200 **and** that the body contains the posted span's service (Tempo can return 200 for unknown ids, a false PASS found at T-1) | PASS |
| AC-7 | `printenv` in compose oms-core gives `TRACING_URL=http://alloy:4317` and `MANAGEMENT_TRACING_SAMPLING_PROBABILITY=1.0` | `#Check-CoreTracingEnv`, 2 checks PASS (exact string equality) | PASS |
| AC-8 | OTLP log to `:4318/v1/logs` and metric `spec0032_smoke_total` to `:4318/v1/metrics` both return 200; within 90 s Loki `query_range` returns the line and Mimir returns the metric | `#Check-OtlpLogsAndMetrics`, 4 checks PASS: unique body found by `{service_name="spec0032-smoke"} \|= "<body>"` with an exact value match; Mimir `spec0032_smoke_total{run_id="<random id>"}` returns this run's sample, so an earlier run's data cannot satisfy it | PASS |

## Goal Assessment

Goal (ticket.md): a local Grafana LGTM stack (Grafana, Loki, Tempo, Mimir and a telemetry agent
such as OpenTelemetry) on recent versions, with obsolete parts (Jaeger, Prometheus, Promtail)
removed.

- **LGTM running locally:** Grafana 13.3.0, Loki 3.7.9, Tempo 3.1.1 and Mimir 3.2.4 come up from
  cold within 90 s and are wired as Grafana datasources with trace→log/metric links (AC-2, AC-3).
- **Telemetry agent:** Grafana Alloy v1.21.3, Grafana's OpenTelemetry Collector distribution,
  takes OTLP traces, metrics and logs on 4317/4318 and forwards each to its backend (AC-6, AC-8).
  It also ships container logs (AC-5) and scrapes oms-core (AC-4).
- **Recent versions:** every pin is the latest release as of 2026-10-31 (proposal research),
  enforced by AC-1.
- **Obsolete components gone:** Jaeger, Prometheus and Promtail are removed from compose and their
  configs deleted (AC-1). Host 4317 now belongs to Alloy, so host-native `bootRun` reports into the
  stack without a config change.

Gaps, all deliberately out of scope and stated in the proposal:
1. **oms-core's own traces do not appear in Grafana yet:** the app emits no spans. Its build lacks the Spring Boot 4 tracing modules; that is
   SPEC-0033's job. The pipeline those spans will take is proven with a synthetic span (AC-6) and
   the compose wiring (AC-7).
2. No Grafana dashboards. Tempo's metrics-generator is off, so the provisioned service-map link
   stays empty until a later ticket enables it.
3. `developer-cockpit` and `mission-control` still default `prometheusUrl` to `localhost:9090`.
   Nothing queries it today.

The requester would recognise the goal as met: the stack they named is running on current
versions, and the three components they called obsolete are gone.

## Policy Review

Scope: the files this ticket changes (docker-compose.yml observability services and the oms-core
env block, `oms-core/{alloy-config.alloy,mimir-config.yml,tempo-config.yml,loki-config.yml}`, the
Grafana provisioning, the smoke script, the deleted promtail and prometheus configs, CLAUDE.md,
NFR-007, system-context.md and readme.txt). The working tree also holds unrelated uncommitted
changes from other tickets (e.g. SPEC-0018 Java in oms-core), which this review leaves out.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contract files touched; R01 passes |
| P-02 | Specification before code, generated models only | N/A | No API or message change |
| P-03 | Never edit generated code | N/A | Nothing under `build/generated*` touched |
| P-04 | Contracts evolve compatibly | N/A | No OpenAPI/Avro change; the local-dev port break is marked BREAKING in the proposal |
| P-05 | Every state change is recorded in the event log | N/A | No order state change |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka producer; R04 passes |
| P-07 | Schema changes through new Liquibase changesets | N/A | No DB change by this ticket |
| P-08 | Concurrency and idempotency are explicit | N/A | No command or order processing touched |
| P-09 | Commands and queries stay separate | N/A | No endpoints changed |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No state machine or pipeline change |
| P-11 | Layering and conventions | PASS | Configs follow the SPEC-0031 layout (`oms-core/<component>-config.*` bind-mounted from the root compose); smoke test kept at its path with the same helpers |
| P-12 | Jackson 3 only | N/A | No Java change |
| P-13 | Errors and validation follow the framework specs | N/A | No request handling changed |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Smoke script rewritten first and run red (T-1), then green; every AC maps to a function with assertions on its then-clause (table above). R07 does not apply (no production Java) |
| P-15 | Observability | PASS | One OTLP entry point for all three signals, container logs to Loki, actuator metrics to Mimir, local sampling 1.0; app-side propagation unchanged (SPEC-0033) |
| P-16 | Security | PASS | No secrets added (Grafana password stays `${GF_SECURITY_ADMIN_PASSWORD:-secret}`); docker.sock mounted `:ro`; R09 clean |
| P-17 | Simplicity and dependencies | PASS | R10 warns on docker-compose.yml. The decisions are recorded in design.md → Alternatives & Decisions (Alloy over the vanilla collector, Mimir monolithic, native OTLP paths, no new volumes). Net −1 container |
| P-18 | Modules build standalone | PASS | No Gradle or source change; `oms-core ./gradlew check` exit 0 in `spec verify` |
| P-19 | Documentation follows behaviour | PASS | NFR-007 and system-context.md updated, plus CLAUDE.md §Monitoring and readme.txt; stale Jaeger/Prometheus/Promtail references remain only in the one-time migration notes |

## Independent Review

spec-reviewer (fresh context; it re-ran the smoke test itself: 34/34, exit 0) said **MET**, with
five findings:

1. **[major] AC-5 freshness guard ineffective.** Confirmed: Loki's label-values API ignores
   `start`, even with a window an hour in the future. **Fixed** (implement reopened): AC-5 now
   writes a unique marker to oms-core's container stdout and requires `query_range` to return it.
   The false claim in design.md and tasks.md was corrected and recorded as "Changed during
   implementation".
2. **[minor] AC-8 metric not unique per run.** **Fixed:** the data point carries a random
   `run_id` attribute, and the query filters on it.
3. **[major] AC proof not in `evidence/`.** `spec verify` records only `oms-core ./gradlew check`
   (up to date, since there is no Java change). **Partly addressed:** the PreToolUse hook forbids
   agents from writing to `evidence/`, so the full output of the final cold smoke run is embedded
   below (Appendix), with the script's sha1. Having `spec verify` run the smoke script for infra
   tickets means changing `specs/config.json`, which is gate config reserved for humans, so it is
   listed as a follow-up.
4. **[minor] "None restarting" was a `State` snapshot only.** **Fixed:** the check also asserts
   `RestartCount` = 0 for the five containers.
5. **[minor] verification.md was still a template.** Expected at that point; it is now complete.

The reviewer also noted stale Jaeger/9090 mentions outside the declared scope
(`oms-core/docs/architecture-specification.md`, the IDE copy `oms-core/bin/main/readme.txt`, and
the mission-control and developer-cockpit docs). These are listed under Follow-ups.

## Automated Evidence

`evidence/last-run.json` (ranAt 2026-10-31T07:59:06Z, fingerprint `c539a3af8ef4ac64`): result
**pass**; modules oms-core and oms-knowledge-base. Policy check PASS with no errors and one warning:
R10/P-17 on docker-compose.yml, addressed in design.md. `oms-core: ./gradlew check` exit 0 (log
`evidence/oms-core-1.log`). Its `test` task was UP-TO-DATE: the inputs were identical to
SPEC-0034's final verify on the same working tree (07:47Z), which executed all 37 oms-core test
classes, 191 tests, 0 failures. SPEC-0032 changes no Java.

The 06:53Z verify run failed only on `QuerySearchIsolationIntegrationTest`, which SPEC-0018 had
written red-first in the shared working tree (its T-14). SPEC-0018 completed T-14 and is done; the
ticket was blocked meanwhile (07:13Z) and unblocked at 07:58Z.

The first two `spec verify` attempts failed inside Gradle's test-result plumbing
(`NoSuchFileException` / `EOFException` on
`build/test-results/test/binary/in-progress-results-generic.bin`) after every test had run, with
no test failure. A full `./gradlew test` then passed (exit 0), and so did the third `spec verify`.
This is an intermittent Windows file race, unrelated to this ticket (no Java change); see
tasks.md → Notes.

## Follow-ups

- SPEC-0033: give oms-core the Spring Boot 4 tracing modules, push OTLP traces, metrics and logs
  to Alloy, and then remove Alloy's actuator scrape.
- Enable Tempo's metrics-generator (span metrics and service graphs, remote-written to Mimir) so
  the provisioned service-map and trace→metric links show data.
- Update the `developer-cockpit` and `mission-control` `prometheusUrl` defaults from
  `localhost:9090` to `http://localhost:9009/prometheus`.
- Make `spec verify` run `oms-core/scripts/lgtm-smoke-test.ps1` for infra tickets, so the AC proof
  lands in `evidence/` (a `specs/config.json` change, for a human).
- Refresh the stale Jaeger/Prometheus mentions in `oms-core/docs/architecture-specification.md`
  (around line 1341).
- Optional: the smoke test's `Check-*` function names trip PSScriptAnalyzer's
  approved-verb warning (inherited from SPEC-0031).

## Verdict

Verdict: GOAL MET

## Appendix: final cold smoke run (script sha1 f10f0554)

```text
[PASS] AC-1 docker compose config --format json exit=0
[PASS] AC-1 services include alloy, mimir, tempo, loki, grafana
[PASS] AC-1 services exclude promtail, prometheus, jaeger
[PASS] AC-1 alloy image pinned >= grafana/alloy:1.21.3 image='grafana/alloy:v1.21.3'
[PASS] AC-1 mimir image pinned >= grafana/mimir:3.2.4 image='grafana/mimir:3.2.4'
[PASS] AC-1 tempo image pinned >= grafana/tempo:3.1.1 image='grafana/tempo:3.1.1'
[PASS] AC-1 loki image pinned >= grafana/loki:3.7.9 image='grafana/loki:3.7.9'
[PASS] AC-1 grafana image pinned >= grafana/grafana:13.3.0 image='grafana/grafana:13.3.0'
[PASS] AC-1 removed: oms-core\promtail-config.yml
[PASS] AC-1 removed: oms-core\prometheus.yml
[PASS] AC-1 alloy validate exit=0
[PASS] AC-1 loki -verify-config exit=0
[PASS] AC-1 tempo -config.verify exit=0
[PASS] AC-2 docker compose up -d grafana loki tempo mimir alloy exit=0
[PASS] AC-2 all LGTM services running, none restarting (90s probed every 5s) alloy=running grafana=running loki=running mimir=running tempo=running
[PASS] AC-2 RestartCount is 0 for all LGTM containers alloy=0 grafana=0 loki=0 mimir=0 tempo=0
[PASS] AC-2 GET http://localhost:3100/ready status=200
[PASS] AC-2 GET http://localhost:3200/ready status=200
[PASS] AC-2 GET http://localhost:9009/ready status=200
[PASS] AC-2 GET http://localhost:12345/-/ready status=200
[PASS] AC-6 POST localhost:4318/v1/traces status=200 traceId=927c80e5f27b43e3becee2de7b727ef5
[PASS] AC-6 tempo GET /api/v2/traces/<traceId> = 200 with the posted span traceId=927c80e5f27b43e3becee2de7b727ef5
[PASS] AC-8 POST localhost:4318/v1/logs status=200 body=spec0032-smoke-8b3d19b72e7b
[PASS] AC-8 POST localhost:4318/v1/metrics status=200
[PASS] AC-8 loki query_range returns the OTLP log line body=spec0032-smoke-8b3d19b72e7b
[PASS] AC-8 mimir query returns this run's spec0032_smoke_total run_id=b9c8669aed44
[PASS] AC-3 datasources are exactly Mimir, Loki, Tempo Loki/loki=http://loki:3100 Mimir/prometheus=http://mimir:9009/prometheus Tempo/tempo=http://tempo:3200
[PASS] AC-3 Loki (oms-loki) health OK Data source successfully connected.
[PASS] AC-3 Mimir (oms-mimir) health OK Successfully queried the Prometheus API.
[PASS] AC-3 Tempo (oms-tempo) health OK Data source is working
[PASS] AC-4 docker compose up -d postgres oms-core exit=0
[PASS] AC-4 up{job="oms-core"} has a sample with value 1 oms-core:8090=1
[PASS] AC-5 compose_service=oms-core in loki alloy, broker, exchange-simulator, grafana, loki, mcp-server, mimir, oms-core, oms-ui, postgres, qdrant, schema-registry, streaming-service, tempo
[PASS] AC-5 marker written to oms-core container stdout marker=spec0032-log-marker-22fe397968a7
[PASS] AC-5 fresh oms-core container log line shipped to loki by alloy marker=spec0032-log-marker-22fe397968a7
[PASS] AC-7 oms-core TRACING_URL=http://alloy:4317 got: 'http://alloy:4317'
[PASS] AC-7 oms-core MANAGEMENT_TRACING_SAMPLING_PROBABILITY=1.0 got: '1.0'
ALL CHECKS PASS (AC-1..AC-8)
```
