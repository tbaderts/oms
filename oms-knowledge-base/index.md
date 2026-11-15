---
okf_version: "0.2"
---
# OMS Knowledge Base

Domain knowledge, requirements, architecture and ways of working of the Order Management System.
This folder is an Open Knowledge Format bundle; see [Knowledge Base Conventions](okf-conventions.md)
for the format and how to contribute.

**Where to start.** To learn what the OMS does and what is built, read the
[capabilities](capabilities/index.md). To change code, read the [architecture](architecture/index.md)
(especially its implementation patterns and decisions) and the [core framework](framework/index.md).
To understand an order, start with the [domain model](domain/model/index.md) and the
[order lifecycle](domain/concepts/order-lifecycle.md).

## Sections

- [Capabilities](capabilities/index.md) — what the OMS can do (implemented, partial, planned), with use cases, actors and functional and non-functional requirements
- [Domain](domain/index.md) — the domain model, the domain concepts and specifications, and the interfaces (command, query, REST read and message APIs)
- [Core OMS Framework](framework/index.md) — state machine, validation engine, task orchestrator, query engine, exception handling
- [Architecture](architecture/index.md) — system context and components, architecture concepts, decisions (ADRs), implementation patterns, technical debt, assessments, illustrations
- [Infrastructure](infrastructure/index.md) — local Docker stack, Cozystack/Kubernetes (planned), observability
- [User Interface](ui/index.md) — UI specifications and the design system
- [Tools](tools/index.md) — knowledge server (MCP), KB explorer, developer cockpit, mission control
- [Software Delivery](delivery/index.md) — spec-driven development, testing, CI/CD, release, manifesto, skills, AI-augmented development
- [Semantic Layer](semantic-layer/index.md) — how this knowledge base is organised and checked, the knowledge graph, review records
- [Archive](archive/index.md) — superseded documents kept for history; deprecated, do not build on them

Process journeys (storyboards) live in `storyboards/`, managed by the developer cockpit; they are
not part of the bundle.

## Conventions and history

- [Knowledge Base Conventions](okf-conventions.md) — the OKF conventions this bundle follows
- [Log](log.md) — notable changes, newest first
