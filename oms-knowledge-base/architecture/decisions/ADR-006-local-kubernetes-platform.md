---
type: Decision
id: "ADR-006"
title: "Decision: Compose and a Lightweight Local Kubernetes Coexist; No Local Cozystack"
description: "Docker Compose stays the everyday local stack; a k3d cluster with the upstream Postgres, Kafka, Redis and Grafana operators is used, one at a time, for scaling tests. Cozystack does not fit one laptop."
decision: coexist
tags: [decision, infrastructure, kubernetes, cozystack, k3d, docker-compose, local-development]
status: draft
updated: "2026-11-26T14:00:00Z"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-26T14:00:00Z" }
sources:
  - resource: https://cozystack.io/docs/install/hardware-requirements/
  - resource: https://cozystack.io/docs/install/kubernetes/generic/
  - resource: https://cozystack.io/docs/applications/kafka/
  - resource: "repo:docker-compose.yml"
  - resource: "repo:specs/changes/SPEC-0078-evaluate-cozystack-for-local-kubernetes/spike/timings.md"
  - resource: "repo:specs/changes/SPEC-0078-evaluate-cozystack-for-local-kubernetes/spike/k3d-stats.txt"
---
# Decision: Compose and a Lightweight Local Kubernetes Coexist; No Local Cozystack

## Context

- The OMS runs locally only on the root `docker-compose.yml` ([Local Docker Stack](../../infrastructure/local-docker-stack.md)).
- The question (SPEC-0078) was whether to set up [Cozystack](../../infrastructure/cozystack.md)
  as a Kubernetes alternative on the development laptop. The goals were:
  - test scaling (oms-core already runs safely with several instances, SPEC-0048);
  - get PostgreSQL, Kafka, Grafana and Redis from operators;
  - streamline the build → deploy → test cycle;
  - find out whether this is overkill, or whether Docker and Kubernetes can coexist and be used
    one at a time.
- This record compares four options:
  - compose, measured;
  - Cozystack on three Talos VMs, assessed against its documentation;
  - Cozystack on a single-node k3s host, assessed against its documentation;
  - a k3d cluster with the upstream operators, prototyped and measured.

## Decision

**Coexist.** Docker Compose stays the default for everyday development: it is faster to iterate
on and lighter. For scaling tests, a disposable **k3d** cluster (k3s in Docker Desktop) runs the
same upstream operators Cozystack itself uses:
- CloudNativePG for PostgreSQL;
- Strimzi for Kafka;
- the OT-Container-Kit redis-operator;
- grafana-operator.

The two are used one at a time, never together.

**Cozystack is not used locally.** Its smallest documented setup needs more than twice this
machine's memory. It remains a candidate for a future *shared* environment on dedicated hardware.
Because Cozystack's Postgres and Kafka come from the same operators, k3d manifests written against
them carry over.

## Options

| Option | RAM footprint | CPU footprint | Setup effort | Windows 11 Home feasibility | Compose parity | Scaling test ability |
|---|---|---|---|---|---|---|
| 1. Compose only (today) | 5.4 GiB for the 15 everyday services; 5.8–6.6 GiB with Control Center and pgAdmin as well (measured) | ~0.1 CPU idle for the 15 everyday services; ~0.7 CPU with Control Center just started (measured) | none, exists | yes, runs today | full (reference) | none: one container per service, fixed names and ports |
| 2. Cozystack on Talos, 3 VMs | ≥ 72 GB, the documented minimum (3 × 24 GB) | ≥ 24 cores (3 × 8) | high: 3 Talos VMs with nested virtualisation, L2 network, MetalLB, then the Cozystack install | does not fit: no Hyper-V manager on Home, 72 GB > 31.2 GB host | partial: managed Postgres/Kafka/Redis; no Schema Registry; VictoriaMetrics monitoring instead of LGTM | full, multi-tenant |
| 3. Cozystack on single-node k3s | unknown, not measured; the docs give no single-node figure, and the platform runs Cilium/Kube-OVN, LINSTOR, KubeVirt, SeaweedFS and a monitoring hub before any app (estimate: well above option 4) | unknown (estimate: high) | high: dedicated Ubuntu/Debian host with the k3s CNI, ingress and storage disabled | not practical: needs its own Linux host or VM; WSL2's kernel is not a documented target (unverified) | same as option 2 | yes |
| 4. k3d (k3s in Docker Desktop) + upstream operators | 0.8 GiB empty, 4.0 GiB with operators + instances, 7.4 GiB with 3 × oms-core (measured) | 0.35 CPU empty; 0.4 CPU idle with operators, instances and 3 × oms-core; 2.6 CPU while instances start (measured) | low: `cluster.ps1` + `operators.ps1`, about 6 min from nothing to ready (measured) | yes, measured on this machine | partial: same operators as Cozystack; Schema Registry as a plain Deployment; LGTM and archive replica not yet (F-3, F-4) | yes: `--replicas=3` spread over 3 nodes in 19 s (measured) |

Other lightweight distributions were not prototyped:
- Docker Desktop's built-in cluster is single node.
- kind is close to k3d but heavier per node.
- minikube adds another VM driver.

## Evidence

Cozystack's own requirements, from https://cozystack.io/docs/install/hardware-requirements/ (v1.7):
- Minimal tier (dev/test): 3 hosts × 8 cores × 24 GB RAM, with 50 GB + 256 GB disk each.
- Recommended tier: 3 × 64 GB.
- Talos Linux is the default OS. The generic-Kubernetes install
  (https://cozystack.io/docs/install/kubernetes/generic/) needs an Ubuntu 22.04+/Debian 12+ host
  with the CNI, ingress and storage provisioner disabled.

Development machine, measured on 2026-11-26:
- Ryzen 7 6800H, 8 cores / 16 threads;
- 31.2 GB RAM;
- Windows 11 Home;
- Docker Desktop 29.9.2 on WSL2, allotted 16 CPUs / 15.2 GiB.

Whether each option fits:
- **Option 2 does not fit:** 3 × 24 GB = 72 GB, against 31.2 GB in the host and 15.2 GiB for Docker.
- **Option 3 does not fit** as a laptop setup, because it needs a dedicated Ubuntu/Debian host.
  Its memory need is unknown: the docs give no single-node figure. If one node needed what one
  Minimal-tier host has (24 GB, an assumption), it would leave 7 GB for Windows and everything else.
- **Option 4 fits:** 7.4 GiB with 3 oms-core replicas, inside the 15.2 GiB allotment, but only with
  compose stopped (about 6.6 GiB + 7.4 GiB = 14.0 GiB).

CPU figures are `docker stats` percentages summed and divided by 100, so 1 CPU = one core of 16.
Docker was restarted between the first and second compose samples, so the broker had less heap in
use in the second.

| Setup | Memory | Source |
|---|---|---|
| Compose, the 15 services running day to day (Control Center and pgAdmin stopped), idle (total) | 5.43 GiB | measured 2026-11-26 (first sample) |
| Compose, all 17 services including Control Center (861 MiB) and pgAdmin (298 MiB) (total) | 5.83 GiB | measured 2026-11-26 (second sample, about 20 min after a Docker restart) |
| Compose, all 17 services at steady state (total) | ~6.6 GiB | estimate: first sample + 1.13 GiB for Control Center and pgAdmin |
| k3d empty cluster (1 server + 2 agents) | 0.79 GiB | measured 2026-11-26 |
| k3d + 4 operators | 1.42 GiB | measured 2026-11-26 |
| k3d + operators + idle instances (CNPG 1 instance, Kafka 1 KRaft node, Schema Registry, Redis, Grafana) | 4.02 GiB | measured 2026-11-26 |
| k3d + operators + instances + oms-core × 3 | 7.37 GiB | measured 2026-11-26 |
| k3d with the whole OMS (4 services + LGTM) at 1 replica | ~7.5 GiB | estimate: 4.02 GiB + compose figures for oms-core, streaming, simulator, the knowledge server, ui and LGTM |
| Cozystack Minimal tier | 72 GB | estimate: documented minimum, cozystack.io hardware requirements |

How the k3d totals were taken:
- They are `docker stats` on the node containers, so they include every pod.
- The `kubectl top` lists next to them in `k3d-stats.txt` are a breakdown, not the total. At
  sampling time they lacked grafana-operator and the Schema Registry. The likely cause is that
  metrics-server had not scraped those pods yet; this can't be checked now that the cluster is
  deleted.

Compose per container (`docker stats --no-stream`, measured 2026-11-26):

| Container | Memory |
|---|---|
| broker (Kafka) | 1.34 GiB |
| oms-core | 1019 MiB |
| knowledge server (now kb-server, in its own repository) | 658 MiB |
| grafana | 444 MiB |
| schema-registry | 411 MiB |
| oms-streaming-service | 405 MiB |
| oms-exchange-simulator | 371 MiB |
| oms-ui | 291 MiB |
| tempo | 178 MiB |
| alloy | 120 MiB |
| mimir | 94 MiB |
| loki | 76 MiB |
| postgres | 73 MiB |
| postgres-replica | 33 MiB |
| grafana-mcp | 16 MiB |

Other findings from the prototype:
- **It worked end to end.** oms-core ran unchanged against CloudNativePG and Strimzi, and created
  its schema with Liquibase. An `OrderCreateCmd` produced one `orders` row and a `NEW_ORDER` event.
- **Kafka is slow to recover after a cluster restart.** After `k3d cluster stop`/`start`, Strimzi
  recreated the Kafka broker only about 10.5 min later, and the Schema Registry crash-looped until
  then.
- **oms-core is ready without Kafka.** It reported ready while Kafka was down. That matches
  [ADR-005](ADR-005-transactional-outbox.md), under which a Kafka outage delays publication but
  does not fail commands. It also means the readiness check does not show that the cluster is
  usable.
- **Disk is the binding constraint, more than RAM.** During the spike the host's C: drive filled up
  (0.8 GB free), Docker's data disk (83 GB) could not grow, and Docker Desktop crashed. Each
  `k3d image import` writes the full 471 MB image into every node. Docker's build cache held
  28 GB, 21 GB of it reclaimable.

## Parity

| Capability | Compose | Kubernetes option | Gap handling |
|---|---|---|---|
| Kafka | Confluent 7.9 broker | Strimzi, KRaft, 1 node (the same operator Cozystack uses); slow recovery after a cluster restart | accepted for scaling tests; recreate rather than restart the cluster |
| Schema Registry | `schema-registry` container | plain `cp-schema-registry` Deployment, because neither Strimzi nor Cozystack provides one | F-1 |
| PostgreSQL | `postgres` 18 container | CloudNativePG 1-instance `Cluster` | none |
| Archive replica (SPEC-0052) | `postgres-replica`, logical subscription | not prototyped (`REPLICA_ENABLED=false`); a second CNPG cluster with a logical subscription | F-4 |
| Observability (Alloy, Loki, Tempo, Mimir, Grafana) | LGTM containers + Alloy | only Grafana, from grafana-operator; OTLP export off | F-3 |
| Redis | not used | redis-operator standalone `Redis` (9 MiB); no OMS consumer | accepted: no service uses Redis |

## Coexistence

Compose and k3d both run inside the Docker Desktop VM. Use one at a time:
- **Memory:** about 6.6 GiB + 7.4 GiB = 14.0 GiB of the 15.2 GiB allotment.
- **Disk:** the crash above.

They do not clash on ports:
- k3d publishes only its API server on 6550.
- Services in the cluster are reached with `kubectl port-forward` on chosen ports (for example
  18090 → oms-core).

| Host port | Compose service | Used by Kubernetes option |
|---|---|---|
| 8090 | oms-core | no (port-forward to 18090) |
| 8092 | streaming-service | no |
| 7000 | streaming-service (RSocket) | no |
| 8094 | exchange-simulator | no |
| 8091 | knowledge server (kb-server, its own compose since SPEC-0080) | no |
| 8080 | oms-ui | no |
| 9092 | broker | no |
| 9101 | broker (JMX) | no |
| 8081 | schema-registry | no |
| 9021 | control-center | no |
| 5432 | postgres | no |
| 5433 | postgres-replica | no |
| 5050 | pgadmin (`PGADMIN_PORT`) | no |
| 3000 | grafana | no |
| 8096 | grafana-mcp (localhost only) | no |
| 3100 | loki | no |
| 4317 | alloy (OTLP gRPC) | no |
| 4318 | alloy (OTLP HTTP) | no |
| 12345 | alloy (UI) | no |
| 9009 | mimir | no |
| 3200 | tempo | no |
| 6550 | (none) | yes: k3d API server |

Switch from compose to Kubernetes. Recreating the cluster is the documented path: it took about
6 minutes. A stopped cluster restarted slowly, and its Kafka came back only after about 10.5 min.
The scripts are in `specs/changes/SPEC-0078-evaluate-cozystack-for-local-kubernetes/spike/` until
F-1 gives them a permanent home.

```powershell
docker compose stop
.\cluster.ps1 create                      # k3d cluster oms-spike, context k3d-oms-spike
.\operators.ps1 -Instances                # 4 operators + Postgres, Kafka, Schema Registry, Redis, Grafana
k3d image import oms-core:latest -c oms-spike
kubectl -n oms apply -f oms-core.yaml
```

Switch back:

```powershell
k3d cluster delete oms-spike              # frees its memory and disk; `k3d cluster stop oms-spike` keeps it
docker compose start                      # or: docker compose up -d
```

`k3d cluster stop` and `k3d cluster start` work for short breaks if waiting for Kafka is
acceptable.

A Docker Desktop restart revives the containers of *both* sides that were running, because of
their restart policies. Stop the other side explicitly after one.

## Build–deploy–test cycle

The cycle measured was "change one oms-core class → new oms-core serving". Prototype scripts are in
the SPEC-0078 ticket folder (`spike/loop.ps1`). Kubernetes figures are for k3d with 1 oms-core
replica unless a row says otherwise.

The compose column ran these steps separately:
1. `bootJar`;
2. `docker build -t oms-core:latest`;
3. `docker compose up -d --no-build oms-core`.

They ran from a scratch copy of the repository, to leave a shared working tree alone. That is the
same work `docker compose up -d --build oms-core` does after a `bootJar`.

| Step | Compose | Kubernetes | Source |
|---|---|---|---|
| `gradlew bootJar -x test` (incremental) | 5.6 s | 7.2 s | measured (median of 3) |
| Image build (copies the jar) | 8.0 s | 7.8 s | measured (median of 3) |
| Ship the image (`k3d image import`, 471 MB into 3 nodes) | n/a | 25.4 s | measured (median of 3) |
| Recreate container / `kubectl rollout restart` | 2.3 s | 0.2 s | measured (median of 3) |
| Start → healthy / `rollout status` | 14.9 s | 15.0 s | measured (median of 3) |
| **Total** | **30.8 s** | **56.2 s** | measured (median of 3) |
| Total, 3 replicas (rolling) | n/a | 86.2 s | measured (1 run) |
| Total with a k3d registry + layered jar (only the changed app layer ships) | n/a | ~30 s | estimate: import drops from 25 s to ~2 s, the image build to ~3 s |

The proposed cycle has three parts:
1. **Iterate on compose.** It is the fastest loop, at 30.8 s.
   - The layered image from F-2 also shortens the compose image build, from 8.0 s to about 3 s
     (estimate).
   - For the tightest loop, run oms-core host-native with `./gradlew bootRun` against the
     compose infrastructure ([Local Docker Stack](../../infrastructure/local-docker-stack.md)).
     That skips the image entirely (not measured here).
2. **Faster Kubernetes loop (F-2).**
   - Ship images through a k3d-managed local registry instead of `k3d image import`.
   - Split the oms-core image into Spring Boot layers, so that a code change pushes only the
     application layer.
   - Then add Skaffold or Tilt to run build → push → rollout on save. Neither is installed;
     choosing between them is part of F-2.
3. **Scaling test.** The test entry point is the existing order generator,
   `oms-core/scripts/order-generator.ipynb`.
   - Create the cluster, operators and oms-core as under Coexistence.
   - Scale with `kubectl -n oms scale deploy/oms-core --replicas=3`.
   - Run `kubectl -n oms port-forward svc/oms-core 18090:8090`.
   - Run the notebook with `OMS_BASE_URL = "http://localhost:18090"`, and watch the pods spread
     over the 3 nodes (`kubectl -n oms get pods -o wide`).

F-1 wraps these steps into one script.

## Consequences

- Day-to-day work does not change. Compose stays the documented default, and nothing is added to
  the build.
- Kubernetes manifests target the CloudNativePG and Strimzi CRDs, which Cozystack also uses. A
  later shared Cozystack environment can reuse the workload manifests; the operator instances
  become Cozystack apps.
- **Disk headroom is a precondition.** Keep at least about 30 GB free on the host drive before
  starting the cluster, and prune Docker's build cache regularly.
- The Schema Registry needs its own Deployment on any Kubernetes option, Cozystack included.
- Observability on Kubernetes needs its own work (F-3). grafana-operator alone covers Grafana, not
  Loki, Tempo, Mimir or Alloy.

## Follow-ups

| ID | Title | Type | Modules |
|---|---|---|---|
| F-1 | Add k3d manifests and scripts for OMS scaling tests | feature | oms-core, oms-streaming-service, oms-exchange-simulator, oms-knowledge-base |
| F-2 | Layered oms-core image and registry-based k3d loop | refactor | oms-core |
| F-3 | Run the LGTM observability stack on the k3d cluster | feature | oms-core, oms-knowledge-base |
| F-4 | Archive replica on CloudNativePG | feature | oms-core, oms-knowledge-base |
| F-5 | Re-evaluate Cozystack for a shared test environment | spike | oms-knowledge-base |
