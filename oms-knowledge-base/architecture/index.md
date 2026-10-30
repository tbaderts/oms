# Architecture

How the OMS is put together: the system context, its components and the key decisions.

Back to the [knowledge base index](../index.md).

## Overview

- [System Context](system-context.md) — The OMS components, the infrastructure they use and how commands, events and queries flow between them.

## Components

- [Developer Cockpit](developer-cockpit.md) — Electron desktop tool for the spec workflow, the knowledge base and requirements.
- [Exchange Simulator](exchange-simulator.md) — Simulated venue that answers OMS orders with acks, fills, rejects and cancels.
- [KB Explorer](kb-explorer.md) — Vite/React web UI for browsing and searching the knowledge base through the MCP server.
- [MCP Server](mcp-server.md) — Spring AI MCP server exposing knowledge base and order search tools to AI assistants.
- [OMS UI](oms-ui.md) — React admin tool and trade blotter.
- [oms-contracts](oms-contracts.md) — Library holding the only copy of the OpenAPI and Avro contracts and the models generated from them.
- [oms-core](oms-core.md) — The Spring Boot core of the OMS: command processing, order state, event log, outbox, queries.
- [Streaming Service](streaming-service.md) — Spring Boot service that streams orders and executions to the UI over RSocket.

## Decisions

- [Decision: Event Sourcing with Snapshots](event-sourcing.md) — Orders keep current state in a table and every change as an event carrying a full snapshot.
- [Decision: One Contracts Module](contracts-module.md) — All OpenAPI and Avro contracts live in oms-contracts and nowhere else.
- [Decision: Shared-table CQRS](shared-table-cqrs.md) — Commands and queries have separate APIs and models but read and write the same tables.
- [Decision: Task Pipelines and a State Machine](task-pipeline-and-state-machine.md) — Every command runs as an ordered task pipeline, and state changes are validated by one state machine.
- [Decision: Transactional Outbox](transactional-outbox.md) — Kafka messages are staged in the database with the change and published by a relay.
