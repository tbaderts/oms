# OMS Core — Code Review Report (2026-02-12)

## Scope
This review covers the `oms-core` module only, focusing on:
- Build tooling (Gradle, OpenAPI/Avro generation)
- API layer (controllers, OpenAPI contract alignment)
- Service/task pipelines (command + execution processing)
- Persistence (JPA entities, repositories, schema strategy)
- Messaging (Kafka listener, outbox publisher)
- Operational config (Docker, compose, Spring config)
- Tests

I also ran `./gradlew test` in `oms-core` to validate the module builds and tests execute.

## Executive Summary
**Overall:** strong architectural foundation (spec-driven APIs, clean task-pipeline orchestration, read/write datasource routing, ProblemDetail error shape) with all previously tracked P0/P1 backlog items implemented.

**Top risks (fix first):**
1. **Operational hardening**: review production exposure settings (`health.show-details`, tracing sampling) before production rollout.
2. **Lifecycle semantics**: sequencing is now covered by integration test; keep this behavior aligned with business expectations for partial fills.
3. **Business-rule coverage**: structural validation now exists at API boundary, while business rules remain task-based and should stay thoroughly tested.

## Implementation Status (Updated 2026-02-14)

### Completed
- **P0 data safety**: moved default schema management from `create-drop` to `validate` and introduced profile split (`application-dev.yml` retains `create-drop`).
- **P0 migrations**: added Liquibase baseline changelog (`db.changelog-master.yaml` + `001-initial-schema.yaml`) and wired dependency in Gradle.
- **P0 outbox correctness**: `MessagePublisher` now waits for Kafka send result before deleting outbox rows; failures keep rows for retry.
- **P1 Kafka consumer wiring**: `KafkaConsumerConfig` now uses `ConcurrentKafkaListenerContainerFactory<String, CommandMessage>`.
- **P1 command listener dispatch**: `CommandListener` now processes Kafka `OrderCreateCmd`, `ExecutionCreateCmd`, and `OrderAcceptCmd` using existing processors.
- **P1 command flow gap**: implemented `OrderAcceptCmd` via `OrderAcceptCommandProcessor` and wired it in `CommandController` (UNACK -> LIVE path now exists).
- **P1 API contract de-scoping**: removed unsupported commands from `oms-cmd-api.yml` discriminator and schemas (`QuoteRequestCreateCmd`, `QuoteCreateCmd`, `ExecutionWhackCmd`, `ExecutionBustCmd`) so public contract matches implemented handlers.
- **P1 internal command de-scoping**: removed unsupported command variants from `src/main/avro/CommandMessage.avsc` union and deleted stale Avro schemas (`QuoteRequestCreateCmd`, `QuoteCreateCmd`, `ExecutionWhackCmd`, `ExecutionBustCmd`).
- **P1 query OpenAPI warning resolved**: removed problematic dynamic object query parameter from `oms-query-api.yml`; dynamic filters are still supported by collecting query params in `QueryController`.
- **P2 generated model warning resolved**: added `x-field-extra-annotation: "@lombok.Builder.Default"` to `PagedOrderDto.content` schema so generated Lombok `@SuperBuilder` keeps default initialization without warnings.
- **P1 API-boundary validation**: added OpenAPI required/constraint metadata for `OrderCreateCmd`, `OrderAcceptCmd`, `ExecutionCreateCmd`, `Order`, and `Execution` to generate Bean Validation constraints at DTO boundary.
- **P2 JPA equality model**: replaced Lombok id-only equality on `Order`, `Execution`, `OrderEvent`, and `OrderOutbox` with safe Hibernate-class/id semantics so transient entities are no longer equal.
- **P1 OpenAPI response alignment**: command spec updated to include `201` response and `OrderAcceptCmd.orderId` required.
- **P1 compose fix**: corrected Grafana volume quote typo in `docker-compose.yml`.
- **P1 Docker healthcheck robustness**: runtime image now installs `curl`, so healthcheck command is available.
- **Controller layering**: internal read controllers now delegate to read services instead of directly calling repositories.
- **Build warning reduction**: resolved MapStruct unmapped-field warning in `OrderMapper.toExecution(...)` by explicit mapping ignores.
- **Tests added**:
  - `OrderAcceptCommandProcessorTest`
  - `MessagePublisherTest`
  - `LiquibaseMigrationIntegrationTest` (Testcontainers + PostgreSQL)
  - `CommandControllerWebMvcTest` (standalone MockMvc + controller advice)
  - `CommandModelValidationTest` (generated DTO bean validation constraints)
  - `OrderSpecificationsIntegrationTest` (filter parsing and invalid-input behavior)
  - `OrderLifecycleIntegrationTest` (`UNACK` execution rejection and `OrderAcceptCmd` -> execution success path)
  - `DataSourceRoutingTest` (read/write routing key selection)
  - `EntityEqualityTest` (transient vs persisted equality semantics)

### Still Open
- **Additional tests still recommended**:
  - Add mixed command/execution scenarios for partial fills and multi-execution aggregation

## What’s working well
- **Spec-first approach**: OpenAPI specs exist and are wired into Gradle generation tasks.
- **Task orchestration framework** (`org.example.common.orchestration.*`) is cohesive and well-tested.
- **CQRS-ish separation**: `CommandController` vs `QueryController` and read-replica routing (`@UseReadReplica`).
- **Reasonable API error shape**: `GlobalExceptionHandler` uses RFC7807 `ProblemDetail` with stable `type` URNs.
- **Dynamic query filtering** (`OrderSpecifications`) is defensive: unknown fields are ignored with warnings; numeric/date/enum parsing failures degrade safely.

## Build & generation findings
### Observed during `./gradlew test`
- OpenAPI generator logs:
  - `Ignoring complex example on request body`
- Compile warnings:
  - No current compile warnings after OpenAPI and mapper warning fixes.

**Recommendations**
- Treat OpenAPI generation warnings as contract-quality issues:
  - Keep examples in OpenAPI specs (or in `schema.yml`) rather than very large inline examples in annotations.
- Keep `OrderMapper.toExecution(...)` explicit (`@Mapping(..., ignore = true)` where not mapped) to retain warning-free builds and clear intent.

## API & OpenAPI alignment
### Contract status
- Command API responses and command schemas are aligned with current implementation, including `201` create responses and required validation constraints for command payloads.

**Recommendations**
- Keep OpenAPI and generated DTO constraints synchronized whenever command semantics change.
- Add at least one integration test per new command type to validate contract + runtime behavior together.

### Controller layering consistency
- `OrderController`, `ExecutionController`, `OrderEventController` access repositories directly. They are annotated `@Hidden`, so likely internal/debug endpoints, but this bypasses the service layer.

**Recommendations**
- If these endpoints are intended to stay: keep them internal and consider moving them behind a profile (e.g., `dev` only).
- If they are part of the product API: route through services and add tests.

## Command + execution processing
### Lifecycle status
- Newly created orders are set to **`UNACK`** (`SetOrderStateTask`), execution processing requires **`LIVE`** (`ValidateExecutionTask`), and the `OrderAcceptCmd` path implements `UNACK -> LIVE`.
- Integration coverage now verifies rejection of execution while `UNACK` and successful processing after accept.

**Recommendations**
- Document and enforce expected operational sequencing for producers so `OrderAcceptCmd` precedes executable fills.
- Extend lifecycle tests for partial-fill progression and repeated execution updates.

### Validation approach
- `ValidateOrderTask` and `ValidateExecutionTask` still contain business-rule validation.
- Structural constraints are now enforced at API boundary via generated Bean Validation from OpenAPI constraints.

**Recommendations**
- Consider moving basic structural validation to **Jakarta Bean Validation** on generated DTOs / controller boundary (where possible), keeping tasks for business-rule validation.

## Messaging & outbox
### Outbox delivery status
- `MessagePublisher` now waits for Kafka send confirmation and only deletes outbox rows on successful publish.
- Failed sends retain rows for retry paths.

**Recommendations**
- Consider adding explicit outbox retry scheduling and dead-letter routing for sustained publish failures.

### Kafka command consumption status
- `KafkaConsumerConfig` and `CommandListener` are aligned on `CommandMessage` payload handling and dispatch implemented command types.

**Recommendations**
- Keep Avro command union and OpenAPI command discriminator changes synchronized in the same PR.

### CommandListener completeness
- `CommandListener` now dispatches `OrderCreateCmd`, `ExecutionCreateCmd`, and `OrderAcceptCmd` into domain processors.
- Unsupported command variants have been removed from both OpenAPI contract and internal Avro command union.

**Recommendations**
- Keep command families synchronized across OpenAPI and Avro schemas to prevent unsupported message drift.

## Persistence & schema management
### Schema strategy status
- Default profile uses `ddl-auto: validate` with Liquibase-managed schema.
- `create-drop` is isolated to development profile.

**Recommendations**
- Keep all future schema changes migration-first and validated in Testcontainers integration tests.

### JPA entity equality
- `OrderEvent` and `OrderOutbox` now use Hibernate-class/id equality semantics.
- Distinct transient instances (`id == null`) are no longer considered equal.

**Recommendations**
- Apply the same equality pattern to any future JPA entities added to this module.

## Docker & local environment
### Local stack status
- Compose syntax and Docker healthcheck prerequisites are now fixed.

**Recommendation**
- Continue verifying compose and healthcheck paths in CI smoke tests to prevent regressions.

## Observability & ops config
- Actuator exposure is reasonably constrained to `health,info,prometheus,metrics`.
- Production-default health detail exposure is restricted; development profile is intentionally verbose.

**Recommendations**
- Consider making tracing sampling configurable per environment (`probability: 1.0` is expensive in production).

## Tests
- Test coverage now includes controller behavior, command processors, outbox behavior, Liquibase/Testcontainers startup validation, order filter behavior, and datasource routing key behavior.

**Remaining high-value tests**
1. Additional lifecycle transition tests for partial fills and multi-execution aggregation behavior.
2. End-to-end command ingestion tests validating OpenAPI and Avro command type alignment.

## Prioritized recommendations (action list)
### P0 (must fix before production)
- ~~Replace `ddl-auto: create-drop` with migrations + profile-based config.~~ ✅
- ~~Fix outbox flow so outbox rows are deleted only after a confirmed successful publish (or are retried).~~ ✅

### P1 (next)
- ~~Fix Kafka consumer container factory typing/config so `CommandListener` receives the expected Avro type.~~ ✅
- ~~Align OpenAPI contract with controller responses (200 vs 201).~~ ✅
- ~~Fix docker-compose quoting issue; verify local stack starts.~~ ✅
- ~~Implement `OrderAcceptCmd` (or another path) to transition `UNACK -> LIVE`, otherwise executions will be rejected.~~ ✅
- ~~Implement Kafka `CommandListener` dispatch for supported command types (`OrderCreateCmd`, `ExecutionCreateCmd`, `OrderAcceptCmd`).~~ ✅
- ~~Implement `QuoteRequestCreateCmd` and remaining command handlers or explicitly de-scope/remove from OpenAPI.~~ ✅ (de-scoped from OpenAPI)
- ~~Address Docker healthcheck dependency (`curl`) for runtime image robustness.~~ ✅

### P2 (quality / maintainability)
- Keep build warning-free state by validating generated-code warnings after spec edits.
- Add additional integration coverage for partial-fill and multi-execution lifecycle behavior.

---

## Appendix: reviewed files (non-exhaustive)
- `build.gradle`, `src/main/resources/application.yml`, `Dockerfile`, `docker-compose.yml`
- Controllers: `CommandController`, `QueryController`, `GlobalExceptionHandler`, `MetamodelController`
- Services/tasks: `OrderCreateCommandProcessor`, `ExecutionCommandProcessor`, validation/state/persist/publish tasks
- Messaging: `CommandListener`, `MessagePublisher`, `OrderMessageMapper`
- Persistence: `Order`, `Execution`, `OrderOutbox`, repositories
- Tests: orchestration + state machine unit tests
