# Order Management System (OMS)

This repository is an Order Management System implemented in Java (Java 25) using Spring Boot microservices.

## Primary modules

- `oms-core` — core services, controllers, domain model and business logic. Runs on port 8090.
- `oms-streaming-service` — real-time streaming service using RSocket over WebSocket. Consumes order events from Kafka and streams them to connected clients. Supports filtered streaming with snapshot + live updates. Runs on port 7000 (RSocket) and 8092 (HTTP).
- The knowledge server for AI tooling (MCP, hybrid search over `oms-knowledge-base`) and its web UI run from their own repository, [knowledge-server](https://github.com/tbaderts/knowledge-server) (`kb-server` on port 8091, `kb-explorer` on 8097).
- `oms-ui` — React frontend application with AG Grid blotters, real-time streaming support, and filter builder. Runs on port 3000.

## Architecture

```text
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│   oms-ui    │────▶│  oms-core   │────▶│      Kafka       │
│  (React)    │     │ (REST API)  │     │  (orders topic)  │
└─────────────┘     └─────────────┘     └──────────────────┘
       │                                          │
       │ RSocket/WebSocket                        │
       ▼                                          ▼
┌──────────────────────────────────────────────────────────┐
│              oms-streaming-service                        │
│  (RSocket server, Kafka consumer, filtered streaming)    │
└──────────────────────────────────────────────────────────┘
```

## Notable items

- Gradle-based build (wrapper and `build.gradle` files).
- Docker support (single `docker-compose.yml` at the repository root, per-module `Dockerfile`s).
- Kafka + Schema Registry for event streaming with Avro serialization.
- DB migrations and Testcontainers used for integration tests (see module docs).
- OpenAPI-first approach: APIs and DTOs are defined in OpenAPI YAML and generated during the build.
- Documentation and architecture notes under `oms-knowledge-base/`.

## Build & run (examples)

Use PowerShell commands in the project root or module directories:

```powershell
# Composite build from repository root
.\gradlew.bat cleanAll
.\gradlew.bat buildAll
.\gradlew.bat testAll

# Start infrastructure (Postgres, Kafka, Schema Registry, etc.) from the repository root
docker compose up -d

# Full build
.\gradlew.bat clean build

# Fast dev build (skip tests)
.\gradlew.bat bootJar -x test

# Run oms-core (REST API)
cd oms-core
.\gradlew.bat bootRun

# Run streaming service
cd oms-streaming-service
$env:KAFKA_ENABLED = "true"
java -jar build/libs/oms-streaming-service-0.0.1-SNAPSHOT.jar

# Run the knowledge server (MCP + UI) from its checkout next to this one
cd ..\knowledge-server
$env:KB_REPO_NAME = "oms-knowledge-base"; $env:KB_REPO_PATH = "../oms/oms-knowledge-base"
docker compose up -d --build

# Run UI (development)
cd oms-ui/frontend
npm start
```

## Streaming Service

The streaming service provides real-time order updates via RSocket:

- **WebSocket endpoint**: `ws://localhost:7000/rsocket`
- **Routes**:
  - `orders.stream` — Stream order events with optional filter
  - `executions.stream` — Stream execution events
- **Features**:
  - Snapshot on connect (loads existing data)
  - Live Kafka event streaming
  - Server-side filtering (same operators as Query API)
  - Deduplication between snapshot and live events

## Contributing / notes

- OpenAPI specs are the source of truth and live under `oms-contracts/src/main/openapi/`.
- Controllers are typically thin and delegate to services; follow existing patterns when adding endpoints.
- See each module's `README.md` and `docs/` folders for module-specific instructions and architecture details.
