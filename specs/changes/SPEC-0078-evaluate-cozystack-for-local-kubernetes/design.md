# Design — SPEC-0078: Evaluate Cozystack for local Kubernetes deployment

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

- The OMS runs from the root `docker-compose.yml` (17 services, see
  `oms-knowledge-base/infrastructure/local-docker-stack.md`). It publishes these host ports:
  8090, 8092, 7000, 8094, 8091, 8080, 9092, 9101, 8081, 9021, 5432, 5433, 5050 (pgadmin,
  `PGADMIN_PORT`), 3000, 8096, 3100, 4317, 4318, 12345, 9009 and 3200. The implementation re-reads
  them from the file rather than trusting this list.
- `oms-knowledge-base/infrastructure/cozystack.md` is a "planned, nothing built" concept page.
  There are no Kubernetes manifests in the repository.
- **Development machine** (measured 2026-11-26): Ryzen 7 6800H, 8 cores / 16 threads, 31.2 GB RAM,
  Windows 11 Home. Docker Desktop 29.9.2 on WSL2 is allotted 16 CPUs and 15.2 GiB. `kubectl` 1.36.1
  is installed.
- **Cozystack v1.7.1** (cozystack.io/docs):
  - The Minimal tier is 3 hosts × 8 cores × 24 GB RAM, with 50 GB + 256 GB disk each, on Talos.
  - Generic Kubernetes (k3s/kubeadm/RKE2) is also supported, on Ubuntu 22.04+/Debian 12+ hosts with
    CNI/ingress/storage disabled.
  - Managed apps: Postgres (CloudNativePG), Kafka (Strimzi, no Schema Registry), Redis/Valkey
    (Sentinel), and a VictoriaMetrics-based monitoring hub with Grafana.
- **Closest existing example:** the ADR format of
  `oms-knowledge-base/architecture/decisions/ADR-005-transactional-outbox.md`, with front matter
  `type: Decision`, `id`, and the sections Context / Decision / Consequences. The new ADR follows
  it and adds the evidence sections the ACs require.

## Approach

The spike is research plus one time-boxed prototype. Its output is documentation.

1. **Measure compose (AC-4, AC-7).**
   - Start the full stack with `docker compose up -d` and wait until it is healthy.
   - Run `docker stats --no-stream` and save the result to `spike/compose-stats.txt`.
   - Time a no-op code change → `docker compose up -d --build oms-core` → `/actuator/health` UP.
     Use three runs and keep the median. Write the result to `spike/timings.md`.
   - Stop compose (`docker compose stop`) before the prototype, so the two never run at once.
2. **Prototype option 4: k3d (k3s in Docker Desktop), 1 server + 2 agents (AC-4, AC-6, AC-7).**
   - All scripts and manifests go in `specs/changes/SPEC-0078-…/spike/`:
     `cluster.ps1` (create/delete), `operators.ps1` (Helm installs), `instances/*.yaml`,
     `oms-core.yaml` and `loop.ps1`.
   - **Operators**, installed with Helm into their own namespaces:
     - CloudNativePG (`cnpg/cloudnative-pg`);
     - Strimzi (`strimzi/strimzi-kafka-operator`);
     - Redis (`ot-helm/redis-operator`);
     - Grafana operator (`oci://ghcr.io/grafana/helm-charts/grafana-operator`).
   - **Minimal instances:**
     - a 1-instance CNPG `Cluster`;
     - a 1-broker KRaft `Kafka` with `KafkaNodePool`;
     - a standalone `Redis`;
     - a `Grafana` CR;
     - plus a plain `Deployment` for Confluent `cp-schema-registry`, because no operator provides
       a Schema Registry.
   - **Measure** with `docker stats` on the k3d node containers, in two states: operators only, and
     operators + idle instances. Save to `spike/k3d-stats.txt`.
   - **Deploy oms-core** from its existing image with a Deployment + Service, environment variables
     pointing at the CNPG and Strimzi services, and the schema-registration step:
     - Liquibase runs at oms-core start-up, as today.
     - Scale with `kubectl scale deploy/oms-core --replicas=3`.
     - Time the loop in `loop.ps1`: `docker build` → `k3d image import` →
       `kubectl rollout restart` → `kubectl rollout status`.
   - **Time box:** half a day of agent effort for steps 2–4. If oms-core does not come up inside
     it, record the blocking reason and label the loop and scaling figures "estimate".
   - **Clean up:** delete the cluster (`k3d cluster delete oms-spike`) and record the removal commands.
3. **Options 2 and 3 (Cozystack) on paper (AC-3).** Show the arithmetic against the machine:
   - Talos: 3 × 24 GB = 72 GB > 31 GB host, and > the 15.2 GiB Docker allotment.
   - Generic k3s single node: Cozystack's platform components (Cilium/Kube-OVN, LINSTOR/DRBD,
     KubeVirt, SeaweedFS, the monitoring hub) need kernel modules and nested virtualisation that
     the WSL2 kernel does not provide out of the box. Verify this against the docs' generic-install
     prerequisites and cite it.
4. **Write ADR-006** `oms-knowledge-base/architecture/decisions/ADR-006-local-kubernetes-platform.md`.
   Front matter `type: Decision`, `id: "ADR-006"`, plus a `decision:` field holding exactly one of
   `adopt-cozystack | coexist | lightweight-kubernetes | stay-on-compose`. Sections, in order:
   - Context;
   - Decision;
   - Options (the AC-2 table, columns exactly: Option | RAM footprint | CPU footprint |
     Setup effort | Windows 11 Home feasibility | Compose parity | Scaling test ability);
   - Evidence (AC-3/AC-4);
   - Parity (AC-5: Schema Registry, LGTM observability, archive replica, Kafka);
   - Coexistence (AC-6: port table + switch commands);
   - Build–deploy–test cycle (AC-7);
   - Consequences;
   - Follow-ups (AC-8: table Title | Type | Modules).
5. **Update the KB.**
   - Add ADR-006 to `architecture/decisions/index.md`.
   - `infrastructure/cozystack.md`: link ADR-006, set its status line and text to the decision, keep
     the page's `status: draft`.
   - Add a one-line link from `infrastructure/local-docker-stack.md`.
6. **Automated checks (P-14)** in `spike/adr-check.test.mjs`, using `node:test` with no
   dependencies:
   - parse ADR-006 and assert each AC's structural content;
   - re-read `docker-compose.yml` ports and assert every one appears in the coexistence table;
   - check that the measured-or-estimate labels exist;
   - assert the git change scope (AC-9).

Proposal What-Changes → where: ADR-006 (step 4), cozystack.md update (step 5), follow-ups (step 4,
Follow-ups section), prototype files (`spike/`, steps 1–2).

## Contract Changes

None. The spike produces documentation and throwaway prototype files only.

## Data & Persistence

None in the repository. The prototype's CNPG database is created fresh by oms-core's existing
Liquibase changelog and deleted with the cluster.

## Events & Messaging

None. No code paths change. The prototype uses the existing topics, which oms-core creates as it
does today.

## Domain, State & Orchestration

None, because no domain behaviour changes.

## Alternatives & Decisions

- **Prototype on k3d rather than kind, minikube or Docker Desktop's built-in Kubernetes.**
  - k3d runs multi-node k3s inside the existing Docker Desktop with no new VM, which matters on
    Windows Home.
  - It has a light footprint, and `k3d image import` makes a short inner loop.
  - Rejected: Docker Desktop Kubernetes, which is single node and has no node-level scaling
    experiments; kind, which is close but heavier per node and loads images more slowly;
    minikube, which adds another VM driver.
  - The ADR still lists the others in the option comparison.
- **Cozystack assessed on paper, not installed.**
  - Its documented minimum (72 GB RAM over 3 Talos hosts) exceeds the 31 GB machine.
  - The generic install needs a dedicated Linux host with the CNI and storage disabled.
  - The proposal approval accepted this assumption.
- **Redis operator: OT-Container-Kit `redis-operator`.** It is maintained, installs with Helm, and
  has a single-instance CR. The alternative, spotahome, is Sentinel-only and less active. The
  choice is reversible because no OMS code uses Redis.
- **Schema Registry: a plain `cp-schema-registry` Deployment.** This matches the compose image
  (Confluent 7.9). Apicurio was rejected for the prototype because it would change the registry
  oms-contracts `registerSchemas` targets.
- **Inner loop: a plain script (`loop.ps1`) is measured. Tilt and Skaffold are compared in the ADR,
  not installed.** A tool choice is a follow-up decision. The script gives the baseline it would
  improve on (P-17).
- **Prototype files stay in the ticket folder** and are archived with it. Whether k8s manifests
  get a permanent home (for example `deploy/k8s/`) is a follow-up.
- **New dependencies:** none in the repository build. The machine gets the `k3d` and `helm` CLIs
  (removable). Helm charts are pulled at prototype time only.

## Risks & Mitigations

- **Machine pressure.** Compose and k3d both draw on the 15.2 GiB Docker allotment.
  - Mitigation: compose is stopped before the cluster starts, and the instances are minimal
    (1 replica, small requests).
  - If pods are evicted, record that as evidence.
- **oms-core fails to start on k8s** (env/config mismatch, schema registration).
  - Mitigation: the time box, then label the figures "estimate" and name the blocker in the ADR.
    The decision does not depend on a perfect prototype.
- **Unverified Cozystack claims** (e.g. Redis operator, WSL2 kernel modules).
  - Mitigation: every Cozystack fact in the ADR cites a docs URL, or is marked "unverified".
- **Left-over cluster consumes resources.**
  - Mitigation: a cleanup step in the plan. The verify stage checks that `k3d cluster list` shows
    no `oms-spike`.
- **Parallel sessions share the working tree.** The working tree already has unrelated
  modifications from other work.
  - Mitigation: the AC-9 scope check considers only paths this ticket lists (KB pages + ticket
    folder), via `git status --porcelain` filtered against a list of expected paths recorded in
    the test, not the whole tree.

## Test Strategy

| AC | Level (unit / web-mvc / integration / e2e) | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | e2e (doc check) | `node tools/okf-check/okf-check.mjs oms-knowledge-base`; `spike/adr-check.test.mjs#adr exists, indexed, one decision` | okf-check exits 0; ADR-006 file exists and is linked from `decisions/index.md`; `decision:` is exactly one of the four values |
| AC-2 | unit (doc check) | `spike/adr-check.test.mjs#options table` | Options table has the 7 required columns, ≥ 4 rows covering compose, Cozystack Talos, Cozystack single-node, lightweight k8s, and no empty cells |
| AC-3 | unit (doc check) | `spike/adr-check.test.mjs#evidence hardware` | Evidence section contains a cozystack.io URL, "24 GB", the host RAM/cores/Docker allotment, and a fits/does not fit verdict per Cozystack option |
| AC-4 | unit (doc check) | `spike/adr-check.test.mjs#memory figures` | Evidence section has compose total + per-service memory with a date, and a k3d operators+instances total. Every figure is in a row labelled `measured` or `estimate` |
| AC-5 | unit (doc check) | `spike/adr-check.test.mjs#parity` | Parity section names Schema Registry, LGTM/Alloy, archive replica, Kafka. Each row ends in a follow-up reference or `accepted` |
| AC-6 | unit (doc check) | `spike/adr-check.test.mjs#coexistence ports` | Every host port parsed from `docker-compose.yml` appears in the coexistence table. The section contains both switch directions (`docker compose stop` and `k3d cluster stop/start`) |
| AC-7 | unit (doc check) | `spike/adr-check.test.mjs#inner loop` | Inner-loop section has the compose oms-core rebuild time, the k8s loop steps and time, each labelled measured/estimate, and a `--replicas=3` scaling command |
| AC-8 | unit (doc check) | `spike/adr-check.test.mjs#follow-ups and cozystack page` | Follow-ups table rows each have title, a type from {feature, fix, refactor, spike, chore}, and module names from `specs/config.json`. `cozystack.md` links ADR-006 |
| AC-9 | e2e (repo check) | `spike/adr-check.test.mjs#change scope` | Files changed by this ticket (the expected-paths list) are all under `oms-knowledge-base/` or the ticket folder. `docker-compose.yml`, `oms-contracts/` and service `src/` are untouched by it |

Run: `node --test specs/changes/SPEC-0078-evaluate-cozystack-for-local-kubernetes/spike/adr-check.test.mjs`.

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | No contracts touched |
| P-02 | Specification before code, generated models only | n/a | No production code; the ADR is the specification output |
| P-03 | Never edit generated code | n/a | No code changes |
| P-04 | Contracts evolve compatibly | n/a | No contract changes |
| P-05 | Every state change is recorded in the event log | n/a | No domain behaviour changes |
| P-06 | Kafka only through the transactional outbox | n/a | No messaging changes; the prototype runs oms-core unchanged |
| P-07 | Schema changes through new Liquibase changesets | n/a | No schema changes; the prototype DB uses the existing changelog |
| P-08 | Concurrency and idempotency are explicit | n/a | No code changes. The 3-replica prototype relies on the existing SPEC-0048 behaviour |
| P-09 | Commands and queries stay separate | n/a | No API changes |
| P-10 | State transitions go through the state machine and task pipeline | n/a | No state changes |
| P-11 | Layering and conventions | comply | ADR follows the existing ADR-00x format and KB conventions (front matter, index entry) |
| P-12 | Jackson 3 only | n/a | No Java code |
| P-13 | Errors and validation follow the framework specs | n/a | No API or validation changes |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | `spike/adr-check.test.mjs` is written before the ADR and asserts every AC; okf-check covers AC-1 |
| P-15 | Observability | n/a | No runtime code. Observability parity is analysed in the ADR (AC-5) |
| P-16 | Security | comply | Prototype manifests take passwords from k8s Secrets generated at run time, never committed. No `.env` values copied into the ticket folder |
| P-17 | Simplicity and dependencies | comply | No repository dependencies. Prototype tools (k3d, helm, operators) are recorded above with rejected alternatives and removed after the spike |
| P-18 | Modules build standalone | n/a | No module build changes. oms-knowledge-base has no verify command beyond okf-check |
| P-19 | Documentation follows behaviour | comply | ADR-006 added and indexed; cozystack.md and local-docker-stack.md updated (see below) |

## Knowledge Base Updates

- `architecture/decisions/ADR-006-local-kubernetes-platform.md` (new): the decision, the options,
  the evidence, parity, coexistence, the inner loop and follow-ups.
- `architecture/decisions/index.md`: list ADR-006.
- `infrastructure/cozystack.md`: link ADR-006; the status line and "Why" reflect the decision and
  the hardware finding.
- `infrastructure/local-docker-stack.md`: one line pointing to ADR-006 for the Kubernetes alternative.

### Changed during implementation

- **The prototype builds from a scratch copy** of oms-core/oms-contracts instead of the working
  tree, because a peer session had uncommitted oms-core edits. This changes no result: the image
  content is the same.
- **The prototype's stop/start test ran on the cluster** rather than only being described. It
  surfaced the slow Strimzi recovery and that readiness ignores Kafka; both are recorded in the ADR.
- **The prototype filled the host disk and Docker Desktop crashed.** Disk headroom is now an
  explicit consequence in ADR-006.
