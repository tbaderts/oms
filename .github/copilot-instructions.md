## Quick context for AI coding agents

- Repo: OMS (Order Management System) — Java 25, Spring Boot 4 microservices with OpenAPI + Avro specs. Primary modules: `oms-core`, `oms-mcp-server`, `oms-ui`.
- Spec-driven: APIs and DTOs are defined in OpenAPI YAML under `oms-contracts/src/main/openapi/` (e.g. `oms-query-api.yml`, `oms-cmd-api.yml`). Models are generated once in `oms-contracts`; only `oms-core` generates API interfaces.
- Migrations & DB: project uses standard DB migration folders (look for `db/migration` or Liquibase conventions in module docs). Tests rely on Testcontainers for integration tests.

## Immediate tasks you can help with

- Implement thin Spring controllers that map to OpenAPI paths and call service layer. See `oms-core/src/main/java/org/example/oms/api/*Controller.java` for examples and `oms-contracts/src/main/openapi/oms-query-api.yml` for the query API.
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
- Semantic search (optional): the MCP server keeps its own Lucene index and embeds with Ollama on the host (`mxbai-embed-large` by default); without Ollama it falls back to keyword search. No vector database is needed.

## Project-specific conventions & patterns

- OpenAPI-first: OpenAPI YAML under `oms-contracts/src/main/openapi/` is the source of truth. Service modules must not keep their own copies.
- Two API families: Command APIs (commands/commands) and Query APIs (under `/api/query/*`). Examples: `OrderController.java`, `OrderQueryController.java`.
- DTO nullability: repo uses jackson-databind-nullable and OpenAPI generator nullables — be explicit about nullable filters. See `build.gradle` for `org.openapitools:jackson-databind-nullable`.
- Error format: RFC7807 Problem+JSON is used in examples — follow that shape for error responses.
- Logging & observability: use structured SLF4J logging, include correlation/order ids when present. Prometheus and Actuator are configured in modules.

## Integration points to be aware of

- OMS backend APIs: controllers under `oms-core/src/main/java/org/example/oms/api` expose endpoints consumed by `oms-ui` and `oms-mcp-server` tool clients (`OrderQueryClient` in `oms-mcp-server`).
- OpenAPI generator tasks: `build.gradle` wires `openApiGenerate` to generate models and controllers; avoid manual edits to generated packages unless migrating generator configs.
- Semantic search (optional): Ollama embeddings into the MCP server's embedded Lucene index; see `oms-knowledge-base/tools/knowledge-server.md`.

## What reviewers expect from generated code

- Keep controllers thin and delegate to services. Add unit tests (JUnit 5 + Mockito) and at least one integration test if touching persistence or migrations.
- Include changelog/migration files for DB changes and document breaking changes in PR description.
- Follow existing package structure and naming (packages under `org.example.*`). Update `build.gradle` only when necessary and run `./gradlew clean build` locally.

## Helpful file pointers (examples to open)

- OpenAPI specs: `oms-contracts/src/main/openapi/{oms-cmd-api,oms-query-api,schema}.yml`.
- Controllers: `oms-core/src/main/java/org/example/oms/api/*Controller.java`.
- MCP docs & run scripts: `oms-mcp-server/docs/README.md`, `oms-mcp-server/run-mcp.ps1`, `oms-mcp-server/run-mcp.sh`, `oms-mcp-server/setup-semantic-search.ps1`.
- Gradle build config: `oms-core/build.gradle`, `oms-mcp-server/build.gradle`, `oms-ui/build.gradle`.

## Safety & guardrails for AI agents

- Never add secrets (API keys, passwords) to code. Use environment variables or Azure Key Vault conventions referenced in docs.
- Always generate tests for substantive code changes and flag DB migration scripts for human review.
- Make small, focused changes per PR; include a short summary linking changed OpenAPI spec (if applicable) and tests run locally.

## Knowledge Base Quick Reference

When working on these areas, consult these files in `oms-knowledge-base/` (start at `index.md`; how it is
organised: `semantic-layer/knowledge-base-strategy.md`). Each document's front matter says whether it is
current (`status`, `updated`), and capabilities and requirements say what is built (`maturity`,
`implementation`). A specification that describes more than is built starts with an *Implementation
status* note. Do not build on anything in `archive/`.

### Domain & Business Logic

| Task | Files |
|------|-------|
| **What the OMS does, what is built** | `capabilities/index.md`, the capability's use cases and requirements |
| **Order entity fields & mappings** | `domain/model/order.md`, `domain/model/domain-model.md` (field reference) |
| **Order states and transitions** | `domain/model/order-state.md` (in force), `domain/concepts/order-lifecycle.md` |
| **Quantities (cumQty, leavesQty, avgPx)** | `domain/model/order-quantities.md`, `domain/concepts/order-quantity-calculations.md` |
| **Cancel, reject, replace** | `capabilities/order-cancellation.md`, `domain/concepts/order-replace.md` (replace not built) |
| **Executions and fills** | `capabilities/execution-processing.md`, `domain/concepts/execution-reporting.md` |
| **APIs, topics, Avro messages** | `domain/interfaces/` (command, query, REST read and message APIs) |

### Framework & Architecture

| Task | Files |
|------|-------|
| **State machine, task pipelines** | `framework/state-machine.md`, `framework/task-orchestrator.md` |
| **Validation and errors** | `framework/validation-engine.md`, `framework/exception-handling.md` |
| **Queries** | `framework/query-engine.md` |
| **Event log, outbox, projections** | `architecture/concepts/state-store.md`, `architecture/decisions/` |
| **Kafka, transactions, logging, new services** | `architecture/patterns/` |
| **Known debt** | `architecture/technical-debt/technical-debt-register.md` |

### Integration & UI

| Task | Files |
|------|-------|
| **Real-time streaming (RSocket)** | `architecture/concepts/event-streaming.md`, `capabilities/real-time-streaming.md` |
| **Admin UI (React/AG Grid)** | `ui/admin-ui.md`, `ui/design-system.md` |
| **Order state visual indicators** | `ui/order-state-indicator.md` |
| **Local stack and observability** | `infrastructure/local-docker-stack.md`, `infrastructure/observability.md` |

### Development Process

| Task | Files |
|------|-------|
| **Spec tickets** | `delivery/spec-driven-development.md` |
| **AI-augmented development** | `delivery/ai-augmented-development.md`, `tools/knowledge-server.md` |
| **Testing** | `delivery/testing.md` |
| **Team manifesto & values** | `delivery/manifesto.md` |

