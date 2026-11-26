# Proposal — SPEC-0078: Evaluate Cozystack for local Kubernetes deployment

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The OMS runs only on the root `docker-compose.yml` ([Local Docker Stack](../../../oms-knowledge-base/infrastructure/local-docker-stack.md)).
Compose cannot show how the services behave when several replicas run behind a load balancer, roll
or reschedule. oms-core is already safe to run as several instances (SPEC-0048), but nothing
exercises that locally. The knowledge base names [Cozystack](../../../oms-knowledge-base/infrastructure/cozystack.md)
as the planned platform, with nothing built. The requester wants Kubernetes with PostgreSQL, Kafka,
Grafana and Redis operators. They also want a faster build/deploy/test cycle, and an honest answer
on whether this is overkill for one machine, and whether Docker and Cozystack can coexist.

Early evidence suggests that the question is real:
- **Hardware.** Cozystack's smallest documented tier ("Minimal", dev/test) is 3 hosts with 8 cores, 24 GB RAM and 50 GB + 256 GB disk each, on Talos Linux
  (cozystack.io/docs/install/hardware-requirements). The development machine is one laptop: 8
  cores / 16 threads, 31 GB RAM, Windows 11 Home (no Hyper-V manager), with Docker Desktop on WSL2
  allotted 16 GB.
- **Single node.** Cozystack v1.7 also installs on generic Kubernetes (k3s "recommended for single-node and edge").
  That could fit on a laptop, but it is not the documented default.
- **Missing pieces.** Cozystack's Kafka (Strimzi) ships no Schema Registry, and the OMS needs one. Its monitoring
  is VictoriaMetrics-based, not the LGTM stack the OMS uses (SPEC-0031..0038). The OMS uses no Redis today.

Without this spike, the first build ticket would commit to a platform before anyone knows whether it
fits the machine or slows down the inner loop.

## What Changes

- A new architecture decision record, **ADR-006**, in `oms-knowledge-base/architecture/decisions/`. It
  records the options compared, the measured evidence, the decision (adopt Cozystack / coexist /
  use a lighter Kubernetes / stay on compose), and the reasons.
- `oms-knowledge-base/infrastructure/cozystack.md` is updated to reflect the decision and link the ADR.
- A short list of follow-up ticket candidates, recorded in the ADR, for the build work the decision
  implies (cluster setup, manifests/Helm, image build, inner-loop tooling).
- Optional prototype files (scripts, manifests) used for measurements stay in the ticket folder
  `specs/changes/SPEC-0078-…/spike/`. No service module changes.
- No **BREAKING** changes.

## Scope

### In scope

- Compare at least these local options against the goal:
  1. compose only (today);
  2. full Cozystack on Talos (3 VMs);
  3. Cozystack on single-node generic Kubernetes (k3s in a VM or WSL2);
  4. a lightweight local Kubernetes (e.g. kind, k3d, or Docker Desktop's built-in cluster) running
     the same upstream operators directly: CloudNativePG, Strimzi, a Redis operator, Grafana operator.
- For each option, cover: RAM/CPU footprint, setup effort, Windows 11 Home feasibility, parity with
  the compose stack (Schema Registry, LGTM observability, archive replica), and ability to test
  scaling.
- Measure today's footprint and inner loop on compose. Prototype the most promising Kubernetes
  option, time-boxed, and measure its footprint too.
- Describe how compose and the chosen Kubernetes option coexist, used one at a time: ports, kube
  context, start/stop switch.
- Propose a streamlined build → deploy → test cycle (image build, deploy tool, test entry point),
  with measured or clearly-labelled estimated timings.

### Out of scope

- Building the target platform: no Helm charts, manifests or CI in service modules. These are follow-up tickets.
- Adding Redis to the OMS. Redis is evaluated only as an operator's availability and cost; no service uses it.
- Production or shared environments, multi-host clusters, and cloud providers.
- Changing the compose stack. It remains the default until a follow-up ticket says otherwise.

## Acceptance Criteria

- **AC-1** — Given the spike is finished, when `node tools/okf-check/okf-check.mjs oms-knowledge-base` runs, then it exits 0. `oms-knowledge-base/architecture/decisions/ADR-006-*.md` exists and is listed in the decisions `index.md`. Its front matter or first section states exactly one decision from {adopt Cozystack, coexist (compose + Kubernetes), lightweight Kubernetes without Cozystack, stay on compose}.
- **AC-2** — Given ADR-006, when its option comparison is read, then it contains a table with one row per option, at least the 4 in scope. Each row has a value in each of these columns: RAM footprint, CPU footprint, setup effort, Windows 11 Home feasibility, compose parity, scaling test ability.
- **AC-3** — Given ADR-006, when its evidence section is read, then it states Cozystack's minimum hardware requirements with a source URL, and the development machine's measured specs (RAM, cores, Docker Desktop allotment). Each Cozystack option is marked fits / does not fit the machine, with the arithmetic shown.
- **AC-4** — Given the compose stack running all services, when its memory is sampled (`docker stats --no-stream`), then ADR-006 records total and per-service memory, with the date measured. Given the prototyped Kubernetes option with the PostgreSQL, Kafka, Grafana and Redis operators installed and idle, when its memory is sampled, then ADR-006 records that total too. Any figure not measured is labelled "estimate" with its source.
- **AC-5** — Given ADR-006, when the parity section is read, then it states for Schema Registry, LGTM observability (Alloy/Loki/Tempo/Mimir/Grafana), the PostgreSQL archive replica (SPEC-0052) and Kafka, how each is provided on the chosen option. Each gap is marked with a follow-up candidate or "accepted".
- **AC-6** — Given ADR-006, when the coexistence section is read, then it lists every host port published by `docker-compose.yml` and says whether the Kubernetes option uses it. It also gives the commands to switch from compose to Kubernetes and back, including stopping one before starting the other.
- **AC-7** — Given ADR-006, when the inner-loop section is read, then it records today's measured time for "change oms-core code → new oms-core running" on compose (`docker compose up -d --build oms-core`). It gives the proposed Kubernetes cycle (image build, load/push, deploy tool, test entry point) with its time, measured or labelled "estimate", and says how a scaling test (e.g. 3 oms-core replicas) is started.
- **AC-8** — Given ADR-006, when its follow-ups are read, then each candidate ticket has a title, type and modules. `oms-knowledge-base/infrastructure/cozystack.md` links ADR-006 and its status/text reflects the decision.
- **AC-9** — Given the spike is finished, when `git status` / `git diff --stat` is run, then changes from this ticket touch only `oms-knowledge-base/` and `specs/changes/SPEC-0078-…/`. No service module, compose file or contract changes.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-knowledge-base only |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | none |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | none. The MCP server indexes the new ADR as ordinary KB content |
| Knowledge base | new `architecture/decisions/ADR-006-*.md`; updated `architecture/decisions/index.md`, `infrastructure/cozystack.md`; possibly a link from `infrastructure/local-docker-stack.md` and `delivery/release-and-deploy.md` |

## Open Questions

- [resolved] May the spike install software on the development machine for the prototype? → assumption: yes, a time-boxed, disposable prototype of option 4 (or 3) inside Docker Desktop/WSL2. It is removed afterwards, with the removal commands recorded. Full Cozystack on 3 Talos VMs is assessed on paper only, because its documented minimum (72 GB RAM) exceeds the machine. Say so at approval if you want it tried anyway.
- [resolved] What does "Grafana operator" mean, given the OMS uses the LGTM stack? → assumption: the Grafana operator (or Cozystack's monitoring hub) as a way to run Grafana and its datasources in-cluster. The ADR compares that against redeploying the existing LGTM + Alloy setup via Helm.
- [resolved] Redis has no consumer in the OMS → assumption: evaluate only the operator's footprint and availability, so a future cache can use it; no service wiring.
- [deferred] Which shared environments (test, demo, load) Cozystack might host later → safe to defer; this spike is about the local setup, and the ADR can record it as a follow-up.
