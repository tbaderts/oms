---
okf_version: "0.2"
---
# OMS Knowledge Base

Domain knowledge, requirements and design of the Order Management System. This folder is an Open
Knowledge Format bundle; see [Knowledge Base Conventions](okf-conventions.md) for the format and how
to contribute. Start with the [capabilities](capabilities/index.md) to see what the OMS does and
what is planned.

## Capabilities and requirements

- [Capabilities](capabilities/index.md) — what the OMS can do, implemented, partial or planned
- [Functional Requirements](functional-requirements/index.md) — FR-nnn, one per document, traced to code and tests
- [Non-functional Requirements](non-functional-requirements/index.md) — NFR-nnn with metric and target

## System

- [Domain](domain/index.md) — order, execution, event, outbox, states, quantities, glossary
- [Interfaces](interfaces/index.md) — command and query APIs, REST read API, Kafka topics, Avro messages
- [Architecture](architecture/index.md) — system context, components, decisions

## Detailed specifications and papers

- [OMS Concepts](oms-concepts/index.md) — domain specifications and concept papers
- [OMS Framework](oms-framework/index.md) — technical frameworks: domain model, state machine, task orchestration, stores, validation, errors, contracts, testing
- [Illustrations](illustrations/index.md) — diagrams and visual specifications
- [User Interface](ui/index.md) — UI specifications

## Ways of working

- [Methodology](oms-methodolgy/index.md) — team values, roles, architecture methodology and AI-augmented development
- [OMS Knowledge Base Strategy](oms-knowledge-base-strategy.md) — how the knowledge base is organised and served to AI assistants
- [OMS Knowledge Base Review Report](KNOWLEDGE-BASE-REVIEW-REPORT.md) — review of the documents against the strategy and the code (February 2026)
- [Knowledge Base Conventions](okf-conventions.md) — the OKF conventions this bundle follows

## Change log

- [Log](log.md) — notable changes, newest first
