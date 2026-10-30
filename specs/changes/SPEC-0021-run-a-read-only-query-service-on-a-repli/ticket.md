---
id: SPEC-0021
title: Run a read-only query service on a replica
type: feature
status: proposal
awaiting:
autopilot: false
modules: [oms-core, oms-contracts, oms-knowledge-base]
approvals: []
owner: Toni Badertscher
created: 2026-10-30
blocked_from:
blocked_reason:
---

# SPEC-0021 — Run a read-only query service on a replica

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Roadmap ticket D of the architecture review (oms-core/docs/architecture-review-2026-10-30.md, findings 10 and 11): add a query runtime profile that disables the Kafka listener, the outbox relay, Liquibase and the command endpoints, sets the datasource read-only and reports replication lag in health; add a PostgreSQL logical replica to docker-compose and run a second oms-core instance against it as the query service; complete the OpenAPI query spec with executions by order, order history by order and tree by root so the hidden controllers become part of the contract.

## Log

- 2026-10-30 created
