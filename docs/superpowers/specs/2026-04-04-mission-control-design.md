# Mission Control - Design Specification

**Date:** 2026-04-04
**Status:** Draft
**Author:** AI-assisted design session

---

## 1. Vision & Goals

Mission Control is a multi-agent operational platform built on Mastra AI. It is a companion to Developer Cockpit: where Developer Cockpit assists developers with coding-related tasks, Mission Control is the go-to tool for operational aspects -- incident investigation, release management, performance analysis, infrastructure planning, and custom multi-agent workflows.

### Goals

| # | Goal | Rationale |
|---|------|-----------|
| G1 | **Agent-powered operations** | Replace manual runbook execution with supervised multi-agent workflows |
| G2 | **Visual workflow builder** | Let users compose agents, tools, and control flow in a drag-and-drop UI |
| G3 | **Human-in-the-loop** | Critical/destructive actions require human approval before execution |
| G4 | **Investigation-first** | Incident investigation is the primary MVP use case and reference architecture |
| G5 | **Adapter-based infrastructure** | Pluggable adapters for K8s, Docker, PostgreSQL, Prometheus, and more |
| G6 | **Single-user, local** | Runs on localhost, no auth, one user at a time |
| G7 | **Independent deployment** | No runtime dependency on Developer Cockpit |

### Non-Goals (MVP)

| # | Non-Goal | Reason |
|---|----------|--------|
| NG1 | Multi-user / team features | Single-user local tool for MVP |
| NG2 | Production monitoring platform | Complements existing observability, does not replace it |
| NG3 | Visual builder code export | Workflows are compiled at runtime, not exported as TypeScript |
| NG4 | Developer Cockpit integration | Fully independent; integration can come later |

---

## 2. Architecture

### Deployment Model

Web application: Node.js + React, accessed via browser on localhost.

### Hybrid UI Strategy

- **Mastra Studio** for agent/workflow development and debugging during development
- **Custom React UI** as the primary user-facing operational dashboard

### System Architecture

```
mission-control/  (pnpm monorepo + turborepo)
├── packages/
│   ├── server/          # Mastra app + Hono API layer
│   └── ui/              # React app (Vite + Tailwind + shadcn)
├── package.json         # Workspace root
├── pnpm-workspace.yaml
└── turbo.json
```

```
┌─────────────────────────────────────────────────┐
│                  mission-control                 │
├────────────────────┬────────────────────────────┤
│   packages/server  │       packages/ui          │
│                    │                            │
│  Mastra Instance   │   React 19 + Vite          │
│  ├─ Agents         │   ├─ Dashboard             │
│  ├─ Tools          │   ├─ Investigation View    │
│  ├─ Workflows      │   ├─ Workflow Builder      │
│  └─ MCP Clients    │   ├─ Agent Registry        │
│                    │   ├─ Run History           │
│  API Layer (Hono)  │   └─ Settings              │
│  ├─ REST endpoints │                            │
│  ├─ WebSocket      │   Tailwind CSS 4           │
│  └─ SSE streams    │   shadcn/ui + Radix        │
│                    │   React Flow (builder)      │
│  Adapter Layer     │   xterm.js (agent output)   │
│  ├─ K8s adapter    │                            │
│  ├─ Docker adapter │                            │
│  └─ PG adapter     │                            │
└────────────────────┴───��────────────────────────┘
```

### Key Design Decisions

1. **Mastra as the engine** -- All agent orchestration, workflow execution, tool management, and multi-agent coordination run through Mastra. No custom agent runtime.
2. **Hono as the API layer** -- Lightweight, TypeScript-native. Mastra has built-in Hono integration via `@mastra/server`.
3. **Adapters as Mastra Tools** -- Each infrastructure adapter (K8s, Docker, PostgreSQL) is a set of Mastra tools. Agents use them natively; workflows call them as steps.
4. **React Flow for the visual builder** -- Industry-standard React library for node-based graph editors.
5. **Investigation as the reference workflow** -- The incident investigation supervisor agent is the first fully built multi-agent workflow.

### Monorepo Structure

```
mission-control/
├── packages/
│   ├── server/
│   │   ├── src/
│   │   │   ├── mastra/
│   │   │   │   ├── agents/          # Agent definitions
│   │   │   │   ├── tools/           # Tool definitions (adapters)
│   │   │   │   ├── workflows/       # Predefined workflows
│   │   │   │   └── index.ts         # Mastra instance
│   │   │   ├── api/                 # Hono routes
│   │   │   ├── runtime/             # Dynamic workflow compiler
│   │   │   └── index.ts             # Server entry
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── ui/
│       ├── src/
│       │   ├── components/          # Shared UI components
│       │   ├── views/               # Page-level views
│       │   ├── stores/              # Zustand state
│       │   ├── api/                 # API client
│       │   └── App.tsx
│       ├── package.json
│       └── vite.config.ts
├── package.json                     # Workspace root
├── pnpm-workspace.yaml
└── turbo.json
```

---

## 3. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Agent framework** | Mastra AI (`@mastra/core`) | TypeScript-native, supervisor agents, workflows, tools, human-in-the-loop |
| **Server** | Hono + `@mastra/server` | Built-in Mastra integration, lightweight |
| **Frontend** | React 19 + TypeScript | Dominant ecosystem, developer familiarity |
| **Build** | Vite | Fast dev server, optimized builds |
| **Styling** | Tailwind CSS 4 + shadcn/ui | Utility-first, accessible components |
| **State management** | Zustand | Minimal boilerplate, TypeScript-first |
| **Workflow builder** | React Flow | Node-based graph editor |
| **Agent output** | xterm.js | Terminal emulation for streaming agent output |
| **Charts** | Recharts | React-native charting |
| **Kubernetes** | `@kubernetes/client-node` | Official K8s client |
| **Docker** | dockerode | Docker Engine API client |
| **PostgreSQL** | pg | Standard PostgreSQL driver |
| **Prometheus** | prom-client + HTTP | Prometheus query API |
| **Monorepo** | pnpm workspaces + Turborepo | Fast, reliable monorepo tooling |
| **AI provider** | Anthropic (Claude) via Mastra model router | Default provider; pluggable |

---

## 4. Agents & Tools

### Agent Architecture

Supervisor agent pattern: a top-level supervisor delegates to specialized sub-agents.

```
┌────────────────────────────��─────┐
│     Investigation Supervisor     │
│  (orchestrates, reasons, asks    │
│   for human approval)            │
├──────────┬───────────┬───────────┤
│          │           │           │
▼          ▼           ▼           ▼
Log        K8s        Database   Metrics
Analyzer   Inspector  Querier    Analyzer
Agent      Agent      Agent      Agent
│          │           │           │
▼          ▼           ▼           ▼
Container  K8s        PostgreSQL  Prometheus
Log Tools  Tools      Tools       Tools
```

### Supervisor Agent

```typescript
const investigationSupervisor = new Agent({
  id: 'investigation-supervisor',
  name: 'Investigation Supervisor',
  instructions: `You are an incident investigation coordinator.
    Analyze symptoms, delegate to specialized agents, correlate
    findings across sources, and produce a root cause analysis.
    Request human approval before any destructive or write operations.
    Follow playbooks when available.`,
  model: 'anthropic/claude-sonnet-4-6',
  agents: { logAnalyzer, k8sInspector, dbQuerier, metricsAnalyzer },
  tools: { searchPlaybooks, correlateTimeline, formatReport },
})
```

### Sub-Agents (MVP)

| Agent | Description | Tools |
|-------|-------------|-------|
| **Log Analyzer** | Reads and analyzes container/pod logs, identifies error patterns, correlates timestamps | `getContainerLogs`, `searchLogs`, `getErrorContext` |
| **K8s Inspector** | Checks pod/deployment health, recent events, resource utilization, restart loops | `listPods`, `getPodStatus`, `getPodLogs`, `listDeployments`, `getEvents` |
| **Database Querier** | Runs read-only SQL queries, analyzes schema, searches for entities by ID | `executeQuery`, `getSchema`, `searchEntities` |
| **Metrics Analyzer** | Queries Prometheus, detects anomalies, correlates with events | `queryMetrics`, `getAlerts`, `getServiceHealth` |

### Tool Sets (Adapters)

Each infrastructure adapter is implemented as a set of Mastra tools:

**Kubernetes Tools:**
- `listPods` -- List pods with status, restarts, age
- `getPodStatus` -- Detailed pod status with conditions and events
- `getPodLogs` -- Read pod container logs with tail/filter
- `listDeployments` -- List deployments with replica status
- `listServices` -- List services with endpoints
- `getEvents` -- Get recent cluster events
- `getResourceUsage` -- Pod/node resource utilization

**Docker Tools:**
- `listContainers` -- List containers with status, ports, resource usage
- `getContainerLogs` -- Read container logs with tail/filter
- `searchLogs` -- Search across multiple container logs
- `getErrorContext` -- Find error with surrounding log context
- `startContainer` -- Start a container (`requireApproval: true`)
- `stopContainer` -- Stop a container (`requireApproval: true`)

**PostgreSQL Tools:**
- `executeQuery` -- Execute read-only SQL (SELECT only)
- `getSchema` -- Return database schema (tables, columns, types, FKs)
- `searchEntities` -- Search entities by type and filters
- `getEntityLifecycle` -- Full entity with events and relationships

**Prometheus Tools:**
- `queryMetrics` -- Instant PromQL query
- `queryRange` -- Range PromQL query with start/end/step
- `getAlerts` -- Get active alerts
- `getTargets` -- Get scrape target health

**Shared Tools:**
- `searchPlaybooks` -- Find relevant investigation playbooks by keyword
- `correlateTimeline` -- Cross-source correlation: gather events from all adapters into a unified timeline
- `formatReport` -- Structure findings into a standardized report

### Human-in-the-Loop

Tools performing write/destructive operations use Mastra's `requireApproval: true`. The UI renders an approval dialog when triggered. Users can approve, decline, or provide additional context.

---

## 5. Visual Workflow Builder

### Node Types

| Node Type | Visual | Purpose |
|-----------|--------|---------|
| **Agent Node** | Rounded, colored by agent | Invokes a registered agent with configurable prompt template |
| **Tool Node** | Rectangular, icon-coded | Calls a specific tool with configurable input mapping |
| **Workflow Node** | Double-bordered | Embeds a saved workflow as a sub-workflow |
| **Input Node** | Green circle | Workflow entry point, defines input schema |
| **Output Node** | Red circle | Workflow exit point, defines output schema |
| **Branch Node** | Diamond | Conditional routing based on previous step output |
| **Parallel Node** | Fork icon | Runs connected branches in parallel, merges results |
| **Approval Gate** | Shield icon | Suspends workflow, waits for human approval |
| **Map Node** | Transform icon | Maps/transforms data between steps |

### Canvas Layout

```
┌─────────────────────────────────────────────────────────┐
│ Toolbar: [Save] [Run] [Export] [Import]    Run Status   │
├──────────┬─────────────────────────────────────���────────┤
│ Palette  │           React Flow Canvas                  │
│          │                                              │
│ Agents   │   [Input]──>[Log Analyzer]──>[Branch]        │
│  ├─ Inv. │                               │    │         │
│  ├─ K8s  │                    [K8s Insp.]◄┘    │        │
│  ├─ DB   │                        │       [DB Querier]  │
│  └─ Met. │                        ▼            │        │
│          │                   [Approval]        │        │
│ Tools    │                        │            │        │
│  ├─ K8s  │                        ▼            ▼        │
│  ├─ Dock │                   [Parallel Merge]           │
│  └─ DB   │                        │                     │
│          │                   [Format Report]            │
│ Control  │                        │                     │
│  ├─ Brnc │                   [Output]                   │
│  ├─ Para │                                              │
│  ├─ Appr │                                              │
│  └─ Map  │                                              │
├──────────┴──────────────────────────────────────────────┤
│ Properties Panel (selected node configuration)          │
└─────────────────────────────────────────────────────────┘
```

### Workflow Definition Schema

```typescript
interface WorkflowDefinition {
  id: string
  name: string
  description: string
  inputSchema: JsonSchema
  outputSchema: JsonSchema
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

interface WorkflowNode {
  id: string
  type: 'agent' | 'tool' | 'workflow' | 'branch' | 'parallel' | 'approval' | 'map' | 'input' | 'output'
  position: { x: number; y: number }
  config: NodeConfig
}

interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  dataMapping?: Record<string, string>
}
```

### Runtime Compilation

1. **Validate** -- Check schema validity, ensure all referenced agents/tools exist. Return structured validation errors to the UI (missing agent, incompatible schema between connected nodes, orphan nodes, etc.)
2. **Build steps** -- Each node becomes a `createStep()` with appropriate schemas
3. **Wire control flow** -- Edges become `.then()`, `.branch()`, `.parallel()` calls
4. **Register** -- Compiled workflow registered with Mastra instance
5. **Persist** -- JSON definition saved to `~/.mission-control/workflows/`

Validation errors are surfaced in the UI as inline warnings on affected nodes/edges before the user can run the workflow.

### Execution Visualization

Status overlays on canvas nodes during execution:
- Grey: pending
- Blue pulse: running
- Green: completed
- Red: failed
- Amber: waiting for approval

---

## 6. Investigation System

### Flow

```
User describes symptom
        │
        ▼
Match Playbook (if available)
        │
        ▼
Supervisor Agent reasons about symptom + playbook
Delegates to sub-agents
        │
   ┌────┼────┬────────┐
   ▼    ▼    ▼        ▼
 Logs  K8s   DB    Metrics
   │    │    │        │
   └────┼────┴────────┘
        ▼
Supervisor correlates findings
May request more investigation
        │
        ▼ (if destructive action needed)
Human Approval
        │
        ▼
Final Report: root cause, evidence, timeline, recommendations
```

### Playbooks

Markdown files with YAML front-matter in `~/.mission-control/playbooks/`:

```yaml
---
title: "Pod CrashLoopBackOff Investigation"
triggers: [crashloop, restart, oomkill, crash, backoff]
priority: 10
---

## Investigation Steps
1. Check pod status and restart count
2. Read pod events for OOMKilled or error reasons
3. Pull last 200 lines of container logs before crash
4. Check resource limits vs actual usage
5. Look for recent deployments that changed the image or config
6. Query database for application-level errors near crash time
7. Check metrics for memory/CPU spikes
```

### Investigation Persistence

```typescript
interface Investigation {
  id: string
  symptom: string
  playbook?: string
  startedAt: string
  completedAt: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  steps: InvestigationStep[]
  approvals: ApprovalRecord[]
  report: {
    rootCause: string
    evidence: Evidence[]
    timeline: TimelineEntry[]
    recommendations: string[]
  }
  usage: { promptTokens: number; completionTokens: number }
}
```

### Investigation UI

- Symptom input with Start button
- Live investigation timeline showing each agent step with streaming output
- Expandable step details (tool calls, inputs, outputs)
- Inline approval dialogs when human-in-the-loop is triggered
- Final report section with root cause, evidence, timeline, recommendations
- History view for browsing past investigations

---

## 7. API Layer

### REST Endpoints

All prefixed with `/api/v1/`.

| Group | Endpoints | Purpose |
|-------|-----------|---------|
| **Agents** | `GET /agents`, `GET /agents/:id` | List/get registered agents |
| **Tools** | `GET /tools`, `GET /tools/:id` | List/get registered tools |
| **Workflows** | `GET /workflows`, `POST /workflows`, `PUT /workflows/:id`, `DELETE /workflows/:id` | CRUD workflow definitions |
| **Runs** | `POST /workflows/:id/run`, `GET /runs`, `GET /runs/:id` | Execute workflows, browse history |
| **Investigations** | `POST /investigations`, `GET /investigations`, `GET /investigations/:id` | Start/list/get investigations |
| **Approvals** | `GET /approvals/pending`, `POST /approvals/:id/approve`, `POST /approvals/:id/decline` | Human-in-the-loop |
| **Playbooks** | `GET /playbooks`, `GET /playbooks/:id`, `POST /playbooks`, `PUT /playbooks/:id` | Manage playbooks |
| **Adapters** | `GET /adapters`, `GET /adapters/:id/status` | List adapters, check connectivity |
| **Config** | `GET /config`, `PUT /config` | Read/update configuration |

### Real-time Streaming

**SSE** for workflow/investigation progress:
- `GET /api/v1/runs/:id/stream`
- `GET /api/v1/investigations/:id/stream`

Events: `step:started`, `step:output`, `step:completed`, `step:failed`, `approval:required`, `workflow:completed`

**WebSocket** (`/api/v1/ws`) for live adapter data (dashboard widgets).

### API Client

Type-safe client in the UI package consuming all endpoints with proper TypeScript types.

---

## 8. UI Views

### Navigation

Sidebar with views:
- **Dashboard** -- Operational overview: active investigations, pending approvals, recent runs, adapter health
- **Investigations** -- Start/browse/view investigations with live streaming
- **Workflow Builder** -- Visual workflow editor with React Flow
- **Agents** -- Browse registered agents, test with ad-hoc prompts
- **Run History** -- Browse all workflow/investigation runs
- **Playbooks** -- Browse, create, edit investigation playbooks
- **Settings** -- Configure adapters, AI provider, paths

### Status Bar

Shows adapter connectivity: K8s, Docker, PostgreSQL, Prometheus (green/red indicators).

### Dashboard

- Summary cards: Active investigations, Pending approvals, Runs today, Adapters online
- Pending approvals list with inline Approve/Decline buttons
- Recent activity feed

---

## 9. Configuration

Stored at `~/.mission-control/config.json`:

```json
{
  "server": { "port": 3100 },
  "ai": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-6",
    "apiKey": "${MC_AI_API_KEY}"
  },
  "adapters": {
    "kubernetes": {
      "enabled": true,
      "kubeconfig": "~/.kube/config",
      "defaultNamespace": "default"
    },
    "docker": {
      "enabled": true,
      "socketPath": "/var/run/docker.sock"
    },
    "postgresql": {
      "enabled": true,
      "connectionString": "${MC_PG_CONNECTION}"
    },
    "prometheus": {
      "enabled": false,
      "url": "http://localhost:9090"
    }
  },
  "playbooks": { "path": "~/.mission-control/playbooks" },
  "workflows": { "path": "~/.mission-control/workflows" },
  "investigations": { "path": "~/.mission-control/investigations" }
}
```

### File System Layout

```
~/.mission-control/
├── config.json
├── playbooks/
│   ├── pod-crashloop.md
│   ├── high-latency.md
│   └── database-connection.md
├── workflows/
│   ├── incident-investigation.json
│   └── deploy-checklist.json
└── investigations/
    ├── inv-2026-04-04-abc123.json
    └── inv-2026-04-03-def456.json
```

---

## 10. Future Roadmap (Post-MVP)

| Phase | Features |
|-------|----------|
| **Phase 2** | Kafka adapter, RabbitMQ adapter, additional investigation playbooks |
| **Phase 3** | Release management workflows, deployment supervision agents |
| **Phase 4** | Performance analysis agents, anomaly detection workflows |
| **Phase 5** | Infrastructure planning workflows, capacity analysis |
| **Phase 6** | Developer Cockpit API integration, shared configuration |
| **Phase 7** | Multi-user support, role-based access, team workflows |
| **Phase 8** | Workflow template marketplace, community playbooks |
