---
type: Concept Paper
title: "Cozystack Platform (planned)"
description: "Planned cloud-like platform for the OMS on Cozystack: Kubernetes with operators for PostgreSQL, Kafka, Redis and Qdrant, replacing the local compose stack for shared environments. Nothing is built yet."
tags: [infrastructure, kubernetes, cozystack, operators, planned]
status: draft
updated: "2026-11-14T12:00:00Z"
sources:
  - resource: https://cozystack.io/
---
# Cozystack Platform (planned)

> **Status: planned, nothing built.** The OMS runs only on the [local Docker stack](local-docker-stack.md)
> today. There are no Kubernetes manifests, Helm charts or operator resources in the repository. This
> page records the intent so designs can aim at it; a spec ticket will turn it into a specification.

## Why

The compose stack is good for one developer's machine. Shared environments (test, demo, load
tests with several oms-core instances) need what a cloud gives: managed databases and brokers,
rolling deploys, scaling and isolation, without depending on a hyperscaler.
[Cozystack](https://cozystack.io/) is an open-source platform that turns bare-metal or virtual
machines into such a cloud, built on Kubernetes with managed services provided by operators.

## What it would provide

| Need | Today (compose) | On Cozystack |
|---|---|---|
| Runtime for the OMS services | containers on one host | Kubernetes deployments, one per service, scaled independently (oms-core already runs safely with several instances, SPEC-0048) |
| PostgreSQL | one container | a managed PostgreSQL from its operator (replicas, backups; a read replica is what SPEC-0021 needs) |
| Kafka and Schema Registry | Confluent containers | a managed Kafka from its operator |
| Redis | not used | available from its operator if a cache becomes necessary (some concept papers mention it) |
| Qdrant | unused container | available from its operator if the knowledge server ever moves its vectors out of process |
| Observability | LGTM containers | the same Alloy-based setup ([Observability](observability.md)), or the platform's monitoring |

## Open questions

- Which services are deployed first, and which environments (test, demo, load) are needed?
- Do schema registration (`registerSchemas`) and Liquibase migrations run as jobs before
  deployments?
- How are images built and published (there is no CI that builds images yet;
  [CI/CD](../delivery/ci-cd.md))?
