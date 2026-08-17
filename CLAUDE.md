# OMS Project - Claude Code Instructions

## Project Overview

OMS (Order Management System) is a Java-based financial application for managing orders, executions, quotes, and related financial operations. The system is built on modern architectural patterns including Event Sourcing, CQRS, and microservices architecture.

## Architecture

This is a multi-module project consisting of:

- **oms-contracts** - Shared OpenAPI specs, Avro schemas, and the models generated from them
- **oms-core** - Main Java/Spring Boot application for order management
- **oms-streaming-service** - Kafka-based streaming service
- **oms-ui** - React-based frontend application
- **oms-mcp-server** - Model Context Protocol server for AI-assisted development
- **oms-knowledge-base** - Project documentation and specifications

The Gradle build is a **composite**: each module is an independent build, and the service modules
include `oms-contracts` so they still build standalone.

## Technology Stack

### Backend (oms-core, oms-streaming-service)
- **Java 25** (using Java toolchain)
- **Spring Boot 4.1.0**
- **Spring Cloud 2025.0.3**
- **Jackson 3** (`tools.jackson.databind`, not `com.fasterxml.jackson`)
- **Spring Kafka** - Event streaming
- **Spring Data JPA** - Data persistence
- **PostgreSQL** - Database
- **Liquibase** - Schema migrations (`ddl-auto: validate`)
- **Apache Avro** - Schema serialization
- **OpenAPI/Swagger** - API documentation
- **Lombok** - Boilerplate reduction
- **MapStruct** - Bean mapping
- **Gradle** - Build tool

### Monitoring & Observability
- **Prometheus** - Metrics collection
- **OpenTelemetry** - Distributed tracing
- **Loki & Promtail** - Log aggregation

### Frontend (oms-ui)
- **React** - UI framework
- **Node.js** - Runtime
- **Tailwind CSS** - Styling

## Team Manifesto & Core Values

The team follows these principles (from `oms-knowledge-base/oms-methodolgy/manifesto.md`):

1. **Truthfulness and Transparency** - Honest opinions, open discussion of challenges
2. **Ownership and Accountability** - Take responsibility for work quality
3. **Continuous Learning and Improvement** - Embrace feedback, experiment, grow
4. **Collaboration and Teamwork** - Leverage diverse perspectives
5. **Simplicity and Clarity** - Clear, maintainable code and communication
6. **Data-Driven Decision-Making** - Base decisions on evidence

## Development Principles

### 1. Specification-Driven Development
- Development is driven by clear specifications (OpenAPI, Avro schemas)
- Write specifications BEFORE code
- Use specifications to generate code, tests, and documentation
- All code must adhere to specifications

### 2. Event Sourcing & CQRS
- Every state change is appended to `order_events` with a per-order `version`, alongside the
  resulting state and a snapshot of the order — see `OrderEventAppender` and `OrderReplayService`
- Commands and queries have separate APIs and models, but currently share the `orders` table; there
  is no separate materialized read store
- Events reach Kafka through a transactional outbox drained by `OutboxRelay`, never by publishing
  directly from the command path

### 3. Test-Driven Development (TDD)
- Write tests before code
- Include unit tests, integration tests, and end-to-end tests
- Use BDD frameworks for acceptance criteria

### 4. Microservices Architecture
- Small, independent, loosely coupled services
- Use APIs for inter-service communication
- Deploy and scale services independently

### 5. Embrace Generative AI
- Use AI for code generation, test generation, documentation
- Critically evaluate AI output for quality standards
- Leverage the MCP server for spec-driven development

## Code Generation

The project uses code generation extensively:

**All contracts live in `oms-contracts/` and nowhere else.** A service module must never have its
own `src/main/openapi/` or `src/main/avro/` — `./gradlew check` in oms-contracts fails the build if
one reappears.

### Contract sources

- OpenAPI: `oms-contracts/src/main/openapi/{oms-cmd-api,oms-query-api,schema}.yml`
- Avro: `oms-contracts/src/main/avro/*.avsc`

### Generated models (published by oms-contracts, consumed as a jar)

- `org.example.common.model.cmd` — command API models
- `org.example.common.model.query` — query API models
- `org.example.common.model.msg` — Avro classes

```bash
cd oms-contracts && ./gradlew build   # regenerate everything, all consumers pick it up
```

### API interfaces

Only **oms-core** generates these, because it is the only module that implements them:

```bash
cd oms-core && ./gradlew openApiGenerateCmd openApiGenerateQuery
```

They land in `build/generated/` as `ExecuteApi` and `SearchApi`. Other modules consume the models
and generate nothing.

## Project Structure

```
oms/
├── oms-contracts/               # Shared contracts — the only copy
│   ├── src/main/openapi/        # OpenAPI specifications
│   ├── src/main/avro/           # Avro schema definitions
│   └── build.gradle
├── oms-core/                    # Main OMS application
│   ├── src/main/java/
│   │   └── org/example/
│   │       ├── common/          # Common models and utilities
│   │       └── oms/             # OMS-specific logic
│   ├── src/main/resources/
│   └── build.gradle
├── oms-streaming-service/       # Kafka streaming service
├── oms-ui/                      # React frontend
│   └── frontend/
├── oms-mcp-server/              # MCP server for AI integration
├── oms-knowledge-base/          # Documentation
│   ├── oms-concepts/
│   ├── oms-framework/
│   └── oms-methodolgy/
└── CLAUDE.md                    # This file
```

## Code Conventions

### Java Code Style
- Use **Lombok** annotations (@Data, @Builder, @SuperBuilder, @Jacksonized)
- Use **MapStruct** for entity-to-DTO mapping
- Follow Spring Boot best practices
- Package structure: `org.example.<module>.<layer>` (e.g., `org.example.oms.model`)

### API Models
- Command models use suffix from config: `modelNameSuffix: ""`
- Generated models use `@SuperBuilder` and `@Jacksonized` annotations
- Enum naming: use `original` (preserves case from spec)

### Testing
- Tests in `src/test/java/`
- Use JUnit 5 (Jupiter)
- Use Spring Boot Test for integration tests
- Run tests: `./gradlew test`

## Common Commands

### Build & Run
```bash
# Build all projects
./gradlew build

# Build without tests (faster)
./gradlew build -x test

# Run oms-core
cd oms-core
./gradlew bootRun

# Run oms-streaming-service
cd oms-streaming-service
./gradlew bootRun

# Run oms-ui frontend
cd oms-ui/frontend
npm install
npm start
```

### Docker
A single `docker-compose.yml` at the repository root builds and runs every module plus the
infrastructure (Postgres, Kafka, Schema Registry, observability). There are no per-module compose
files and no Kubernetes manifests in this repository.

```bash
# Start everything from the repository root
docker compose up -d

# Rebuild and restart a single service
docker compose up -d --build oms-core
```

### Code Generation
```bash
# Regenerate all shared models after a spec or schema change
cd oms-contracts && ./gradlew build

# Regenerate everything from the repository root
./gradlew cleanAll buildAll
```

## Domain Model

JPA entities in oms-core:

- **Order** - Order state, versioned with `txNr` for optimistic locking
- **Execution** - Fills, unique on `(orderId, execID)`
- **OrderEvent** - The append-only event log
- **OutboxMessage** - Messages staged for Kafka

**Quote** and **QuoteRequest** exist as Avro schemas only; there are no entities or processors for
them yet.

Sub-domains (Equity, FX, etc.) are intended to extend these base entities through inheritance.

## MCP Server Integration

The project includes an MCP server (`oms-mcp-server`) that provides:
- Access to OMS specifications for AI assistants
- Domain knowledge tools (read, search, navigate specs)
- Query tools for OMS data
- Enables spec-driven development with GitHub Copilot and Claude

### Using MCP Server
```bash
cd oms-mcp-server
./run-mcp.ps1        # Windows
./run-mcp.sh         # Linux/Mac
```

## Documentation References

Key documentation files in `oms-knowledge-base/`:
- `oms-methodolgy/manifesto.md` - Team values and principles
- `oms-methodolgy/software-architecture-methodology.md` - Architecture approach
- `oms-framework/domain-model_spec.md` - Domain model specifications
- `oms-framework/state-query-store_spec.md` - Query service specs
- `oms-concepts/streaming-architecture.md` - Event streaming concepts

## Important Notes

### When Writing Code
- **Always check specifications first** - Located in `oms-knowledge-base/` and `oms-contracts/src/main/openapi/`
- **Prefer editing over creating** - Don't create new files unless necessary
- **Follow specification-driven approach** - Specs before code
- **Use generated code** - Don't manually write models covered by OpenAPI/Avro
- **Write tests first** - TDD approach
- **Keep it simple** - Avoid over-engineering

### When Modifying APIs
1. Update the OpenAPI spec in `oms-contracts/src/main/openapi/`
2. Update the Avro schema in `oms-contracts/src/main/avro/` if needed
3. Regenerate code: `./gradlew clean build`
4. Implement business logic
5. Write tests

### Git Workflow
- Main branch: `main`
- Always review changes before committing
- Follow commit message conventions

## Monitoring

When oms-core is running:
- Application: `http://localhost:8080`
- Actuator endpoints: `http://localhost:8080/actuator`
- Prometheus metrics: `http://localhost:8080/actuator/prometheus`
- OpenAPI UI: `http://localhost:8080/swagger-ui.html`

## Questions?

For project-specific questions, refer to:
- MCP server documentation: `oms-mcp-server/README.md`
- Core OMS documentation: `oms-core/README.md`
- Knowledge base: `oms-knowledge-base/`

---

**Last Updated:** 2026-08-17

<!-- OPENWIKI:START -->

## OpenWiki

This repository uses OpenWiki for recurring code documentation. Start with `openwiki/quickstart.md`, then follow its links to architecture, workflows, domain concepts, operations, integrations, testing guidance, and source maps.

The scheduled OpenWiki GitHub Actions workflow refreshes the repository wiki. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->
