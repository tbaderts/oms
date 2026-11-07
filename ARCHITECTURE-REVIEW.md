# OMS Architecture Review

Date: 2026-08-15
Scope: full monorepo analysis (oms-core, oms-streaming-service, oms-mcp-server, oms-ui, oms-kb-explorer, oms-knowledge-base)

## 1. Overview

OMS is a Gradle **composite-build monorepo**: `settings.gradle` uses `includeBuild` so each Java module is an *independent* Gradle build (no shared dependency graph, no shared BOM). Stack: Java 25, Spring Boot 4.0.2/4.0.3, Spring Cloud 2025.0.0, Kafka + Confluent Avro, Postgres + JPA/Liquibase, RSocket/Reactor, Spring AI (M2), React frontends.

| Module | Purpose | Boot | Notes |
|---|---|---|---|
| oms-core | Sync REST command/query API, Kafka consumer, transactional outbox | 4.0.3 | Avro 7.9.2 |
| oms-streaming-service | Kafka → RSocket streaming, in-memory caches, snapshots | 4.0.2 | Avro **7.9.0** |
| oms-mcp-server | Spring AI MCP server: docs tools, Qdrant semantic search, KB explorer | 4.0.3 | Spring AI **2.0.0-M2** from milestone repo |
| oms-ui | React (CRA) blotter UI + thin Boot static host | 4.0.2 | React 18, AG-Grid |
| oms-kb-explorer | Vite/React doc viewer (not in Gradle build) | — | React 19 |
| oms-knowledge-base | Docs only (markdown) | — | — |

Test counts: oms-core 90 methods (19 files, incl. Testcontainers), streaming 17 (2 files), mcp-server 45 (7 files), ui 1. No Jacoco/coverage anywhere.

## 2. Top Findings

### P0 — correctness / robustness

1. **`kafka.enabled` default mismatch (real bug)**
   - `oms-core/src/main/resources/application.yml:60` → `kafka.enabled: ${KAFKA_ENABLED:false}` (default **off**)
   - `oms-core/src/main/java/org/example/oms/service/MessagePublisher.java:53` → `@Value("${kafka.enabled:true}")` (default **on**)
   - Effect: effective default depends on how the property is supplied; Kafka publishing can silently flip on/off with outbox-accumulation consequences.

2. **Outbox has no recovery path**
   - `MessagePublisher.java:85-87`: publish error is only logged; the outbox row is kept but **nothing re-publishes it** (no scheduler/poller). A failed `send().get(10s)` loses the event until manual intervention.
   - `MessagePublisher.java:95`: blocking `.get()` on a Spring-managed thread after `AFTER_COMMIT`.

3. **Unbounded caches + infinite retry in streaming**
   - `KafkaEventStreamProvider.java` (392 lines, zero tests): `orderCache`/`executionCache` are `ConcurrentHashMap`s evicted **only on message arrival** (`doOnNext`); a burst followed by silence = unbounded memory growth.
   - `KafkaEventStreamProvider.java:129,164`: `Retry.backoff(Long.MAX_VALUE, ...)` = infinite retries, 5 min max backoff, `WARN` forever; no circuit breaker.

4. **Dead code / silent exception swallowing in mcp-server**
   - `DomainDocsTools.java:319-327`: `extractDocPath` returns `source` in every branch (`lastSlash` computed and unused).
   - `DomainDocsTools.java:95,169`: `catch (IOException e) { continue; }` silently drops unreadable docs — no log, no signal.

### P1 — architecture

5. **Triple-duplicated OpenAPI/Avro contract**
   - `src/main/openapi/{oms-cmd-api.yml, oms-query-api.yml, schema.yml}` are **byte-identical** in oms-core, oms-streaming-service, and oms-mcp-server (verified by checksum). Contract changes must be hand-edited in 3 places and drift silently.
   - Consequence: domain model + mapping logic duplicated — `OrderMessageMapper` in core, plus hand-rolled `toOrderDto` via `JsonNode` in `OmsQueryClient.java` (337 lines) and `KafkaEventStreamProvider.java:352-380`. Adding a field to `Order` requires updating 3–4 hand-written mappers with no compile-time safety net.
   - Fix: extract shared `oms-api`/`oms-common` module (generated models + mappers) consumed by all three.

6. **Version drift across composite builds (no shared BOM)**
   - Spring Boot: 4.0.3 (core, mcp) vs 4.0.2 (streaming, ui)
   - Confluent Avro: **7.9.2 (core producer) vs 7.9.0 (streaming consumer)** on the same pipeline
   - `jackson-databind-nullable`: 0.2.7 vs 0.2.9; swagger annotations 2.2.38 vs 2.2.42
   - React: 18.2 (oms-ui) vs 19.2 (kb-explorer)
   - No compile-time guard against drift.

7. **`useSpringBoot3: "true"` on Spring Boot 4 projects**
   - All 3 Java modules pass this OpenAPI-generator flag while running Boot 4.x; generated code may target Boot 3 semantics.

8. **Two frontends, two toolchains**
   - oms-ui: CRA (`react-scripts` 5 + `react-app-rewired`), React 18, alpha rsocket deps (`0.0.29-alpha.0`), ~70 unconditional `console.log`s in production code, auth token held only in JS memory (lost on refresh), only test is legacy `App.test.js`.
   - kb-explorer: Vite 7 / React 19, zero tests.
   - Fix: consolidate on Vite (already in-tree).

### P2 — hygiene / quality

9. **Dev junk shipped from `src/main/`** (ends up in the production jar/classpath):
   - `oms-core/src/main/resources/test.txt` (sample order payload), `readme.txt` (dev cheat-sheet incl. `admin/secret` Grafana creds)
   - `oms-core/src/main/java/org/example/oms/service/execution/README.md`
   - `oms-streaming-service/src/main/resources/static/test.html`
   - `oms-mcp-server .../oms/DemoOrderController.java` (`@Profile("local")`, hardcoded filters)
   - `oms-mcp-server .../TestStreamController.java` (streaming, `@Profile("dev")`)

10. **Test gaps** (largest classes untested):
    - streaming: `KafkaEventStreamProvider`, `OmsQueryClient` — zero tests
    - mcp-server: `vector/*` (SemanticSearchTools, DocumentIndexerService, VectorStoreConfig), `KbExplorerController`
    - core: `MetamodelService` (324 lines), `OrderSpecifications` (no unit test), controllers, `service/*` tasks, mappers
    - No Jacoco, no coverage gate, no parallel test config.

11. **Dependency/config smells**:
    - Spring AI **2.0.0-M2 milestone** resolved from `repo.spring.io/milestone` (`oms-mcp-server/build.gradle:24,28`) — pre-release in production.
    - `DOMAIN_DOCS_PATHS:../oms-knowledge-base` (`oms-mcp-server application.yml:39`) — CWD-dependent, silently misses docs when launched elsewhere.
    - `DEBUG` logging on `org.springframework.ai.*` in committed `application.yml`.
    - `oms-mcp-server .../vector/SemanticSearchTools.java:125` — blocking `.get()` on gRPC async calls inside a reactive server.
    - `TaskOrchestrator` / task classes catch generic `Exception` in 16 places across main code.
    - `OtlpGrpcSpanExporter` bean (`oms-core/config/OmsConfig.java:18`) has no `disposeMethod`/`close` — gRPC channel may leak.
    - `DataSourceContextHolder` ThreadLocal: cleared only in `ReadReplicaAspect` finally — fine today, but any other `@UseReadReplica` usage without the aspect leaks per-thread state on pooled threads.
    - `PublishExecutionEventTask.java:44,60` — `TODO: Integrate with actual event publishing mechanism` (unimplemented publishing path).

12. **Build-system inconsistencies**:
    - `openApiGenerate` wired as 3 tasks in core/streaming but 1 task in mcp-server
    - deprecated `$buildDir` in core/streaming vs `${layout.buildDirectory}` in mcp-server
    - `-parameters` compiler flag only in mcp-server
    - oms-ui uses `sourceCompatibility = '25'` (string) instead of toolchain, and deprecated `task` bare-Groovy DSL
    - No dependency lock or cross-build `dependencyManagement`

## 3. Suggested Order of Action

1. **Now (quick, low risk)**
   - Align `kafka.enabled` defaults (#1)
   - Remove dead `extractDocPath`, log dropped docs in `DomainDocsTools` (#4)
   - Purge `test.txt`, `readme.txt`, `test.html`, `DemoOrderController` from `src/main` (#9)
2. **Short term (robustness)**
   - Outbox: async publish + re-publish poller (or switch to scheduled poller) (#2)
   - Bounded caches with scheduled eviction; cap retries (or `Retry.backoff` with max attempts) in streaming (#3)
   - `disposeMethod="close"` on OTel exporter (#11)
3. **Medium term (architecture)**
   - Extract shared `oms-api`/`oms-common` module (OpenAPI/Avro specs + generated models + mappers); delete hand-rolled mappers (#5)
   - Shared BOM / aligned versions: Spring Boot, Confluent Avro, Jackson nullable (#6)
   - Fix/verify `useSpringBoot3` generator flag for Boot 4 (#7)
   - Move mcp-server off Spring AI milestone (or gate it explicitly) and make `DOMAIN_DOCS_PATHS` absolute/configurable (#11)
4. **Medium term (frontend + quality)**
   - Migrate oms-ui from CRA to Vite; align React versions; fold kb-explorer toolchain in (#8)
   - Replace unconditional `console.log`s with a gated logger
   - Add tests for untested core classes; add Jacoco + coverage gate (#10)
   - Implement or remove the `PublishExecutionEventTask` TODO path (#11)

## 4. Quick Reference (files)

- `oms-core/src/main/resources/application.yml:60` — `kafka.enabled` default
- `oms-core/.../service/MessagePublisher.java:53,85-95` — outbox publish path
- `oms-core/.../config/DataSourceContextHolder.java`, `ReadReplicaAspect.java` — read-replica routing
- `oms-core/.../config/OmsConfig.java:18` — OTel exporter
- `oms-core/.../service/execution/tasks/PublishExecutionEventTask.java:44,60` — TODOs
- `oms-streaming-service/.../service/KafkaEventStreamProvider.java:129,164` — retries/caches/eviction
- `oms-streaming-service/.../client/OmsQueryClient.java` — hand-rolled JSON mapping (337 lines)
- `oms-mcp-server/.../docs/DomainDocsTools.java:95,169,319` — silent catches / dead code
- `oms-mcp-server/.../vector/SemanticSearchTools.java:125` — blocking call in reactive code
- `oms-mcp-server/build.gradle:24,28` — Spring AI milestone repo
- `oms-ui/frontend/package.json` — CRA + alpha rsocket deps
- `oms-core/src/main/openapi/` (×3 modules) — duplicated contract specs
