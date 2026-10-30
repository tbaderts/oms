# 05 - Data Model & Persistence

The Developer Cockpit follows a **filesystem-first** persistence strategy. There is no external database for core functionality. All state is derived from files on disk or held transiently in memory.

---

## 1. Persistence Strategy Overview

| Data | Storage | Lifetime | Format |
|------|---------|----------|--------|
| Application config | `~/.developer-cockpit/config.json` | Permanent | JSON |
| Secrets | `~/.developer-cockpit/secrets.env` | Permanent | KEY=VALUE |
| Missions | `~/.developer-cockpit/missions.json` | Permanent | JSON |
| Query history | `~/.developer-cockpit/query-history.json` | Permanent | JSON |
| Spec artifacts | `<module>/specs/<ticket>/` | Permanent (in repo) | Markdown + YAML front-matter |
| Knowledge base | Configurable directory | Permanent (in repo) | Markdown + YAML front-matter |
| Requirements | `<kb-root>/requirements/` | Permanent (in repo) | Markdown + YAML front-matter |
| Roadmap | `<project-root>/roadmap.yaml` | Permanent (in repo) | YAML |
| Review reports | `<module>/docs/reviews/` | Permanent (in repo) | Markdown |
| Playbooks | `<kb-root>/playbooks/` | Permanent (in repo) | Markdown + YAML front-matter |
| Session output | In-memory | Session lifetime | Text (ANSI) |
| Investigation state | In-memory | Investigation lifetime | Structured objects |
| WebSocket connections | In-memory | Connection lifetime | N/A |

---

## 2. Configuration Schema

### config.json

```json
{
  "general": {
    "projectRoot": "/path/to/project",
    "theme": "system",
    "sidebarPosition": "left"
  },
  "scm": {
    "provider": "gitlab",
    "url": "https://gitlab.example.com",
    "projectId": "123",
    "defaultBranch": "main"
  },
  "ai": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-6",
    "cliTool": "claude-code",
    "maxTokens": 4096
  },
  "kb": {
    "rootPath": null,
    "requirementsPath": null,
    "playbooksPath": null
  },
  "containers": {
    "runtime": "docker"
  },
  "kubernetes": {
    "kubeconfigPath": null,
    "defaultNamespace": "default"
  },
  "messageBus": {
    "type": "kafka",
    "bootstrapServers": null,
    "schemaRegistryUrl": null
  },
  "database": {
    "type": "postgresql",
    "connectionString": null
  },
  "infrastructure": {
    "prometheusUrl": "http://localhost:9090",
    "grafanaUrl": "http://localhost:3000",
    "lokiUrl": "http://localhost:3100",
    "omsCoreUrl": "http://localhost:8090",
    "apiTemplateSources": ["oms-core/rest.http"]
  },
  "specs": {
    "openApiPaths": ["oms-contracts/src/main/openapi"],
    "avroPaths": ["oms-contracts/src/main/avro"],
    "autoGenerate": false,
    "moduleDirectories": [],
    "reviewOutputDir": "docs/reviews"
  },
  "storyboards": {
    "enabled": true,
    "roots": ["oms-knowledge-base/storyboards"],
    "maxSourceBytes": 1048576,
    "maxAssetBytes": 524288,
    "writable": true
  }
}
```

`storyboards` configures the Storyboards view (SPEC-0014):

- `roots` are workspace-relative folders; a `*` segment matches one folder level.
- The size limits apply to Markdown/YAML sources and to illustrations, on read and on write.
- `writable: false` turns every write off.
- The `COCKPIT_STORYBOARDS_ENABLED`, `_ROOTS` (`;`-separated), `_MAX_SOURCE_BYTES`,
  `_MAX_ASSET_BYTES` and `_WRITABLE` environment variables override the saved values.
- A config file saved before SPEC-0014 gets the defaults.

`specs.openApiPaths` / `specs.avroPaths` are the contract folders of the Contracts view, relative to
the workspace root. Saved values that are exactly the legacy `oms-core/src/main/openapi` /
`oms-core/src/main/avro` defaults are migrated to the values above on load.

`infrastructure.omsCoreUrl` is the oms-core the API Explorer calls; an empty or missing value means
`http://localhost:8090`. `infrastructure.apiTemplateSources` lists extra `.http` template files,
workspace-relative or absolute (default `[]`; blank lines are ignored). The files in
`developer-cockpit/api-templates` are always listed.

**Resolution order**: defaults -> config.json -> environment variables -> CLI flags.

### api-explorer-history.json

Next to `config.json`; written only by the main process (temp file + rename). Newest first, at most
100 entries; bodies over 64 KB are stored truncated (`truncated: true`).

```json
[
  {
    "id": "6f1c…", "at": "2026-10-27T10:03:00.000Z",
    "kind": "command", "label": "OrderAcceptCmd",
    "method": "POST", "path": "/api/command/execute",
    "status": 200, "durationMs": 31,
    "request": { "body": "{\"type\":\"OrderAcceptCmd\",\"orderId\":\"O-1\"}" }
  },
  {
    "id": "a9e2…", "at": "2026-10-27T10:02:00.000Z",
    "kind": "query", "label": "search",
    "method": "GET", "path": "/api/query/search?symbol=AAPL&page=0&size=50",
    "status": null, "durationMs": 3,
    "request": { "params": [{ "field": "symbol", "op": "eq", "value": "AAPL" }], "page": 0, "size": 50 }
  }
]
```

`status: null` means no HTTP response: with `"refused": true` the cockpit refused it before sending
(invalid JSON, unconfirmed non-local host, invalid URL or filter), otherwise oms-core was not
reachable or did not answer in time.

### API Explorer templates (`*.http`)

Templates use the VS Code REST Client format. The cockpit reads this subset:

- A line starting with `###` starts a new request.
- `#` and `//` lines are comments, and `# @name X` names the request.
- `@name = value` lines declare file variables, valid in the whole file. If a name is declared
  twice, the last one wins.
- In each request, the first other non-empty line is the request line, `METHOD URL [HTTP/1.1]`
  (a bare URL means GET). Header lines follow up to the first blank line, and the rest is the
  body.

```http
@baseUrl = http://localhost:8090
@account = account-01

###
# @name INTC limit buy
POST {{baseUrl}}/api/command/execute HTTP/1.1
content-type: application/json

{ "type": "OrderCreateCmd", "version": "1.0.0",
  "order": { "clOrdId": "{{$guid}}", "sendingTime": "{{$datetime iso8601}}", "account": "{{account}}", … } }
```

Only `POST` requests to `/api/command/execute` become templates. Supported variables are
`{{$guid}}`, `{{$datetime iso8601}}`, `{{$timestamp}}`, `{{$randomInt min max}}`, file
variables (resolved recursively, up to depth 5) and `{{orderId}}`. Environments, `$dotenv`,
`$processEnv` and request variables are not supported; they are reported as unresolved.

Null values mean "not configured" -- the corresponding feature is disabled gracefully.

### secrets.env

```env
SCM_ACCESS_TOKEN=glpat-xxxx
AI_API_KEY=sk-ant-xxxx
DATABASE_CONNECTION_STRING=postgresql://user:pass@host:5432/db
```

Loaded via dotenv or equivalent. Never logged or exposed via API.

---

## 3. Spec Data Model

The files under `specs/` are the source of truth and only the workflow CLI
(`specs/tools/spec.mjs`) writes ticket state. The cockpit keeps no copy; filters and the
Mine/All toggle are session state only.

### Directory Structure

```
specs/
  config.json                     approvals, modules, types
  changes/
    SPEC-0002-integrate-spec-workflow-into-developer-c/
      ticket.md                   front-matter + Goal + Log (CLI-owned)
      proposal.md  design.md  tasks.md  verification.md
      evidence/last-run.json      written by `spec verify`
  archive/
    SPEC-0001-…/                  finished tickets, same layout
```

### ticket.md Front-Matter

```yaml
---
id: SPEC-0002
title: Integrate spec workflow into developer cockpit
type: feature                 # feature | fix | refactor | spike | chore
status: implement             # proposal | design | plan | implement | verify | done | blocked
awaiting:                     # stage waiting for human approval, if any
autopilot: false
modules: [developer-cockpit]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-24
blocked_from:
blocked_reason:
---
```

### tasks.md Format

```markdown
- [x] **T-1** Add Vitest and the fixture workspace (AC-1)
  - files: developer-cockpit/package.json
  - verify: `npx vitest run …` passes
- [ ] **T-2** …
```

### Derived Ticket Objects (`src/shared/types/specTickets.ts`)

```typescript
interface SpecTicketSummary {
  id: string; title: string; type: string;
  status: SpecStage | 'blocked'; awaiting: string; autopilot: boolean;
  modules: string[]; approvals: string[]; owner: string; created: string;
  blockedFrom: string; blockedReason: string;
  archived: boolean; dir: string;            // e.g. specs/changes/SPEC-0002-…
  tasks: { done: number; total: number };
  acs: string[];                             // AC ids from proposal.md
}

interface SpecTicketDetail extends SpecTicketSummary {
  goal: string; log: string[];
  taskList: { id: string; done: boolean; acs: string[]; summary: string }[];
  gate: { stage: string; pass: boolean; errors: string[]; warnings: string[]; exceptions: string[] } | null;
  evidence: { result: 'pass' | 'fail'; ranAt: string; modules: string[]; fresh: boolean; coversModules: boolean } | null;
  next: string;
  documents: Partial<Record<'proposal' | 'design' | 'tasks' | 'verification', string>>;
}

interface SpecTicketList { user: string; types: string[]; tickets: SpecTicketSummary[]; errors: { dir: string; error: string }[] }
```

These map 1:1 from `spec list --json` / `spec status --json` (front-matter is converted from
snake_case to camelCase).

### Editing (`src/shared/types/specTickets.ts`, shared by main and renderer)

```typescript
const STAGE_DOCUMENT = { proposal: 'proposal', design: 'design', plan: 'tasks', implement: 'tasks', verify: 'verification' };
const DOCUMENT_FILES = { proposal: 'proposal.md', design: 'design.md', tasks: 'tasks.md', verification: 'verification.md' };

// The one document a human may edit now: the current stage's (blocked → blocked_from);
// null for archived and done tickets.
function editableDocument(t: { status; blockedFrom; archived }): SpecDocument | null;
function editableStage(t): SpecStage | null;   // whose gate a draft is checked against

type SpecSaveResult =
  | { status: 'saved'; content: string }
  | { status: 'conflict'; diskContent: string };   // file changed since the editor loaded it
```

The renderer keeps the open document in `stores/docEditor.ts`: ticket and document, the loaded
text (`base`, sent with every save as the conflict check), the edited text, `dirty`, the latest
draft gate result and a pending conflict.

---

## 4. Knowledge Base Document Model

### Front-Matter Schema

```yaml
---
title: "Document Title"          # Required
version: "1.0"                   # Required
last_updated: 2026-02-18         # Required (ISO date)
author: jsmith                   # Required
status: Active                   # Required: Active | Draft | Deprecated | In Review
category: concept                # Required: concept | feature | guide | reference | decision
module: cross-cutting            # Optional: which module this relates to
tags: [tag1, tag2]               # Required: array of search tags
---
```

### Derived Document Object

```typescript
interface KBDocument {
  path: string;                  // Relative path from KB root
  title: string;
  version: string;
  lastUpdated: string;
  author: string;
  status: "Active" | "Draft" | "Deprecated" | "In Review";
  category: string;
  module: string | null;
  tags: string[];
  content: string;               // Raw markdown body
  headings: {                    // Extracted for TOC
    level: number;
    text: string;
    anchor: string;
  }[];
}
```

---

## 5. Playbook Model

### Front-Matter Schema

```yaml
---
title: "Order Cancel Investigation"
triggers: [cancel, cxl, cancelled]    # Matched against symptom text
priority: 10                           # Lower = matched first (default: 50)
---
```

### Derived Playbook Object

```typescript
interface Playbook {
  path: string;
  title: string;
  triggers: string[];
  priority: number;
  steps: string;                 // Markdown body with investigation steps
}
```

### Trigger Matching Algorithm

```
1. Normalize symptom text to lowercase
2. For each playbook, check if any trigger keyword is contained in the symptom text
3. Sort matching playbooks by priority (ascending)
4. Use the first match as the investigation guide
5. If no match, use a generic investigation prompt
```

---

## 6. Mission Model

```typescript
interface Mission {
  id: string;                    // UUID
  ticketId: string;
  title: string;
  branch: string;
  targetRepos: string[];
  status: "preflight" | "active" | "landing" | "completed";
  startedAt: string;             // ISO datetime
  completedAt: string | null;
  checks: {
    git: "pending" | "pass" | "fail" | "action_needed";
    mr: "pending" | "pass" | "fail" | "action_needed";
    docs: "pending" | "pass" | "fail" | "action_needed";
    ticket: "pending" | "pass" | "fail" | "action_needed";
  };
  history: {
    timestamp: string;
    event: string;
    details: string;
  }[];
}
```

---

## 7. Requirements Model

### Use Case

```typescript
interface UseCase {
  id: string;                    // e.g., "UC-001"
  title: string;
  functionalArea: string;
  actors: string[];
  description: string;
  preconditions: string[];
  postconditions: string[];
  mainFlow: string[];
  alternativeFlows: { name: string; steps: string[] }[];
  linkedFRs: string[];           // FR IDs
  linkedSpecs: string[];         // Spec ticket IDs
}
```

### Functional Requirement

```typescript
interface FunctionalRequirement {
  id: string;                    // e.g., "FR-001"
  title: string;
  description: string;
  priority: "Must" | "Should" | "Could";
  status: "Implemented" | "In Progress" | "Planned";
  linkedUC: string;              // UC ID
  linkedSpecs: string[];
}
```

### Non-Functional Requirement

```typescript
interface NonFunctionalRequirement {
  id: string;                    // e.g., "NFR-PERF-001"
  title: string;
  category: "Performance" | "Security" | "Reliability" | "Scalability" | "Usability";
  description: string;
  threshold: string;             // e.g., "< 50ms p99"
  status: "Met" | "Pending" | "At Risk";
  evidence: string | null;
}
```

---

## 8. Roadmap Model

```typescript
interface Roadmap {
  epics: Epic[];
}

interface Epic {
  id: string;
  title: string;
  description: string;
  start: string;                 // ISO date
  end: string;
  color: string;                 // Optional hex color
  milestones: Milestone[];
  items: WorkItem[];
}

interface Milestone {
  id: string;
  title: string;
  date: string;                  // ISO date
}

interface WorkItem {
  id: string;
  title: string;
  start: string;
  end: string;
  status: "planned" | "in_progress" | "completed" | "blocked";
  assignee: string | null;
  ticketId: string | null;
}
```

---

## 9. Query History Model

```typescript
interface QueryHistoryEntry {
  id: string;
  sql: string;
  executedAt: string;            // ISO datetime
  rowCount: number;
  durationMs: number;
  error: string | null;
}
```

Persisted in `~/.developer-cockpit/query-history.json`. Capped at 100 entries (FIFO).

---

## 10. Review Report Model

Review reports are markdown files with a structured format:

```markdown
# Code Review Report

**Date**: 2026-03-15
**Scope**: ri-oms-core (full module)
**Health Score**: 7/10
**Focus**: General

## Executive Summary
...

## Findings

| # | Severity | File | Line | Finding | Recommendation |
|---|----------|------|------|---------|----------------|
| 1 | High | OrderService.java | 42 | Missing null check | Add null validation |

## Recommendations
...
```

The cockpit parses the health score and findings table for display in the Reviews list view.
