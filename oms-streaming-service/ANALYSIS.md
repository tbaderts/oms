# OMS Streaming Service - Architecture & Code Quality Analysis

## 1. Executive Summary

The `oms-streaming-service` is a reactive Spring Boot microservice that provides real-time order and execution event streaming to Trade Blotter UI clients. It consumes Avro-serialized events from Kafka, fetches initial snapshots from the OMS Core Query API, and delivers merged data via RSocket over WebSocket.

The service demonstrates a solid overall architecture for its purpose --- reactive top-to-bottom, strategy pattern for testability, and spec-driven code generation. However, the analysis identifies several issues across severity levels: a reactive composition bug that causes duplicate REST calls, unbounded in-memory caches, a reflection-based filter engine that is fragile and slow, missing security controls, incomplete execution mapping, and limited test coverage outside of filtering.

**File inventory:** 15 Java source files, 26 Avro schemas, 2 OpenAPI specs, 1 test HTML page, 2 test classes (16 test methods total).

---

## 2. Architecture & Design

### 2.1 High-Level Architecture

```
                                +----------------------+
    Kafka (orders topic)  ----->|                      |
    Kafka (exec topic)    ----->|  Streaming Service   |------> RSocket/WebSocket --> UI
    OMS Core REST API <---------|                      |------> REST (metadata/test)
                                +----------------------+
```

**Technology stack:**

| Concern | Technology |
|---|---|
| Runtime | Java 21+, Spring Boot 3.5.7 (WebFlux) |
| Streaming protocol | RSocket over WebSocket (port 7000) |
| Event source | Kafka + Confluent Avro / Schema Registry |
| Snapshot source | OMS Core Query API (WebClient) |
| Code generation | OpenAPI Generator (DTOs), Avro Plugin (messages) |
| Build | Gradle with `openApiGenerate` + `avro` plugins |

### 2.2 Package Structure

```
org.example.streaming
 +-- config/          KafkaConfig, RSocketConfig
 +-- controller/      TradeBlotterController (RSocket), MetadataController, TestStreamController (REST)
 +-- service/         EventStreamProvider interface, KafkaEventStreamProvider, MockEventStreamProvider,
 |                    FilterService, MetadataService
 +-- model/           OrderDto, OrderEvent, ExecutionDto, ExecutionEvent, StreamFilter,
 |                    FilterCondition, StreamRequest, ObjectMetadata
 +-- mapper/          OrderMessageMapper (Avro -> DTO)
 +-- client/          OmsQueryClient (WebClient -> OMS Core)
```

The package layout is clean and follows a standard layered approach. Controllers are separated from services, the mapper is isolated, and the REST client is in its own `client` package.

### 2.3 Key Design Patterns

| Pattern | Implementation | Assessment |
|---|---|---|
| **Strategy** | `EventStreamProvider` interface with `KafkaEventStreamProvider` (prod) and `MockEventStreamProvider` (dev), toggled via `@ConditionalOnProperty` | Good. Clean separation; enables Kafka-free UI development. |
| **Builder** | All DTOs use Lombok `@Builder` | Good. Consistent construction style. |
| **Reactive Streams** | Flux/Mono throughout; `Sinks.many()` for hot broadcasting | Appropriate for the WebFlux + RSocket stack. |
| **Spec-driven generation** | OpenAPI specs generate command and query DTOs; Avro schemas generate Kafka message types | Follows project conventions from `copilot-instructions.md`. |
| **Snapshot + Live merge** | REST snapshot merged with Kafka live stream, deduplicated by `eventId` | Correct concept; implementation has a bug (see 3.1). |

### 2.4 Data Flow

1. `@PostConstruct` in `KafkaEventStreamProvider` subscribes to Kafka topics and begins populating `Sinks.Many` replay buffers and `ConcurrentHashMap` caches.
2. Client connects via RSocket WebSocket to `/trade-blotter/stream`.
3. Client sends `orders.stream` message (optionally with `StreamFilter`).
4. `TradeBlotterController` delegates to `EventStreamProvider.getOrderEventStream(filter)`.
5. `KafkaEventStreamProvider`:
   - Fetches paginated snapshot from OMS Core REST API (via `OmsQueryClient`)
   - Subscribes to the hot `orderEventSink` replay stream
   - Deduplicates live events against snapshot `eventId`s
   - Merges snapshot + live via `Flux.merge()` with `delaySubscription`
   - Applies `FilterService` predicate
6. Merged `OrderEvent` objects stream to the client.

### 2.5 Communication Patterns

| Pattern | Endpoint | Purpose |
|---|---|---|
| Request-Stream | `orders.stream` | Live + snapshot order events |
| Request-Stream | `executions.stream` | Live + snapshot execution events |
| Request-Stream | `blotter.stream` | Unified stream (orders, executions, or both) |
| Request-Response | `orders.snapshot` | One-time snapshot of current orders |
| Request-Response | `executions.snapshot` | One-time snapshot of current executions |
| Request-Response | `health` | Health check |
| SSE (REST) | `GET /api/test/orders/stream` | Test endpoint for browser debugging |
| REST | `GET /trade-blotter/metadata` | Field metadata for UI filter builders |
| REST | `GET /trade-blotter/status` | Cache size and service status |

### 2.6 Contract Definitions

- **OpenAPI**: `oms-cmd-api.yml` (command models) and `oms-query-api.yml` (query models + pagination) under `src/main/openapi/`.
- **Avro**: 26 `.avsc` files under `src/main/avro/` defining `OrderMessage`, `Execution`, `Order`, and numerous enums (`Side`, `State`, `OrdType`, etc.).
- Three Gradle `openApiGenerate` tasks produce models into `$buildDir/generated`.

---

## 3. Critical Issues

### 3.1 Double Snapshot Subscription (Correctness)

**File:** `KafkaEventStreamProvider.java:196-199`

```java
return Flux.merge(
    snapshotStream,
    liveStream.delaySubscription(snapshotStream.then())
);
```

`snapshotStream` is a cold `Flux` backed by `omsQueryClient.fetchOrdersWithFilter()`. `Flux.merge()` subscribes to it once, and `snapshotStream.then()` subscribes to it a **second** time. This will:

- Issue the REST API call **twice** for the full paginated snapshot.
- Cause `snapshotEventIds` and `orderCache` to receive mixed updates from two concurrent fetches.
- Compromise deduplication state because both subscriptions write to the same mutable sets.

**Impact:** Double network load, potential data corruption in dedup set, race conditions in cache.

**Recommendation:** Cache the snapshot using `.cache()` on the cold Flux, or restructure to use `concatWith()`:

```java
Flux<OrderEvent> cachedSnapshot = snapshotStream.cache();
return cachedSnapshot.concatWith(liveStream);
```

### 3.2 Unbounded In-Memory Caches (Reliability)

**File:** `KafkaEventStreamProvider.java:62-63`

```java
private final ConcurrentHashMap<String, OrderDto> orderCache = new ConcurrentHashMap<>();
private final ConcurrentHashMap<String, ExecutionDto> executionCache = new ConcurrentHashMap<>();
```

These caches grow indefinitely as new orders and executions arrive from Kafka. In a production environment with sustained order flow, this will eventually cause `OutOfMemoryError`.

The same unbounded pattern exists in `MockEventStreamProvider.java:50-51`.

**Impact:** Service will crash under sustained load. No eviction, no size limit, no monitoring of cache growth rate.

**Recommendation:** Use a bounded cache with eviction (e.g., Caffeine with a max-size or time-based expiry), or periodically purge orders in terminal states (FILLED, CXL, REJ, CLOSED, EXP).

---

## 4. High-Severity Issues

### 4.1 Reflection-Based Filter Engine (Fragility & Performance)

**File:** `FilterService.java:253-258`

```java
private Object getFieldValue(Object obj, String fieldName) throws Exception {
    Class<?> clazz = obj.getClass();
    Field field = clazz.getDeclaredField(fieldName);
    field.setAccessible(true);
    return field.get(obj);
}
```

Problems:

- **Fragile**: Renaming any DTO field silently breaks filtering at runtime with no compile-time safety.
- **Performance**: Reflection-based field access is significantly slower than compiled access. On a high-volume streaming path, this adds measurable latency per event per filter condition.
- **Error swallowing**: The catch block in `matchesCondition()` (line 134) silently returns `false` on any exception, meaning a typo in a filter field name silently drops all events instead of reporting an error.
- **Security surface**: `setAccessible(true)` bypasses Java access controls. While `sanitizeFieldName()` validates the pattern, an attacker controlling filter input could probe internal field names not listed in metadata.

**Recommendation:** Replace reflection with a static field-accessor map (`Map<String, Function<OrderDto, Object>>`) built once at startup, validated against `MetadataService` field names.

### 4.2 Plaintext Credentials in `.env` (Security)

**File:** `.env:3`

```
DB_PASSWORD=changeme
```

The `.env` file contains a plaintext database password and is present in the repository working tree. If committed, this violates the project's own guidelines in `copilot-instructions.md` ("Never add secrets to code").

The streaming service doesn't use a database, making these credentials unnecessary and confusing.

**Recommendation:** Remove the `.env` file from version control. Add `.env` to `.gitignore`.

### 4.3 Kafka Auto-Commit Conflicts with Manual Acknowledgment

**File:** `KafkaConfig.java:53` and `KafkaEventStreamProvider.java:89`

```java
// KafkaConfig.java
props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, true);

// KafkaEventStreamProvider.java
record.receiverOffset().acknowledge();
```

Auto-commit is enabled, but offsets are also manually acknowledged. With auto-commit, Kafka periodically commits offsets regardless of processing status; the `acknowledge()` calls are effectively no-ops.

**Impact:** In failure scenarios, events may be lost (committed before processed) or reprocessed. If at-least-once semantics are intended, auto-commit should be `false`.

### 4.4 No Kafka Consumer Lifecycle Management

**File:** `KafkaEventStreamProvider.java:72-94`

```java
orderMessageReceiver.receive()
    ...
    .retryWhen(reactor.util.retry.Retry.backoff(3, Duration.ofSeconds(1)))
    .subscribe();
```

- The `Disposable` from `subscribe()` is discarded --- no way to gracefully shut down consumers.
- The retry allows only 3 attempts with 1-second backoff. After exhaustion, the consumer silently dies with no recovery mechanism.
- No `@PreDestroy` hook for shutdown.
- `KafkaReceiver` is a single-subscription source. Once the subscription terminates, a new receiver is needed.

**Recommendation:** Store the `Disposable`, add a `@PreDestroy` shutdown hook, and use unlimited retry with exponential backoff + jitter.

### 4.5 Incomplete Execution Mapping from Avro

**File:** `KafkaEventStreamProvider.java:289-295`

```java
private ExecutionDto toExecutionDto(Execution exec) {
    return ExecutionDto.builder()
            .execId(exec.getExecId() != null ? exec.getExecId().toString() : null)
            .orderId(exec.getOrderId() != null ? exec.getOrderId().toString() : null)
            .eventTime(Instant.now())
            .build();
}
```

The `ExecutionDto` has 14 fields (`lastQty`, `lastPx`, `cumQty`, `avgPx`, `leavesQty`, `execType`, `lastMkt`, `lastCapacity`, `transactTime`, `creationDate`, `sequenceNumber`), but only 3 are populated. This is partly because the Avro `Execution.avsc` schema only defines `execId` and `orderId`, but the mismatch means:

- UI clients receive mostly-null execution data on the live Kafka stream.
- The `MockEventStreamProvider` fills all 14 fields, creating a behavioral inconsistency between dev and prod.

### 4.6 No Authentication or Authorization

None of the endpoints (RSocket, REST metadata, test endpoints) require authentication. Any client that can reach the network ports can stream all order and execution data (including price, quantity, account information), access metadata and status endpoints, and use test SSE endpoints.

### 4.7 Test Endpoints Exposed Unconditionally

**File:** `TestStreamController.java`

`TestStreamController` has no profile guard. It will be active in production, exposing:

- `/api/test/orders/stream` (SSE stream of all orders)
- `/api/test/orders/snapshot` (all cached orders)
- `/api/test/health` and `/api/test/ping`

**Recommendation:** Guard with `@Profile("dev")` or `@ConditionalOnProperty`.

---

## 5. Medium-Severity Issues

### 5.1 ObjectMapper Bean Conflicts with Spring Boot Auto-Configuration

**File:** `RSocketConfig.java:31-35`

```java
@Bean
public ObjectMapper objectMapper() {
    ObjectMapper mapper = new ObjectMapper();
    mapper.registerModule(new JavaTimeModule());
    return mapper;
}
```

Spring Boot auto-configures an `ObjectMapper` with properties from `spring.jackson.*`. Defining a custom `@Bean` overrides the auto-configured one, losing:

- `write-dates-as-timestamps: false`
- `fail-on-unknown-properties: false`
- Any other auto-discovered Jackson modules

This could lead to dates serialized as timestamps on the RSocket path but as ISO strings on the REST path.

### 5.2 Verbose Logging on Hot Path

**Files:** `KafkaEventStreamProvider.java:76-77,86-87,178-180,209`

Every Kafka message and every filter evaluation logs at `INFO`. Under production load (thousands of events/second), this will generate massive log volumes, create I/O pressure, and obscure actual warnings.

**Recommendation:** Downgrade per-event logs from `INFO` to `DEBUG` or `TRACE`.

### 5.3 Pagination Error Handling Swallows Failures

**File:** `OmsQueryClient.java:176-179`

```java
.onErrorResume(e -> {
    log.error("Error fetching orders page {}: {}", page, e.getMessage());
    return Mono.empty();
});
```

If any page fails, the error is silently dropped. The `expand()` operator stops on `Mono.empty()`, so a failure on page 2 of 10 means pages 3-10 are never attempted. The client receives a partial snapshot with no indication of incompleteness.

### 5.4 Unreachable `default` Branch in Switch

**File:** `TradeBlotterController.java:135`

```java
return switch (request.getStreamType()) {
    case ORDERS -> ...;
    case EXECUTIONS -> ...;
    case ALL -> ...;
    default -> eventStreamProvider.getOrderEventStream(filter);
};
```

`StreamType` has exactly three values. The `default` is unreachable and masks compiler warnings if a new enum value is added.

### 5.5 `WebClient` Initialized in `@PostConstruct`

**File:** `OmsQueryClient.java:62-76`

`WebClient` is created in `@PostConstruct` rather than via constructor injection. This makes the class harder to unit test (cannot inject a mock `WebClient.Builder`) and leaves the field `null` between construction and init.

### 5.6 Inconsistent Filter Application for Executions

In `TradeBlotterController.streamOrders()` (line 82), the filter is passed into the provider (applied to both REST query and live stream). In `streamExecutions()` (line 98-99), the filter is applied outside the provider by the controller. This means the execution snapshot is **not filtered** --- all cached executions are returned.

### 5.7 Magic Numbers

| Value | Location | Purpose |
|---|---|---|
| `100` | `KafkaEventStreamProvider.java:55` | Replay buffer size |
| `1000` | `MockEventStreamProvider.java:44` | Backpressure buffer |
| `500` | `OmsQueryClient.java:104,112,142` | Page size |
| `10` | `MockEventStreamProvider.java:78` | Initial mock orders |
| `2s` / `5s` | `MockEventStreamProvider.java:69,73` | Event generation intervals |
| `3` / `1s` | `KafkaEventStreamProvider.java:92` | Retry count / backoff |

The `application.yml` defines `streaming.buffer.max-size: 1000` and `streaming.buffer.timeout-seconds: 30`, but these are **never referenced** anywhere in Java code.

### 5.8 No CORS Configuration

REST endpoints have no CORS configuration. If the Trade Blotter UI is served from a different origin (typical), REST calls and the RSocket WebSocket upgrade will fail.

---

## 6. Minor Issues & Code Smells

### 6.1 Java Toolchain Mismatch

**File:** `build.gradle:13-15`

```groovy
java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}
```

Targets Java 25 (not yet GA), but the Dockerfile uses `eclipse-temurin:21-jre-alpine`. This will cause either build failures or runtime `UnsupportedClassVersionError`.

### 6.2 Stale Javadoc Reference

**File:** `StreamingServiceApplication.java:22`

```java
@see org.example.streaming.service.OrderEventService
```

References `OrderEventService` which does not exist. The actual service is `EventStreamProvider`.

### 6.3 `@Data` on DTOs Creates Mutable Objects

All model classes use `@Data` (generates setters) with `@Builder`. These DTOs are intended as streaming value objects but are fully mutable. Consider `@Value` (immutable) or `@Getter` only.

### 6.4 `ServiceStatus` Inner Class Location

**File:** `MetadataController.java:73-80`

`ServiceStatus` is a static inner class in the controller --- the only model not in the `model` package. Inconsistent with the rest of the codebase.

### 6.5 Missing `@NoArgsConstructor` on `ServiceStatus`

`ServiceStatus` has `@Builder` + `@AllArgsConstructor` but no `@NoArgsConstructor`. Jackson deserialization (if ever needed) would fail.

### 6.6 Non-Deterministic `Random` in Mock Provider

**File:** `MockEventStreamProvider.java:54`

`java.util.Random` accessed from multiple threads (interval schedulers). `ThreadLocalRandom` is the correct choice for concurrent access. Seeding would also improve test reproducibility.

---

## 7. Test Coverage Assessment

### 7.1 What Is Tested

| Component | Tests | Coverage |
|---|---|---|
| `FilterService` | 15 tests (`FilterServiceTest`) | Good: all operators, logical combinators, datetime, query param conversion |
| Application context | 1 test (`StreamingServiceApplicationTests`) | Smoke test with Kafka disabled |

### 7.2 What Is Not Tested

| Component | Gap |
|---|---|
| `KafkaEventStreamProvider` | No tests. Most complex class: snapshot merge, deduplication, caching, Kafka consumption. |
| `TradeBlotterController` | No tests for RSocket endpoint routing, filter passthrough, or blotter stream merge. |
| `OmsQueryClient` | No tests for pagination, filtering, error handling, or timeout behavior. |
| `OrderMessageMapper` | No tests for Avro-to-DTO conversion, null handling, BigDecimal conversion. |
| `MetadataController` / `MetadataService` | No tests. |
| `TestStreamController` | No tests. |
| `MockEventStreamProvider` | No tests. |

### 7.3 Missing Test Infrastructure

- No Testcontainers for Kafka integration testing.
- No WireMock or MockWebServer for `OmsQueryClient` testing.
- No RSocket test client setup.
- No test profiles or `application-test.yml`.

**Estimated meaningful code coverage: ~15-20%** (only `FilterService` is well-tested).

---

## 8. Configuration & Infrastructure

### 8.1 Docker Compose Gaps

**File:** `docker-compose.yml`

- **Schema Registry missing**: Required for Avro deserialization, but not defined. Service will fail to start.
- **OMS Core missing**: Required for snapshot fetching, not in compose file.
- **No health checks**: Neither the Kafka broker nor the streaming service has Docker health checks.

### 8.2 Unused Configuration Properties

`streaming.buffer.max-size` and `streaming.buffer.timeout-seconds` are defined in `application.yml` but never injected or used in any Java class. They appear to be intended for backpressure configuration that was never implemented.

### 8.3 Actuator Exposure

`management.endpoint.health.show-details: always` exposes internal dependency information without authentication. Prometheus and metrics endpoints are also unauthenticated.

### 8.4 Missing Spring Profiles

No profile separation (`application-dev.yml`, `application-prod.yml`). The single `application.yml` relies entirely on environment variables.

---

## 9. Findings Summary

### By Severity

| Severity | Count | Key Items |
|---|---|---|
| **Critical** | 2 | Double snapshot subscription, unbounded caches |
| **High** | 7 | Reflection filters, plaintext credentials, Kafka commit conflict, no consumer lifecycle, incomplete execution mapping, no auth, test endpoints in prod |
| **Medium** | 8 | ObjectMapper conflict, verbose logging, pagination error swallowing, dead switch branch, WebClient init, inconsistent filter application, magic numbers, no CORS |
| **Minor** | 6 | Java version mismatch, stale javadoc, mutable DTOs, inner class placement, missing annotation, non-deterministic random |

### Prioritized Recommendations

1. **Fix snapshot double-subscription** --- use `.cache()` or `concatWith()` to prevent dual REST calls
2. **Bound the in-memory caches** --- add eviction by size or terminal state
3. **Replace reflection in FilterService** --- use a static accessor map for type safety and performance
4. **Remove `.env` from repo** --- add to `.gitignore`, use environment variables or secrets management
5. **Fix Kafka commit strategy** --- disable auto-commit if manual acknowledgment is intended
6. **Add consumer lifecycle management** --- store `Disposable`, add `@PreDestroy`, use unbounded retry
7. **Complete execution mapping** --- align Avro schema with DTO or populate available fields
8. **Guard test endpoints** --- add `@Profile("dev")` or `@ConditionalOnProperty`
9. **Add authentication** --- at minimum Spring Security with basic auth or token validation
10. **Reduce hot-path logging** --- downgrade per-event logs from INFO to DEBUG/TRACE
11. **Add CORS configuration** --- configure allowed origins for the Trade Blotter UI
12. **Fix Java toolchain version** --- align `build.gradle` (Java 25) with Dockerfile (Java 21)
13. **Fix ObjectMapper bean** --- remove custom bean or ensure it inherits all auto-configured settings
14. **Remove or wire up unused buffer config** --- implement backpressure or delete dead properties
15. **Expand test coverage** --- prioritize `KafkaEventStreamProvider`, `OmsQueryClient`, and `OrderMessageMapper`
16. **Add missing Docker Compose services** --- Schema Registry and OMS Core
17. **Add Spring profiles** --- separate dev/prod configuration

---

*Analysis performed: 2026-02-09*
