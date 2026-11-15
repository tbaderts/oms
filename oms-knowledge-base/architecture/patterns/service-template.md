---
type: Pattern
title: "Service Template"
description: "The shape every Java microservice in the OMS repository shares: Gradle composite build with oms-contracts, Java 25 and Spring Boot 4.1, configuration by environment variable, OTLP telemetry, actuator health, a two-stage Dockerfile and an entry in the root docker-compose.yml."
tags: [pattern, microservice, template, spring-boot, gradle, docker]
status: draft
updated: "2026-11-14T12:00:00Z"
sources:
  - resource: "repo:oms-core/build.gradle"
  - resource: "repo:oms-core/settings.gradle"
  - resource: "repo:oms-core/Dockerfile"
  - resource: "repo:oms-exchange-simulator/build.gradle"
  - resource: "repo:oms-exchange-simulator/src/main/resources/application.yml"
  - resource: "repo:docker-compose.yml"
---
# Service Template

There is no generator; a new service copies the shape of an existing one. **The exchange simulator
(`oms-exchange-simulator`) is the smallest complete example**; oms-core is the full one. The four
Java services (oms-core, oms-streaming-service, oms-exchange-simulator, oms-mcp-server) all follow it.

## Checklist

| Part | What it looks like | Copy from |
|---|---|---|
| Build | Its own Gradle build (`settings.gradle`, wrapper), Java toolchain 25, Spring Boot 4.1, Lombok, MapStruct where it maps | `oms-exchange-simulator/build.gradle` |
| Contracts | `includeBuild('../oms-contracts')` in `settings.gradle`, so the service builds on its own and uses the shared models; never its own `src/main/openapi` or `src/main/avro` (P-01) | any service's `settings.gradle` |
| JSON | Jackson 3 (`tools.jackson.*`), never `com.fasterxml.jackson` (P-12) | — |
| Configuration | `application.yml` with every deployment value as `${ENV_VAR:default}`; a `dev` profile for compose | `oms-core/src/main/resources/application.yml` |
| Kafka | Avro serdes with the Schema Registry, observation on, the rules of [Kafka Messaging](kafka-messaging.md) | `oms-exchange-simulator/src/main/resources/application.yml` |
| Telemetry | `logback-spring.xml` with the `OTEL` appender, `OpenTelemetryLogging`, the OTLP settings and the correlation log pattern ([Logging and Tracing](logging-and-tracing.md)) | oms-core |
| Health | Spring Boot Actuator `/actuator/health`; the Dockerfile's `HEALTHCHECK` calls it | oms-core |
| Container | Two-stage `Dockerfile` on `eclipse-temurin:25-jre`, copying the boot jar from `build/libs` | `oms-core/Dockerfile` |
| Compose | A service in the root `docker-compose.yml` with `<<: *otlp-env`, its port, `depends_on` and the `app-net` network ([Local Docker Stack](../../infrastructure/local-docker-stack.md)) | the `exchange-simulator` entry |
| Tests | JUnit 5; integration tests with Testcontainers ([Testing](../../delivery/testing.md)) | — |
| Spec ticket | The module listed in `specs/config.json` with its `verify` command, so gates run its checks | `specs/config.json` |

## Known deviations

- `oms-mcp-server` has no actuator dependency.
- Jackson 2 (`com.fasterxml.jackson.databind`) is still used by `JsonHelper` (oms-core) and by
  `EmbeddingService` and `OrderQueryClient` (oms-mcp-server); see the
  [technical debt register](../technical-debt/technical-debt-register.md). Jackson 3 keeps its
  annotations in `com.fasterxml.jackson.annotation`, so those imports are fine.
