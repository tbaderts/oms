---
type: Architecture
title: "Local Docker Stack"
description: "The root docker-compose.yml: every OMS module and the infrastructure it needs (PostgreSQL, Kafka with Schema Registry, the Grafana LGTM stack), with ports, how to start, rebuild and reset it, and its known oddities."
tags: [infrastructure, docker, docker-compose, local-development]
status: draft
updated: "2026-11-17T12:00:00Z"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-14T12:00:00Z" }
sources:
  - resource: "repo:docker-compose.yml"
  - resource: "repo:oms-core/Dockerfile"
  - resource: "repo:oms-core/scripts/lgtm-smoke-test.ps1"
---
# Local Docker Stack

One `docker-compose.yml` at the repository root builds and runs the whole OMS. There are no
per-module compose files and no Kubernetes manifests in the repository; the planned cloud platform
is [Cozystack](cozystack.md).

```bash
docker compose up -d                          # everything
docker compose up -d --build oms-core         # rebuild and restart one service
docker compose up -d --remove-orphans         # after a service was removed (drops old containers, e.g. qdrant)
```

## Services

| Group | Service | Port(s) | Notes |
|---|---|---|---|
| OMS | `oms-core` | 8090 | [oms-core](../architecture/context/oms-core.md) |
| | `streaming-service` | 8092 HTTP, 7000 RSocket | [Streaming Service](../architecture/context/streaming-service.md) |
| | `exchange-simulator` | 8094 | [Exchange Simulator](../architecture/context/exchange-simulator.md) |
| | `mcp-server` | 8091 | [Knowledge Server](../tools/knowledge-server.md); mounts the knowledge base read-only; expects Ollama on the host for embeddings |
| | `oms-ui` | 8080 | [OMS UI](../architecture/context/oms-ui.md) |
| Messaging | `broker` (Kafka) | 9092 | Confluent Platform 7.9 |
| | `schema-registry` | 8081 | Subjects registered by oms-contracts `registerSchemas` |
| | `control-center` | 9021 | Confluent Control Center |
| Data | `postgres` | 5432 | PostgreSQL 18; schema by Liquibase from oms-core; `wal_level=logical`, `max_slot_wal_keep_size=2GB` |
| | `postgres-replica` | 5433 | The archive replica (SPEC-0052): a logical replica of the order history that keeps rows archived from `postgres`. oms-core migrates it and subscribes it at start-up ([Retention and Archive](../architecture/concepts/retention-and-archive.md)) |
| | `pgadmin` | 5050 (`PGADMIN_PORT`) | Database UI |
| Observability | `grafana` | 3000 | admin / `$GF_SECURITY_ADMIN_PASSWORD` (default `secret`) |
| | `grafana-mcp` | 8096 (localhost only) | Grafana MCP server, registered in `.mcp.json` as `grafana` |
| | `alloy` | 4317 gRPC, 4318 HTTP, 12345 UI | The single telemetry agent |
| | `loki`, `mimir`, `tempo` | 3100, 9009, 3200 | Logs, metrics, traces |

All services share the `app-net` network. The four Java services take their telemetry settings
from the `x-otlp-env` anchor (`OTLP_EXPORT_ENABLED=true`, `OTLP_ENDPOINT=http://alloy:4318`,
sampling 1.0). Details: [Observability](observability.md).

## Host-native runs

Services can also run with `./gradlew bootRun` on the host, against the infrastructure containers.
They then use `localhost` endpoints and have OTLP export off unless `OTLP_EXPORT_ENABLED=true` is
set. The KB explorer, the developer cockpit and mission control always run on the host.

## Checks

`powershell -File oms-core/scripts/lgtm-smoke-test.ps1` checks that telemetry flows end to end
(exit 0 when every check passes).
