# Mastra Studio vs Mission Control — When to Use What

## What is Mastra?

Mastra is a TypeScript framework for building AI agent applications. When you run `mastra dev`, you get:

1. **A server** (default port 4111, we use 3100) that hosts your agents, tools, and workflows
2. **Mastra Studio** — a built-in web UI for development and testing
3. **A REST API** — auto-generated endpoints for all registered agents, tools, and workflows
4. **Swagger UI** — API documentation at `/swagger-ui`

### What Mastra Studio gives you for free

| Capability | How it works |
|------------|-------------|
| **Agent chat** | Send ad-hoc prompts to any registered agent via a chat UI |
| **Tool testing** | Test any tool independently with custom inputs, see outputs |
| **Workflow execution** | Run workflows step-by-step, inspect intermediate state |
| **Agent listing** | Browse all registered agents with their descriptions and tool bindings |
| **Tool listing** | Browse all registered tools with their schemas |
| **REST API** | `POST /api/agents/{id}/generate` — call any agent programmatically |
| **Streaming** | Built-in support for streaming agent responses |
| **Swagger UI** | Interactive API docs for all endpoints |

### What Mastra does NOT give you

- No concept of **investigations** — there's no way to describe a symptom and have agents coordinate to diagnose it
- No **playbooks** — no structured guides that agents follow for specific scenarios
- No **investigation history** — no persistence of past investigations and their reports
- No **infrastructure health dashboard** — no overview of which adapters are connected
- No **visual workflow builder** — Studio lets you run workflows but not design them visually
- No **adapter configuration UI** — no way to configure K8s/Docker/PG/Prometheus connections
- No **domain-specific orchestration** — the supervisor agent pattern (delegate to specialists, correlate findings, produce reports) is our design, not a Mastra feature

## Does Mastra work standalone?

**Yes.** You can run `mastra dev` and use Studio + the REST API without Mission Control's UI at all. Everything we registered (agents, tools) is accessible:

```bash
# Chat with the investigation supervisor directly
curl -X POST http://localhost:3100/api/agents/investigationSupervisor/generate \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "pods are restarting in production"}]}'

# Test a tool independently
# (via Studio UI or Swagger)

# List all agents
curl http://localhost:3100/api/agents
```

This is useful for development and debugging, but it's a raw developer experience — you're talking directly to agents via API calls or Studio's generic chat UI.

## What Mission Control adds

Mission Control is NOT just an abstraction layer. It adds domain-specific value on top of Mastra:

### 1. Investigation orchestration

The supervisor agent pattern — describe a symptom, match a playbook, delegate to specialists, correlate findings, produce a structured report — is Mission Control's design. Mastra provides the agent framework; we provide the investigation workflow.

### 2. Playbook system

Markdown playbooks with frontmatter that guide investigations. The `search-playbooks` tool lets the supervisor agent find and follow relevant playbooks. This is our domain logic, not a Mastra feature.

### 3. Investigation persistence & history

Investigations are saved as JSON files, assigned IDs, tracked through states (running → completed/failed). The API and UI let you browse past investigations and their reports. Mastra has no concept of this.

### 4. Adapter health monitoring

The dashboard shows which infrastructure backends are connected. The health check service probes K8s, Docker, PostgreSQL, and Prometheus. This is ops-specific tooling.

### 5. Visual workflow builder

React Flow canvas for designing multi-agent workflows by dragging and connecting nodes. Mastra Studio lets you run existing workflows; Mission Control lets you design new ones visually.

### 6. Operational UI

Purpose-built views for ops work: symptom input → agent investigation → structured report. This is fundamentally different from Studio's generic "chat with an agent" UI.

### 7. Configuration management

Centralized config for all adapters, persisted to `~/.mission-control/config.json`, with a settings UI. Mastra has no equivalent — tool configuration is hard-coded.

## When to use what

| I want to... | Use |
|--------------|-----|
| Investigate an incident with a structured report | **Mission Control UI** (`/investigations`) |
| See which infrastructure adapters are connected | **Mission Control UI** (`/` dashboard) |
| Design a multi-agent workflow visually | **Mission Control UI** (`/workflows`) |
| Configure adapter connections | **Mission Control UI** (`/settings`) |
| Test a single agent with an ad-hoc prompt | **Mastra Studio** |
| Test a single tool with custom inputs | **Mastra Studio** |
| Debug agent tool calls and responses | **Mastra Studio** |
| Explore the auto-generated REST API | **Swagger UI** (`/swagger-ui`) |
| Call agents programmatically from another service | **Mastra REST API** (`/api/agents/{id}/generate`) |
| Develop and iterate on agent instructions | **Mastra Studio** |

## Summary

**Mastra** = agent framework + dev tools. Generic, powerful, developer-facing.

**Mission Control** = ops platform built ON Mastra. Domain-specific, user-facing, adds investigation orchestration, playbooks, persistence, health monitoring, visual workflow design, and operational UI.

You need Mastra (it's the engine). Mission Control is the ops-focused application that gives that engine a purpose. Dropping Mission Control and using only Mastra Studio would mean losing everything that makes it an operational tool — you'd just have agents you can chat with.
