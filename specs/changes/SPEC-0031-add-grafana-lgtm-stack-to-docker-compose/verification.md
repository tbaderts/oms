# Verification — SPEC-0031: Add Grafana LGTM stack to docker-compose

> **Is the goal really met?** Every claim below points to evidence: the latest
> `lgtm-smoke-test.ps1` run (all 16 checks PASS, exit 0, 2026-10-30 16:32 window) and
> `evidence/last-run.json` (`./gradlew check` exit 0, policy PASS, ranAt 2026-10-30T16:32:22Z).

## Acceptance Criteria Results

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | compose + 4 config files exist as files and validate | `lgtm-smoke-test.ps1#Check-Config`: `docker compose config --quiet` exit 0; all 4 paths exist as non-empty **files**; `promtool check config`, `loki -verify-config`, `tempo -config.verify`, `promtail -check-syntax` all exit 0 (real YAML parsers for each config); grafana provisioning `oms.yml` passes the structural check (root mapping, `apiVersion`, `datasources`, prometheus/loki/tempo uids+types) — and its ingestion is proven behaviourally by AC-3. Latest run: 10/10 PASS | PASS |
| AC-2 | `up -d` of the 5 LGTM services, all running, none restarting, in-container configs non-empty | `lgtm-smoke-test.ps1#Wait-StackHealthy`: `docker compose up -d` exit 0; 60s window (5s probes) with all 7 services running and zero restarting at every probe; `docker compose exec -T promtail/loki` runs each service's own binary (`-check-syntax`/`-verify-config`) on the mounted config **inside the running containers** — presence AND validity, stronger than `cat` (minimal images ship no coreutils). Latest run: 4/4 PASS | PASS |
| AC-3 | Grafana `/api/datasources` returns prometheus/loki/tempo with in-network URLs | `lgtm-smoke-test.ps1#Check-GrafanaDatasources`: basic-auth GET returns `prometheus=http://prometheus:9090`, `loki=http://loki:3100`, `tempo=http://tempo:3200`. Latest run: PASS | PASS |
| AC-4 | Prometheus scrape target `oms-core:8090` health=up | `lgtm-smoke-test.ps1#Check-PrometheusTarget`: `http://oms-core:8090/actuator/prometheus` health=`up` (plus `http://prometheus:9090/metrics=up`). Latest run: PASS | PASS |
| AC-5 | promtail→Loki log flow, label `compose_service` has value `oms-core` | `lgtm-smoke-test.ps1#Check-LokiLabels`: label values contain `oms-core` (also broker, grafana, loki, promtail, tempo, …). Latest run: PASS | PASS |
| AC-6 | Tempo `/ready` responds ready; oms-core `TRACING_URL=http://tempo:4317` | `lgtm-smoke-test.ps1#Check-Tempo`: `GET :3200/ready` → `ready`; `docker compose exec -T oms-core printenv TRACING_URL` → `http://tempo:4317`. Latest run: 2/2 PASS | PASS |

## Goal Assessment

The goal — "start grafana lgtm stack from docker-compose. add the necessary config" — is met:
`docker compose up -d` (the script runs `up -d grafana prometheus loki promtail tempo postgres oms-core`) brings
up Grafana with provisioned prometheus/loki/tempo datasources, Prometheus scraping the app (`oms-core:8090`
target up), promtail shipping this compose project's logs to Loki (label `compose_service=oms-core` present),
and Tempo ready on :3200 with the compose `oms-core` OTLP export pointed at it (`TRACING_URL=http://tempo:4317`).
The "necessary config" is real config under `oms-core/` (loki, promtail, tempo, grafana provisioning) replacing
what were empty directories, plus the `app-net` wiring that made the services reachable.

Honest gaps vs the proposal letter, none of which the goal requires:
- The proposal's "new compose volumes `loki-storage` and `tempo-storage`" were dropped during implementation
  (Tempo image-owned `/var/tempo` layout + Loki upstream local-dev pattern) — recorded in design.md
  (Alternatives & Decisions, Risks). A dev stack loses no required function: no AC covers retention.
- Only the LGTM transport is proven; app-side observability enablers were out of scope (proposal Out-of-scope).
- Tempo trace *delivery* by oms-core is wired (`TRACING_URL`) but not asserted with a real span push
  (would need a live trace round-trip; readiness + wiring are what the AC asks).

## Policy Review

<!-- For each policy: PASS, N/A (with reason) or EXCEPTION (only if the design declared it).
     Answer the policy's review questions against the actual diff
     (`git diff $(git merge-base main HEAD)`), not against the design. -->

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | no OpenAPI/Avro changes; no contract folders added |
| P-02 | Specification before code, generated models only | N/A | spec-first workflow followed; no generated models touched |
| P-03 | Never edit generated code | N/A | no generated code touched |
| P-04 | Contracts evolve compatibly | N/A | no contract changes |
| P-05 | Every state change is recorded in the event log | N/A | no domain/app state changes at all |
| P-06 | Kafka only through the transactional outbox | N/A | no Kafka path changes |
| P-07 | Schema changes through new Liquibase changesets | N/A | no DB changes |
| P-08 | Concurrency and idempotency are explicit | N/A | no app code |
| P-09 | Commands and queries stay separate | N/A | no API changes |
| P-10 | State transitions go through the state machine and task pipeline | N/A | no state changes |
| P-11 | Layering and conventions | PASS | configs and the smoke script live in `oms-core/` paths `docker-compose.yml` already mounts, following the existing pattern (`prometheus.yml`, `qdrant` service style) |
| P-12 | Jackson 3 only | N/A | no Java/Jackson changes |
| P-13 | Errors and validation follow the framework specs | N/A | no app code/response changes |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | every AC-1..AC-6 maps 1:1 to smoke-test functions (AC Results table); script written first (T-1, red baseline confirmed); strengthened during verify per independent review; final run exit 0 |
| P-15 | Observability | PASS | the ticket IS observability config: metrics (prometheus target up), logs (promtail→Loki labels), traces (Tempo OTLP wiring); no app-side behaviour changed |
| P-16 | Security | PASS | no secrets added to source: Grafana admin password stays the pre-existing `GF_SECURITY_ADMIN_PASSWORD` (default `secret`, dev dataset); Loki `auth_enabled: false` is the standard local single-binary dev pattern, network-restricted to `app-net`; docker.sock mount is `:ro` |
| P-17 | Simplicity and dependencies | PASS | one new dependency `grafana/tempo:2.10.10`, pinned; existing pins untouched; decisions recorded in design.md (Alternatives & Decisions: no Mimir, no Alloy, Jaeger kept, port-3200 risk). The tool's `[R10 P-17] docker-compose.yml` warning is satisfied by those recorded decisions |
| P-18 | Modules build standalone | N/A | no build/dependency-manifest changes in any module; `oms-core` `./gradlew check` exit 0 (evidence/oms-core-1.log) |
| P-19 | Documentation follows behaviour | PASS | CLAUDE.md Monitoring, `oms-knowledge-base/architecture/system-context.md`, `NFR-007-observability.md`, `oms-core/src/main/resources/readme.txt` all match the running stack; stale `readme.txt` docker `TRACING_URL` and NFR-007 frontmatter/duplicate paragraph fixed during verify |

## Independent Review

The spec-reviewer agent reviewed the whole ticket against the goal, all ACs, and all
19 policies. Its verdict before fixes: **NOT MET** — the stack and configs were right,
but the ticket was not reviewable-as-passed. Findings and dispositions:

1. **[blocking] verification.md unfilled** — was true; this document is the fix.
2. **[blocking] no recorded smoke-test evidence** — `evidence/last-run.json` records the
   automated round (policy PASS, `./gradlew check` exit 0, fingerprint `bc8264…`); the smoke
   run's 16-check all-PASS output (exit 0) is recorded above; the script is in-repo at
   `oms-core/scripts/lgtm-smoke-test.ps1` and re-runnable.
3. **[major] AC-2 `exec cat` then-branch untested** — fixed: `docker compose exec -T
   promtail/loki` now runs each service's own config validator on the mounted file
   inside the running containers (discovered the images ship no `cat`; the binary
   validators are stronger — presence AND YAML validity). Checks PASS.
4. **[major] AC-1 YAML-validity proven only by proxy** — fixed: promtail `-check-syntax`
   added (real parser for `promtail-config.yml`); grafana provisioning `oms.yml` gets an
   explicit structural check (apiVersion/datasources/three uid+type pairs) plus the
   behavioural proof of ingestion via AC-3 (Grafana logs provisioning failures and would
   not expose the datasources otherwise). No new dependencies (no YAML lib in this PS
   context; riding another module's transitive install rejected as fragile).
5. **[minor] stale `readme.txt` docker `TRACING_URL=http://jaeger:4317`** — fixed →
   `http://tempo:4317`; LGTM endpoints (loki :3100, tempo :3200) added to the endpoint list.
6. **[minor] NFR-007 stale frontmatter target + duplicated paragraph** — fixed.
7. **[minor] loki/tempo retention across restarts (no named volumes)** — rejected as a
   change: deliberate, recorded design decision (dev stack; design.md Alternatives &
   Decisions / Risks). No AC covers persistence; listed under Follow-ups.
8. **[minor] restart detection is a single snapshot** — fixed: the 60s stack-health probe
   now requires running AND non-restarting on every 5s iteration before AC-2 passes.

No unresolved blocking findings.

## Automated Evidence

Latest automated round (`evidence/last-run.json`, fingerprint `bc8264c08161cb59`, ranAt 2026-10-30T16:32:22Z):

- `spec verify` policy check: PASS (changes since main, merge-base `55cc3313`); one warning
  `[R10 P-17] docker-compose.yml: build or dependency change: record the decision in design.md`
  — satisfied, decisions recorded in design.md (Alternatives & Decisions).
- `oms-core` `./gradlew check`: exit 0 after 74s, log `evidence/oms-core-1.log`.
- LGTM smoke test `oms-core/scripts/lgtm-smoke-test.ps1` (run 2026-10-30 16:32 window,
  after all fixes): **ALL CHECKS PASS (AC-1..AC-6), exit 0** — 16 checks:
  AC-1 ×10, AC-2 ×4, AC-3 ×1, AC-4 ×1, AC-5 ×1, AC-6 ×2.
- Docker stack live during the run: grafana, prometheus, loki, promtail, tempo, postgres,
  oms-core running; none restarting.

## Follow-ups

- Grafana dashboards (JSON provisioning under `grafana/provisioning/dashboards/`) — next
  observability ticket (proposal Out-of-scope).
- App-side observability enablers E2–E4 from `mission-control/docs/architecture/mission-control-v2.md`
  (observation annotations, Kafka observation, traceparent through the outbox) — separate tickets.
- Mission Control F5 (host port 3200 reservation) — recorded risk in design.md; infra-only bind
  change if both ever run on one host.
- If the team ever wants retention across `docker compose down -v`, revisit named volumes for
  loki/tempo (recorded decision, rejected for dev).

## Verdict

Verdict: GOAL MET
