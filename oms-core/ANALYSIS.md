# OMS-Core Architecture, Design & Code Quality Analysis

## 1. Executive Summary

OMS-Core is a Java 25 / Spring Boot 3.5.7 Order Management System implementing a command-query separation pattern with a custom task orchestration framework. The codebase is well-structured with clear layering, strong use of code generation from OpenAPI specs, and an observability stack (tracing, metrics, logging). The project is in an early/active development stage (`0.0.1-SNAPSHOT`, `ddl-auto: create-drop`), with several areas that need attention before production readiness.

**Overall Assessment: Solid foundation with good architectural choices, but gaps in test coverage, error handling at the API boundary, database schema management, and security hardening that must be addressed before production use.**

---

## 2. Architecture & Design

### 2.1 High-Level Architecture

```
                  +------------------+
                  |   oms-ui (React) |
                  +--------+---------+
                           |
              REST (OpenAPI-generated interfaces)
                           |
         +-----------------+------------------+
         |            oms-core                |
         |                                    |
         |  Controllers (API layer)           |
         |    CommandController (ExecuteApi)   |
         |    QueryController   (SearchApi)   |
         |    OrderController, etc.           |
         |                                    |
         |  Service layer                     |
         |    OrderCreateCommandProcessor     |
         |    ExecutionCommandProcessor       |
         |    OrderQueryService               |
         |                                    |
         |  Task Orchestration Framework      |
         |    Task<T> -> ConditionalTask<T>   |
         |    TaskPipeline<T>                 |
         |    TaskOrchestrator                |
         |                                    |
         |  Data layer                        |
         |    JPA repositories                |
         |    Write/Read datasource routing   |
         +---------+--------------+-----------+
                   |              |
           +-------+---+    +----+-------+
           | PostgreSQL |    |  ReadySet  |
           |  (write)   |    |  (read)    |
           +-------+---+    +------------+
                   |
           +-------+---+
           |   Kafka    |  (Avro msgs)
           +------------+
```

### 2.2 Design Patterns Identified

| Pattern | Implementation | Quality |
|---------|---------------|---------|
| **Command-Query Separation** | Separate `CommandController` / `QueryController` with distinct OpenAPI specs | Good |
| **Task Pipeline / Chain of Responsibility** | Custom `Task<T>` + `TaskPipeline<T>` + `TaskOrchestrator` | Good |
| **Conditional Execution** | `ConditionalTask<T>` with `Predicate<T>` preconditions | Good |
| **Outbox Pattern** | `OrderOutbox` entity + `TransactionalEventListener` for Kafka publish | Good |
| **Read Replica Routing** | `@UseReadReplica` annotation + AOP aspect + `AbstractRoutingDataSource` | Good |
| **API-First / Spec-Driven** | OpenAPI YAML specs generate interfaces and DTOs; controllers implement them | Good |
| **State Machine** | Generic `StateMachine<S>` with immutable `StateMachineConfig` | Good (but unused in runtime) |

### 2.3 Architecture Strengths

1. **Clean layering**: Controllers are thin, delegating to processors/services. Business logic is encapsulated in task pipelines.

2. **Task orchestration framework** is well-designed:
   - Generic type-safe context (`TaskContext` subclass)
   - Ordered execution with `getOrder()`
   - Conditional execution with `ConditionalTask`
   - Pipeline-level failure control (`stopOnFailure`)
   - Result aggregation with metrics
   - Execution timing

3. **OpenAPI-first approach** ensures API contract consistency between services and avoids manual DTO drift.

4. **Read replica routing** via custom annotation and AOP is a clean, transparent approach to offloading read traffic.

5. **Observability** is well-integrated: Micrometer `@Observed` annotations on key methods, OpenTelemetry tracing, Prometheus metrics, structured logging.

6. **Outbox pattern** for Kafka publishing avoids the dual-write problem (database + message broker).

### 2.4 Architecture Concerns

1. **State machine is defined but not wired into runtime code**: `OrderStateMachineConfig` and `StateMachine` exist in `common.state` but are never referenced by any controller, service, or task. State transitions are currently handled ad-hoc in `SetOrderStateTask` and `DetermineOrderStateTask` without formal validation. This means invalid state transitions could occur silently.

2. **`ProcessingEvent` is not a Spring `ApplicationEvent`**: `ProcessingEvent` extends nothing (no `ApplicationEvent` or `ApplicationEvent` wrapper). The `@TransactionalEventListener` in `MessagePublisher` accepts `ProcessingEvent`, which requires Spring's event infrastructure to recognize it. While Spring 4.2+ supports arbitrary objects as events, this is fragile and non-obvious. An explicit `ApplicationEvent` wrapper or documentation would clarify intent.

3. **No shared module / multi-module Gradle build**: Code in `org.example.common` lives inside `oms-core` but is conceptually a shared library used across modules (the copilot instructions reference `oms-mcp-server`, `oms-streaming-service`). Each module has an independent `settings.gradle`. This means shared model classes (`Order`, `Execution`, enums, orchestration framework) are likely duplicated or tightly coupled.

4. **`ExecutionCommandProcessor` is wired but never invoked**: `CommandController.executeCommand()` only handles `OrderCreateCmd` via `instanceof`. There is no `instanceof ExecutionCreateCmd` branch, so execution reports cannot be submitted through the command API despite the processor being fully implemented.

5. **Mixed DI styles**: Some classes use Lombok `@RequiredArgsConstructor` (e.g., `CommandController`, `QueryController`, `KafkaProducerConfig`), while others use explicit constructors (e.g., `OrderController`, `OrderQueryService`, `MessagePublisher`). This inconsistency makes the codebase harder to scan.

---

## 3. Code Quality Analysis

### 3.1 Controller Layer

**`CommandController.java`** (`api/CommandController.java:29`)
- Annotates the entire class with `@Transactional`, meaning even failed validation attempts open a database transaction. This wastes connection pool resources.
- The `@Operation` annotation contains a large inline JSON example (lines 34-53). This should be externalized to a resource file or the OpenAPI spec itself.
- Only handles `OrderCreateCmd`; all other command types return 501. The `ExecutionCreateCmd` handler is missing despite the processor existing.
- Returns HTTP 200 for successful orders rather than 201 Created, which is semantically incorrect for resource creation.

**`OrderController.java`** and **`ExecutionController.java`**
- Directly inject repositories into controllers, bypassing the service layer. This violates the project's own stated convention of "thin controllers that delegate to services."
- `getAllOrders()` calls `findAll()` with no pagination, which will cause performance issues at scale.
- No service-layer abstraction means cross-cutting concerns (logging, metrics, caching) cannot be added without modifying controllers.

**`MetamodelController.java`** (`api/MetamodelController.java:48-66`)
- Catches `Exception` broadly and re-throws it. The catch block adds logging but the generic `throw e` means Spring's default error handling kicks in with a raw 500 response. Should use `@ExceptionHandler` or return a proper error DTO.
- Has a custom `/health` endpoint that duplicates Spring Actuator's health check functionality.

**`QueryController.java`**
- Clean implementation. Properly separates control params from filter params.
- Correctly uses `@UseReadReplica` and `@Transactional(readOnly = true)`.

### 3.2 Service / Task Layer

**Task Orchestration Framework** (`common/orchestration/`)
- Well-designed and well-tested (11 tests for `TaskOrchestrator` alone).
- `TaskPipeline` has both a fluent builder *and* a separate `Builder` inner class, which is redundant. The `create()` factory method returns a mutable pipeline, while `builder()` returns a `Builder`. Only `builder()` is used in production code, making `create()` dead code for production (only used in tests).
- `TaskPipeline.build()` mutates the pipeline in-place (sorts the task list) but returns `this`. This is misleading for a method named `build()` which typically implies creating a new immutable instance.

**`OrderCreateCommandProcessor.java`**
- Clean, well-documented, well-structured.
- Pipeline construction is done per-request (`buildPipeline()` called each time). Since tasks are Spring singletons and the pipeline is structurally identical each time, this allocates unnecessary objects. The pipeline could be built once and reused.

**`ValidateOrderTask.java`**
- Validation logic is thorough but hand-rolled. Jakarta Bean Validation (`@Valid`, `@NotNull`, `@Positive`) on the command/DTO could eliminate most of this boilerplate.
- The `OrdType` check at line 74 uses string comparison (`"LIMIT".equals(order.getOrdType().name())`) instead of the enum constant directly (`OrdType.LIMIT == order.getOrdType()`).

**`CalculateOrderQuantitiesTask.java`**
- Stores calculated values in the generic `TaskContext` attribute map (`context.put("calculatedCumQty", ...)`) using string keys. This is type-unsafe and prone to typos. The typed `OrderTaskContext` already has fields for order state; calculated quantities should be stored there too.

**`OrderSpecifications.java`**
- Solid dynamic query builder, but:
  - Unknown fields are silently ignored (line 54-56). This could hide client-side bugs. Logging a warning or returning an error would be better.
  - `buildEnum()` uses `Enum.valueOf()` which throws `IllegalArgumentException` on invalid values, but this exception is not caught. Unlike `buildNumeric()` which gracefully handles `NumberFormatException`, invalid enum values will cause a 500 error.
  - Date parsing outside the `between` case (lines 172-181) has no try-catch, meaning malformed ISO dates cause unhandled exceptions.

**`MessagePublisher.java`**
- Uses `@Value` field injection for `orderTopic` and `kafkaEnabled` instead of constructor injection. This prevents the fields from being `final` and makes the class harder to test.
- Catches and logs exceptions in `handleOrderEvent()` without rethrowing. Failed Kafka publishes are silently lost. For an outbox pattern, there should be retry logic or at minimum marking the outbox entry as failed.
- The outbox entry is never deleted or marked as published after successful Kafka send. The outbox table will grow indefinitely.

**`MetamodelService.java`**
- Uses reflection to analyze entity fields, which is acceptable here.
- The hard-coded field sets (`ORDER_STRING_FIELDS`, `ORDER_NUMERIC_FIELDS`, etc.) duplicate knowledge from `OrderSpecifications`. If one is updated without the other, the UI metadata will be inconsistent with actual query capabilities.

### 3.3 Domain Model

**`Order.java`** (`common/model/Order.java`)
- Uses `@SuperBuilder` + `@Jacksonized` + `@NoArgsConstructor` + `@Getter` + selective `@Setter`. The selective setter approach (`@Setter private State state`) is intentional but inconsistent: `txNr` also has `@Setter` while other mutable fields (like `cumQty`, `leavesQty`) are modified via the builder's `toBuilder()`. This creates two mutation pathways for the same entity.
- `@EqualsAndHashCode` on a JPA entity includes `id`, which is `null` before persistence. This means two unpersisted `Order` objects with identical business data will be considered equal to each other (both have `null` id), but *not* equal after one is persisted. This is a well-known JPA anti-pattern.
- `@JsonTypeInfo(use = JsonTypeInfo.Id.CLASS, property = "@type")` embeds the fully-qualified Java class name in JSON output. This leaks internal implementation details and creates tight coupling between serialized data and the class structure.
- Uses `ReflectionToStringBuilder` for `toString()`, which has performance overhead and can cause issues with lazy-loaded JPA associations (triggering N+1 queries).
- `PriceType` field (line 83) is missing `@Enumerated(EnumType.STRING)`, meaning it will be persisted as an ordinal integer by default. This is fragile if enum constants are reordered.
- The entity directly implements `Serializable` but has no `serialVersionUID`.

**`Execution.java`**
- Similar `@EqualsAndHashCode` issue as `Order`.
- Does not implement `Serializable` (inconsistent with `Order`).
- No `@Enumerated` annotations on any fields, though none are currently enums.

**`OrderOutbox.java`**
- Stores an `Order` entity as JSONB. This works but means the outbox payload is coupled to the JPA entity's serialization format, including the `@JsonTypeInfo` class annotation. Changes to the `Order` class could break deserialization of historical outbox entries.

**`OrderTaskContext.java`**
- Well-designed typed context with clear helper methods.
- The `command` field is typed as `Object` (line 33), losing type safety. Should be typed as `Command` (the OpenAPI-generated base type).

### 3.4 Configuration

**`DataSourceConfig.java`**
- Clean implementation of `AbstractRoutingDataSource`.
- Uses `HashMap` directly (line 60) rather than `Map.of()` for target data sources, which is fine since `AbstractRoutingDataSource` requires a `Map<Object, Object>`.

**`DataSourceContextHolder.java`**
- Uses `ThreadLocal<Boolean>` correctly with cleanup in `ReadReplicaAspect`.
- Consider an `InheritableThreadLocal` if async/virtual thread usage is planned (virtual threads config is present but disabled).

**`WebConfig.java`**
- CORS configuration allows `*` for methods and headers from `localhost:3000`. This is development-appropriate but must be locked down for production. No profile-based CORS configuration exists.

**`application.yml`**
- **Critical**: `ddl-auto: create-drop` means the database schema is dropped and recreated on every application restart. This is a data-loss risk that should never reach production. No Liquibase/Flyway migrations are present.
- `management.endpoints.web.exposure.include: "*"` exposes all actuator endpoints, including potentially sensitive ones (`/env`, `/configprops`, `/heapdump`). Should be restricted.
- `management.tracing.sampling.probability: 1.0` means 100% of requests are traced. This is appropriate for development but creates significant overhead in production.
- No default values for `DB_URL`, `READYSET_URL`, `TRACING_URL`, `SERVER_PORT` - application fails to start without these environment variables. Consider Spring profiles or sensible defaults.
- `kafka.enabled: true` in the default config but the Kafka infrastructure may not be running, causing startup failures.

**`OmsConfig.java`**
- Bean name `otlpHttpSpanExporter` is misleading since it creates a `OtlpGrpcSpanExporter` (gRPC, not HTTP).

### 3.5 Build Configuration

**`build.gradle`**
- **Java 25**: This is an early-access JDK version. For production systems, an LTS release (Java 21) would be more appropriate.
- Missing dependency on `org.apache.commons:commons-lang3`, but `Order.java` and `Execution.java` use `ReflectionToStringBuilder` from it. This likely resolves transitively but should be declared explicitly.
- OpenAPI Avro generation task (`openApiGenerateAvro`) generates files to `$buildDir/generated-avro` but this directory is not added to source sets (unlike the other generated sources). The Avro plugin picks it up via convention, but this is implicit.
- No `configurations.all { resolutionStrategy { failOnVersionConflict() } }` — dependency conflicts could go unnoticed.

### 3.6 Docker & Infrastructure

**`Dockerfile`**
- `CMD apt-get update -y` runs on every container start, not during build. This should be a `RUN` instruction, or removed entirely since updates aren't needed at runtime for a JRE image.
- No multi-stage build: the full JDK image is used at runtime. A JRE-only image would reduce the attack surface and image size.
- No health check (`HEALTHCHECK`) directive.
- Uses `eclipse-temurin:25` without a specific tag, meaning builds are not reproducible.

---

## 4. Testing

### 4.1 Test Coverage Assessment

| Component | Test File | Coverage |
|-----------|-----------|----------|
| TaskOrchestrator | `TaskOrchestratorTest` (11 tests) | Good |
| TaskContext | `TaskContextTest` | Good |
| TaskResult | `TaskResultTest` | Good |
| StateMachine | `StateMachineTest` | Good |
| **Controllers** | **None** | **Missing** |
| **OrderCreateCommandProcessor** | **None** | **Missing** |
| **ExecutionCommandProcessor** | **None** | **Missing** |
| **ValidateOrderTask** | **None** | **Missing** |
| **Other business tasks** | **None** | **Missing** |
| **OrderSpecifications** | **None** | **Missing** |
| **OrderQueryService** | **None** | **Missing** |
| **OrderMapper** | **None** | **Missing** |
| **MessagePublisher** | **None** | **Missing** |
| **DataSource routing** | **None** | **Missing** |
| **Integration tests** | **None** | **Missing** |

### 4.2 Test Quality

The existing tests are well-written:
- Proper use of JUnit 5 and Mockito
- Good test naming conventions
- Edge cases covered (empty pipelines, exceptions, conditional execution)
- Assertion messages are implicit but test names are descriptive

### 4.3 Critical Testing Gaps

1. **No unit tests for any business task** (validate, persist, calculate, publish) - these contain the core business logic.
2. **No controller tests** (MockMvc / WebMvcTest) - the API contract is untested.
3. **No integration tests** despite Testcontainers being referenced in project docs. The persistence layer, transaction boundaries, and Kafka integration are all untested.
4. **No tests for `OrderSpecifications`** dynamic query building - this is complex, user-input-driven code that needs thorough testing.
5. **No mapper tests** - MapStruct mappers can have subtle bugs, especially with the `Instant`/`OffsetDateTime` conversions.

---

## 5. Security Considerations

| Area | Status | Notes |
|------|--------|-------|
| **Input validation** | Partial | Manual validation in tasks; no Bean Validation on API DTOs |
| **SQL Injection** | Low risk | JPA Criteria API used correctly; no raw SQL |
| **CORS** | Dev-only | Hardcoded `localhost:3000`; no production config |
| **Actuator exposure** | Risk | All endpoints exposed including `/env`, `/heapdump` |
| **Secrets management** | Good | Environment variables used; no hardcoded credentials |
| **JSON type info** | Risk | `@JsonTypeInfo(Id.CLASS)` on `Order` can enable deserialization attacks if untrusted input is accepted |
| **Enum parsing** | Risk | `Enum.valueOf()` in `OrderSpecifications.buildEnum()` with unsanitized user input can throw unhandled exceptions |
| **Error disclosure** | Risk | Stack traces may leak via unhandled exceptions (no global `@ControllerAdvice` / error handler) |
| **DDL auto** | Critical | `create-drop` in default config |

---

## 6. Recommendations (Prioritized)

### P0 — Must Fix Before Production

1. **Replace `ddl-auto: create-drop` with Flyway/Liquibase migrations**. The current configuration destroys all data on restart. Add proper schema migration tooling.

2. **Add a global exception handler** (`@ControllerAdvice`) producing RFC 7807 Problem+JSON responses. Currently, unhandled exceptions leak stack traces.

3. **Restrict actuator endpoint exposure**. Change to `include: health,info,prometheus` or secure sensitive endpoints.

4. **Fix the Dockerfile**: Change `CMD apt-get update` to `RUN` or remove it. Pin the base image tag. Consider multi-stage build.

5. **Fix `@EqualsAndHashCode` on JPA entities**. Either exclude `id` or use a business key. The current implementation breaks JPA collection semantics.

### P1 — Should Fix

6. **Wire `ExecutionCommandProcessor` into `CommandController`**. The processor exists but is unreachable via the API.

7. **Integrate the state machine into runtime processing**. `OrderStateMachineConfig` and `StateMachine` should validate transitions in `SetOrderStateTask` / `DetermineOrderStateTask` rather than ad-hoc logic.

8. **Add `@Enumerated(EnumType.STRING)` to `Order.priceType`**. Currently defaults to ordinal persistence.

9. **Handle outbox lifecycle**: Mark or delete outbox entries after successful Kafka publish. Add retry logic for failed publishes.

10. **Add unit tests for business tasks and controllers**. At minimum: `ValidateOrderTask`, `CalculateOrderQuantitiesTask`, `OrderSpecifications`, `CommandController` (MockMvc).

11. **Add integration tests with Testcontainers** for the persistence layer and end-to-end command processing.

12. **Fix unhandled exceptions in `OrderSpecifications`**: Catch `IllegalArgumentException` in `buildEnum()` and `DateTimeParseException` in `buildDate()` non-between operations.

### P2 — Should Improve

13. **Standardize DI style**: Use `@RequiredArgsConstructor` consistently across all classes, or use explicit constructors consistently. Pick one convention.

14. **Remove `@JsonTypeInfo(Id.CLASS)` from `Order`**. Use `@JsonTypeInfo(Id.NAME)` with `@JsonSubTypes` if polymorphism is needed, or remove it entirely.

15. **Move pipeline construction out of per-request processing**. `OrderCreateCommandProcessor.buildPipeline()` creates identical pipelines on every call. Build once as a field.

16. **Use typed fields in `OrderTaskContext`** instead of string-keyed `context.put("calculatedCumQty", ...)`. Add `calculatedCumQty` and `calculatedLeavesQty` as proper fields.

17. **Type the `command` field** in `OrderTaskContext` as `Command` instead of `Object`.

18. **Move `OrderController` and `ExecutionController` to use service-layer abstractions** instead of injecting repositories directly. This aligns with the project's stated conventions.

19. **Add pagination to `OrderController.getAllOrders()`** and `ExecutionController.getAllExecutions()`. Unbounded `findAll()` is a scalability risk.

20. **Externalize CORS configuration** to properties or profiles rather than hardcoding.

21. **Add Spring profiles** (`dev`, `prod`) with appropriate defaults for database URL, Kafka, tracing, and CORS.

22. **Consider a multi-module Gradle build** for shared code in `org.example.common`. A `common` module would prevent code duplication across `oms-core`, `oms-mcp-server`, and other modules.

23. **Use `@Value` constructor injection** in `MessagePublisher` or extract to a `@ConfigurationProperties` class for type-safe Kafka configuration.

---

## 7. Metrics Summary

| Metric | Value |
|--------|-------|
| Source files (handwritten) | ~75 Java files |
| Source files (generated) | ~20+ Java files |
| Test files | 4 |
| Test assertions | ~50+ |
| Lines of code (main, approx) | ~3,000 |
| Lines of code (test, approx) | ~280 |
| Test-to-code ratio | ~9% (low) |
| OpenAPI specs | 3 (cmd, query, schema) |
| Docker services | 12 |
| Spring beans (approx) | ~25 |
| JPA entities | 4 (Order, Execution, OrderOutbox, OrderEvent) |
| REST endpoints | ~11 |

---

## 8. Conclusion

OMS-Core demonstrates thoughtful architecture with its task orchestration framework, command-query separation, outbox pattern, and observability integration. The OpenAPI-first approach and code generation pipeline are well-configured. The core abstractions (`Task`, `ConditionalTask`, `TaskPipeline`, `TaskOrchestrator`, `StateMachine`) are well-designed and well-tested.

The primary gaps are in production readiness: database schema management, security hardening, error handling at API boundaries, and test coverage for business logic. The state machine framework exists but isn't connected to the runtime processing pipeline, and several implemented features (execution command processing) aren't reachable through the API.

Addressing the P0 items is essential before any production deployment. The P1 items should be tackled to ensure business logic correctness and maintainability. The P2 items are code quality improvements that will pay dividends as the codebase grows.
