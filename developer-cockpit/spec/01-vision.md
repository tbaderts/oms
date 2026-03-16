# 01 - Vision & Principles

## 1. What Is the Developer Cockpit?

A **Developer Cockpit** is a unified workbench that gives a single developer (or small team) a single-pane-of-glass view across the full software development lifecycle:

- **Plan** -- specs, requirements, roadmap
- **Build** -- AI coding sessions, code reviews, source control
- **Monitor** -- containers, clusters, message buses, databases
- **Debug** -- AI-powered incident investigation with cross-source correlation

It replaces the constant tab-switching between GitLab, Grafana, pgAdmin, Kafka UI, terminal windows, and documentation wikis with one cohesive interface.

## 2. Goals

| # | Goal | Rationale |
|---|------|-----------|
| G1 | **Single pane of glass** | Reduce context-switching overhead by 80%+ |
| G2 | **Filesystem-first** | No external database for core functionality; all state derives from files on disk (specs, docs, config) |
| G3 | **AI-native** | AI is not bolted on -- it is a first-class capability woven into every view |
| G4 | **Adaptable to any project** | Generic enough to work for any codebase, not tied to a specific domain |
| G5 | **Offline-capable core** | Knowledge base, specs, file explorer work without network access |
| G6 | **Real-time** | File changes, container events, and AI streams push to the UI instantly |
| G7 | **Low ceremony** | Adding a new doc, playbook, or spec should require creating a markdown file, nothing more |

## 3. Target Users

| Persona | Description |
|---------|-------------|
| **Solo Developer** | Uses the cockpit as their daily driver for a personal or side project |
| **Team Lead** | Uses the Flight Deck and Dashboard to track spec progress across the team |
| **On-Call Engineer** | Uses the Investigator to diagnose production incidents |
| **New Joiner** | Uses the Knowledge Base and Requirements Explorer to onboard |

## 4. Design Principles

### 4.1 Filesystem-First

All mutable state lives on the filesystem:

- **Specs** are markdown files in `<module>/specs/<ticket>/`
- **Knowledge base** documents are markdown files in a configurable directory
- **Playbooks** are markdown files with YAML front-matter
- **Configuration** is a JSON file in `~/.developer-cockpit/config.json`
- **Mission state** is a JSON file in `~/.developer-cockpit/missions.json`

The cockpit watches these paths with a file watcher (e.g., chokidar, fsnotify) and pushes changes to the UI via WebSocket. There is no database for core features.

### 4.2 Convention over Configuration

The cockpit discovers content by following naming conventions:

| Content | Convention |
|---------|-----------|
| Spec folders | `<module>/specs/<TICKET-ID>_<title>/` containing `proposal.md`, `design.md`, `tasks.md` |
| Knowledge base | Markdown files organized in category directories with YAML front-matter |
| Playbooks | Markdown files in a `playbooks/` directory with `title`, `triggers`, `priority` front-matter |
| Review reports | Markdown files in `<module>/docs/reviews/` |
| Requirements | Structured markdown in `requirements/use-cases/`, `requirements/functional-requirements/`, etc. |

### 4.3 Adapter Pattern for External Systems

Every external system (GitLab, GitHub, Kubernetes, Docker, Kafka, PostgreSQL, etc.) is accessed through an **adapter interface**. Swapping GitLab for GitHub, or Docker for Podman, means implementing a new adapter -- not rewriting view code.

### 4.4 AI as a Tool Layer

AI features are exposed through a uniform `AIService` abstraction:

- Single-turn calls (explain, analyze, narrate)
- Multi-turn agentic loops (investigator)
- Streaming CLI sessions (Claude Code, Copilot, Aider, etc.)

The AI provider (Anthropic, OpenAI, local models) is pluggable.

### 4.5 Progressive Disclosure

Views start simple and reveal complexity on demand:

- Dashboard shows summary metrics; click a spec to see details
- Database view shows schema; run a query to see results; click "Analyze" for AI insights
- Kafka view shows topics; expand a message for payload; click "Explain" for AI context

## 5. Non-Goals

| # | Non-Goal | Reason |
|---|----------|--------|
| NG1 | Replace the IDE | The cockpit complements VS Code/IntelliJ, it does not replace code editing |
| NG2 | Multi-tenant SaaS | This is a local developer tool, not a hosted platform |
| NG3 | Full CI/CD orchestration | The cockpit monitors pipelines; it does not replace GitLab CI or GitHub Actions |
| NG4 | Production monitoring | It can connect to staging/dev clusters; it is not an observability platform |
