# Mission Control Roadmap

## Phase 1: MVP (Done)

Core investigation system and infrastructure tooling.

- [x] Monorepo scaffold (pnpm + turborepo)
- [x] Mastra server with LibSQL storage
- [x] Configuration service (~/.mission-control/config.json)
- [x] Kubernetes adapter (6 tools)
- [x] Docker adapter (5 tools, start/stop with approval)
- [x] PostgreSQL adapter (3 tools, read-only)
- [x] Prometheus adapter (3 tools)
- [x] Shared tools (playbook search, timeline correlation, report formatting)
- [x] Investigation agents (supervisor + 4 specialists)
- [x] All agents/tools registered in Mastra
- [x] API routes (investigations, playbooks, adapters, config)
- [x] React UI scaffold with sidebar navigation
- [x] Dashboard view (summary cards, adapter status, recent investigations)
- [x] Investigation view (symptom input, timeline, report, polling)
- [x] Visual workflow builder (React Flow canvas, node palette, drag-and-drop)
- [x] Settings view (adapter configuration)
- [x] Sample playbooks (crashloop, latency, database)

## Phase 2: Investigation Hardening

Make the investigation system production-ready.

- [ ] **SSE streaming for investigations** — Real-time step-by-step progress instead of polling. Show which agent is currently working and what it found.
- [ ] **Approval UI** — Inline approval dialogs when agents want to run destructive tools (e.g. restart a container). Requires SSE streaming.
- [ ] **Investigation report parsing** — Parse structured reports from the supervisor agent (currently stores raw text as rootCause). Extract evidence, timeline, recommendations into structured fields.
- [ ] **Playbooks UI view** — Browse, edit, and create playbooks from the UI. API endpoints already exist.
- [ ] **Run history view** — Browse past investigations and workflow runs with filtering and search.
- [ ] **Investigation templates** — Quick-start buttons for common investigation types (pod issues, latency, database).

## Phase 3: Workflow Execution

Make the visual workflow builder functional end-to-end.

- [ ] **Workflow runtime compiler** — Compile visual workflow JSON definitions into executable Mastra workflows (`runtime/workflow-compiler.ts`).
- [ ] **Workflow validator** — Validate workflow definitions before compilation (connected graph, valid node types, required fields).
- [ ] **Workflow persistence** — Save/load workflow definitions to disk (~/.mission-control/workflows/).
- [ ] **Workflow execution** — Run compiled workflows from the builder UI, with progress tracking.
- [ ] **Workflow library** — Pre-built workflow templates (health check, deployment verification, capacity planning).
- [ ] **Suspend/resume in workflows** — Human-in-the-loop steps that pause workflow execution for approval or input.

## Phase 4: Deeper Infrastructure Integration

Expand adapter coverage and intelligence.

- [ ] **Loki adapter** — Query Loki for log aggregation (alternative to Docker log scraping).
- [ ] **Grafana adapter** — Embed or link to Grafana dashboards, query annotations.
- [ ] **Kafka adapter** — Consumer lag, topic inspection, message browsing.
- [ ] **OpenTelemetry adapter** — Trace inspection and correlation with investigations.
- [ ] **Adapter auto-discovery** — Detect available infrastructure from kubeconfig, docker socket, etc.
- [ ] **Custom adapter SDK** — Let users define new adapters as Mastra tool sets.

## Phase 5: Advanced Agent Capabilities

- [ ] **Agent memory** — Agents remember past investigations and learn from them. "This looks similar to the OOM issue we found last Tuesday."
- [ ] **Scheduled investigations** — Periodic health checks that run on a cron schedule.
- [ ] **Alert-triggered investigations** — Prometheus alertmanager webhook triggers automatic investigation.
- [ ] **Multi-cluster support** — Manage multiple K8s clusters, switch context in the UI.
- [ ] **Collaboration** — Share investigation reports, playbooks, and workflows with team members (export/import or simple multi-user).

## Phase 6: Polish & Integration

- [ ] **Terminal view** — xterm.js embedded terminal for ad-hoc commands during investigations.
- [ ] **Agent explorer view** — Browse registered agents, test with prompts, see tool bindings (beyond Mastra Studio).
- [ ] **Notification system** — Desktop notifications when investigations complete or need approval.
- [ ] **Developer Cockpit bridge** — Optional integration point so developer-cockpit can link to mission-control investigations from its monitoring view.
- [ ] **Theming** — Light mode, custom accent colors.

## Design Principles

These guide all roadmap decisions:

1. **Ops focus** — Mission Control is for operational tasks. SDLC features belong in Developer Cockpit.
2. **Agent-first** — New capabilities should be agent-powered, not manual UI features.
3. **Playbook-driven** — Investigations follow playbooks. Good playbooks = good investigations.
4. **Human-in-the-loop** — Destructive actions always require approval. Agents suggest, humans decide.
5. **Adapter-based** — New infrastructure integrations are Mastra tool sets, not custom code.
