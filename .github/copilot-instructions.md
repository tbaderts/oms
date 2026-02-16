## Quick context for AI coding agents

- Repo: OMS (Order Management System) — Java 21+, Spring Boot microservices with OpenAPI + Avro specs. Primary modules: `oms-core`, `oms-mcp-server`, `oms-ui`.
- Spec-driven: APIs and DTOs are defined in OpenAPI YAML under `src/main/openapi/` (e.g. `oms-query-api.yml`, `oms-cmd-api.yml`). OpenAPI generation is wired in `build.gradle` (openApiGenerate task).
- Migrations & DB: project uses standard DB migration folders (look for `db/migration` or Liquibase conventions in module docs). Tests rely on Testcontainers for integration tests.

## Immediate tasks you can help with

- Implement thin Spring controllers that map to OpenAPI paths and call service layer. See `oms-core/src/main/java/org/example/oms/api/*Controller.java` for examples and `oms-mcp-server/src/main/openapi/` for query API.
- Prefer small immutable DTOs and explicit mappers (controller -> dto/mapper -> service -> repository).
- When asked to generate DB migrations, produce Liquibase changelogs and comments; add corresponding tests and note compatibility concerns in PR description.

## Build / run / test (concrete commands)

- Full build (windows PowerShell):
  .\gradlew.bat clean build
- Fast build (skip tests / create jar):
  .\gradlew.bat bootJar -x test
- Run locally (MCP server):
  .\run-mcp.ps1    # builds jar and runs the MCP server (see oms-mcp-server/run-mcp.ps1)
  or
  ./run-mcp.sh     # unix shell
- Gradle run for development:
  .\gradlew.bat bootRun --args='--spring.main.web-application-type=servlet --server.port=8091'
- Semantic search (optional) setup uses Docker Compose in `oms-mcp-server/docker-compose.yml` and helper scripts: `setup-semantic-search.ps1` / `.sh`. Check with `docker-compose ps` and `docker-compose logs qdrant`.

## Project-specific conventions & patterns

- OpenAPI-first: OpenAPI YAML under `src/main/openapi/` is the source of truth. Gradle `openApiGenerate` is configured in each module's `build.gradle`.
- Two API families: Command APIs (commands/commands) and Query APIs (under `/api/query/*`). Examples: `OrderController.java`, `OrderQueryController.java`.
- DTO nullability: repo uses jackson-databind-nullable and OpenAPI generator nullables — be explicit about nullable filters. See `build.gradle` for `org.openapitools:jackson-databind-nullable`.
- Error format: RFC7807 Problem+JSON is used in examples — follow that shape for error responses.
- Logging & observability: use structured SLF4J logging, include correlation/order ids when present. Prometheus and Actuator are configured in modules.

## Integration points to be aware of

- OMS backend APIs: controllers under `oms-core/src/main/java/org/example/oms/api` expose endpoints consumed by `oms-ui` and `oms-mcp-server` tool clients (`OrderQueryClient` in `oms-mcp-server`).
- OpenAPI generator tasks: `build.gradle` wires `openApiGenerate` to generate models and controllers; avoid manual edits to generated packages unless migrating generator configs.
- Semantic search (optional): Qdrant/Ollama via Docker Compose used by `oms-mcp-server` (`README_SEMANTIC_SEARCH.md`, `setup-semantic-search.sh`).

## What reviewers expect from generated code

- Keep controllers thin and delegate to services. Add unit tests (JUnit 5 + Mockito) and at least one integration test if touching persistence or migrations.
- Include changelog/migration files for DB changes and document breaking changes in PR description.
- Follow existing package structure and naming (packages under `org.example.*`). Update `build.gradle` only when necessary and run `./gradlew clean build` locally.

## Helpful file pointers (examples to open)

- OpenAPI specs: `oms-core/src/main/openapi/oms-cmd-api.yml`, `oms-core/src/main/openapi/oms-query-api.yml`, `oms-mcp-server/src/main/openapi/`.
- Controllers: `oms-core/src/main/java/org/example/oms/api/*Controller.java`.
- MCP docs & run scripts: `oms-mcp-server/docs/README.md`, `oms-mcp-server/run-mcp.ps1`, `oms-mcp-server/run-mcp.sh`, `oms-mcp-server/setup-semantic-search.ps1`.
- Gradle build config: `oms-core/build.gradle`, `oms-mcp-server/build.gradle`, `oms-ui/build.gradle`.

## Safety & guardrails for AI agents

- Never add secrets (API keys, passwords) to code. Use environment variables or Azure Key Vault conventions referenced in docs.
- Always generate tests for substantive code changes and flag DB migration scripts for human review.
- Make small, focused changes per PR; include a short summary linking changed OpenAPI spec (if applicable) and tests run locally.

## Knowledge Base Quick Reference

When working on these areas, consult these spec files in `oms-knowledge-base/`:

### Domain & Business Logic

| Task | Spec Files |
|------|-----------|
| **Order entity fields & mappings** | `oms-framework/domain-model_spec.md` (📄 713 lines - complete field specs) |
| **Order create/accept/grouping** | `oms-concepts/order-grouping.md`, `oms-framework/domain-model_spec.md` |
| **Cancel/replace operations** | `oms-concepts/order-replace.md` (1,237 lines - comprehensive FIX workflows) |
| **Execution reporting & quantities** | `oms-concepts/order-quantity-calculations.md` (FIX tags, PlacedQty, CumQty, AllocQty) |

### Framework & Architecture

| Task | Spec Files |
|------|-----------|
| **State transitions (NEW→FILLED)** | `oms-framework/state-machine-framework_spec.md` (state machine patterns) |
| **Task pipelines & orchestration** | `oms-framework/task-orchestration-framework_spec.md` (ConditionalTask, TaskResult) |
| **Event sourcing & persistence** | `oms-framework/oms-state-store.md` (event log, Kafka integration) |
| **Query APIs (CQRS read model)** | `oms-framework/state-query-store_spec.md` (ReadySet, logical replication) |

### Integration & UI

| Task | Spec Files |
|------|-----------|
| **WebSocket streaming** | `oms-concepts/streaming-architecture.md` (RSocket, real-time updates) |
| **Admin UI (React/AG Grid)** | `ui/oms-admin-ui_spec.md` (blotter, filters, state indicators) |
| **Order state visual indicators** | `illustrations/order-state-indicator-spec.md` (4-bar indicator spec) |

### Development Process

| Task | Spec Files |
|------|-----------|
| **AI-augmented development** | `oms-methodolgy/ai-augmented-development.md` (MCP, Copilot agents, @oms) |
| **Team manifesto & values** | `oms-methodolgy/manifesto.md` (spec-driven dev, TDD, event sourcing) |
| **Architecture methodology** | `oms-methodolgy/software-architecture-methodology.md` (4-pillar framework) |

**Note:** All specs now have "Related Documents" sections for cross-referencing. Use these to navigate between related concepts.
