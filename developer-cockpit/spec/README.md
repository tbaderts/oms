# Developer Cockpit - Generic Blueprint Specification

A comprehensive, architecture-agnostic specification for building a **Developer Cockpit**: a unified browser-based (or desktop) workbench that consolidates spec-driven development, knowledge base browsing, infrastructure monitoring, AI-assisted code sessions, and incident investigation into a single interface.

This spec is designed so that an AI agent (or human team) can bootstrap a complete implementation from scratch on any technology stack (Electron, Tauri, web app, etc.).

## Documents

| Document | Purpose |
|----------|---------|
| [01-vision.md](./01-vision.md) | Product vision, goals, target users, principles |
| [02-information-architecture.md](./02-information-architecture.md) | Navigation structure, views, layout patterns |
| [03-features.md](./03-features.md) | Detailed feature specifications for every view |
| [04-backend-services.md](./04-backend-services.md) | Backend service catalogue, APIs, responsibilities |
| [05-data-model.md](./05-data-model.md) | Data model, configuration, persistence strategy |
| [06-realtime.md](./06-realtime.md) | Real-time update architecture (WebSocket/SSE) |
| [07-ai-integration.md](./07-ai-integration.md) | AI features: sessions, investigator, explainers |
| [08-extension-points.md](./08-extension-points.md) | Plugin system, custom views, adapters |
| [09-tech-stack-options.md](./09-tech-stack-options.md) | Reference architectures for Web, Electron, Tauri |
| [10-implementation-guide.md](./10-implementation-guide.md) | Phased build plan with task checklists |
