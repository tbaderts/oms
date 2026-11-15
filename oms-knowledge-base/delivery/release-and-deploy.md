---
type: Methodology
title: "Release and Deploy"
description: "How the OMS is built and run today (locally, with the root docker-compose.yml, images built from each module's Dockerfile), how versions are handled, and what a release process would add; Kubernetes via Cozystack is planned."
tags: [release, deploy, docker, versioning]
status: draft
updated: "2026-11-14T12:00:00Z"
sources:
  - resource: "repo:docker-compose.yml"
  - resource: "repo:oms-core/Dockerfile"
  - resource: "repo:oms-contracts/build.gradle"
---
# Release and Deploy

## Today: local only

- **Build.** Each Java service is built with its own Gradle wrapper (`./gradlew build`), producing a
  boot jar in `build/libs`. Its two-stage `Dockerfile` copies that jar into an
  `eclipse-temurin:25-jre` image ([Service Template](../architecture/patterns/service-template.md)).
- **Run.** The root `docker-compose.yml` builds and starts every module plus PostgreSQL, Kafka,
  the Schema Registry and the observability stack ([Local Docker Stack](../infrastructure/local-docker-stack.md)).
  `docker compose up -d --build <service>` rebuilds one service.
- **Schemas before services.** New Avro subjects are registered with
  `./gradlew registerSchemas -PregistryUrl=…` in oms-contracts before a service that writes them
  starts; the services do not auto-register ([Message API](../domain/interfaces/message-api.md)).
- **Database.** Liquibase applies new changelogs at startup; an existing changeset is never edited
  (policy P-07).

## Versions

Modules carry `-SNAPSHOT` versions; there are no tags, release notes or published artifacts. The
contracts evolve compatibly (policy P-04), so services can be deployed in any order once their
schemas are registered.

## Not built

- Release tagging, changelogs and artifact or image publishing.
- A deployment target beyond the local compose stack. The planned platform is
  [Cozystack](../infrastructure/cozystack.md) (Kubernetes with operators for PostgreSQL, Kafka and
  more).
- See [Continuous Integration and Delivery](ci-cd.md) for the missing CI.
