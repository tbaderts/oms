# Mission Control

Multi-agent operational platform for incident investigation, infrastructure monitoring, and custom workflows. Built on [Mastra AI](https://mastra.ai).

**Companion to [Developer Cockpit](../developer-cockpit/):** Developer Cockpit handles SDLC (specs, coding, git). Mission Control handles ops (monitoring, debugging, incident response).

## Quick Start

```bash
# Install dependencies
pnpm install

# Terminal 1 — Server (Mastra + API)
cd packages/server
pnpm dev
# → http://localhost:3100 (Mastra Studio)

# Terminal 2 — UI
cd packages/ui
pnpm dev
# → http://localhost:5173 (Mission Control UI)
```

**Prerequisites:** Node.js 22+, pnpm 10+, `ANTHROPIC_API_KEY` environment variable.

## Architecture

```
mission-control/              pnpm monorepo + turborepo
├── packages/
│   ├── server/               Mastra app + Hono API
│   │   ├── src/mastra/
│   │   │   ├── agents/       5 investigation agents
│   │   │   └── tools/        20 infrastructure tools
│   │   ├── src/api/          REST API routes
│   │   ├── src/services/     Config, playbooks, investigations, health
│   │   └── playbooks/        Sample investigation playbooks
│   └── ui/                   React 19 + Vite + Tailwind CSS 4
│       └── src/
│           ├── views/         Dashboard, Investigations, Workflow Builder, Settings
│           ├── components/    Investigation UI, workflow builder nodes
│           ├── stores/        Zustand state management
│           └── api/           Type-safe API client
```

## Current Features (MVP)

### Investigation System

The core feature. Describe a symptom, and a supervisor agent coordinates 4 specialist agents to investigate:

| Agent | What it does | Tools |
|-------|-------------|-------|
| **Investigation Supervisor** | Coordinates investigation, matches playbooks, produces reports | search-playbooks, correlate-timeline, format-report |
| **Log Analyzer** | Searches container logs for errors and patterns | Docker: list-containers, get-logs, search-logs |
| **K8s Inspector** | Checks pod health, deployments, events | K8s: list-pods, pod-status, pod-logs, deployments, services, events |
| **DB Querier** | Queries PostgreSQL for entity states and anomalies | PG: execute-query, get-schema, search-entities |
| **Metrics Analyzer** | Queries Prometheus for resource/app metrics | Prom: query-metrics, query-range, get-alerts |

**How to use:**
1. Open Investigations view (`/investigations`)
2. Type a symptom (e.g. "pods restarting in production")
3. The supervisor agent matches a playbook, delegates to specialists, and produces a report
4. View the report with root cause, evidence, timeline, and recommendations

### Playbooks

Markdown files with frontmatter that guide investigations. Located in `packages/server/playbooks/`.

```markdown
---
title: Pod CrashLoopBackOff Investigation
triggers: [crashloop, restart, oomkill, crash]
priority: 10
---
## Investigation Steps
1. Check pod status...
```

Three sample playbooks included: pod crashloop, high latency, database connection issues.

### Infrastructure Adapters

Configure which infrastructure backends to connect to via Settings (`/settings`) or `~/.mission-control/config.json`:

| Adapter | Tools | Approval Required |
|---------|-------|-------------------|
| **Kubernetes** | list-pods, get-pod-status, get-pod-logs, list-deployments, list-services, get-events | No |
| **Docker** | list-containers, get-container-logs, search-logs, start-container, stop-container | start/stop only |
| **PostgreSQL** | execute-query (SELECT only), get-schema, search-entities | No |
| **Prometheus** | query-metrics, query-range, get-alerts | No |

### Visual Workflow Builder

Drag-and-drop canvas for composing multi-agent workflows (`/workflows`). Node types: Agent, Tool, Branch, Parallel, Approval, Input, Output. **Note:** designing workflows works; executing them is not yet wired (see roadmap).

### Dashboard

Summary cards (active investigations, adapters online), recent investigations, adapter connection status.

### Mastra Studio

Access at `http://localhost:3100` when the server is running. Provides a built-in UI for:
- Browsing all registered agents and tools
- Testing agents with ad-hoc prompts
- Inspecting tool schemas

## Configuration

Config lives at `~/.mission-control/config.json`. Created automatically on first run with sensible defaults. Edit via the Settings UI or directly.

Key settings:
- `ai.model` — LLM model for agents (default: `anthropic/claude-sonnet-4-6`)
- `ai.apiKey` — Anthropic API key (or set `ANTHROPIC_API_KEY` env var)
- `adapters.kubernetes.kubeconfig` — Path to kubeconfig file
- `adapters.docker.socketPath` — Docker socket (default: `/var/run/docker.sock`)
- `adapters.postgresql.connectionString` — Postgres connection string
- `adapters.prometheus.url` — Prometheus server URL

## API

All custom API routes are mounted under `/mc`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/mc/investigations` | List all investigations |
| GET | `/mc/investigations/:id` | Get investigation by ID |
| POST | `/mc/investigations` | Start new investigation `{ symptom: "..." }` |
| GET | `/mc/playbooks` | List playbooks |
| POST | `/mc/playbooks` | Create playbook `{ filename, content }` |
| GET | `/mc/adapters` | Get adapter health status |
| GET | `/mc/config` | Get config (secrets masked) |
| PUT | `/mc/config` | Update config (deep merge) |

Mastra's built-in API is also available (agents, tools, workflows) — see Swagger UI at `/swagger-ui`.

## Tech Stack

- **Mastra AI** (`@mastra/core`, `@mastra/server`, `@mastra/libsql`) — Agent framework
- **Hono** — API layer
- **React 19** + **Vite 6** — Frontend
- **Tailwind CSS 4** — Styling
- **React Flow** (`@xyflow/react`) — Visual workflow builder
- **Zustand** — State management
- **TypeScript** — Everything
- **pnpm workspaces** + **Turborepo** — Monorepo tooling
