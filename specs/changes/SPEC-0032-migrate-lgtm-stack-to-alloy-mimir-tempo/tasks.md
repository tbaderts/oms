# Tasks — SPEC-0032: Migrate LGTM stack to Alloy, Mimir, Tempo 3

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
> - [ ] **T-1** Imperative summary (AC-1, AC-2)
>   - files: path/one.java, path/two.yaml
>   - verify: `./gradlew test --tests 'org.example.oms…SomeTest'` passes
> ```
>
> Every AC must be covered by at least one task, and every task needs a `verify:` line. Tasks may
> be added during implementation; record why under Notes.

## Tasks

- [x] **T-1** Rewrite `oms-core/scripts/lgtm-smoke-test.ps1` for SPEC-0032 with one function per AC (`Check-Config`, `Remove-ObsoleteContainers`, `Wait-StackHealthy`, `Check-GrafanaDatasources`, `Check-MimirScrape`, `Check-LokiLabels`, `Check-HostTracePath`, `Check-CoreTracingEnv`, `Check-OtlpLogsAndMetrics`) and run it red against the current stack (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8)
  - files: oms-core/scripts/lgtm-smoke-test.ps1
  - verify: `powershell -File oms-core/scripts/lgtm-smoke-test.ps1` runs to the summary and exits 1, with AC-1 failing (promtail/prometheus present, old image pins) — the red baseline
- [x] **T-2** Add `oms-core/mimir-config.yml` (monolithic, filesystem, RF 1, multitenancy off, usage stats off) as in the design (AC-2, AC-4, AC-8)
  - files: oms-core/mimir-config.yml
  - verify: a throwaway `docker run grafana/mimir:3.2.4 -config.file=<mounted file>` reaches `GET /ready` = 200 within 90 s
- [x] **T-3** Add `oms-core/alloy-config.alloy` (OTLP receiver 4317/4318 → batch → Tempo/Mimir/Loki exporters, `prometheus.scrape` job `oms-core` → remote_write Mimir, docker discovery/relabel/`loki.source.docker` → `loki.write`), formatted with `alloy fmt` (AC-4, AC-5, AC-6, AC-8)
  - files: oms-core/alloy-config.alloy
  - verify: `grafana/alloy:v1.21.3 validate` on the mounted file exits 0 and `alloy fmt` output equals the file
- [x] **T-4** Update `oms-core/tempo-config.yml` (header for Tempo 3.1.1/SPEC-0032, in-network OTLP HTTP receiver 4313 → 4318) and `oms-core/loki-config.yml` (`allow_structured_metadata: true`, header) (AC-6, AC-8)
  - files: oms-core/tempo-config.yml, oms-core/loki-config.yml
  - verify: `grafana/tempo:3.1.1 -config.verify=true` and `grafana/loki:3.7.9 -verify-config` both exit 0 on the mounted files
- [x] **T-5** Replace the Grafana provisioning: `deleteDatasources` Prometheus; `Mimir` (uid oms-mimir, type prometheus, `http://mimir:9009/prometheus`, default); Loki unchanged; Tempo with tracesToLogsV2 / tracesToMetrics / serviceMap / nodeGraph (AC-3)
  - files: oms-core/grafana/provisioning/datasources/oms.yml
  - verify: after T-6, smoke-test `Check-GrafanaDatasources` (AC-3) passes: exactly Mimir/Loki/Tempo with the design URLs, each health `OK`
- [x] **T-6** Rewire `docker-compose.yml`: delete `jaeger`, `prometheus`, `promtail`; add `alloy` and `mimir` services; pin `tempo:3.1.1`, `loki:3.7.9`, `grafana:13.3.0`; update comments (AC-1, AC-2)
  - files: docker-compose.yml
  - verify: after `Remove-ObsoleteContainers` and `docker compose up -d grafana loki tempo mimir alloy`, the smoke-test `Wait-StackHealthy` (AC-2) check passes
- [x] **T-7** Set compose `oms-core` env `TRACING_URL: http://alloy:4317` and `MANAGEMENT_TRACING_SAMPLING_PROBABILITY: "1.0"` (AC-7)
  - files: docker-compose.yml
  - verify: after `docker compose up -d postgres oms-core`, `docker compose exec -T oms-core printenv TRACING_URL` prints `http://alloy:4317` and `printenv MANAGEMENT_TRACING_SAMPLING_PROBABILITY` prints `1.0`
- [x] **T-8** Delete the obsolete `oms-core/promtail-config.yml` and `oms-core/prometheus.yml` (AC-1)
  - files: oms-core/promtail-config.yml, oms-core/prometheus.yml
  - verify: smoke-test `Check-Config` (AC-1) passes: both files absent, compose services and image pins as required, configs validate
- [x] **T-9** Run the full smoke test green end-to-end (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8)
  - files: no files
  - verify: `powershell -File oms-core/scripts/lgtm-smoke-test.ps1` exits 0 with every AC-1..AC-8 check PASS
- [x] **T-10** [docs] Update `NFR-007-observability.md`, `architecture/system-context.md`, `CLAUDE.md` §Monitoring and `oms-core/src/main/resources/readme.txt` to the Alloy/Mimir/Tempo 3 stack, including the one-time `docker compose up -d --remove-orphans` step (no AC — P-19)
  - files: oms-knowledge-base/non-functional-requirements/NFR-007-observability.md, oms-knowledge-base/architecture/system-context.md, CLAUDE.md, oms-core/src/main/resources/readme.txt
  - verify: `grep -nEi "jaeger|promtail|16686|prometheus:9090|localhost:9090"` on the four files finds no current-stack references (historical SPEC-0031 mentions only), and each file names Alloy and Mimir
- [x] **T-11** Run spec verify
  - files: no files
  - verify: `node specs/tools/spec.mjs verify SPEC-0032` exits 0

## Notes

- T-1 red baseline (2026-10-31): exit 1 with AC-1/2/3/4/6/7/8 failing. It also exposed two false
  PASSes in the test itself, fixed before going green: Tempo answers 200 for an unknown trace id
  (AC-6 now requires the posted span in the response body), and Promtail kept shipping after the
  script started. The first AC-5 fix (`start=` on label values) turned out to be ineffective; see
  the verify-round note below.
- First green attempt failed only AC-3, also a test bug: PS 5.1 `@(Invoke-RestMethod …)` nests the
  JSON array as one element. Fixed by assigning to a variable first. Grafana itself was correct
  (all three datasources were healthy when queried directly).
- Check order: AC-6 and AC-8 run before AC-3, as the design's risk table allows (Tempo health is
  checked once Tempo holds data).
- T-9 evidence: green on a warm stack and again from a cold start (`docker compose rm -sf grafana
  loki tempo mimir alloy` first): 34/34 checks PASS, exit 0.
- Order: docs (T-10) were written while the T-1 red run was in progress; they have no dependency
  on the compose change.
- T-11: the first two `spec verify` runs failed in oms-core `:test` with Gradle's own result-file
  plumbing (`NoSuchFileException` / `EOFException` on
  `build/test-results/test/binary/in-progress-results-generic.bin`) after every test had run. No
  test failed. A full `./gradlew test` with a directory watcher then passed (exit 0), and the third
  `spec verify` passed. This is an intermittent Windows file race on Gradle's result rename,
  probably the VS Code Java tooling running alongside. It is unrelated to this ticket, which has no
  Java change.
- Verify round 1 (spec-reviewer), implement reopened: Loki's label-values API ignores `start`, so
  the AC-5 guard was ineffective. AC-5 now also writes a unique marker to oms-core's container
  stdout and requires `query_range` to return it. AC-8's metric gets a per-run `run_id` label, and
  AC-2 also checks `RestartCount` = 0. The smoke test was then re-run cold and warm, both exit 0
  with 37/37 checks PASS, and T-9 and T-11 were re-verified.
