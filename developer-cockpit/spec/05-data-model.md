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
  "specs": {
    "moduleDirectories": [],
    "reviewOutputDir": "docs/reviews"
  }
}
```

**Resolution order**: defaults -> config.json -> environment variables -> CLI flags.

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

### Directory Structure

```
<module>/
  specs/
    PROJ-123_add-authentication/
      proposal.md
      design.md
      tasks.md
```

### proposal.md Front-Matter

```yaml
---
ticket_id: PROJ-123
title: Add User Authentication
status: in_progress
category: feature
classification: enhancement
story_points: 8
module: backend
created: 2026-03-01
author: jsmith
tags: [auth, security]
---
```

### tasks.md Format

```markdown
# Implementation Tasks

## Phase 1: Core Authentication
- [x] Create user model and migration
- [x] Implement password hashing service
- [ ] Add JWT token generation

## Phase 2: API Endpoints
- [ ] POST /auth/login
- [ ] POST /auth/register
- [ ] POST /auth/refresh
```

### Derived Spec Object

```typescript
interface Spec {
  ticketId: string;
  title: string;
  module: string;
  status: "proposal_only" | "design_ready" | "in_progress" | "completed";
  category: string;
  classification: string;
  storyPoints: number;
  author: string;
  created: string;
  tags: string[];
  tasks: {
    total: number;
    checked: number;
    phases: {
      name: string;
      items: { text: string; checked: boolean }[];
    }[];
  };
  hasProposal: boolean;
  hasDesign: boolean;
  hasTasks: boolean;
}
```

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
