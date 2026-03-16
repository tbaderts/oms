# 10 - Implementation Guide

A phased build plan for bootstrapping the Developer Cockpit from scratch. Each phase produces a working increment. Phases are ordered by dependency and value.

---

## Phase 0: Skeleton & Infrastructure (Foundation)

**Goal**: Runnable app with sidebar navigation, settings, and WebSocket connection.

### Tasks

- [ ] Initialize project (package.json / Cargo.toml / build.gradle)
- [ ] Set up frontend build (Vite + React + TypeScript)
- [ ] Set up backend server (Express/Fastify or equivalent)
- [ ] Implement `ConfigService` -- load/save config.json and secrets.env
- [ ] Implement `WatcherService` -- file watching with debounce
- [ ] Implement WebSocket server with event bus
- [ ] Build shell layout: sidebar, main content area, status bar
- [ ] Build sidebar navigation with collapsible groups and view switching
- [ ] Implement command palette (Ctrl+K) with fuzzy search
- [ ] Build Settings view with all configuration sections
- [ ] Implement theme support (light/dark/system)
- [ ] Set up client-side WebSocket connection with auto-reconnect
- [ ] Set up error boundary and "Not Connected" states for infrastructure views

### Deliverable
App starts, sidebar navigates between placeholder views, settings are persisted, WebSocket connects.

---

## Phase 1: Knowledge & Documentation (Read-Only Value)

**Goal**: Browse project documentation and requirements -- immediate value for any team.

### Tasks

- [ ] Implement `KbService` -- directory scanning, document parsing, keyword search
- [ ] Build Knowledge Base view:
  - [ ] Category tree (left panel)
  - [ ] Document viewer with markdown rendering
  - [ ] Mermaid diagram support
  - [ ] Auto-generated table of contents
  - [ ] Metadata banner (status, author, version, tags)
  - [ ] Search bar with results
- [ ] Wire `kb:changed` event for live reload
- [ ] Implement `RequirementsService` -- parse UC, FR, NFR, Actor documents
- [ ] Build Requirements Explorer view:
  - [ ] Use Cases sub-tab with functional area tree
  - [ ] Functional Requirements sub-tab with table view
  - [ ] Non-Functional Requirements sub-tab with card view
  - [ ] Actors sub-tab with card view
  - [ ] Cross-view navigation (links between tabs and to KB)
- [ ] Implement `FsService` with path security
- [ ] Build File Explorer view:
  - [ ] File tree with expand/collapse
  - [ ] Content viewer with syntax highlighting (Monaco/CodeMirror)
  - [ ] Breadcrumb navigation

### Deliverable
Team can browse all project documentation, requirements, and source files in one place.

---

## Phase 2: Spec Dashboard (Planning Value)

**Goal**: Track feature specs with progress metrics.

### Tasks

- [ ] Implement `SpecService` -- scan specs, parse front-matter, track task progress
- [ ] Build Dashboard view:
  - [ ] Summary metric cards (total, in-progress, completed, task completion %)
  - [ ] Pie chart for status distribution
  - [ ] Bar chart for specs per module
  - [ ] Filterable spec table
- [ ] Build Spec Detail panel:
  - [ ] Rendered proposal.md
  - [ ] Rendered design.md
  - [ ] Rendered tasks.md with progress bar
- [ ] Wire `specs:changed` event for live reload
- [ ] Implement `RoadmapService` -- parse roadmap YAML
- [ ] Build Roadmap view:
  - [ ] Gantt chart with epics and work items
  - [ ] Milestone diamonds
  - [ ] Zoom levels (week/month/quarter)
  - [ ] Click for detail panel

### Deliverable
Full planning visibility -- specs, progress, roadmap in one interface.

---

## Phase 3: Source Control Integration (Build Value)

**Goal**: Browse MRs, issues, pipelines, and workspace status.

### Tasks

- [ ] Define `SCMAdapter` interface
- [ ] Implement `GitLabAdapter` (or `GitHubAdapter` depending on your SCM)
- [ ] Implement `SCMService` wrapping the adapter
- [ ] Build SCM Browser view:
  - [ ] Merge Requests sub-tab with table and detail expansion
  - [ ] Issues sub-tab with filters
  - [ ] Pipelines sub-tab with status indicators and job drill-down
- [ ] Implement `WorkspaceService` -- multi-repo git scanning
- [ ] Build Workspace view:
  - [ ] Repository cards with branch, status, ahead/behind
  - [ ] Color-coded borders (clean/dirty/behind)
  - [ ] Quick actions (pull, push)

### Deliverable
No more switching to GitLab/GitHub web UI for routine checks.

---

## Phase 4: Infrastructure Views (Monitor Value)

**Goal**: Container, Kubernetes, message bus, and database monitoring.

### Tasks

#### Containers
- [ ] Define `ContainerAdapter` interface
- [ ] Implement `DockerCLIAdapter` (or `PodmanCLIAdapter`)
- [ ] Build Containers view:
  - [ ] Container table with status, ports, resource usage
  - [ ] Log viewer with streaming, filtering, colorization
  - [ ] Start/stop/restart actions

#### Kubernetes
- [ ] Implement `KubernetesService`
- [ ] Build Kubernetes view:
  - [ ] Pods sub-tab with status, restarts, log viewer
  - [ ] Deployments sub-tab
  - [ ] Services sub-tab
  - [ ] Namespace selector

#### Message Bus
- [ ] Define `MessageBusAdapter` interface
- [ ] Implement `KafkaAdapter`
- [ ] Build Message Bus view:
  - [ ] Topics sub-tab with topic list and metadata
  - [ ] Messages sub-tab with offset controls and message expansion
  - [ ] Consumer Groups sub-tab with lag display
  - [ ] Schema registry browser (if available)

#### Database
- [ ] Define `DatabaseAdapter` interface
- [ ] Implement `PostgreSQLAdapter`
- [ ] Build Database view:
  - [ ] Schema browser (tree: database > schema > tables)
  - [ ] Query editor (Monaco with SQL syntax)
  - [ ] Results grid (sortable, filterable)
  - [ ] Query history (persisted)

### Deliverable
Full infrastructure visibility without external tools.

---

## Phase 5: AI Features (Intelligence Value)

**Goal**: AI-powered explanations, analysis, sessions, and investigation.

### Tasks

#### AI Provider
- [ ] Define `AIAdapter` interface
- [ ] Implement `AnthropicAdapter` (or `OpenAIAdapter`)
- [ ] Implement `AIService` with streaming support
- [ ] Wire AI streaming to WebSocket (`ai:stream` events)
- [ ] Implement cost tracking (optional)

#### Single-Turn Features
- [ ] Message Bus Explainer -- "Explain" button on expanded messages
- [ ] Query Result Analyzer -- "Analyze" button on query results
- [ ] Natural Language to SQL -- text input above query editor
- [ ] Entity Lifecycle Narrator -- "Narrate" button on lifecycle view (if applicable)

#### Sessions
- [ ] Implement `SessionManager` with PTY support
- [ ] Build Sessions view:
  - [ ] Session list (left rail)
  - [ ] Terminal emulator (xterm.js)
  - [ ] New session dialog with configuration
  - [ ] Session lifecycle (start/stop/restart/kill)

#### Reviews
- [ ] Implement `ReviewService`
- [ ] Build Reviews view:
  - [ ] Review list grouped by module
  - [ ] Report viewer with rendered markdown
  - [ ] "New Review" dialog for launching headless AI reviews

#### Investigator
- [ ] Implement playbook loading and trigger matching
- [ ] Implement environment detection
- [ ] Implement investigation tool set (database, logs, messages, correlation)
- [ ] Implement agentic investigation loop with max turns
- [ ] Wire investigation progress to WebSocket
- [ ] Build Investigate UI:
  - [ ] Symptom input with "Investigate" button
  - [ ] Progress panel with expandable steps
  - [ ] Conclusion panel with root cause, evidence, timeline

### Deliverable
AI-native developer experience across all views.

---

## Phase 6: Flight Deck (Workflow Value)

**Goal**: Mission-based workflow tying everything together.

### Tasks

- [ ] Implement `FlightDeckService` -- mission lifecycle management
- [ ] Build Flight Deck view:
  - [ ] Preflight wizard (ticket selection, repo selection, checks, branch creation)
  - [ ] Active mission display (metadata, status, quick links)
  - [ ] Landing checklist (git, MR, docs, ticket checks with action buttons)
  - [ ] Mission history
- [ ] Implement Team Briefing (AI-generated situational awareness)
- [ ] Wire mission status to status bar indicator

### Deliverable
Guided feature development workflow from ticket to merge request.

---

## Phase 7: Polish & Extension (Production Quality)

**Goal**: Refinement, performance, and extensibility.

### Tasks

- [ ] Implement plugin architecture (custom views, custom investigation tools)
- [ ] Add keyboard shortcuts (configurable)
- [ ] Add breadcrumb navigation
- [ ] Add notification system (toast messages)
- [ ] Performance: virtualize long lists and large tables
- [ ] Performance: lazy-load views
- [ ] Accessibility: keyboard navigation, screen reader labels, focus management
- [ ] Add configuration profiles for multiple projects
- [ ] Write user documentation (in-app help or built-in KB doc)
- [ ] If desktop: package with Electron or Tauri

### Deliverable
Production-quality developer tool ready for daily use.

---

## Summary Timeline

| Phase | Name | Estimated Effort | Cumulative Value |
|-------|------|-----------------|-----------------|
| 0 | Skeleton & Infrastructure | Small | Foundation |
| 1 | Knowledge & Documentation | Medium | Read-only value |
| 2 | Spec Dashboard | Medium | Planning visibility |
| 3 | Source Control | Medium | Build workflow |
| 4 | Infrastructure Views | Large | Full monitoring |
| 5 | AI Features | Large | Intelligence layer |
| 6 | Flight Deck | Medium | Guided workflow |
| 7 | Polish & Extension | Medium | Production quality |

Each phase can be delivered independently. Phases 0-2 provide immediate value with minimal effort. Phases 4-5 are the largest but deliver the most differentiated features.

---

## Bootstrap Prompt (For AI Agents)

If using an AI agent to bootstrap the implementation, provide this context:

```
You are building a Developer Cockpit -- a unified browser-based workbench for
software developers. Read the specification documents in this directory:

- 01-vision.md: Product goals and principles
- 02-information-architecture.md: Navigation and layout
- 03-features.md: Detailed feature specs for every view
- 04-backend-services.md: Backend service APIs
- 05-data-model.md: Data models and persistence
- 06-realtime.md: WebSocket event architecture
- 07-ai-integration.md: AI features and investigator
- 08-extension-points.md: Adapter interfaces and plugins
- 09-tech-stack-options.md: Technology choices
- 10-implementation-guide.md: This phased build plan

Start with Phase 0 tasks. Use [chosen tech stack from 09]. Follow the
adapter interfaces from 08 so external systems are pluggable. Implement
the WebSocket protocol from 06 for real-time updates. Reference the data
models from 05 for all data structures.

Work through the phases in order, completing all tasks in each phase
before moving to the next.
```
