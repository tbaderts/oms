# SPEC-0078 spike timings

All measured 2026-11-26 on the development machine (Ryzen 7 6800H, 8C/16T, 31.2 GB RAM,
Windows 11 Home, Docker Desktop 29.9.2 on WSL2 with 16 CPUs / 15.2 GiB).

## Compose inner loop: change oms-core code → new oms-core healthy

The step: change one class, then run `./gradlew bootJar -x test` (incremental) → `docker build` (the
image copies the jar) → `docker compose up -d --no-build oms-core` → poll
`/actuator/health` until UP. A cold `bootJar` (no Gradle outputs) took 36 s.

| Run | Gradle bootJar | Image build | Recreate | Start → healthy | Total |
|---|---|---|---|---|---|
| 1 | 5.8 s | 7.9 s | 2.3 s | 14.9 s | 30.8 s |
| 2 | 5.6 s | 8.0 s | 2.1 s | 14.9 s | 30.7 s |
| 3 | 5.6 s | 8.0 s | 2.4 s | 15.0 s | 31.0 s |
| **median** | **5.6 s** | **8.0 s** | **2.3 s** | **14.9 s** | **30.8 s** |

Built from a scratch copy of oms-core + oms-contracts so that the shared working tree stayed
untouched. The build steps match what `docker compose up -d --build oms-core` runs after a `bootJar`.

## k3d prototype (1 server + 2 agents, k3s v1.35.5), all measured 2026-11-26

| Step | Time |
|---|---|
| `k3d cluster create` (3 nodes, images pulled) | 38 s |
| Install 4 operators (CNPG 1.30.2, Strimzi 1.3.1, OT redis-operator 0.27.0, grafana-operator 5.26.0) | ~3 min including one rerun |
| Instances Ready (Kafka KRaft 1 node, CNPG 1 instance, Redis, Grafana, cp-schema-registry) | ~2 min |
| oms-core first rollout after image import | 18.8 s |
| Scale oms-core 1 → 3 replicas (`kubectl -n oms scale deploy/oms-core --replicas=3`), one per node | 19 s |
| Smoke test: `OrderCreateCmd` via port-forward → `orders` 1 row, `order_events` NEW_ORDER 1 | OK |

### Kubernetes inner loop (`loop.ps1`): change one class → gradle bootJar → docker build → k3d image import → rollout restart → rollout status

| Run | Replicas | Gradle | Image | k3d import | Restart | Ready | Total |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 7.1 s | 8.3 s | 26.6 s | 0.2 s | 15.0 s | 57.2 s |
| 2 | 1 | 7.5 s | 7.8 s | 25.4 s | 0.2 s | 14.8 s | 55.7 s |
| 3 | 1 | 7.2 s | 7.8 s | 24.6 s | 0.2 s | 16.4 s | 56.2 s |
| **median** | 1 | **7.2 s** | **7.8 s** | **25.4 s** | **0.2 s** | **15.0 s** | **56.2 s** |
| 1 | 3 | 7.1 s | 7.8 s | 24.5 s | 0.2 s | 46.6 s | 86.2 s |

Image 471 MB, of which the boot jar is 106 MB. `k3d image import` copies the whole image into all
three nodes on every loop.

### Stop/start (coexistence switch)

- `k3d cluster stop oms-spike`: 8.5 s.
- `k3d cluster start oms-spike` → oms-core 3/3 ready: 288.6 s.
- Kafka did NOT come back with the cluster. Strimzi kept reporting "Reconciliation is in progress"
  and recreated the broker pod only ~10.5 min after the start. The Schema Registry crash-looped
  until then. oms-core reported ready without Kafka: its readiness does not cover Kafka.

### Incident: Docker Desktop crashed (12:45 UTC)

- The host C: drive filled up (0.8 GB free) and `docker_data.vhdx` (83 GB) could not grow.
- The Docker VM logged I/O errors on its data disk, its filesystem went read-only, and containerd
  died (`signal: bus error`).
- Docker Desktop then reported "unable to start". The k3d cluster and the stopped compose stack
  both live in that VM.
- Contributing factors: repeated 471 MB image imports into 3 nodes, the Kafka and Postgres PVs,
  and the operator images, on a host disk that had little headroom.

### Recovery and cleanup

- The user freed space (10.2 GB free) and restarted Docker Desktop. Docker restarted the compose
  stack *and* the k3d cluster together, because both had containers that were running when the VM
  died. Switching therefore means stopping the other side explicitly: Docker's restart policy
  revives both.
- Removal: `k3d cluster delete oms-spike` (deletes nodes, network and volumes), then
  `docker rmi rancher/k3s:v1.35.5-k3s1 ghcr.io/k3d-io/k3d-proxy:5.9.0 ghcr.io/k3d-io/k3d-tools:5.9.0`.
  The k3d CLI stays installed (`winget uninstall k3d.k3d` removes it).
- `docker system df` after recovery: build cache 28.1 GB (21.1 GB reclaimable), images 27.5 GB
  (14.6 GB reclaimable). This is the main lever for disk headroom on this machine.
