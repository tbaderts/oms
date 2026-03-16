# 08 - Extension Points

The Developer Cockpit is designed to be adaptable to different projects, tech stacks, and infrastructure. This document defines the adapter interfaces, plugin architecture, and customization points.

---

## 1. Adapter Interfaces

Adapters abstract external systems behind stable interfaces. Swapping one implementation for another (e.g., GitLab -> GitHub) requires no changes to views or services.

### 1.1 SCMAdapter (Source Control Management)

```typescript
interface SCMAdapter {
  // Identity
  readonly provider: string;     // "gitlab" | "github" | "bitbucket" | ...

  // Merge / Pull Requests
  listMRs(filters?: MRFilters): Promise<MergeRequest[]>;
  getMR(id: number): Promise<MergeRequest>;
  getMRDiff(id: number): Promise<FileDiff[]>;
  getMRDiscussions(id: number): Promise<Discussion[]>;
  createMR(params: CreateMRParams): Promise<MergeRequest>;
  commentOnMR(id: number, body: string): Promise<Comment>;
  mergeMR(id: number, options?: MergeOptions): Promise<void>;

  // Issues
  listIssues(filters?: IssueFilters): Promise<Issue[]>;
  getIssue(id: number): Promise<Issue>;
  createIssue(params: CreateIssueParams): Promise<Issue>;
  updateIssue(id: number, params: UpdateIssueParams): Promise<Issue>;

  // Pipelines / CI
  listPipelines(filters?: PipelineFilters): Promise<Pipeline[]>;
  getPipeline(id: number): Promise<Pipeline>;
  getPipelineJobs(id: number): Promise<Job[]>;
  getJobLog(id: number): Promise<string>;

  // Branches
  listBranches(search?: string): Promise<Branch[]>;
  createBranch(name: string, ref: string): Promise<Branch>;
  deleteBranch(name: string): Promise<void>;
}
```

**Built-in implementations**: `GitLabAdapter`, `GitHubAdapter`

### 1.2 ContainerAdapter

```typescript
interface ContainerAdapter {
  readonly runtime: string;      // "docker" | "podman" | ...

  listContainers(): Promise<Container[]>;
  getContainer(id: string): Promise<Container>;
  getLogs(id: string, options?: LogOptions): AsyncIterable<string>;
  start(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  restart(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  getStats(id: string): Promise<ContainerStats>;
}

interface LogOptions {
  tail?: number;                 // Number of lines from end
  since?: string;                // ISO timestamp
  follow?: boolean;              // Stream live logs
  filter?: string;               // Grep pattern
}
```

**Built-in implementations**: `DockerCLIAdapter`, `PodmanCLIAdapter`

### 1.3 MessageBusAdapter

```typescript
interface MessageBusAdapter {
  readonly type: string;         // "kafka" | "rabbitmq" | ...

  listTopics(): Promise<Topic[]>;
  getMessages(topic: string, options?: MessageOptions): Promise<BusMessage[]>;
  listConsumerGroups(): Promise<ConsumerGroup[]>;
  getConsumerGroup(id: string): Promise<ConsumerGroup>;

  // Schema registry (optional)
  listSchemas?(): Promise<Schema[]>;
  getSchema?(id: string | number): Promise<Schema>;
  deserialize?(message: Buffer, schemaId: number): Promise<object>;
}

interface MessageOptions {
  partition?: number;
  offset?: "earliest" | "latest" | number;
  limit?: number;
  keyFilter?: string;
}
```

**Built-in implementations**: `KafkaAdapter`, optionally `RabbitMQAdapter`

### 1.4 DatabaseAdapter

```typescript
interface DatabaseAdapter {
  readonly type: string;         // "postgresql" | "mysql" | "sqlite" | ...

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  getSchema(): Promise<DatabaseSchema>;
  executeQuery(sql: string): Promise<QueryResult>;

  // Optional: entity lifecycle support
  getEntityLifecycle?(entityType: string, id: string): Promise<EntityLifecycle>;
}

interface DatabaseSchema {
  schemas: {
    name: string;
    tables: {
      name: string;
      columns: { name: string; type: string; nullable: boolean; default?: string }[];
      indexes: { name: string; columns: string[]; unique: boolean }[];
      foreignKeys: { column: string; referencedTable: string; referencedColumn: string }[];
      estimatedRowCount: number;
    }[];
  }[];
}

interface QueryResult {
  columns: { name: string; type: string }[];
  rows: Record<string, any>[];
  rowCount: number;
  durationMs: number;
}
```

**Built-in implementations**: `PostgreSQLAdapter`, `MySQLAdapter`, `SQLiteAdapter`

### 1.5 AIAdapter

See [07-ai-integration.md](./07-ai-integration.md) Section 1.

---

## 2. Custom Views (Plugin Architecture)

### 2.1 View Registration

Custom views can be registered to extend the cockpit with project-specific functionality:

```typescript
interface ViewPlugin {
  id: string;                    // Unique view ID (e.g., "custom-dashboard")
  name: string;                  // Display name in sidebar
  icon: string;                  // Icon name or SVG
  group: string;                 // Sidebar group (Development, Infrastructure, etc.)
  order: number;                 // Position within group

  // Frontend component (framework-specific)
  component: ComponentType;      // React component, Vue component, etc.

  // Optional: backend routes
  routes?: RouteDefinition[];

  // Optional: WebSocket events this view produces/consumes
  events?: {
    produces?: string[];
    consumes?: string[];
  };
}
```

### 2.2 Plugin Discovery

Plugins are discovered from a `plugins/` directory:

```
~/.developer-cockpit/plugins/
  my-custom-view/
    manifest.json              # Plugin metadata
    index.js                   # Frontend component (bundled)
    server.js                  # Backend routes (optional)
```

**manifest.json**:
```json
{
  "id": "my-custom-view",
  "name": "My Custom View",
  "version": "1.0.0",
  "icon": "star",
  "group": "Development",
  "order": 50,
  "entrypoint": "index.js",
  "serverEntrypoint": "server.js",
  "events": {
    "consumes": ["specs:changed"]
  }
}
```

### 2.3 Plugin API

Plugins receive a context object with access to cockpit services:

```typescript
interface PluginContext {
  // Services
  config: ConfigService;
  eventBus: EventBus;
  ai: AIService;

  // API client (for calling cockpit REST endpoints)
  api: CockpitAPIClient;

  // UI utilities
  showNotification(message: string, type: "info" | "warning" | "error"): void;
  navigateTo(viewId: string, params?: Record<string, string>): void;
}
```

---

## 3. Custom Investigation Tools

The Investigator's tool set can be extended with project-specific tools:

```typescript
interface InvestigationToolPlugin {
  name: string;
  description: string;
  inputSchema: object;           // JSON Schema
  isAvailable(): Promise<boolean>; // Environment check
  execute(input: object): Promise<object>; // Tool implementation
}
```

Register custom tools in configuration:

```json
{
  "investigator": {
    "customTools": [
      {
        "name": "check_external_api",
        "description": "Check the health of the external payment API",
        "module": "~/.developer-cockpit/plugins/payment-tools/check-api.js"
      }
    ]
  }
}
```

---

## 4. Custom Playbooks

No code changes needed. Drop a markdown file in the playbooks directory:

```markdown
---
title: "Payment Processing Investigation"
triggers: [payment, charge, refund, stripe]
priority: 20
---

## Payment Processing Investigation Playbook

1. Check the payments table for the transaction ID
2. Look for webhook events from the payment provider
3. Check service logs for API call failures
4. Verify idempotency keys to rule out duplicate charges
5. Cross-reference with the order entity lifecycle
```

The Investigator loads playbooks from disk on every investigation -- no restart needed.

---

## 5. Theming

### 5.1 CSS Variables

The cockpit exposes a set of CSS custom properties for theming:

```css
:root {
  /* Colors */
  --cockpit-bg-primary: #ffffff;
  --cockpit-bg-secondary: #f5f5f5;
  --cockpit-bg-sidebar: #1e1e2e;
  --cockpit-text-primary: #1a1a1a;
  --cockpit-text-secondary: #666666;
  --cockpit-accent: #3b82f6;
  --cockpit-success: #22c55e;
  --cockpit-warning: #f59e0b;
  --cockpit-error: #ef4444;

  /* Sizing */
  --cockpit-sidebar-width: 240px;
  --cockpit-sidebar-collapsed-width: 56px;
  --cockpit-header-height: 48px;
  --cockpit-status-bar-height: 24px;

  /* Typography */
  --cockpit-font-family: system-ui, -apple-system, sans-serif;
  --cockpit-font-mono: "JetBrains Mono", "Fira Code", monospace;
  --cockpit-font-size-sm: 0.875rem;
  --cockpit-font-size-base: 1rem;
}
```

### 5.2 Built-In Themes

| Theme | Description |
|-------|-------------|
| `light` | Light background, dark text |
| `dark` | Dark background, light text |
| `system` | Follow OS preference |

### 5.3 Custom Themes

Users can provide a custom CSS file:
```json
{
  "general": {
    "theme": "custom",
    "customThemePath": "~/.developer-cockpit/themes/my-theme.css"
  }
}
```

---

## 6. Configuration Profiles

Support multiple configuration profiles for different projects:

```
~/.developer-cockpit/
  config.json                  # Default profile
  profiles/
    project-a.json             # Override config for Project A
    project-b.json             # Override config for Project B
```

Switch profiles via Settings or CLI flag: `--profile project-a`

Profile configs are merged on top of the default config (deep merge).

---

## 7. Keyboard Shortcuts

All shortcuts are customizable via configuration:

```json
{
  "shortcuts": {
    "commandPalette": "Ctrl+K",
    "search": "Ctrl+Shift+F",
    "newSession": "Ctrl+Shift+T",
    "toggleSidebar": "Ctrl+B",
    "settings": "Ctrl+,",
    "views": {
      "dashboard": "Ctrl+1",
      "flightDeck": "Ctrl+2",
      "sessions": "Ctrl+3",
      "knowledgeBase": "Ctrl+4"
    }
  }
}
```
