# oms-mcp-server — Architecture, Design & Code Quality Analysis

> **Date:** 2026-02-09
> **Scope:** All hand-written source in `oms-mcp-server/src/main/java`, resource files, build configuration, and infrastructure files. Generated code (OpenAPI output) is excluded.

---

## 1. Executive Summary

`oms-mcp-server` is a Spring Boot 3.5.7 application that exposes OMS (Order Management System) capabilities as MCP (Model Context Protocol) tools for consumption by LLM clients. It provides 10 tools across four functional areas: order search, domain document knowledge, semantic vector search, and health.

The module is well-structured for its current scope and leverages Spring AI's `@Tool` annotation system effectively. However, there are several architectural concerns, code quality issues, and deviations from best practices that should be addressed before the codebase grows further.

**Overall assessment:** Solid prototype / early-stage production code with a clear purpose, but needing refinement in error handling, test coverage, configuration management, and separation of concerns before it can be considered production-hardened.

---

## 2. Architecture Overview

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────┐
│                LLM Client (Copilot)             │
│                  (MCP Protocol)                  │
└──────────────────────┬──────────────────────────┘
                       │ stdio / HTTP
┌──────────────────────▼──────────────────────────┐
│              oms-mcp-server                      │
│  ┌──────────────────────────────────────────┐   │
│  │  McpConfig (ToolCallbackProvider)         │   │
│  │  ├── OrderSearchMcpTools (1 tool)        │   │
│  │  ├── DomainDocsTools     (6 tools)       │   │
│  │  ├── HealthTools         (1 tool)        │   │
│  │  └── SemanticSearchTools (2 tools) [opt] │   │
│  └──────────────────────────────────────────┘   │
│  ┌────────────────┐  ┌──────────────────────┐   │
│  │ OrderQueryClient│  │DocumentIndexerService│   │
│  │   (RestClient)  │  │  (VectorStore)       │   │
│  └───────┬────────┘  └──────────┬───────────┘   │
└──────────┼──────────────────────┼───────────────┘
           │                      │
     ┌─────▼─────┐         ┌─────▼─────┐   ┌──────────┐
     │ oms-core  │         │  Qdrant   │   │  Ollama  │
     │ :8090     │         │  :6333    │   │  :11434  │
     └───────────┘         └───────────┘   └──────────┘
```

### 2.2 Package Structure

```
org.example.mcp
├── SpringAiApplication.java          # Entry point
├── docs/
│   └── DomainDocsTools.java          # 6 knowledge tools + 7 inner records/classes
├── oms/
│   ├── McpConfig.java                # Tool registration
│   ├── OmsClientProperties.java      # Config properties record
│   ├── RestClientConfig.java         # RestClient bean
│   ├── LoggingInterceptor.java       # HTTP logging
│   ├── OrderQueryClient.java         # REST client to oms-core
│   ├── OrderSearchMcpTools.java      # Search tool + filter/response records
│   ├── PageResponse.java             # Pagination wrapper
│   └── DemoOrderController.java      # Dev-only REST controller
├── tools/
│   └── HealthTools.java              # Ping tool
└── vector/
    ├── VectorStoreConfig.java        # Qdrant configuration
    ├── DocumentIndexerService.java   # Document indexing
    └── SemanticSearchTools.java      # 2 semantic search tools
```

### 2.3 Dual-Mode Operation

The application supports two operational modes:
- **stdio mode** (default): `web-application-type: none` — pure MCP over stdin/stdout
- **servlet mode** (`local` profile): enables embedded web server for REST endpoints and Swagger UI

This is a good design decision that keeps stdout clean for MCP protocol traffic in production while enabling web-based debugging during development.

---

## 3. Architecture & Design Analysis

### 3.1 Strengths

| Area | Detail |
|------|--------|
| **Spec-driven design** | OpenAPI specs are the source of truth; generated models for enum types (`Side`, `State`, `OrdType`, `CancelState`) ensure consistency with `oms-core` |
| **Conditional features** | Semantic search is cleanly gated behind `@ConditionalOnProperty("vector.store.enabled")`, allowing the app to run without Qdrant/Ollama |
| **Tool registration** | Centralized in `McpConfig` with optional injection of `SemanticSearchTools` — clean and explicit |
| **Logging discipline** | `logback-spring.xml` correctly routes logs to file-only in MCP mode to avoid corrupting the stdio transport |
| **Configuration records** | `OmsClientProperties` uses a Java record with `@ConfigurationProperties` — idiomatic modern Spring |
| **Strongly-typed filters** | `OrderSearchFilters` record provides type safety and clear documentation for the LLM, including generated enum types |

### 3.2 Architectural Concerns

#### 3.2.1 `DomainDocsTools` is a God Class (431 lines)

`DomainDocsTools.java` contains **6 tool methods**, **7 inner types** (records + exception), and **8 private helper methods**. At 431 lines, it violates the Single Responsibility Principle. It handles:

- File system traversal and discovery
- File reading with offset/limit pagination
- Keyword search with term-frequency scoring
- Markdown section parsing
- Section-level search
- Path resolution across multiple base directories

**Recommendation:** Extract a `DocumentRepository` (file I/O + path resolution), a `MarkdownParser` (section extraction), and a `KeywordSearchEngine` (scoring + snippet generation). The tools class should be a thin facade delegating to these services.

#### 3.2.2 Duplicated File-Scanning Logic

Both `DomainDocsTools` and `DocumentIndexerService` independently:
- Parse `domain.docs.paths` into `List<Path>`
- Walk directories filtering for `.md/.txt/.markdown/.adoc` files
- Each has its own `isDocFile()` method with identical logic

**Recommendation:** Extract a shared `DocumentDiscoveryService` or at minimum a shared utility for path parsing and file filtering.

#### 3.2.3 `OrderQueryClient` Creates a New `ObjectMapper` on Every Call

```java
// OrderQueryClient.java:79
ObjectMapper mapper = new ObjectMapper();
```

A new `ObjectMapper` is instantiated on every `search()` invocation. `ObjectMapper` is thread-safe and expensive to create. Spring Boot already auto-configures one.

**Recommendation:** Inject the Spring-managed `ObjectMapper` via constructor.

#### 3.2.4 Hardcoded API Path Mismatch

```java
// OrderQueryClient.java:47
UriComponentsBuilder builder = UriComponentsBuilder.fromPath("/api/query/search");
```

The OpenAPI spec defines the endpoint as `/api/query/orders`, not `/api/query/search`. This is either a bug or indicates the spec and client are out of sync.

#### 3.2.5 Hardcoded gRPC Port in `VectorStoreConfig`

```java
// VectorStoreConfig.java:52
int port = 6334; // gRPC port
```

The gRPC port is hardcoded rather than derived from configuration. While 6334 is Qdrant's default, this breaks if the deployment uses a non-standard port.

**Recommendation:** Make the gRPC port configurable, or parse it from a dedicated property.

#### 3.2.6 URL Parsing via String Manipulation

```java
// VectorStoreConfig.java:51
String host = qdrantUrl.replace("http://", "").replace("https://", "").split(":")[0];
```

This is fragile. It doesn't handle URLs with paths, authentication, or IPv6 addresses.

**Recommendation:** Use `java.net.URI` for proper URL parsing.

#### 3.2.7 No Error Handling Strategy

The codebase has no global exception handler for MCP tool errors. Each tool handles errors differently:
- `OrderSearchMcpTools.searchOrders()` — lets `RuntimeException` propagate from `OrderQueryClient`
- `DomainDocsTools` — throws `IllegalArgumentException` and custom `DomainDocReadException`
- `SemanticSearchTools` — throws custom `SemanticSearchException`
- `HealthTools.ping()` — no error handling (none needed)

There is a `GlobalExceptionHandler.java` file tracked as untracked in git status, but it lives in `oms-core`, not in this module.

**Recommendation:** Establish a consistent error handling pattern, potentially using a shared base exception type or a Spring AI error callback.

#### 3.2.8 `DemoOrderController` Ships in Production Code

`DemoOrderController` is a debugging-only controller with hardcoded filters and `@SuppressWarnings({"rawtypes", "unchecked"})`. It is not gated behind a profile or feature flag.

**Recommendation:** Annotate with `@Profile("local")` or move to a test source set.

#### 3.2.9 `reindexAllDocuments()` Does Not Actually Clear the Store

```java
// DocumentIndexerService.java:202-207
public void reindexAllDocuments() {
    log.info("[Vector] Clearing vector store and re-indexing all documents...");
    // Note: Qdrant doesn't have a built-in delete all method in Spring AI
    indexAllDocuments();
}
```

The method logs "Clearing vector store" but never actually clears it. This will result in duplicate vectors growing unboundedly across re-index operations.

---

## 4. Code Quality Analysis

### 4.1 Inconsistent Logging Approach

The codebase mixes two logging patterns:

| Pattern | Files |
|---------|-------|
| `@Slf4j` (Lombok) | `OrderQueryClient`, `VectorStoreConfig`, `DocumentIndexerService`, `SemanticSearchTools` |
| Manual `LoggerFactory.getLogger()` | `OrderSearchMcpTools`, `DomainDocsTools`, `LoggingInterceptor` |

**Recommendation:** Standardize on one approach. Since Lombok is already a compile dependency, `@Slf4j` is the simpler choice.

### 4.2 Inconsistent Indentation in `DomainDocsTools`

Several methods have broken indentation where the `log.info` call at the start of the method is at column 0 while the rest of the method body is indented:

```java
@Tool(name = "readDomainDoc", ...)
public DocContent readDomainDoc(String path, Integer offset, Integer limit) {
log.info("[MCP] readDomainDoc called with path={}", path);   // ← column 0
    if (!StringUtils.hasText(path)) {                         // ← indented
```

This occurs in `readDomainDoc`, `listDocSections`, `readDocSection`, `searchDocSections`, `resolveAgainstBases`, and `relativizeToAnyBase`.

### 4.3 Verbose Logging in `DomainDocsTools` Helper Methods

```java
private Path resolveAgainstBases(String relative) {
    log.info("[MCP] resolveAgainstBases called with relative={}", relative);
```

```java
private String relativizeToAnyBase(Path p) {
    log.info("[MCP] relativizeToAnyBase called with path={}", p);
```

Private helper methods should not log at `INFO` level on every invocation. These are called multiple times per tool invocation (e.g., once per search result). This generates excessive log noise.

**Recommendation:** Change to `log.debug()` or remove entirely.

### 4.4 `PageResponse` Should Be a Record

`PageResponse` is a traditional Java class with manual constructor, getters, and `toString()`. Given the project already uses records extensively (`OrderSearchFilters`, `OrderSearchResponse`, `DocMeta`, etc.), this is inconsistent.

**Recommendation:** Replace with a Java record for consistency and reduced boilerplate.

### 4.5 Raw Types in `DemoOrderController`

```java
@SuppressWarnings({ "rawtypes", "unchecked" })
public ResponseEntity<PageResponse<Map<String, Object>>> demoOrders() {
    // ...
    PageResponse result = orderQueryClient.search(filters, 0, 5, "id,DESC");
```

The raw `PageResponse` type is used despite the method declaring `PageResponse<Map<String, Object>>` in the return type. This is unnecessary — the `search()` method already returns `PageResponse<Map<String, Object>>`.

### 4.6 Repeated `content.split("\n")` Calls

In `DomainDocsTools`, the same file content is split into lines multiple times:
- `readDocSection()` calls `content.split("\n")` once
- `extractSections()` calls `content.split("\n")`
- `extractSectionContent()` calls `content.split("\n")` — called once **per section** during `searchDocSections`

For a document with 20 sections, this means the same string is split 22+ times.

**Recommendation:** Split once and pass the lines array to helper methods.

### 4.7 Potential Path Traversal in `DomainDocsTools`

```java
private Path resolveAgainstBases(String relative) {
    for (Path base : baseDirs) {
        Path p = base.resolve(relative).normalize();
        if (p.startsWith(base) && Files.exists(p) && Files.isRegularFile(p)) {
            return p;
        }
    }
```

The `p.startsWith(base)` check is a good defense against path traversal. However, the second loop that strips a base name prefix and re-resolves is more subtle and worth auditing carefully. The input `relative` comes directly from LLM tool invocations, which means it is **user-controlled by proxy**.

### 4.8 Blocking `.get()` on Async Qdrant Call

```java
// SemanticSearchTools.java:124
var collectionInfo = qdrantClient.getCollectionInfoAsync(collectionName).get();
```

Calling `.get()` on a `CompletableFuture` without a timeout blocks indefinitely if Qdrant is unresponsive. This could hang the MCP server.

**Recommendation:** Use `.get(timeout, TimeUnit)` or restructure as async.

### 4.9 Catch-All Exception Handling

```java
// OrderQueryClient.java:118
} catch (Exception e) {
    throw new RuntimeException("Failed to parse orders from response", e);
}
```

Catching `Exception` is overly broad. The actual expected exception is `JsonProcessingException` (from Jackson). Wrapping in a plain `RuntimeException` loses semantic meaning.

### 4.10 No Input Validation on Pagination Parameters

`OrderSearchMcpTools.searchOrders()` passes `page` and `size` directly to the backend without validation. Negative values, extremely large page sizes, or non-numeric inputs from an LLM could cause unexpected behavior.

The OpenAPI spec defines `size` max as 500 and `page` min as 0, but this is not enforced client-side.

---

## 5. Test Coverage

### 5.1 Current State

There is exactly **one test**:

```java
@SpringBootTest
class SpringAiApplicationTests {
    @Test
    void contextLoads() {}
}
```

This test will likely **fail** if Qdrant and Ollama are not running, since `vector.store.enabled=true` in `application.yml` causes `VectorStoreConfig`, `DocumentIndexerService`, and `SemanticSearchTools` beans to be created, which require connectivity.

### 5.2 Missing Test Coverage

| Component | Priority | What to Test |
|-----------|----------|-------------|
| `OrderSearchMcpTools` | High | Filter mapping (all 26 fields), null handling, enum conversion |
| `OrderQueryClient` | High | Response parsing for all three formats (content array, HAL, root array), error scenarios, null responses |
| `DomainDocsTools` | High | Path resolution, path traversal prevention, search scoring, section extraction, offset/limit pagination |
| `DocumentIndexerService` | Medium | Chunking, metadata enrichment, startup indexing |
| `SemanticSearchTools` | Medium | Result mapping, empty results, Qdrant error handling |
| `McpConfig` | Low | Optional bean wiring (with/without semantic search) |
| `VectorStoreConfig` | Low | URL parsing, port extraction |

### 5.3 Testability Concerns

- `DomainDocsTools` directly accesses the file system with `Files.walk()` and `Files.readString()`, making unit tests dependent on actual files
- `OrderQueryClient` creates its own `ObjectMapper`, preventing injection of a test-configured one
- `VectorStoreConfig` hardcodes the gRPC port, preventing test override

---

## 6. Configuration & Build

### 6.1 Hardcoded Local Path in `application.yml`

```yaml
domain:
  docs:
    paths: C:/data/workspace/oms/oms-knowledge-base
```

This is a Windows-specific absolute path. It will fail on any other developer's machine or in CI/CD. This should be a relative path or environment variable.

### 6.2 Java 25 Toolchain

```gradle
java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}
```

Java 25 is a non-LTS, early-access release. For a production system, Java 21 (LTS) is the standard choice. The copilot-instructions.md file states "Java 21+", suggesting 21 was the intent.

### 6.3 Deprecated `$buildDir` Usage

```gradle
sourceSets.main.java.srcDirs += "$buildDir/generated/src/main/java"
// ...
outputDir = "$buildDir/generated".toString()
```

`$buildDir` is deprecated in Gradle 9.x. The migration path is `layout.buildDirectory`.

### 6.4 Docker Compose Version Key

```yaml
version: '3.8'
```

The `version` key is [obsolete in modern Docker Compose](https://docs.docker.com/compose/compose-file/04-version-and-name/) and can be removed.

### 6.5 `spring.application.name` Mismatch

```yaml
spring:
  application:
    name: spring-ai
```

The application name is `spring-ai` but the module is `oms-mcp-server`. This name appears in logs, metrics, and service discovery. It should reflect the actual module.

### 6.6 Collection Name Defined in Two Places

The Qdrant collection name `domain-docs` is defined in both:
- `spring.ai.qdrant.collection-name` (application.yml line 20)
- `vector.store.collection-name` (application.yml line 44)

`VectorStoreConfig` reads from `spring.ai.qdrant.collection-name`, while `SemanticSearchTools` also reads from `spring.ai.qdrant.collection-name`. The `vector.store.collection-name` property appears unused.

---

## 7. Dependency Analysis

### 7.1 Potentially Unnecessary Dependencies

| Dependency | Concern |
|------------|---------|
| `spring-boot-starter-web` | Only needed when running in servlet mode (local profile). In stdio mode, the web server is disabled via config. Could be `compileOnly` or profile-activated, though the overhead is minimal. |
| `springdoc-openapi-starter-webmvc-ui` | Swagger UI — only useful in servlet mode for debugging. Should not ship in a production stdio-mode deployment. |
| `spring-boot-starter-validation` | Declared but no `@Valid` or `@Validated` annotations are used anywhere in the codebase. |
| `jackson-databind-nullable` | Required by OpenAPI-generated code, but generated code is only enum types and DTOs — verify if actually needed. |

### 7.2 gRPC Version Pinning

```gradle
implementation 'io.grpc:grpc-netty-shaded:1.69.0'
implementation 'io.grpc:grpc-protobuf:1.69.0'
implementation 'io.grpc:grpc-stub:1.69.0'
```

These gRPC libraries are pinned to specific versions rather than managed via a BOM. They may conflict with versions pulled transitively by the Qdrant client or Spring AI.

**Recommendation:** Let the Spring AI BOM or Qdrant client's transitive dependencies manage gRPC versions, or verify version compatibility explicitly.

---

## 8. Security Considerations

| Area | Status | Detail |
|------|--------|--------|
| **Path traversal** | Partially mitigated | `resolveAgainstBases()` checks `p.startsWith(base)` after normalization. The secondary resolution path (stripping base name prefix) is more complex and should be reviewed. |
| **No authentication** | Not applicable for stdio | MCP stdio mode doesn't expose HTTP endpoints. In servlet mode, all endpoints are unauthenticated, including `DemoOrderController`. |
| **Sensitive data in logs** | Risk | `OrderQueryClient` logs full request URIs and response bodies at INFO level. Filter parameters (account IDs, order IDs) may be sensitive. |
| **No rate limiting** | Low risk | Tools are invoked by LLM clients, but there's no throttling on expensive operations like `searchDocSections` (reads all files, splits every file into lines per section). |
| **SSRF potential** | Low risk | `oms.base-url` is configuration-driven. If this were ever exposed as a tool parameter, it could enable SSRF. Currently safe. |

---

## 9. Summary of Findings by Severity

### Critical

| # | Finding | Location |
|---|---------|----------|
| 1 | API path mismatch (`/api/query/search` vs `/api/query/orders`) | `OrderQueryClient.java:47` |
| 2 | `reindexAllDocuments()` doesn't clear the store (data duplication) | `DocumentIndexerService.java:202` |

### High

| # | Finding | Location |
|---|---------|----------|
| 3 | Near-zero test coverage; single test likely fails without external services | `SpringAiApplicationTests.java` |
| 4 | Hardcoded Windows path in default config | `application.yml:38` |
| 5 | `ObjectMapper` instantiated on every REST call | `OrderQueryClient.java:79` |
| 6 | Blocking `.get()` without timeout on async Qdrant call | `SemanticSearchTools.java:124` |
| 7 | Java 25 (non-LTS, early access) instead of Java 21 (LTS) | `build.gradle:13` |

### Medium

| # | Finding | Location |
|---|---------|----------|
| 8 | `DomainDocsTools` is a 431-line god class | `DomainDocsTools.java` |
| 9 | Duplicated file discovery logic across two classes | `DomainDocsTools` / `DocumentIndexerService` |
| 10 | Hardcoded gRPC port (6334) | `VectorStoreConfig.java:52` |
| 11 | Fragile URL parsing via string manipulation | `VectorStoreConfig.java:51` |
| 12 | `DemoOrderController` not gated behind a profile | `DemoOrderController.java` |
| 13 | Inconsistent error handling across tool classes | Multiple files |
| 14 | No input validation on pagination/filter parameters | `OrderSearchMcpTools.java:46` |
| 15 | Deprecated `$buildDir` usage in Gradle 9.x | `build.gradle:62,67` |

### Low

| # | Finding | Location |
|---|---------|----------|
| 16 | Inconsistent logging approach (`@Slf4j` vs manual) | Multiple files |
| 17 | Broken indentation in `DomainDocsTools` | `DomainDocsTools.java:78,135,153,230,385,406` |
| 18 | `INFO`-level logging in private helper methods | `DomainDocsTools.java:385,406` |
| 19 | `PageResponse` should be a record | `PageResponse.java` |
| 20 | Raw types in `DemoOrderController` | `DemoOrderController.java:39` |
| 21 | Repeated `String.split("\n")` on same content | `DomainDocsTools.java` |
| 22 | `spring.application.name` is `spring-ai` instead of `oms-mcp-server` | `application.yml:3` |
| 23 | Unused `vector.store.collection-name` config property | `application.yml:44` |
| 24 | Docker Compose obsolete `version` key | `docker-compose.yml:1` |
| 25 | `spring-boot-starter-validation` declared but unused | `build.gradle:33` |

---

## 10. Recommendations (Prioritized)

1. **Fix the API path mismatch** in `OrderQueryClient` — this is likely a runtime bug.
2. **Add unit tests** for `OrderSearchMcpTools`, `OrderQueryClient`, and `DomainDocsTools` at minimum. Use `@SpringBootTest` with `vector.store.enabled=false` for the context load test.
3. **Externalize the docs path** — use a relative path or `${user.dir}` / environment variable instead of `C:/data/workspace/oms/...`.
4. **Downgrade to Java 21 LTS** unless there is an explicit reason for 25.
5. **Inject `ObjectMapper`** into `OrderQueryClient` instead of creating a new one per call.
6. **Add a timeout** to the Qdrant async `.get()` call in `SemanticSearchTools`.
7. **Refactor `DomainDocsTools`** — extract file I/O, markdown parsing, and search logic into separate service classes.
8. **Extract shared file discovery** logic used by both `DomainDocsTools` and `DocumentIndexerService`.
9. **Implement `reindexAllDocuments()` properly** by clearing the Qdrant collection before re-indexing.
10. **Gate `DemoOrderController`** behind `@Profile("local")`.
11. **Standardize logging** on `@Slf4j` and reduce log levels for internal helper methods.
12. **Add input validation** on tool parameters (page >= 0, size in [1, 500], etc.).
13. **Fix `VectorStoreConfig`** URL parsing to use `java.net.URI` and make gRPC port configurable.
14. **Migrate from `$buildDir`** to `layout.buildDirectory` for Gradle 9 compatibility.
