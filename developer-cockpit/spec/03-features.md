# 03 - Feature Specifications

This document specifies the behavior of every view in the Developer Cockpit. Each feature is described with: purpose, UI layout, data sources, user interactions, and AI integrations.

---

## 1. Dashboard and Spec Tickets

### Purpose
Overview of all spec-driven work (the workflow in `specs/README.md`) and a workbench for driving
individual tickets through it: see your tickets, their progress and what needs you, and act on them.

### Data Source
The spec workflow tickets in the workspace:

```
specs/
  changes/SPEC-NNNN-<slug>/     active tickets
  archive/SPEC-NNNN-<slug>/     finished tickets
    ticket.md                   front-matter: id, title, type, status, awaiting, autopilot,
                                modules, approvals, owner, created, blocked_from,
                                blocked_reason; body: ## Goal, ## Log
    proposal.md                 why/what; acceptance criteria **AC-n**
    design.md                   how; test strategy; policy compliance
    tasks.md                    - [x] **T-n** … (AC-n) tasks with verify: lines
    verification.md             evidence per AC; verdict
    evidence/last-run.json      written by `spec verify`
```

The cockpit does **not** parse these rules itself. It reads tickets through
`node specs/tools/spec.mjs list|status|gate … --json` and performs every action by running the same
CLI, so gates, approvals and evidence freshness are exactly what the CLI, CI and Claude Code see.
Only the four stage documents are read and written directly (see *Editing stage documents*);
`ticket.md` and `evidence/` are never written by the cockpit.

**Status** is the ticket's `status`: `proposal → design → plan → implement → verify → done`, or
`blocked` (with `blocked_from`). A ticket can additionally be *awaiting approval* of a stage
(`awaiting`), when that stage's gate passed but needs a human (`approvals` in `specs/config.json`, or
a policy exception in the design).

### Dashboard: portfolio of all tickets

The Dashboard is the overview of spec work (navigation lives in the sidebar and Ctrl+K; there are
no quick-link cards). Top to bottom:

| Element | Value |
|------|-------|
| KPI tiles | One row of six tiles over the active (non-archived) tickets: *Active tickets*, *In progress* (not done; blocked counts), *Awaiting approval*, *Blocked*, *Done*, and *Task completion* (ticked / all tasks as %, with a progress ring and "x of y tasks"; – when there are no tasks). Each tile has its own colour band and icon; values and labels stay in text colours. Every tile except *Task completion* filters the ticket table: *Active tickets* clears the stage filter, *In progress* and *Awaiting approval* apply the same cross-stage views as the table's stage select, and *Blocked* and *Done* filter to that stage; a tile click also switches the table to *All tickets*, and clicking the tile again removes the filter |
| Ticket progress | One full-width card (SPEC-0017): the donut and its legend on the left, **Your turn** on the right (stacked below `lg`), and the collapsible **Activity** bar along the bottom. **Donut**: a donut of the active tickets per stage in pipeline order proposal → design → plan → implement → verify → done, then blocked, with the total in the hole and a legend with stage, count and %. Hovering or focusing a segment shows "stage, n of total · p%" in the hole. Clicking a segment or legend entry (or Enter / Space on a focused segment) filters the ticket table to that stage and switches it to *All tickets*; clicking again, or *Clear* on the "Showing: stage" chip, removes the filter. The donut and the tiles count only active tickets; with *Show archived* on, the filtered table also lists archived tickets in that stage. The chart's text alternative lists the same numbers; "No active tickets yet." when empty, and "Tickets could not be loaded." after a failed load (the tiles then show –) |
| Signals | Part of the *Ticket progress* card; they replace SPEC-0006's *Needs me*. **Your turn**: tickets awaiting approval ("approve <stage>") and blocked tickets (with the reason), your own first; "Nothing needs you." when empty. **Activity**: a one-line bar, collapsed by default, showing "*n* new" and the latest entry (level, time, ticket id, text). Clicking it (or Enter / Space) expands the feed below it: the 20 most recent `## Log` entries of all active tickets, newest first, each with time, level, ticket id, title and event text, in a scroll box of fixed height. The expanded state lasts for the session, and the status-bar indicator opens the Dashboard with the feed expanded. "No activity yet." (nothing to expand) when there are no entries. Levels: *critical* (verify run failed, blocked, reopened, autopilot switched off), *attention* (gate passed, awaiting approval), *good* (verify run passed, reached done), *info* (everything else, including unknown lines); each has a status icon and a visible label. Entries that arrived after the cockpit's first ticket load in this session carry a *new* pill. Every entry opens its ticket. After a failed load: "Signals are unavailable." and no Activity bar. |
| Tickets | The ticket table (below), with **New ticket** |

Clicking any ticket opens it in Spec Tickets; a ticket created from the Dashboard opens there too.

**Stage colours** (`--stage-*` tokens in `globals.css`, separate light and dark steps): a categorical
palette, one hue per stage — proposal yellow, design aqua, plan orange, implement blue, verify
magenta, done violet — and the status-critical red, always with an alert icon, for blocked. The hue
order keeps every pair of neighbouring donut segments distinguishable under protan, deutan and
tritan colour vision; `test/renderer/stageColors.test.ts` checks this. Light yellow, aqua and
magenta are below 3:1 contrast, so they are only used next to their legend label.

**Ticket table**:

| Column | Source |
|--------|--------|
| ID | `id` |
| Title | `title`, with `type` and `modules` |
| Stage | `status` badge (archived / blocked highlighted), after a dot in the stage colour |
| Owner | `owner` |
| Tasks | ticked/total from `tasks.md`, with progress bar |
| Flags | awaiting approval, blocked (reason as tooltip), autopilot |

**Filters**: *My tickets* (default; `owner` equals `git config user.name`, case-insensitive; falls
back to all tickets when no git user is configured) / *All tickets*, stage (the six stages, blocked,
plus the tiles' cross-stage views *In progress* and *Awaiting approval*), module, free-text search
on id or title, and *Show archived*. Folders that cannot be loaded (missing or malformed
`ticket.md`) appear as error rows; the rest still load.

### Spec Tickets: workspace for one ticket

Spec Tickets shows one ticket across the whole content area; there is no list pane.

**Header**: a **ticket switcher** (searchable by id or title over all loaded tickets; each option
shows id, title and stage; arrows, Enter, Escape; switching asks first when there are unsaved
document edits), **New ticket**, and **All tickets** (opens the Dashboard). With no ticket selected
the workspace shows the switcher and a pointer to the Dashboard. The last selected ticket is kept
when you come back and is re-read on open.

**Main column**: header (id, stage, type, owner, modules, approvals), stage progress across
the six stages (blocked shown in red), the Goal, the stage documents as tabs (rendered Markdown,
editable for the current stage, see below) and the ticket log. ` ```mermaid ` blocks in the
documents render as diagrams (see *Mermaid diagrams* under Knowledge Base).

**Status rail** (right; below the main column on narrow windows): the current **gate result**
(PASS/FAIL, errors, warnings, policy exceptions, or the draft result while editing) with the next
step and the workflow actions, the task list and AC coverage, and the **verification evidence**
(result, time, *Fresh* or *Stale* as the gate judges it, missing modules).

### Editing stage documents

The document of the ticket's **current stage** can be edited in place: proposal → `proposal.md`,
design → `design.md`, plan and implement → `tasks.md`, verify → `verification.md` (a blocked ticket
uses the stage it was blocked from). Its tab shows **Edit <file>**; the other documents stay
read-only with a hint, because changing a stage that already passed its gate or approval is what
**Reopen** is for. Archived and done tickets have nothing editable. If the stage changes while a
document is open (e.g. `spec advance` in a terminal), the editor closes, asking first when there are
unsaved edits.

- **Editor**: Monaco in Markdown mode, *Modified* badge, **Save** (or Ctrl/Cmd+S), **Done**. Monaco
  is loaded from the app bundle (`src/renderer/lib/monaco.ts`), never from a CDN, which the renderer
  CSP would block; the same applies to the Contracts → Editor tab.
- **Live gate check**: 500 ms after typing stops, the current stage's gate runs on the unsaved text
  (`spec gate <id> <stage> --draft <file> --json`, text on stdin, nothing written). The gate panel
  shows that result labelled *draft (unsaved)*; after saving it shows the saved file's result again.
- **Tick tasks**: at the implement stage each task has a checkbox; toggling it changes only that
  task's `[ ]`/`[x]` marker in `tasks.md`. Checkboxes wait while `tasks.md` has unsaved edits. If
  `tasks.md` changed on disk meanwhile, the tick is not applied; the list reloads and you tick again
  (a tick has no text of its own, so there is no Overwrite).
- **Conflicts**: every save and tick sends the text the editor loaded. If the file on disk differs
  (CLI, Claude Code, another editor), nothing is written and a banner offers **Reload from disk**
  (drop the edits) or **Overwrite**. An editor without unsaved edits follows changes on disk.
- **Unsaved edits**: switching ticket, document tab or view asks for confirmation first; **Advance**
  and **Approve** are disabled until the edits are saved or discarded, because they act on the saved
  files. (Closing the window is not guarded yet.)

The main process enforces the same rules: it accepts only the four document names (never paths),
only the current stage's document, at most 1 MB, and ticks only at the implement stage.

### Interactions (workflow actions)

Each action runs one CLI command and shows its output and exit code (0 ok, 1 rejected with the
CLI's errors, 3 awaiting approval). Buttons are disabled while an action runs; archived tickets are
read-only.

| Action | CLI |
|--------|-----|
| New ticket (title, type, modules, goal) | `new "<title>" --type --modules --goal` |
| Advance | `advance <id>` |
| Approve… (only when awaiting; explicit confirmation) | `approve <id> <awaiting> --by <git user.name>` |
| Reopen… (earlier stage + reason) | `reopen <id> <stage> "<reason>"` |
| Block… (reason) / Unblock | `block <id> "<reason>"` / `unblock <id>` |
| Note… | `note <id> "<text>"` |
| Autopilot on/off | `autopilot <id> on` / `off` |

Approving is a human action. The cockpit refuses it when the ticket is not awaiting approval or
no git user is configured. Actions, document saves and ticks are reachable only from the cockpit
UI (renderer IPC), never over the WebSocket event server or from AI features.

`spec verify` and `spec archive` stay in the terminal for now; their results show up in the
detail panel.

### Live Updates
The file watcher on `specs/changes/**` and `specs/archive/**` emits one coalesced
`specs:tickets-changed` event per burst of changes. The list, the open detail and the Dashboard
re-read, so changes made by the CLI or Claude Code appear within about a second. The subscription is
app-wide (`SignalsWatcher` in `App`), so tickets stay current in every view.

**Signals in every view.** The list carries each ticket's last 20 `## Log` entries (`recentLog`,
read from `ticket.md` by the main process). Each reload is compared with what the session has
already seen:

- A new *critical* or *attention* entry raises a toast (bottom right, 8 s, at most 3) with the ticket
  id, event text and **Open**.
- It also counts in the status bar: a bell, the number of unseen signals and the latest one's text.
  A click opens the Dashboard and resets the count.
- *Good* and *info* entries only appear in the Activity feed.
- Entries present at the first load never count as new. The seen state lasts for the session only.

### Contracts

One sidebar entry, **Contracts**, for the OMS contracts (the only copy lives in `oms-contracts/`,
see CLAUDE.md). Tabs:

| Tab | Content |
|---|---|
| Editor | OpenAPI (`.yml`/`.yaml`) and Avro (`.avsc`) files from the configured folders; Monaco editor with syntax validation and Save (Ctrl/Cmd+S). Saving is allowed only inside the configured folders and only for those extensions. |
| Domain Model | Records, enums and commands parsed from both sources, with fields and references. |
| Code Generation | **Contract models** (`oms-contracts`: `generateAvroJava openApiGenerateCmdModels openApiGenerateQueryModels`) and **API interfaces** (`oms-core`: `openApiGenerateCmd openApiGenerateQuery`), each run with the module's own Gradle wrapper; *Run all* runs models first. Output and exit status are shown. |

Folders come from Settings → Specs (defaults `oms-contracts/src/main/openapi`,
`oms-contracts/src/main/avro`); changes apply without a restart. A saved config that still has the
old `oms-core/src/main/{openapi,avro}` defaults is migrated once on load.

### API Explorer

An OMS-aware console for oms-core (SPEC-0007), not a second Swagger UI. Requests are made by the
main process to the **oms-core URL** from Settings → Infrastructure (default
`http://localhost:8090`, applies to the next request); the header always shows the target and a
*non-local* badge when it is not localhost/127.0.0.1/::1. If oms-core cannot be reached (or does
not answer within 10 s) the response says "oms-core not reachable at …" with the cause.

| Tab | Content |
|---|---|
| Commands | The command types of the `Command` discriminator in `oms-cmd-api.yml` (follows the file on disk). Picking one fills a JSON editor with a template built from its schema (`type`, `version`, every required property, enum values from `schema.yml`, `<name>` placeholders). The body is checked as you type: missing required properties, wrong types, values outside an enum and length limits are listed with their path; these are warnings, only invalid JSON blocks **Send**. The response shows status, duration and body (title/detail of a Problem+JSON response first). Sending to a non-local oms-core asks for confirmation every time. |
| Orders | Filter builder over the query API's filterable fields with only the operators each supports (string `eq`/`like`; numeric and date-time `eq gt gte lt lte between`; enums `eq` with their values), plus page, size and sort. Shows the exact request URL, the results with paging; clicking a row opens the order's follow-up. |
| History | The last 100 commands and searches (newest first, kept across restarts in `~/.developer-cockpit/api-explorer-history.json`), with status or *unreachable*. **Restore** puts a body back in the editor or filters back in the builder; **Clear history** asks first. |

**Order follow-up** (under a command response that names an order — the created id, the command's
`orderId` or `execution.orderId` — and for a clicked search row): the order's state and key fields
from the query API, and its event timeline (version, event, resulting state, time; *Details* shows
the command and the order snapshot) from the event log. **Next command** starts a template for
any command acting on an existing order with `orderId` filled in; **Refresh** re-reads both.

**Templates** (SPEC-0008) are VS Code REST Client `.http` files, so the same file works in both
tools. Every `POST …/api/command/execute` request with a JSON body is a template. It is listed in
the Commands tab under its command type, by its `# @name`, or else the comment line above it, or
else `<type> #n`. Picking a template loads its body into the editor.

Sources:
- Every `.http` file in `developer-cockpit/api-templates/` (in git). The starter files there
  cover every command type; `orders.http` has orders the exchange simulator accepts.
- Extra files listed in Settings → Infrastructure → *API Explorer template files*, such as
  `oms-core/rest.http`.

Files are read in place and reloaded when they change. A missing source, or a command block with
invalid JSON or an unknown type, is listed under *Template files* with the reason. GET requests are
ignored.

The URL in a template is never used: requests always go to the configured oms-core.

**Variables** are resolved on every send. The editor keeps the template, and History stores the
body as sent.

| Variable | Value |
|---|---|
| `{{$guid}}` | a new UUID |
| `{{$datetime iso8601}}` | now, UTC |
| `{{$timestamp}}` | Unix seconds |
| `{{$randomInt min max}}` | an integer in [min, max) |
| `{{name}}` | a file variable `@name = value` |
| `{{orderId}}` | the order in the follow-up, unless the file declares `@orderId` |

The body check runs on the resolved text. An unresolved variable is listed as a finding and blocks
**Send**.

**Save as template** appends the editor body as a named block to a listed source file, or to a new
file in `api-templates`. It never rewrites existing text, and a name already used in that file is
refused. By default, `clOrdId`, `commandId`, `sendingTime` and `transactTime` are saved as
`{{$guid}}` / `{{$datetime iso8601}}`. The dialog offers the template's own file first. File variables that the
target file doesn't declare are written into the body as their values, so the saved template still
resolves there. To save a past request, Restore it from History first.

**Use as template** in the order follow-up (from Commands or Orders) starts a new
`OrderCreateCmd` with the order's client fields. Server-assigned fields are dropped, and
`clOrdId` and the times are fresh.

The event timeline uses the query API's `getOrderEvents` operation
(`/api/query/orders/{orderId}/events`, contracted since SPEC-0035); if the shape is not recognised,
the raw JSON is shown instead. The URL prefixes
(`/api/command`, `/api/query`) are fixed in the cockpit because the contracts declare no `servers`.

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
  - Mermaid diagram support (rendered inline; see *Mermaid diagrams* below)
  - Syntax-highlighted code blocks
  - Auto-generated table of contents from headings
  - Metadata banner (status, author, version, tags)
  - Anchor links for deep linking

**Mermaid diagrams** (KB viewer and spec ticket documents, shared Markdown renderer): a
` ```mermaid ` block renders as an SVG diagram in the cockpit theme (Mermaid `dark` / `default`),
re-rendered when the theme changes. While it loads the source is shown; invalid syntax shows the
error and the source, and the rest of the document renders normally. A **Copy diagram source**
button copies the block's text. Mermaid runs with `securityLevel: 'strict'` and is loaded on first
use, so it does not slow app startup. Diagrams are not rendered in the editor while typing.

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
- Each functional requirement lists the storyboards whose steps link to it; a click opens the storyboard

### Storyboards

The Storyboards view (Knowledge group, after Requirements) shows end-to-end process journeys
stored as files under `oms-knowledge-base/storyboards/`. The full specification is
[11-storyboards.md](./11-storyboards.md). In short:

- **Catalogue (left).** Storyboards are grouped by domain, with a text filter over titles, summaries
  and step titles, filters for domain, status and tag, trust and drift badges, a thumbnail strip,
  scan diagnostics, Rescan, and New (only when storyboards are writable).
- **Journey (right).** A pinned overview in one of three modes: Strip (a sketch filmstrip with data
  and alternate-path layers), Lanes (swimlanes) and Sequence (a generated Mermaid diagram). The
  selected step is shown below it.
- **Keys.** ← → (or j/k) move through the steps, Home/End jump to the first or last, Esc returns to
  the overview, E edits the step and P presents.
- **Editing.** A wizard creates storyboards. Steps are edited as form fields plus Markdown with a
  preview, with link pickers, data and alternate-path editors and Excalidraw sketches. Steps are
  reordered and inserted from the strip. A stale save opens a Reload/Overwrite dialog.
- **Exports.** Presentation mode, plus Mermaid, standalone HTML and PDF exports.

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
