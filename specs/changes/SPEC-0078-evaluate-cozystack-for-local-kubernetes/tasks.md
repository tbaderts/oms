# Tasks — SPEC-0078: Evaluate Cozystack for local Kubernetes deployment

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

- [x] **T-1** Write the failing ADR check suite with one test per AC, as named in the design's Test Strategy (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9)
  - files: specs/changes/SPEC-0078-evaluate-cozystack-for-local-kubernetes/spike/adr-check.test.mjs
  - verify: `node --test specs/changes/SPEC-0078-evaluate-cozystack-for-local-kubernetes/spike/adr-check.test.mjs` runs and fails only because ADR-006 is missing (red)
- [x] **T-2** Measure the compose stack: idle memory per service and the median of 3 oms-core rebuild timings; then stop compose (AC-4, AC-7)
  - files: specs/changes/SPEC-0078-evaluate-cozystack-for-local-kubernetes/spike/compose-stats.txt, specs/changes/SPEC-0078-evaluate-cozystack-for-local-kubernetes/spike/timings.md
  - verify: compose-stats.txt lists every running compose container with MEM USAGE; timings.md holds 3 runs and a median; `docker compose ps --status running` is empty afterwards
- [x] **T-3** Create the k3d prototype cluster (1 server + 2 agents) with a create/delete script (AC-4, AC-6)
  - files: specs/changes/SPEC-0078-evaluate-cozystack-for-local-kubernetes/spike/cluster.ps1
  - verify: `kubectl --context k3d-oms-spike get nodes` shows 3 Ready nodes
- [x] **T-4** Install the CloudNativePG, Strimzi, Redis and Grafana operators and their minimal instances, plus cp-schema-registry; record the idle memory (AC-4, AC-5)
  - files: specs/changes/SPEC-0078-evaluate-cozystack-for-local-kubernetes/spike/operators.ps1, specs/changes/SPEC-0078-evaluate-cozystack-for-local-kubernetes/spike/instances/*.yaml, specs/changes/SPEC-0078-evaluate-cozystack-for-local-kubernetes/spike/k3d-stats.txt
  - verify: `kubectl --context k3d-oms-spike get pods -A` shows the operator and instance pods Running/Ready; k3d-stats.txt holds the operators-only and operators+instances totals
- [x] **T-5** Deploy oms-core on the prototype, scale it to 3 replicas, and time the build→import→rollout loop (time-boxed; label the figures "estimate" with the blocker if it does not come up) (AC-7)
  - files: specs/changes/SPEC-0078-evaluate-cozystack-for-local-kubernetes/spike/oms-core.yaml, specs/changes/SPEC-0078-evaluate-cozystack-for-local-kubernetes/spike/loop.ps1, specs/changes/SPEC-0078-evaluate-cozystack-for-local-kubernetes/spike/timings.md
  - verify: either `kubectl --context k3d-oms-spike get deploy oms-core` shows 3/3 ready and timings.md holds the measured loop, or timings.md names the blocker and labels the loop figures "estimate"
- [x] **T-6** Delete the prototype cluster and record the removal commands (AC-6)
  - files: specs/changes/SPEC-0078-evaluate-cozystack-for-local-kubernetes/spike/timings.md
  - verify: `k3d cluster list` does not show oms-spike
- [x] **T-7** Write ADR-006 covering context, decision, options, evidence, parity, coexistence, the build/deploy/test cycle, consequences and follow-ups, and add it to the decisions index (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8)
  - files: oms-knowledge-base/architecture/decisions/ADR-006-local-kubernetes-platform.md, oms-knowledge-base/architecture/decisions/index.md
  - verify: `node --test specs/changes/SPEC-0078-evaluate-cozystack-for-local-kubernetes/spike/adr-check.test.mjs` passes every test except, at most, the cozystack-page part of AC-8
- [x] **T-8** Update cozystack.md and local-docker-stack.md to link ADR-006 and reflect the decision (AC-8)
  - files: oms-knowledge-base/infrastructure/cozystack.md, oms-knowledge-base/infrastructure/local-docker-stack.md
  - verify: `node --test specs/changes/SPEC-0078-evaluate-cozystack-for-local-kubernetes/spike/adr-check.test.mjs` passes all tests and `node tools/okf-check/okf-check.mjs oms-knowledge-base` exits 0
- [x] **T-9** Run spec verify (AC-1, AC-9)
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0078` exits 0

## Notes

- T-2 and T-3..T-6 must not overlap: compose is stopped before the cluster starts (design, Risks).
- Peer sessions share the working tree. Before T-2 stops compose, check that no other session
  depends on the running stack; if one does, measure and then leave compose stopped only for the
  prototype window.
- During implementation:
  - **T-1:** `node --test <dir>/` does not discover files on this Node version, so every verify line
    names `adr-check.test.mjs` directly. The compose-port parser was widened after a manual check:
    it missed unquoted, IP-prefixed and `${VAR:-port}` entries.
  - **T-2/T-5:** Gradle and the image builds ran from a scratch copy of oms-core + oms-contracts, so
    the shared working tree (with a peer session's uncommitted oms-core edits) stayed untouched. The
    peer (oms-c7, SPEC-0079) confirmed beforehand that it did not need compose.
  - **Docker crash:** Docker Desktop crashed during T-5 because the host disk was full. The ticket
    was blocked until the user freed space and restarted Docker, then unblocked; T-6 cleanup ran
    afterwards. The details are in `spike/timings.md`.
- **Reopened after the spec-reviewer's findings** (round 1). The fixes:
  - the compose footprint now also measures Control Center and pgAdmin;
  - CPU figures are recomputed in CPUs;
  - the AC-9 test can now fail (it checks compose, the marker class and k8s content outside the
    ticket's paths); AC-3 needs a verdict per option, and AC-7 a named test entry point;
  - the Skaffold claim is removed;
  - recreating the cluster is the documented switch path;
  - the option-3 arithmetic is labelled an assumption;
  - the cozystack.md Kafka row is corrected;
  - the kubectl-top caveat is noted.
  All within T-7/T-8; no new tasks.
