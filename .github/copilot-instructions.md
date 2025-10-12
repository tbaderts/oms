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

---

If you want, I can merge more lines from `oms-core/.github/agent_draft.md` (it contains richer templates) — tell me which sections to include.
