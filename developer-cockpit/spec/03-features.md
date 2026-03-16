# 03 - Feature Specifications

This document specifies the behavior of every view in the Developer Cockpit. Each feature is described with: purpose, UI layout, data sources, user interactions, and AI integrations.

---

## 1. Dashboard

### Purpose
Sprint-level overview of all specification work across the project.

### Data Source
Filesystem scan of `<module>/specs/` directories. Each spec folder contains:
- `proposal.md` -- YAML front-matter with `ticket_id`, `title`, `status`, `category`, `classification`, `story_points`
- `design.md` -- architecture document
- `tasks.md` -- checklist with `- [x]` / `- [ ]` items

### UI Layout (Dashboard Grid)

**Top row -- Summary cards:**
| Card | Value |
|------|-------|
| Total Specs | Count of all spec folders |
| In Progress | Specs with status `in_progress` |
| Completed | Specs where all tasks are checked |
| Task Completion | Aggregate % of checked tasks across all specs |

**Middle row -- Charts:**
- **Pie chart**: Spec status distribution (proposal_only, design_ready, in_progress, completed)
- **Bar chart**: Specs per module

**Bottom -- Spec Table:**

| Column | Source |
|--------|--------|
| Ticket ID | Front-matter `ticket_id` |
| Title | Front-matter `title` |
| Module | Parent directory name |
| Status | Derived from artifact presence and task completion |
| Tasks | `checked/total` with progress bar |
| Category | Front-matter `category` |
| Classification | Front-matter `classification` |

**Filters**: status dropdown, module dropdown, free-text search on title/ticket ID.

### Interactions
- Click a row to open **Spec Detail** panel (right side or overlay)
- Spec Detail shows rendered proposal, design, and tasks with live-reload
- Status auto-derives:
  - `proposal_only` -- only proposal.md exists
  - `design_ready` -- design.md exists, no tasks.md
  - `in_progress` -- tasks.md exists with unchecked items
  - `completed` -- all items in tasks.md are checked

### Live Updates
File watcher on `*/specs/**` triggers `specs:changed` WebSocket event; UI re-fetches spec list.

---

## 2. Flight Deck

### Purpose
Mission-based operational workflow for feature development. Guides developers through a structured lifecycle from ticket selection to merge request creation.

### Mission Lifecycle

```
Preflight --> Active --> Landing --> Completed
```

#### Phase 1: Preflight (Setup)

**Steps:**
1. **Select Ticket** -- Enter ticket ID or pick from assigned issues (via SCM adapter)
2. **Select Target Repositories** -- Choose which repos/modules will be touched
3. **Run Preflight Checks** -- Validates:
   - Ticket exists in the issue tracker
   - Feature branch exists (locally, remotely, or needs creation)
   - Working directory is clean
4. **Execute Actions** -- Create branch, fetch, checkout as needed
5. **Start Mission** -- Persists mission to `~/.developer-cockpit/missions.json`

**UI**: Step-by-step wizard with status indicators (pending, pass, fail, action needed).

#### Phase 2: Active Mission

**Displays:**
- Mission metadata: ticket ID, title, URL, branch name, target repos
- Status badge with color coding:
  - Blue: preflight
  - Green: active
  - Amber: landing
  - Grey: completed
- Quick links to: spec folder, SCM branch, pipeline status

**Actions available during active phase:**
- Open spec in Dashboard detail view
- Launch AI session
- Navigate to any other cockpit view (context preserved)

#### Phase 3: Landing (Touchdown Checklist)

Verifies readiness before closing the mission:

| Category | Checks | Auto-Fix Actions |
|----------|--------|-----------------|
| **Git** | No uncommitted changes, no unpushed commits | Push branch |
| **Merge Request** | MR/PR exists for each target repo | Create MR/PR |
| **Documentation** | Spec artifacts present and complete | Navigate to missing artifact |
| **Ticket** | Labels updated (e.g., "Review") | Update labels via SCM adapter |

Each check shows pass/fail with an action button for remediation.

#### Phase 4: Completed

Mission archived. Visible in mission history with summary metrics.

### Team Briefing (Optional)

AI-generated situational awareness report:
- Fetches recent MRs, failed pipelines, open issues from SCM adapter
- Sends to AI service for summary
- Highlights: stale MRs, pipeline failures, blocked work, team patterns

### Data Persistence
```json
// ~/.developer-cockpit/missions.json
{
  "missions": [
    {
      "id": "uuid",
      "ticketId": "PROJ-123",
      "title": "Add user authentication",
      "branch": "feature/PROJ-123",
      "targetRepos": ["backend", "frontend"],
      "status": "active",
      "startedAt": "2026-03-15T10:00:00Z",
      "completedAt": null,
      "checks": { "git": "pass", "mr": "pending", "docs": "pass", "ticket": "pending" }
    }
  ]
}
```

---

## 3. Sessions

### Purpose
Launch and manage AI coding sessions with embedded terminal emulation.

### UI Layout (Terminal Embed)

**Left rail -- Session list:**
- Each session shows: name, status (running/idle/exited), duration
- "New Session" button with configurable parameters

**Right panel -- Terminal:**
- Full PTY-backed terminal (xterm.js or equivalent)
- Streams stdout/stderr from the AI CLI process in real-time
- Supports ANSI colors, cursor movement, interactive input

### Session Configuration
| Parameter | Description | Example |
|-----------|-------------|---------|
| Working Directory | Where the session runs | `/home/user/project` |
| CLI Tool | Which AI CLI to invoke | `claude-code`, `aider`, `copilot-cli` |
| Initial Prompt | Optional starting instruction | "Fix the failing tests in auth module" |
| Model | AI model to use | `claude-sonnet-4-6`, `gpt-4o` |
| Environment Variables | Extra env vars for the session | `DEBUG=true` |

### Session Lifecycle
1. User clicks "New Session" and fills config
2. Backend spawns child process with PTY (node-pty or equivalent)
3. PTY output streams to UI via WebSocket
4. User can type into the terminal for interactive sessions
5. Session can be stopped, restarted, or terminated
6. Output is retained in memory for the session lifetime (scrollback buffer)

### Interactions
- Click session in list to switch displayed terminal
- Right-click session for: Stop, Restart, Kill, Copy Output
- Session output is searchable (Ctrl+F within terminal)

---

## 4. Reviews

### Purpose
Browse AI-generated code review reports and launch new reviews.

### Data Source
Markdown files in `<module>/docs/reviews/` named with timestamps (e.g., `2026-03-15_ri-oms-core_review.md`).

### UI Layout (Master-Detail)

**Left panel -- Review list:**
- Grouped by module
- Each entry: date, module, health score badge (1-10), title
- Sort by date (newest first)

**Right panel -- Report viewer:**
- Rendered markdown with:
  - Executive Summary with health score
  - Findings table with severity indicators
  - File:line references (clickable, navigate to File Explorer)
  - Recommendations list

### Launch New Review

**"New Review" dialog:**
| Field | Options |
|-------|---------|
| Scope | Module review / MR review |
| Target | Module name or MR/PR ID |
| Focus | General / Security / Performance / Architecture |
| Output Directory | Default: `<module>/docs/reviews/` |

Launches a background AI session (headless) that:
1. Loads project specifications and coding standards
2. Reads source files (module) or diff (MR)
3. Evaluates against loaded specs
4. Generates structured markdown report
5. Saves to output directory
6. UI detects new file via watcher and adds to list

---

## 5. SCM Browser

### Purpose
Browse merge/pull requests, issues, and pipeline/CI status from the configured source control provider.

### Adapter Interface
The view consumes an `SCMAdapter` interface (see [08-extension-points.md](./08-extension-points.md)). Built-in adapters: GitLab, GitHub.

### Sub-Tabs

#### Merge / Pull Requests
| Column | Data |
|--------|------|
| ID | MR/PR number |
| Title | Title with link |
| Author | Avatar + name |
| Status | Open / Merged / Closed badge |
| Pipeline | Pass / Fail / Running indicator |
| Updated | Relative time |

- Click to expand: description, diff summary, discussion thread
- Action buttons: Approve, Comment, Merge (with confirmation)

#### Issues
| Column | Data |
|--------|------|
| ID | Issue number |
| Title | Title |
| Labels | Colored badges |
| Assignee | Avatar |
| State | Open / Closed |

- Click to expand: description, comments
- Quick filter: state, label, assignee, milestone

#### Pipelines
| Column | Data |
|--------|------|
| ID | Pipeline number |
| Branch | Branch name |
| Status | Success / Failed / Running / Pending |
| Duration | Time elapsed |
| Stages | Stage indicators (dots) |

- Click to expand: job list with individual statuses
- Click a job to view logs (streamed if running)

---

## 6. Workspace

### Purpose
Multi-repository git status dashboard showing the state of all project repositories at a glance.

### Data Source
Scans configured repository root for directories containing `.git/`. Runs `git status`, `git branch`, `git rev-list` for each.

### UI Layout (Card Grid)

Each repository renders as a card:

```
+---------------------------------------+
|  repo-name                  main      |
|  Branch: feature/PROJ-123             |
|  Status: 2 modified, 1 untracked     |
|  Ahead: 3  Behind: 0                 |
|  Last commit: "Fix auth" (2h ago)    |
+---------------------------------------+
```

**Color coding:**
- Green border: clean, up-to-date
- Yellow border: uncommitted changes
- Red border: behind remote or conflicts

### Interactions
- Click card to see full file-level status (staged, unstaged, untracked)
- Quick actions: Pull, Push, Open in terminal, Open in IDE

---

## 7. Knowledge Base

### Purpose
Browse and search project documentation rendered as rich markdown.

### Data Source
A configurable root directory containing markdown files organized in category subdirectories. Each document has YAML front-matter:

```yaml
---
title: "State Machine Architecture"
version: "1.0"
last_updated: 2026-02-18
author: jsmith
status: Active
category: concept
tags: [state-machine, architecture, events]
---
```

### UI Layout (Master-Detail)

**Left panel -- Category tree:**
```
> Concepts
    State Machines
    Event Sourcing
    Domain Model
> API
    Command API
    Query API
> Guides
    Getting Started
    Deployment
```

**Right panel -- Document viewer:**
- Rendered markdown with:
  - Mermaid diagram support (rendered inline)
  - Syntax-highlighted code blocks
  - Auto-generated table of contents from headings
  - Metadata banner (status, author, version, tags)
  - Anchor links for deep linking

### Search
- **Local keyword search**: scans document content and front-matter
- **Semantic search** (if AI service available): vector-based similarity search
- Results show: document title, matched snippet, relevance score

### Live Updates
File watcher on KB root triggers `kb:changed` event; tree and content refresh.

---

## 8. Requirements Explorer

### Purpose
Navigate structured requirements with cross-linking to knowledge base and specs.

### Data Source
Markdown files in structured directories under a `requirements/` root:
- `use-cases/` -- Use case documents (UC-NNN)
- `functional-requirements/` -- FRs (FR-NNN)
- `non-functional-requirements/` -- NFRs (NFR-CAT-NNN)
- `actors/` -- Actor definitions

### Sub-Tabs

#### Use Cases
- **Left**: Functional area tree (derived from UC categories)
- **Right**: Use case detail showing:
  - Description, preconditions, postconditions
  - Main flow, alternative flows
  - Linked FRs (clickable, navigates to FR tab)
  - Linked specs (clickable, navigates to Dashboard detail)

#### Functional Requirements
- Table view with columns: ID, Title, Priority, Status, Linked UC
- Click to expand full requirement text
- Status badges: Implemented, In Progress, Planned

#### Non-Functional Requirements
- Filter chips by category (Performance, Security, Reliability, etc.)
- Card layout:
  ```
  +---------------------------------------+
  |  NFR-PERF-001                         |
  |  Order placement < 50ms p99           |
  |  Status: Met  |  Threshold: 50ms     |
  |  Evidence: Load test 2026-03-01      |
  +---------------------------------------+
  ```
- Click for full detail with evidence and measurement history

#### Actors
- Card layout with actor name, description, linked use cases
- Click to navigate to the Use Cases tab filtered by that actor

### Cross-View Navigation
- "View in KB" button on any requirement opens the Knowledge Base view with the source document loaded
- FR links in use cases navigate within the Requirements view
- Spec links navigate to the Dashboard detail view

---

## 9. Roadmap

### Purpose
Interactive timeline visualization of project milestones, epics, and work items.

### Data Source
YAML or JSON file (e.g., `roadmap.yaml`) defining:

```yaml
epics:
  - id: E1
    title: "Core Platform"
    start: 2026-01-01
    end: 2026-06-30
    milestones:
      - id: M1
        title: "MVP Release"
        date: 2026-03-31
    items:
      - id: W1
        title: "Authentication"
        start: 2026-01-15
        end: 2026-02-28
        status: completed
        ticketId: PROJ-42
```

### UI Layout
- **Gantt chart** as primary visualization
- **Zoom levels**: Week, Month, Quarter, Year
- **Epic rows** containing child work items as nested bars
- **Milestone diamonds** on the timeline
- **Today line** vertical indicator

### Interactions
- Hover for tooltip (title, dates, status, assignee)
- Click to open detail panel with description, linked tickets, progress
- Drag-and-drop to adjust dates (if edit mode enabled)
- Filter by: status, assignee, epic

### Live Updates
File watcher on roadmap file triggers `roadmap:changed` event.

---

## 10. File Explorer

### Purpose
General-purpose repository file browser with syntax-highlighted content viewer.

### UI Layout (Master-Detail)

**Left panel -- File tree:**
- Rooted at project root
- Expand/collapse directories
- File icons by extension
- Respects `.gitignore` (configurable)

**Right panel -- Content viewer:**
- Syntax highlighting via Monaco Editor or CodeMirror (read-only by default)
- Line numbers
- Minimap (optional)
- Search within file (Ctrl+F)
- Supports: code files, markdown (rendered), images (displayed), JSON/YAML (formatted)

### Interactions
- Click file to view content
- Right-click for: Copy path, Open in IDE, Open in terminal
- Breadcrumb navigation at top of content panel

---

## 11. Containers

### Purpose
List and manage local containers (Docker or Podman).

### Adapter Interface
Consumes a `ContainerAdapter` interface (see [08-extension-points.md](./08-extension-points.md)). Built-in adapters: Docker CLI, Podman CLI.

### UI Layout

**Table view:**
| Column | Data |
|--------|------|
| Name | Container name |
| Image | Image name:tag |
| Status | Running / Stopped / Exited badge |
| Ports | Published port mappings |
| CPU / Memory | Live usage stats (if running) |
| Created | Relative time |

### Interactions
- Click to expand: environment variables, volumes, network
- **Log viewer**: streamed container logs with:
  - Auto-scroll toggle
  - Timestamp display toggle
  - Keyword filter
  - Log level colorization (ERROR=red, WARN=yellow, INFO=default)
- **Actions**: Start, Stop, Restart, Remove (with confirmation)
- **Bulk actions**: Start All, Stop All (for docker-compose groups)

---

## 12. Kubernetes

### Purpose
Browse Kubernetes resources and stream pod logs.

### Data Source
Kubernetes API via kubeconfig. Configurable context and namespace.

### Sub-Tabs

#### Pods
| Column | Data |
|--------|------|
| Name | Pod name |
| Status | Running / Pending / Failed / Succeeded |
| Ready | Ready containers / Total containers |
| Restarts | Restart count (highlighted if > 0) |
| Age | Relative time |
| Node | Node name |

- Click to expand: container details, events, resource usage
- **Log viewer**: same as Containers view but for pod containers
- **Actions**: Delete pod (with confirmation)

#### Deployments
| Column | Data |
|--------|------|
| Name | Deployment name |
| Ready | Ready replicas / Desired replicas |
| Up-to-date | Updated replicas |
| Available | Available replicas |
| Age | Relative time |

- Click to expand: pod list, rollout history, resource spec

#### Services
| Column | Data |
|--------|------|
| Name | Service name |
| Type | ClusterIP / NodePort / LoadBalancer |
| Cluster IP | Internal IP |
| External IP | External IP (if applicable) |
| Ports | Port mappings |

### Namespace Selector
Dropdown at the top to switch namespace. Remembers last selection.

---

## 13. Message Bus

### Purpose
Inspect message bus topics, consumer groups, and individual messages. Generic enough for Kafka, RabbitMQ, or other message systems.

### Adapter Interface
Consumes a `MessageBusAdapter` interface. Built-in adapter: Kafka.

### Sub-Tabs

#### Topics
| Column | Data |
|--------|------|
| Name | Topic name |
| Partitions | Partition count |
| Messages | Approximate message count |
| Last Message | Timestamp of most recent message |

- Click to expand: partition details, configuration

#### Messages (for selected topic)
- **Controls**: topic selector, partition selector, offset (latest / earliest / specific), limit
- **Message list**: timestamp, key, partition, offset
- Click to expand: full message payload (JSON-formatted)
- **Schema support**: if schema registry is configured, messages are deserialized with schema
- **AI Explain**: button on expanded message that sends payload + schema to AI for domain-contextual explanation

#### Consumer Groups
| Column | Data |
|--------|------|
| Group ID | Consumer group name |
| State | Stable / Rebalancing / Empty |
| Members | Member count |
| Lag | Total lag across partitions |

- Click to expand: per-partition lag breakdown

---

## 14. Database

### Purpose
SQL schema browser, query editor, and AI-powered analysis tools.

### Adapter Interface
Consumes a `DatabaseAdapter` interface. Built-in adapter: PostgreSQL.

### Sub-Tabs

#### Schema Browser
- **Left tree**: database > schema > tables/views
- Click table to show: columns (name, type, nullable, default), indexes, foreign keys, row count estimate
- "Generate SELECT" button: creates `SELECT * FROM table LIMIT 100` in query editor

#### Query Editor
- **Monaco/CodeMirror SQL editor** with:
  - Syntax highlighting
  - Auto-complete for table/column names
  - Multiple query tabs
  - Query history (persisted locally)
- **Execute** button (Ctrl+Enter)
- **Results** displayed in a data grid (AG Grid or equivalent):
  - Sortable, filterable columns
  - Pagination for large result sets
  - Export to CSV/JSON
- **AI "Analyze" button**: sends query + results to AI for:
  - Statistical summary
  - Anomaly detection
  - Follow-up query suggestions
- **Natural language to SQL**: text input that sends description to AI, returns SQL query

#### Entity Lifecycle (Optional, Domain-Specific)
- Visual representation of an entity's state transitions over time
- Tree diagram (parent-child relationships) with status badges
- Event timeline (vertical) with expandable event payloads
- AI "Narrate" button: generates human-readable story of the entity's journey

#### Investigate (AI-Powered)
See [07-ai-integration.md](./07-ai-integration.md) Section 3 for full Investigator specification.

---

## 15. Settings

### Purpose
Configure all cockpit connections, credentials, and preferences.

### Sections

#### General
| Setting | Description | Default |
|---------|-------------|---------|
| Project Root | Path to the project root directory | Auto-detected |
| Theme | Light / Dark / System | System |
| Sidebar Position | Left / Right | Left |

#### Source Control
| Setting | Description |
|---------|-------------|
| Provider | GitLab / GitHub / None |
| URL | Instance URL (e.g., `https://gitlab.example.com`) |
| Project/Repo ID | Numeric or `owner/repo` |
| Access Token | Personal access token (stored in secrets file) |

#### AI Provider
| Setting | Description |
|---------|-------------|
| Provider | Anthropic / OpenAI / Azure OpenAI / Ollama / None |
| API Key | Provider API key (stored in secrets file) |
| Model | Default model for AI features |
| CLI Tool | AI CLI for sessions (claude-code, aider, etc.) |

#### Knowledge Base
| Setting | Description | Default |
|---------|-------------|---------|
| Root Path | Path to knowledge base directory | `<project-root>/docs/knowledge-base` |
| Requirements Path | Path to requirements directory | `<kb-root>/requirements` |
| Playbooks Path | Path to investigation playbooks | `<kb-root>/playbooks` |

#### Infrastructure
| Setting | Description |
|---------|-------------|
| Container Runtime | Docker / Podman / None |
| Kubernetes Config | Path to kubeconfig |
| Kubernetes Namespace | Default namespace |
| Message Bus | Kafka / RabbitMQ / None |
| Message Bus Bootstrap | Connection string |
| Schema Registry URL | Optional schema registry |
| Database Type | PostgreSQL / MySQL / SQLite / None |
| Database Connection | Connection string (stored in secrets file) |

#### Specs
| Setting | Description | Default |
|---------|-------------|---------|
| Module Directories | Directories to scan for specs | Auto-detected from project |
| Review Output | Default review report directory | `<module>/docs/reviews/` |

### Persistence
- Non-sensitive settings: `~/.developer-cockpit/config.json`
- Sensitive values (tokens, passwords): `~/.developer-cockpit/secrets.env`
- Hot-reload: changes take effect without restart; broadcast `config:reloaded` event
