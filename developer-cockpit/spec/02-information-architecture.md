# 02 - Information Architecture

## 1. Top-Level Layout

```
+--------------------------------------------------+
|  Title Bar / Menu Bar (desktop) or Top Nav (web)  |
+--------+-----------------------------------------+
|        |                                         |
|  Side  |            Main Content Area            |
|  Nav   |                                         |
|        |   (rendered by the active view)         |
|        |                                         |
|        |                                         |
+--------+-----------------------------------------+
|              Status Bar (optional)               |
+--------------------------------------------------+
```

- **Sidebar** -- collapsible, grouped navigation with icons and labels
- **Main Content Area** -- single active view at a time, with optional split panes
- **Status Bar** -- active mission indicator, connection status, notification count
- **Command Palette** -- keyboard-driven (Ctrl+K / Cmd+K) for quick navigation

## 2. Navigation Groups & Views

Views are organized into logical groups. Each group collapses independently in the sidebar.

### Group: Development

| View | Icon Suggestion | Purpose |
|------|-----------------|---------|
| **Dashboard** | grid/chart | Sprint-level overview of specs, tasks, progress metrics |
| **Flight Deck** | plane/rocket | Mission-based workflow for feature development lifecycle |
| **Sessions** | terminal | Launch and manage AI coding sessions with embedded terminals |
| **Reviews** | magnifying-glass | Browse and launch AI-generated code review reports |

### Group: Source Control

| View | Icon Suggestion | Purpose |
|------|-----------------|---------|
| **SCM Browser** | git-branch | Browse merge/pull requests, issues, pipeline status |
| **Workspace** | folder-git | Multi-repo git status dashboard (branch, dirty files, ahead/behind) |

### Group: Knowledge

| View | Icon Suggestion | Purpose |
|------|-----------------|---------|
| **Knowledge Base** | book | Browse and search project documentation with markdown rendering |
| **Requirements** | clipboard-check | Navigate use cases, functional requirements, NFRs, actors |
| **Roadmap** | gantt-chart | Interactive timeline of epics, milestones, and work items |
| **File Explorer** | folder-open | General-purpose repository file browser with syntax highlighting |

### Group: Infrastructure

| View | Icon Suggestion | Purpose |
|------|-----------------|---------|
| **Containers** | box | List/manage local containers (Docker/Podman); view logs, start/stop |
| **Kubernetes** | ship-wheel | Browse pods, deployments, services; stream pod logs |
| **Message Bus** | arrow-right-left | Inspect topics, consumer groups, messages; schema registry |
| **Database** | database | Schema browser, SQL editor, query history, AI analysis |

### Group: System

| View | Icon Suggestion | Purpose |
|------|-----------------|---------|
| **Settings** | gear | Configure connections, credentials, paths, themes, AI provider |

## 3. View Composition Patterns

### 3.1 Master-Detail

Used by: Dashboard, SCM Browser, Knowledge Base, Requirements, Reviews

```
+---------------------------+--------------------------+
|   Master List / Tree      |   Detail Panel           |
|                           |                          |
|   - Item 1               |   Content for selected   |
|   > Item 2 (selected)    |   item rendered here     |
|   - Item 3               |                          |
+---------------------------+--------------------------+
```

### 3.2 Tabbed Workspace

Used by: Database, Message Bus, Flight Deck

```
+--------------------------------------------------+
| [ Tab 1 ] [ Tab 2 ] [ Tab 3 ]                   |
+--------------------------------------------------+
|                                                  |
|   Content for active tab                         |
|                                                  |
+--------------------------------------------------+
```

### 3.3 Terminal Embed

Used by: Sessions

```
+--------------------------------------------------+
|  Session List (left rail)  |  Terminal Output     |
|                            |                      |
|  > session-1 (active)      |  $ claude-code ...   |
|    session-2 (idle)        |  > Analyzing...      |
|                            |  > Writing file...   |
+--------------------------------------------------+
```

### 3.4 Dashboard Grid

Used by: Dashboard, Flight Deck

```
+-------------+-------------+-------------+
|  Metric 1   |  Metric 2   |  Metric 3   |
+-------------+-------------+-------------+
|         Chart Area         |  Side Panel |
|                            |             |
+----------------------------+-------------+
|         Data Table (filterable)          |
+------------------------------------------+
```

## 4. Navigation Behavior

| Mechanism | Behavior |
|-----------|----------|
| Sidebar click | Switches active view; preserves state of previous view |
| Command palette | Fuzzy-search across all views and recent items |
| Deep link / URL | Each view has a URL path (e.g., `/dashboard`, `/kb/concepts/state-machines`) |
| Cross-view navigation | Views can link to other views (e.g., requirement links to KB doc) |
| Breadcrumbs | Shown when navigating into nested content (KB category > document > section) |

## 5. Responsive Behavior

| Viewport | Sidebar | Layout |
|----------|---------|--------|
| >= 1280px | Expanded with icons + labels | Full master-detail |
| 768-1279px | Collapsed to icons only | Stacked master/detail |
| < 768px | Hidden (hamburger menu) | Single column |

For desktop apps (Electron/Tauri), the minimum window size should be 1024x768.
