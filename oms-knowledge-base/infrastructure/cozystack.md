---
type: Concept Paper
title: "Cozystack Platform (planned)"
description: "Candidate cloud-like platform for a future shared OMS environment on Cozystack: Kubernetes with operators for PostgreSQL, Kafka, Redis and Qdrant. Not used locally (ADR-006); nothing is built yet."
tags: [infrastructure, kubernetes, cozystack, operators, planned]
status: draft
updated: "2026-11-26T14:00:00Z"
sources:
  - resource: https://cozystack.io/
  - resource: https://cozystack.io/docs/install/hardware-requirements/
---
# Cozystack Platform (planned)

> **Status: shared environments only, nothing built.** The OMS runs on the
> [local Docker stack](local-docker-stack.md). SPEC-0078 evaluated Cozystack for the development
> laptop and decided against it ([ADR-006](../architecture/decisions/ADR-006-local-kubernetes-platform.md)):
> - Its smallest documented setup is 3 hosts × 24 GB RAM, more than twice the laptop.
> - Scaling tests use a disposable k3d cluster instead, alongside compose and one at a time. It
>   runs the same upstream operators Cozystack uses (CloudNativePG, Strimzi).
>
> Cozystack remains the candidate for a shared test or demo environment on dedicated hardware
> (ADR-006 follow-up F-5).

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
| Kafka and Schema Registry | Confluent containers | a managed Kafka from Strimzi. Cozystack provides no Schema Registry, so it runs as a separate Deployment ([ADR-006](../architecture/decisions/ADR-006-local-kubernetes-platform.md)) |
| Redis | not used | available from its operator if a cache becomes necessary (some concept papers mention it) |
| Qdrant | unused container | available from its operator if the knowledge server ever moves its vectors out of process |
| Observability | LGTM containers | the same Alloy-based setup ([Observability](observability.md)), or the platform's monitoring |

## Open questions

- Which services are deployed first, and which environments (test, demo, load) are needed?
- Do schema registration (`registerSchemas`) and Liquibase migrations run as jobs before
  deployments?
- How are images built and published (there is no CI that builds images yet;
  [CI/CD](../delivery/ci-cd.md))?
