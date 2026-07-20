# Mission Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-agent operational platform for incident investigation, infrastructure monitoring, and custom workflow composition, powered by Mastra AI.

**Architecture:** Decoupled monorepo with two packages: `packages/server` (Mastra + Hono API) and `packages/ui` (React 19 + Vite). The server hosts agents, tools, and workflows; the UI provides a dashboard, investigation view, visual workflow builder, and agent explorer. Infrastructure adapters (K8s, Docker, PostgreSQL, Prometheus) are implemented as Mastra tools.

**Tech Stack:** Mastra AI (`@mastra/core`, `@mastra/server`), Hono, React 19, Vite, Tailwind CSS 4, shadcn/ui, Zustand, React Flow, xterm.js, TypeScript, pnpm workspaces, Turborepo.

**Spec:** `docs/superpowers/specs/2026-04-04-mission-control-design.md`

---

## File Structure

### packages/server

```
packages/server/
├── src/
│   ├── mastra/
│   │   ├── index.ts                    # Mastra instance with all agents, tools, workflows
│   │   ├── agents/
│   │   │   ├── investigation-supervisor.ts  # Supervisor agent
│   │   │   ├── log-analyzer.ts              # Log analysis sub-agent
│   │   │   ├── k8s-inspector.ts             # Kubernetes sub-agent
│   │   │   ├── db-querier.ts                # Database sub-agent
│   │   │   └── metrics-analyzer.ts          # Metrics sub-agent
│   │   ├── tools/
│   │   │   ├── kubernetes/
│   │   │   │   ├── list-pods.ts
│   │   │   │   ├── get-pod-status.ts
│   │   │   │   ├── get-pod-logs.ts
│   │   │   │   ├── list-deployments.ts
│   │   │   │   ├── list-services.ts
│   │   │   │   ├── get-events.ts
│   │   │   │   └── index.ts                # Re-exports all K8s tools
│   │   │   ├── docker/
│   │   │   │   ├── list-containers.ts
│   │   │   │   ├── get-container-logs.ts
│   │   │   │   ├── search-logs.ts
│   │   │   │   ├── start-container.ts
│   │   │   │   ├── stop-container.ts
│   │   │   │   └── index.ts
│   │   │   ├── postgres/
│   │   │   │   ├── execute-query.ts
│   │   │   │   ├── get-schema.ts
│   │   │   │   ├── search-entities.ts
│   │   │   │   └── index.ts
│   │   │   ├── prometheus/
│   │   │   │   ├── query-metrics.ts
│   │   │   │   ├── query-range.ts
│   │   │   │   ├── get-alerts.ts
│   │   │   │   └── index.ts
│   │   │   └── shared/
│   │   │       ├── search-playbooks.ts
│   │   │       ├── correlate-timeline.ts
│   │   │       ├── format-report.ts
│   │   │       └── index.ts
│   │   └── workflows/
│   │       └── investigation.ts             # Pre-built investigation workflow
│   ├── api/
│   │   ├── routes.ts                        # All Hono route definitions
│   │   ├── agents.ts                        # Agent endpoints
│   │   ├── tools.ts                         # Tool endpoints
│   │   ├── workflows.ts                     # Workflow CRUD + run endpoints
│   │   ├── investigations.ts                # Investigation endpoints
│   │   ├── approvals.ts                     # Approval endpoints
│   │   ├── playbooks.ts                     # Playbook CRUD endpoints
│   │   ├── adapters.ts                      # Adapter status endpoints
│   │   └── config.ts                        # Config endpoints
│   ├── runtime/
│   │   ├── workflow-compiler.ts             # JSON definition -> Mastra workflow
│   │   └── workflow-validator.ts            # Validate workflow definitions
│   ├── services/
│   │   ├── config.ts                        # Config loading/saving
│   │   ├── playbooks.ts                     # Playbook file management
│   │   ├── investigations.ts                # Investigation persistence
│   │   └── adapter-health.ts                # Adapter connectivity checks
│   └── index.ts                             # Server entry point
├── package.json
└── tsconfig.json
```

### packages/ui

```
packages/ui/
├── src/
│   ├── api/
│   │   └── client.ts                       # Type-safe API client
│   ├── components/
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── status-bar.tsx
│   │   │   └── app-shell.tsx
│   │   ├── investigation/
│   │   │   ├── symptom-input.tsx
│   │   │   ├── investigation-timeline.tsx
│   │   │   ├── step-card.tsx
│   │   │   ├── approval-dialog.tsx
│   │   │   └── report-view.tsx
│   │   ├── workflow-builder/
│   │   │   ├── canvas.tsx
│   │   │   ├── node-palette.tsx
│   │   │   ├── properties-panel.tsx
│   │   │   ├── toolbar.tsx
│   │   │   ├── execution-overlay.tsx
│   │   │   └── nodes/
│   │   │       ├── agent-node.tsx
│   │   │       ├── tool-node.tsx
│   │   │       ├── branch-node.tsx
│   │   │       ├── parallel-node.tsx
│   │   │       ├── approval-node.tsx
│   │   │       ├── map-node.tsx
│   │   │       ├── input-node.tsx
│   │   │       └── output-node.tsx
│   │   ├── agents/
│   │   │   ├── agent-card.tsx
│   │   │   └── agent-chat.tsx
│   │   └── common/
│   │       ├── status-badge.tsx
│   │       └── streaming-text.tsx
│   ├── views/
│   │   ├── dashboard.tsx
│   │   ├── investigations.tsx
│   │   ├── workflow-builder.tsx
│   │   ├── agents.tsx
│   │   ├── run-history.tsx
│   │   ├── playbooks.tsx
│   │   └── settings.tsx
│   ├── stores/
│   │   ├── investigation.ts
│   │   ├── workflow.ts
│   │   └── app.ts
│   ├── types/
│   │   └── index.ts                        # Shared TypeScript types
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
└── components.json                          # shadcn/ui config
```

### Root

```
mission-control/
├── packages/
│   ├── server/
│   └── ui/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

---

## Task 1: Monorepo Scaffolding

**Files:**
- Create: `mission-control/package.json`
- Create: `mission-control/pnpm-workspace.yaml`
- Create: `mission-control/turbo.json`
- Create: `mission-control/tsconfig.base.json`
- Create: `mission-control/.gitignore`

- [ ] **Step 1: Create the mission-control root directory**

```bash
mkdir -p /home/tbaderts/data/workspace/oms/mission-control
```

- [ ] **Step 2: Create root package.json**

Create `mission-control/package.json`:

```json
{
  "name": "mission-control",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "clean": "turbo clean"
  },
  "devDependencies": {
    "turbo": "^2.5.0",
    "typescript": "^5.8.0"
  },
  "packageManager": "pnpm@10.6.0"
}
```

- [ ] **Step 3: Create pnpm-workspace.yaml**

Create `mission-control/pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 4: Create turbo.json**

Create `mission-control/turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": {
      "persistent": true,
      "cache": false
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "lint": {},
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 5: Create tsconfig.base.json**

Create `mission-control/tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 6: Create .gitignore**

Create `mission-control/.gitignore`:

```
node_modules/
dist/
.turbo/
.mastra/
*.tsbuildinfo
```

- [ ] **Step 7: Install root dependencies**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
pnpm install
```

Expected: lockfile created, turbo and typescript installed.

- [ ] **Step 8: Commit**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
git add -A
git commit -m "feat(mission-control): scaffold monorepo root with pnpm + turbo"
```

---

## Task 2: Server Package - Mastra Foundation

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/mastra/index.ts`
- Create: `packages/server/src/index.ts`

- [ ] **Step 1: Create server package directory**

```bash
mkdir -p /home/tbaderts/data/workspace/oms/mission-control/packages/server/src/mastra
```

- [ ] **Step 2: Create server package.json**

Create `packages/server/package.json`:

```json
{
  "name": "@mission-control/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "mastra dev",
    "build": "mastra build",
    "clean": "rm -rf dist .mastra"
  },
  "dependencies": {
    "@mastra/core": "latest",
    "@mastra/server": "latest",
    "@mastra/libsql": "latest",
    "hono": "^4.7.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 3: Create server tsconfig.json**

Create `packages/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create minimal Mastra instance**

Create `packages/server/src/mastra/index.ts`:

```typescript
import { Mastra } from '@mastra/core'
import { LibSQLStore } from '@mastra/libsql'

export const mastra = new Mastra({
  storage: new LibSQLStore({
    id: 'mission-control-storage',
    url: 'file:./mission-control.db',
  }),
  server: {
    port: 3100,
    cors: {
      origin: ['http://localhost:5173'],
      credentials: true,
    },
    build: {
      swaggerUI: true,
      openAPIDocs: true,
      apiReqLogs: true,
    },
  },
})
```

- [ ] **Step 5: Create server entry point**

Create `packages/server/src/index.ts`:

```typescript
export { mastra } from './mastra/index.js'
```

- [ ] **Step 6: Install server dependencies**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
pnpm install
```

- [ ] **Step 7: Verify Mastra dev server starts**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control/packages/server
pnpm dev
```

Expected: Mastra dev server starts on port 3100, Studio available at `http://localhost:3100`.

- [ ] **Step 8: Commit**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
git add packages/server/
git commit -m "feat(server): add Mastra foundation with LibSQL storage"
```

---

## Task 3: Server - Configuration Service

**Files:**
- Create: `packages/server/src/services/config.ts`

- [ ] **Step 1: Create config service**

Create `packages/server/src/services/config.ts`:

```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface MissionControlConfig {
  server: { port: number }
  ai: {
    provider: string
    model: string
    apiKey: string
  }
  adapters: {
    kubernetes: { enabled: boolean; kubeconfig: string; defaultNamespace: string }
    docker: { enabled: boolean; socketPath: string }
    postgresql: { enabled: boolean; connectionString: string }
    prometheus: { enabled: boolean; url: string }
  }
  playbooks: { path: string }
  workflows: { path: string }
  investigations: { path: string }
}

const CONFIG_DIR = join(homedir(), '.mission-control')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

const DEFAULT_CONFIG: MissionControlConfig = {
  server: { port: 3100 },
  ai: {
    provider: 'anthropic',
    model: 'anthropic/claude-sonnet-4-6',
    apiKey: process.env.MC_AI_API_KEY ?? '',
  },
  adapters: {
    kubernetes: {
      enabled: true,
      kubeconfig: join(homedir(), '.kube', 'config'),
      defaultNamespace: 'default',
    },
    docker: {
      enabled: true,
      socketPath: '/var/run/docker.sock',
    },
    postgresql: {
      enabled: false,
      connectionString: process.env.MC_PG_CONNECTION ?? '',
    },
    prometheus: {
      enabled: false,
      url: 'http://localhost:9090',
    },
  },
  playbooks: { path: join(CONFIG_DIR, 'playbooks') },
  workflows: { path: join(CONFIG_DIR, 'workflows') },
  investigations: { path: join(CONFIG_DIR, 'investigations') },
}

export function ensureConfigDirs(): void {
  const dirs = [
    CONFIG_DIR,
    DEFAULT_CONFIG.playbooks.path,
    DEFAULT_CONFIG.workflows.path,
    DEFAULT_CONFIG.investigations.path,
  ]
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }
}

export function loadConfig(): MissionControlConfig {
  ensureConfigDirs()
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2))
    return DEFAULT_CONFIG
  }
  const raw = readFileSync(CONFIG_FILE, 'utf-8')
  const userConfig = JSON.parse(raw) as Partial<MissionControlConfig>
  return { ...DEFAULT_CONFIG, ...userConfig }
}

export function saveConfig(config: MissionControlConfig): void {
  ensureConfigDirs()
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
git add packages/server/src/services/config.ts
git commit -m "feat(server): add configuration service with defaults"
```

---

## Task 4: Server - Kubernetes Tools

**Files:**
- Create: `packages/server/src/mastra/tools/kubernetes/list-pods.ts`
- Create: `packages/server/src/mastra/tools/kubernetes/get-pod-status.ts`
- Create: `packages/server/src/mastra/tools/kubernetes/get-pod-logs.ts`
- Create: `packages/server/src/mastra/tools/kubernetes/list-deployments.ts`
- Create: `packages/server/src/mastra/tools/kubernetes/list-services.ts`
- Create: `packages/server/src/mastra/tools/kubernetes/get-events.ts`
- Create: `packages/server/src/mastra/tools/kubernetes/index.ts`

- [ ] **Step 1: Install Kubernetes client**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control/packages/server
pnpm add @kubernetes/client-node
```

- [ ] **Step 2: Create list-pods tool**

Create `packages/server/src/mastra/tools/kubernetes/list-pods.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import * as k8s from '@kubernetes/client-node'
import { loadConfig } from '../../../services/config.js'

const podSchema = z.object({
  name: z.string(),
  namespace: z.string(),
  status: z.string(),
  ready: z.string(),
  restarts: z.number(),
  age: z.string(),
  node: z.string().optional(),
})

export const listPods = createTool({
  id: 'k8s-list-pods',
  description: 'List Kubernetes pods in a namespace with status, ready count, restarts, and age. Use to check pod health and identify failing pods.',
  inputSchema: z.object({
    namespace: z.string().optional().describe('Namespace to list pods from. Defaults to configured default namespace.'),
    labelSelector: z.string().optional().describe('Label selector to filter pods, e.g. "app=oms-core"'),
  }),
  outputSchema: z.object({
    pods: z.array(podSchema),
  }),
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const kc = new k8s.KubeConfig()
    kc.loadFromFile(config.adapters.kubernetes.kubeconfig)
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)

    const ns = input.namespace ?? config.adapters.kubernetes.defaultNamespace
    const response = await coreApi.listNamespacedPod({ namespace: ns, labelSelector: input.labelSelector })

    const pods = (response.items ?? []).map((pod) => {
      const containers = pod.status?.containerStatuses ?? []
      const readyCount = containers.filter((c) => c.ready).length
      const totalCount = containers.length
      const restarts = containers.reduce((sum, c) => sum + (c.restartCount ?? 0), 0)
      const createdAt = pod.metadata?.creationTimestamp
      const age = createdAt ? formatAge(new Date(createdAt)) : 'unknown'

      return {
        name: pod.metadata?.name ?? 'unknown',
        namespace: pod.metadata?.namespace ?? ns,
        status: pod.status?.phase ?? 'Unknown',
        ready: `${readyCount}/${totalCount}`,
        restarts,
        age,
        node: pod.spec?.nodeName,
      }
    })

    return { pods }
  },
})

function formatAge(created: Date): string {
  const diffMs = Date.now() - created.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 60) return `${diffMin}m`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h`
  const diffDays = Math.floor(diffHrs / 24)
  return `${diffDays}d`
}
```

- [ ] **Step 3: Create get-pod-status tool**

Create `packages/server/src/mastra/tools/kubernetes/get-pod-status.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import * as k8s from '@kubernetes/client-node'
import { loadConfig } from '../../../services/config.js'

export const getPodStatus = createTool({
  id: 'k8s-get-pod-status',
  description: 'Get detailed status of a specific Kubernetes pod including conditions, container states, and recent events. Use to diagnose why a pod is unhealthy.',
  inputSchema: z.object({
    name: z.string().describe('Pod name'),
    namespace: z.string().optional().describe('Namespace. Defaults to configured default.'),
  }),
  outputSchema: z.object({
    name: z.string(),
    namespace: z.string(),
    phase: z.string(),
    conditions: z.array(z.object({
      type: z.string(),
      status: z.string(),
      reason: z.string().optional(),
      message: z.string().optional(),
    })),
    containers: z.array(z.object({
      name: z.string(),
      ready: z.boolean(),
      restartCount: z.number(),
      state: z.string(),
      lastTerminationReason: z.string().optional(),
    })),
  }),
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const kc = new k8s.KubeConfig()
    kc.loadFromFile(config.adapters.kubernetes.kubeconfig)
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)

    const ns = input.namespace ?? config.adapters.kubernetes.defaultNamespace
    const pod = await coreApi.readNamespacedPod({ name: input.name, namespace: ns })

    const conditions = (pod.status?.conditions ?? []).map((c) => ({
      type: c.type ?? 'Unknown',
      status: c.status ?? 'Unknown',
      reason: c.reason,
      message: c.message,
    }))

    const containers = (pod.status?.containerStatuses ?? []).map((c) => {
      let state = 'unknown'
      if (c.state?.running) state = 'running'
      else if (c.state?.waiting) state = `waiting: ${c.state.waiting.reason ?? 'unknown'}`
      else if (c.state?.terminated) state = `terminated: ${c.state.terminated.reason ?? 'unknown'}`

      return {
        name: c.name ?? 'unknown',
        ready: c.ready ?? false,
        restartCount: c.restartCount ?? 0,
        state,
        lastTerminationReason: c.lastState?.terminated?.reason,
      }
    })

    return {
      name: pod.metadata?.name ?? input.name,
      namespace: pod.metadata?.namespace ?? ns,
      phase: pod.status?.phase ?? 'Unknown',
      conditions,
      containers,
    }
  },
})
```

- [ ] **Step 4: Create get-pod-logs tool**

Create `packages/server/src/mastra/tools/kubernetes/get-pod-logs.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import * as k8s from '@kubernetes/client-node'
import { loadConfig } from '../../../services/config.js'

export const getPodLogs = createTool({
  id: 'k8s-get-pod-logs',
  description: 'Read logs from a Kubernetes pod container. Use to find errors, stack traces, and application-level issues.',
  inputSchema: z.object({
    name: z.string().describe('Pod name'),
    namespace: z.string().optional().describe('Namespace. Defaults to configured default.'),
    container: z.string().optional().describe('Container name. Required if pod has multiple containers.'),
    tailLines: z.number().optional().default(200).describe('Number of lines from the end to return.'),
    sinceSeconds: z.number().optional().describe('Return logs from the last N seconds.'),
  }),
  outputSchema: z.object({
    logs: z.string(),
    lineCount: z.number(),
  }),
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const kc = new k8s.KubeConfig()
    kc.loadFromFile(config.adapters.kubernetes.kubeconfig)
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)

    const ns = input.namespace ?? config.adapters.kubernetes.defaultNamespace
    const logs = await coreApi.readNamespacedPodLog({
      name: input.name,
      namespace: ns,
      container: input.container,
      tailLines: input.tailLines,
      sinceSeconds: input.sinceSeconds,
    })

    const logStr = typeof logs === 'string' ? logs : ''
    const lineCount = logStr.split('\n').filter(Boolean).length

    return { logs: logStr, lineCount }
  },
})
```

- [ ] **Step 5: Create list-deployments tool**

Create `packages/server/src/mastra/tools/kubernetes/list-deployments.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import * as k8s from '@kubernetes/client-node'
import { loadConfig } from '../../../services/config.js'

export const listDeployments = createTool({
  id: 'k8s-list-deployments',
  description: 'List Kubernetes deployments with replica status. Use to check if deployments are healthy and fully rolled out.',
  inputSchema: z.object({
    namespace: z.string().optional().describe('Namespace. Defaults to configured default.'),
  }),
  outputSchema: z.object({
    deployments: z.array(z.object({
      name: z.string(),
      namespace: z.string(),
      ready: z.string(),
      upToDate: z.number(),
      available: z.number(),
      age: z.string(),
    })),
  }),
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const kc = new k8s.KubeConfig()
    kc.loadFromFile(config.adapters.kubernetes.kubeconfig)
    const appsApi = kc.makeApiClient(k8s.AppsV1Api)

    const ns = input.namespace ?? config.adapters.kubernetes.defaultNamespace
    const response = await appsApi.listNamespacedDeployment({ namespace: ns })

    const deployments = (response.items ?? []).map((dep) => {
      const createdAt = dep.metadata?.creationTimestamp
      const age = createdAt ? formatAge(new Date(createdAt)) : 'unknown'

      return {
        name: dep.metadata?.name ?? 'unknown',
        namespace: dep.metadata?.namespace ?? ns,
        ready: `${dep.status?.readyReplicas ?? 0}/${dep.spec?.replicas ?? 0}`,
        upToDate: dep.status?.updatedReplicas ?? 0,
        available: dep.status?.availableReplicas ?? 0,
        age,
      }
    })

    return { deployments }
  },
})

function formatAge(created: Date): string {
  const diffMs = Date.now() - created.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 60) return `${diffMin}m`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h`
  return `${Math.floor(diffHrs / 24)}d`
}
```

- [ ] **Step 6: Create list-services tool**

Create `packages/server/src/mastra/tools/kubernetes/list-services.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import * as k8s from '@kubernetes/client-node'
import { loadConfig } from '../../../services/config.js'

export const listServices = createTool({
  id: 'k8s-list-services',
  description: 'List Kubernetes services with type, cluster IP, and ports. Use to verify service endpoints and connectivity.',
  inputSchema: z.object({
    namespace: z.string().optional().describe('Namespace. Defaults to configured default.'),
  }),
  outputSchema: z.object({
    services: z.array(z.object({
      name: z.string(),
      namespace: z.string(),
      type: z.string(),
      clusterIP: z.string(),
      ports: z.array(z.string()),
    })),
  }),
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const kc = new k8s.KubeConfig()
    kc.loadFromFile(config.adapters.kubernetes.kubeconfig)
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)

    const ns = input.namespace ?? config.adapters.kubernetes.defaultNamespace
    const response = await coreApi.listNamespacedService({ namespace: ns })

    const services = (response.items ?? []).map((svc) => ({
      name: svc.metadata?.name ?? 'unknown',
      namespace: svc.metadata?.namespace ?? ns,
      type: svc.spec?.type ?? 'ClusterIP',
      clusterIP: svc.spec?.clusterIP ?? 'None',
      ports: (svc.spec?.ports ?? []).map((p) => `${p.port}/${p.protocol ?? 'TCP'}`),
    }))

    return { services }
  },
})
```

- [ ] **Step 7: Create get-events tool**

Create `packages/server/src/mastra/tools/kubernetes/get-events.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import * as k8s from '@kubernetes/client-node'
import { loadConfig } from '../../../services/config.js'

export const getEvents = createTool({
  id: 'k8s-get-events',
  description: 'Get recent Kubernetes events in a namespace. Use to find warnings, errors, scheduling failures, and OOMKilled events.',
  inputSchema: z.object({
    namespace: z.string().optional().describe('Namespace. Defaults to configured default.'),
    involvedObjectName: z.string().optional().describe('Filter events for a specific resource name.'),
    limit: z.number().optional().default(50).describe('Maximum number of events to return.'),
  }),
  outputSchema: z.object({
    events: z.array(z.object({
      type: z.string(),
      reason: z.string(),
      message: z.string(),
      involvedObject: z.string(),
      count: z.number(),
      lastTimestamp: z.string(),
    })),
  }),
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const kc = new k8s.KubeConfig()
    kc.loadFromFile(config.adapters.kubernetes.kubeconfig)
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)

    const ns = input.namespace ?? config.adapters.kubernetes.defaultNamespace
    const response = await coreApi.listNamespacedEvent({ namespace: ns, limit: input.limit })

    let events = (response.items ?? []).map((evt) => ({
      type: evt.type ?? 'Normal',
      reason: evt.reason ?? 'Unknown',
      message: evt.message ?? '',
      involvedObject: `${evt.involvedObject?.kind ?? ''}/${evt.involvedObject?.name ?? ''}`,
      count: evt.count ?? 1,
      lastTimestamp: evt.lastTimestamp?.toISOString() ?? '',
    }))

    if (input.involvedObjectName) {
      events = events.filter((e) => e.involvedObject.includes(input.involvedObjectName!))
    }

    events.sort((a, b) => b.lastTimestamp.localeCompare(a.lastTimestamp))

    return { events }
  },
})
```

- [ ] **Step 8: Create Kubernetes tools index**

Create `packages/server/src/mastra/tools/kubernetes/index.ts`:

```typescript
export { listPods } from './list-pods.js'
export { getPodStatus } from './get-pod-status.js'
export { getPodLogs } from './get-pod-logs.js'
export { listDeployments } from './list-deployments.js'
export { listServices } from './list-services.js'
export { getEvents } from './get-events.js'
```

- [ ] **Step 9: Commit**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
git add packages/server/src/mastra/tools/kubernetes/
git commit -m "feat(server): add Kubernetes adapter tools (pods, deployments, services, events, logs)"
```

---

## Task 5: Server - Docker Tools

**Files:**
- Create: `packages/server/src/mastra/tools/docker/list-containers.ts`
- Create: `packages/server/src/mastra/tools/docker/get-container-logs.ts`
- Create: `packages/server/src/mastra/tools/docker/search-logs.ts`
- Create: `packages/server/src/mastra/tools/docker/start-container.ts`
- Create: `packages/server/src/mastra/tools/docker/stop-container.ts`
- Create: `packages/server/src/mastra/tools/docker/index.ts`

- [ ] **Step 1: Install dockerode**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control/packages/server
pnpm add dockerode
pnpm add -D @types/dockerode
```

- [ ] **Step 2: Create list-containers tool**

Create `packages/server/src/mastra/tools/docker/list-containers.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import Docker from 'dockerode'
import { loadConfig } from '../../../services/config.js'

export const listContainers = createTool({
  id: 'docker-list-containers',
  description: 'List Docker containers with status, image, ports, and resource usage. Use to check which services are running locally.',
  inputSchema: z.object({
    all: z.boolean().optional().default(false).describe('Include stopped containers.'),
  }),
  outputSchema: z.object({
    containers: z.array(z.object({
      id: z.string(),
      name: z.string(),
      image: z.string(),
      status: z.string(),
      state: z.string(),
      ports: z.array(z.string()),
      created: z.string(),
    })),
  }),
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const docker = new Docker({ socketPath: config.adapters.docker.socketPath })
    const raw = await docker.listContainers({ all: input.all })

    const containers = raw.map((c) => ({
      id: c.Id.slice(0, 12),
      name: (c.Names?.[0] ?? '').replace(/^\//, ''),
      image: c.Image ?? '',
      status: c.Status ?? '',
      state: c.State ?? '',
      ports: (c.Ports ?? []).map((p) =>
        p.PublicPort ? `${p.PublicPort}->${p.PrivatePort}/${p.Type}` : `${p.PrivatePort}/${p.Type}`
      ),
      created: new Date((c.Created ?? 0) * 1000).toISOString(),
    }))

    return { containers }
  },
})
```

- [ ] **Step 3: Create get-container-logs tool**

Create `packages/server/src/mastra/tools/docker/get-container-logs.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import Docker from 'dockerode'
import { loadConfig } from '../../../services/config.js'

export const getContainerLogs = createTool({
  id: 'docker-get-container-logs',
  description: 'Read logs from a Docker container. Use to find application errors, stack traces, and runtime issues.',
  inputSchema: z.object({
    containerId: z.string().describe('Container ID or name.'),
    tail: z.number().optional().default(200).describe('Number of lines from the end.'),
    since: z.number().optional().describe('Unix timestamp. Return logs since this time.'),
  }),
  outputSchema: z.object({
    logs: z.string(),
    lineCount: z.number(),
  }),
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const docker = new Docker({ socketPath: config.adapters.docker.socketPath })
    const container = docker.getContainer(input.containerId)

    const logBuffer = await container.logs({
      stdout: true,
      stderr: true,
      tail: input.tail,
      since: input.since,
      timestamps: true,
    })

    const logs = typeof logBuffer === 'string' ? logBuffer : logBuffer.toString('utf-8')
    const lineCount = logs.split('\n').filter(Boolean).length

    return { logs, lineCount }
  },
})
```

- [ ] **Step 4: Create search-logs tool**

Create `packages/server/src/mastra/tools/docker/search-logs.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import Docker from 'dockerode'
import { loadConfig } from '../../../services/config.js'

export const searchLogs = createTool({
  id: 'docker-search-logs',
  description: 'Search across multiple Docker container logs for a pattern. Use to find errors across services or correlate events by ID.',
  inputSchema: z.object({
    pattern: z.string().describe('Text pattern to search for (case-insensitive).'),
    containerNames: z.array(z.string()).optional().describe('Container names to search. Searches all running containers if omitted.'),
    tail: z.number().optional().default(500).describe('Lines per container to search.'),
  }),
  outputSchema: z.object({
    matches: z.array(z.object({
      container: z.string(),
      line: z.string(),
    })),
    totalMatches: z.number(),
  }),
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const docker = new Docker({ socketPath: config.adapters.docker.socketPath })

    let containers = await docker.listContainers()
    if (input.containerNames?.length) {
      containers = containers.filter((c) =>
        input.containerNames!.some((name) => (c.Names?.[0] ?? '').replace(/^\//, '') === name)
      )
    }

    const matches: Array<{ container: string; line: string }> = []
    const regex = new RegExp(input.pattern, 'i')

    for (const c of containers) {
      const container = docker.getContainer(c.Id)
      const logBuffer = await container.logs({ stdout: true, stderr: true, tail: input.tail })
      const logs = typeof logBuffer === 'string' ? logBuffer : logBuffer.toString('utf-8')

      for (const line of logs.split('\n')) {
        if (regex.test(line)) {
          matches.push({
            container: (c.Names?.[0] ?? '').replace(/^\//, ''),
            line: line.trim(),
          })
        }
      }
    }

    return { matches, totalMatches: matches.length }
  },
})
```

- [ ] **Step 5: Create start-container tool (with approval)**

Create `packages/server/src/mastra/tools/docker/start-container.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import Docker from 'dockerode'
import { loadConfig } from '../../../services/config.js'

export const startContainer = createTool({
  id: 'docker-start-container',
  description: 'Start a stopped Docker container. Requires human approval.',
  inputSchema: z.object({
    containerId: z.string().describe('Container ID or name to start.'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  requireApproval: true,
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const docker = new Docker({ socketPath: config.adapters.docker.socketPath })
    const container = docker.getContainer(input.containerId)
    await container.start()
    return { success: true, message: `Container ${input.containerId} started.` }
  },
})
```

- [ ] **Step 6: Create stop-container tool (with approval)**

Create `packages/server/src/mastra/tools/docker/stop-container.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import Docker from 'dockerode'
import { loadConfig } from '../../../services/config.js'

export const stopContainer = createTool({
  id: 'docker-stop-container',
  description: 'Stop a running Docker container. Requires human approval.',
  inputSchema: z.object({
    containerId: z.string().describe('Container ID or name to stop.'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  requireApproval: true,
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const docker = new Docker({ socketPath: config.adapters.docker.socketPath })
    const container = docker.getContainer(input.containerId)
    await container.stop()
    return { success: true, message: `Container ${input.containerId} stopped.` }
  },
})
```

- [ ] **Step 7: Create Docker tools index**

Create `packages/server/src/mastra/tools/docker/index.ts`:

```typescript
export { listContainers } from './list-containers.js'
export { getContainerLogs } from './get-container-logs.js'
export { searchLogs } from './search-logs.js'
export { startContainer } from './start-container.js'
export { stopContainer } from './stop-container.js'
```

- [ ] **Step 8: Commit**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
git add packages/server/src/mastra/tools/docker/
git commit -m "feat(server): add Docker adapter tools (containers, logs, search, start/stop with approval)"
```

---

## Task 6: Server - PostgreSQL Tools

**Files:**
- Create: `packages/server/src/mastra/tools/postgres/execute-query.ts`
- Create: `packages/server/src/mastra/tools/postgres/get-schema.ts`
- Create: `packages/server/src/mastra/tools/postgres/search-entities.ts`
- Create: `packages/server/src/mastra/tools/postgres/index.ts`

- [ ] **Step 1: Install pg**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control/packages/server
pnpm add pg
pnpm add -D @types/pg
```

- [ ] **Step 2: Create execute-query tool**

Create `packages/server/src/mastra/tools/postgres/execute-query.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import pg from 'pg'
import { loadConfig } from '../../../services/config.js'

export const executeQuery = createTool({
  id: 'pg-execute-query',
  description: 'Execute a read-only SQL query against PostgreSQL. Only SELECT statements are allowed. Use to inspect data, check entity states, and find anomalies.',
  inputSchema: z.object({
    sql: z.string().describe('SQL SELECT query to execute.'),
  }),
  outputSchema: z.object({
    columns: z.array(z.string()),
    rows: z.array(z.record(z.unknown())),
    rowCount: z.number(),
    durationMs: z.number(),
  }),
  execute: async ({ context: input }) => {
    const normalized = input.sql.trim().toLowerCase()
    if (!normalized.startsWith('select') && !normalized.startsWith('with')) {
      throw new Error('Only SELECT queries are allowed.')
    }

    const config = loadConfig()
    const client = new pg.Client({ connectionString: config.adapters.postgresql.connectionString })
    await client.connect()

    try {
      const start = Date.now()
      const result = await client.query(input.sql)
      const durationMs = Date.now() - start

      const columns = result.fields.map((f) => f.name)
      const rows = result.rows as Record<string, unknown>[]

      return { columns, rows, rowCount: result.rowCount ?? 0, durationMs }
    } finally {
      await client.end()
    }
  },
})
```

- [ ] **Step 3: Create get-schema tool**

Create `packages/server/src/mastra/tools/postgres/get-schema.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import pg from 'pg'
import { loadConfig } from '../../../services/config.js'

export const getSchema = createTool({
  id: 'pg-get-schema',
  description: 'Get the database schema: tables, columns, types, and foreign keys. Use to understand data structure before writing queries.',
  inputSchema: z.object({
    schemaName: z.string().optional().default('public').describe('Schema name to inspect.'),
  }),
  outputSchema: z.object({
    tables: z.array(z.object({
      name: z.string(),
      columns: z.array(z.object({
        name: z.string(),
        type: z.string(),
        nullable: z.boolean(),
      })),
      rowCountEstimate: z.number(),
    })),
  }),
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const client = new pg.Client({ connectionString: config.adapters.postgresql.connectionString })
    await client.connect()

    try {
      const tablesResult = await client.query(`
        SELECT c.relname AS name, c.reltuples::bigint AS row_estimate
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relkind = 'r'
        ORDER BY c.relname
      `, [input.schemaName])

      const tables = []
      for (const table of tablesResult.rows) {
        const colsResult = await client.query(`
          SELECT column_name AS name, data_type AS type, is_nullable = 'YES' AS nullable
          FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position
        `, [input.schemaName, table.name])

        tables.push({
          name: table.name,
          columns: colsResult.rows.map((c: { name: string; type: string; nullable: boolean }) => ({
            name: c.name,
            type: c.type,
            nullable: c.nullable,
          })),
          rowCountEstimate: Number(table.row_estimate),
        })
      }

      return { tables }
    } finally {
      await client.end()
    }
  },
})
```

- [ ] **Step 4: Create search-entities tool**

Create `packages/server/src/mastra/tools/postgres/search-entities.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import pg from 'pg'
import { loadConfig } from '../../../services/config.js'

export const searchEntities = createTool({
  id: 'pg-search-entities',
  description: 'Search for an entity by ID across common ID columns (id, entity_id, order_id, etc.) in all tables. Use to find all records related to a specific entity.',
  inputSchema: z.object({
    entityId: z.string().describe('Entity ID to search for.'),
    schemaName: z.string().optional().default('public').describe('Schema to search in.'),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      table: z.string(),
      column: z.string(),
      matchCount: z.number(),
      sampleRows: z.array(z.record(z.unknown())),
    })),
  }),
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const client = new pg.Client({ connectionString: config.adapters.postgresql.connectionString })
    await client.connect()

    try {
      const idColumnsResult = await client.query(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = $1
          AND (column_name = 'id' OR column_name LIKE '%_id' OR column_name LIKE '%Id')
          AND data_type IN ('character varying', 'text', 'uuid', 'bigint', 'integer')
        ORDER BY table_name
      `, [input.schemaName])

      const results = []
      for (const col of idColumnsResult.rows) {
        const countResult = await client.query(
          `SELECT COUNT(*) as cnt FROM "${input.schemaName}"."${col.table_name}" WHERE "${col.column_name}"::text = $1`,
          [input.entityId]
        )
        const count = Number(countResult.rows[0].cnt)
        if (count > 0) {
          const sampleResult = await client.query(
            `SELECT * FROM "${input.schemaName}"."${col.table_name}" WHERE "${col.column_name}"::text = $1 LIMIT 5`,
            [input.entityId]
          )
          results.push({
            table: col.table_name,
            column: col.column_name,
            matchCount: count,
            sampleRows: sampleResult.rows,
          })
        }
      }

      return { results }
    } finally {
      await client.end()
    }
  },
})
```

- [ ] **Step 5: Create PostgreSQL tools index**

Create `packages/server/src/mastra/tools/postgres/index.ts`:

```typescript
export { executeQuery } from './execute-query.js'
export { getSchema } from './get-schema.js'
export { searchEntities } from './search-entities.js'
```

- [ ] **Step 6: Commit**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
git add packages/server/src/mastra/tools/postgres/
git commit -m "feat(server): add PostgreSQL adapter tools (query, schema, entity search)"
```

---

## Task 7: Server - Prometheus Tools

**Files:**
- Create: `packages/server/src/mastra/tools/prometheus/query-metrics.ts`
- Create: `packages/server/src/mastra/tools/prometheus/query-range.ts`
- Create: `packages/server/src/mastra/tools/prometheus/get-alerts.ts`
- Create: `packages/server/src/mastra/tools/prometheus/index.ts`

- [ ] **Step 1: Create query-metrics tool**

Create `packages/server/src/mastra/tools/prometheus/query-metrics.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { loadConfig } from '../../../services/config.js'

export const queryMetrics = createTool({
  id: 'prom-query-metrics',
  description: 'Execute an instant PromQL query against Prometheus. Use to check current metric values like CPU, memory, request rates, error rates.',
  inputSchema: z.object({
    query: z.string().describe('PromQL query expression, e.g. "container_memory_usage_bytes{pod=~\"oms.*\"}"'),
    time: z.string().optional().describe('Evaluation timestamp (RFC3339 or Unix). Defaults to now.'),
  }),
  outputSchema: z.object({
    resultType: z.string(),
    results: z.array(z.object({
      metric: z.record(z.string()),
      value: z.string(),
      timestamp: z.number(),
    })),
  }),
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const params = new URLSearchParams({ query: input.query })
    if (input.time) params.set('time', input.time)

    const response = await fetch(`${config.adapters.prometheus.url}/api/v1/query?${params}`)
    const json = await response.json() as {
      data: {
        resultType: string
        result: Array<{ metric: Record<string, string>; value: [number, string] }>
      }
    }

    return {
      resultType: json.data.resultType,
      results: json.data.result.map((r) => ({
        metric: r.metric,
        value: r.value[1],
        timestamp: r.value[0],
      })),
    }
  },
})
```

- [ ] **Step 2: Create query-range tool**

Create `packages/server/src/mastra/tools/prometheus/query-range.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { loadConfig } from '../../../services/config.js'

export const queryRange = createTool({
  id: 'prom-query-range',
  description: 'Execute a range PromQL query to get metric values over time. Use to detect trends, spikes, and anomalies.',
  inputSchema: z.object({
    query: z.string().describe('PromQL query expression.'),
    start: z.string().describe('Start time (RFC3339 or Unix timestamp).'),
    end: z.string().describe('End time (RFC3339 or Unix timestamp).'),
    step: z.string().optional().default('60s').describe('Query resolution step, e.g. "60s", "5m".'),
  }),
  outputSchema: z.object({
    resultType: z.string(),
    series: z.array(z.object({
      metric: z.record(z.string()),
      values: z.array(z.object({
        timestamp: z.number(),
        value: z.string(),
      })),
    })),
  }),
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const params = new URLSearchParams({
      query: input.query,
      start: input.start,
      end: input.end,
      step: input.step,
    })

    const response = await fetch(`${config.adapters.prometheus.url}/api/v1/query_range?${params}`)
    const json = await response.json() as {
      data: {
        resultType: string
        result: Array<{ metric: Record<string, string>; values: Array<[number, string]> }>
      }
    }

    return {
      resultType: json.data.resultType,
      series: json.data.result.map((r) => ({
        metric: r.metric,
        values: r.values.map(([ts, val]) => ({ timestamp: ts, value: val })),
      })),
    }
  },
})
```

- [ ] **Step 3: Create get-alerts tool**

Create `packages/server/src/mastra/tools/prometheus/get-alerts.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { loadConfig } from '../../../services/config.js'

export const getAlerts = createTool({
  id: 'prom-get-alerts',
  description: 'Get active Prometheus alerts. Use to check if any alerting rules are firing.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    alerts: z.array(z.object({
      name: z.string(),
      state: z.string(),
      severity: z.string(),
      summary: z.string(),
      activeAt: z.string(),
    })),
  }),
  execute: async () => {
    const config = loadConfig()
    const response = await fetch(`${config.adapters.prometheus.url}/api/v1/alerts`)
    const json = await response.json() as {
      data: {
        alerts: Array<{
          labels: Record<string, string>
          annotations: Record<string, string>
          state: string
          activeAt: string
        }>
      }
    }

    return {
      alerts: json.data.alerts.map((a) => ({
        name: a.labels.alertname ?? 'unknown',
        state: a.state,
        severity: a.labels.severity ?? 'unknown',
        summary: a.annotations.summary ?? a.annotations.description ?? '',
        activeAt: a.activeAt,
      })),
    }
  },
})
```

- [ ] **Step 4: Create Prometheus tools index**

Create `packages/server/src/mastra/tools/prometheus/index.ts`:

```typescript
export { queryMetrics } from './query-metrics.js'
export { queryRange } from './query-range.js'
export { getAlerts } from './get-alerts.js'
```

- [ ] **Step 5: Commit**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
git add packages/server/src/mastra/tools/prometheus/
git commit -m "feat(server): add Prometheus adapter tools (query, range, alerts)"
```

---

## Task 8: Server - Shared Tools (Playbooks, Correlation, Report)

**Files:**
- Create: `packages/server/src/services/playbooks.ts`
- Create: `packages/server/src/mastra/tools/shared/search-playbooks.ts`
- Create: `packages/server/src/mastra/tools/shared/correlate-timeline.ts`
- Create: `packages/server/src/mastra/tools/shared/format-report.ts`
- Create: `packages/server/src/mastra/tools/shared/index.ts`

- [ ] **Step 1: Create playbook service**

Create `packages/server/src/services/playbooks.ts`:

```typescript
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig } from './config.js'

export interface Playbook {
  title: string
  triggers: string[]
  priority: number
  content: string
  filePath: string
}

export function loadPlaybooks(): Playbook[] {
  const config = loadConfig()
  const dir = config.playbooks.path
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'))

  return files.map((file) => {
    const filePath = join(dir, file)
    const raw = readFileSync(filePath, 'utf-8')
    const { frontmatter, content } = parseFrontmatter(raw)

    return {
      title: frontmatter.title ?? file.replace('.md', ''),
      triggers: frontmatter.triggers ?? [],
      priority: frontmatter.priority ?? 0,
      content,
      filePath,
    }
  })
}

export function matchPlaybook(symptom: string): Playbook | undefined {
  const playbooks = loadPlaybooks()
  const lowerSymptom = symptom.toLowerCase()

  const matches = playbooks
    .filter((p) => p.triggers.some((t) => lowerSymptom.includes(t.toLowerCase())))
    .sort((a, b) => b.priority - a.priority)

  return matches[0]
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { frontmatter: {}, content: raw }

  const lines = match[1].split('\n')
  const frontmatter: Record<string, unknown> = {}

  for (const line of lines) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value: unknown = line.slice(colonIdx + 1).trim()

    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((s) => s.trim())
    } else if (typeof value === 'string' && !isNaN(Number(value))) {
      value = Number(value)
    }

    frontmatter[key] = value
  }

  return { frontmatter, content: match[2] }
}
```

- [ ] **Step 2: Create search-playbooks tool**

Create `packages/server/src/mastra/tools/shared/search-playbooks.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { matchPlaybook, loadPlaybooks } from '../../../services/playbooks.js'

export const searchPlaybooks = createTool({
  id: 'search-playbooks',
  description: 'Search investigation playbooks by symptom keywords. Returns the best matching playbook with investigation steps to follow.',
  inputSchema: z.object({
    symptom: z.string().describe('Symptom description to match against playbook triggers.'),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    playbook: z.object({
      title: z.string(),
      content: z.string(),
      triggers: z.array(z.string()),
    }).optional(),
    availablePlaybooks: z.array(z.string()),
  }),
  execute: async ({ context: input }) => {
    const match = matchPlaybook(input.symptom)
    const all = loadPlaybooks()

    if (match) {
      return {
        found: true,
        playbook: { title: match.title, content: match.content, triggers: match.triggers },
        availablePlaybooks: all.map((p) => p.title),
      }
    }

    return {
      found: false,
      availablePlaybooks: all.map((p) => p.title),
    }
  },
})
```

- [ ] **Step 3: Create correlate-timeline tool**

Create `packages/server/src/mastra/tools/shared/correlate-timeline.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export const correlateTimeline = createTool({
  id: 'correlate-timeline',
  description: 'Correlate findings from multiple investigation steps into a unified chronological timeline. Pass events from different sources (logs, K8s, DB, metrics) and get a sorted timeline.',
  inputSchema: z.object({
    events: z.array(z.object({
      timestamp: z.string().describe('ISO 8601 timestamp.'),
      source: z.string().describe('Source system, e.g. "kubernetes", "docker-logs", "database", "prometheus".'),
      event: z.string().describe('What happened.'),
      details: z.string().optional().describe('Additional details.'),
      severity: z.enum(['info', 'warning', 'error', 'critical']).optional().default('info'),
    })),
  }),
  outputSchema: z.object({
    timeline: z.array(z.object({
      timestamp: z.string(),
      source: z.string(),
      event: z.string(),
      details: z.string().optional(),
      severity: z.string(),
    })),
    summary: z.string(),
  }),
  execute: async ({ context: input }) => {
    const sorted = [...input.events].sort((a, b) => a.timestamp.localeCompare(b.timestamp))

    const sources = [...new Set(sorted.map((e) => e.source))]
    const errors = sorted.filter((e) => e.severity === 'error' || e.severity === 'critical')

    let summary = `Timeline with ${sorted.length} events from ${sources.join(', ')}.`
    if (errors.length > 0) {
      summary += ` Found ${errors.length} error/critical events.`
    }
    if (sorted.length >= 2) {
      summary += ` Timespan: ${sorted[0].timestamp} to ${sorted[sorted.length - 1].timestamp}.`
    }

    return { timeline: sorted, summary }
  },
})
```

- [ ] **Step 4: Create format-report tool**

Create `packages/server/src/mastra/tools/shared/format-report.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export const formatReport = createTool({
  id: 'format-report',
  description: 'Format investigation findings into a structured report with root cause, evidence, timeline, and recommendations.',
  inputSchema: z.object({
    rootCause: z.string().describe('Root cause summary.'),
    evidence: z.array(z.object({
      source: z.string(),
      finding: z.string(),
      data: z.string().optional(),
    })),
    timeline: z.array(z.object({
      timestamp: z.string(),
      event: z.string(),
    })),
    recommendations: z.array(z.string()),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
  }),
  outputSchema: z.object({
    report: z.string(),
  }),
  execute: async ({ context: input }) => {
    const lines: string[] = [
      `# Investigation Report`,
      ``,
      `**Severity:** ${input.severity.toUpperCase()}`,
      ``,
      `## Root Cause`,
      input.rootCause,
      ``,
      `## Evidence`,
    ]

    for (const e of input.evidence) {
      lines.push(`- **${e.source}:** ${e.finding}`)
      if (e.data) lines.push(`  \`\`\`\n  ${e.data}\n  \`\`\``)
    }

    lines.push(``, `## Timeline`)
    for (const t of input.timeline) {
      lines.push(`- **${t.timestamp}** -- ${t.event}`)
    }

    lines.push(``, `## Recommendations`)
    for (const r of input.recommendations) {
      lines.push(`- ${r}`)
    }

    return { report: lines.join('\n') }
  },
})
```

- [ ] **Step 5: Create shared tools index**

Create `packages/server/src/mastra/tools/shared/index.ts`:

```typescript
export { searchPlaybooks } from './search-playbooks.js'
export { correlateTimeline } from './correlate-timeline.js'
export { formatReport } from './format-report.js'
```

- [ ] **Step 6: Commit**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
git add packages/server/src/services/playbooks.ts packages/server/src/mastra/tools/shared/
git commit -m "feat(server): add shared tools (playbooks, timeline correlation, report formatting)"
```

---

## Task 9: Server - Investigation Agents

**Files:**
- Create: `packages/server/src/mastra/agents/log-analyzer.ts`
- Create: `packages/server/src/mastra/agents/k8s-inspector.ts`
- Create: `packages/server/src/mastra/agents/db-querier.ts`
- Create: `packages/server/src/mastra/agents/metrics-analyzer.ts`
- Create: `packages/server/src/mastra/agents/investigation-supervisor.ts`

- [ ] **Step 1: Create log analyzer agent**

Create `packages/server/src/mastra/agents/log-analyzer.ts`:

```typescript
import { Agent } from '@mastra/core/agent'
import { listContainers, getContainerLogs, searchLogs } from '../tools/docker/index.js'

export const logAnalyzer = new Agent({
  id: 'log-analyzer',
  name: 'Log Analyzer',
  description: 'Analyzes container and pod logs to identify error patterns, stack traces, and timing correlations. Delegate to this agent when you need to find application-level errors in logs.',
  instructions: `You are a log analysis specialist. Your job is to:
1. Search container logs for errors, warnings, and stack traces
2. Identify error patterns and their frequency
3. Correlate timestamps across services to build event sequences
4. Extract relevant log lines that support the investigation

When analyzing logs:
- Start broad (search across all containers) then narrow down
- Look for ERROR, WARN, Exception, timeout, connection refused patterns
- Note timestamps precisely for timeline correlation
- Identify which service produced each finding
- Summarize patterns (e.g. "12 OOM errors in last 5 minutes")

Return structured findings with: service name, timestamp, error pattern, relevant log excerpt.`,
  model: 'anthropic/claude-sonnet-4-6',
  tools: { listContainers, getContainerLogs, searchLogs },
})
```

- [ ] **Step 2: Create K8s inspector agent**

Create `packages/server/src/mastra/agents/k8s-inspector.ts`:

```typescript
import { Agent } from '@mastra/core/agent'
import { listPods, getPodStatus, getPodLogs, listDeployments, listServices, getEvents } from '../tools/kubernetes/index.js'

export const k8sInspector = new Agent({
  id: 'k8s-inspector',
  name: 'Kubernetes Inspector',
  description: 'Inspects Kubernetes cluster health including pods, deployments, services, and events. Delegate to this agent when you need to check infrastructure-level health.',
  instructions: `You are a Kubernetes infrastructure specialist. Your job is to:
1. Check pod health: status, restarts, OOMKilled, CrashLoopBackOff
2. Inspect deployment rollout status and replica counts
3. Verify service endpoints and connectivity
4. Read cluster events for warnings and errors
5. Check resource utilization against limits

When investigating:
- Start with pod status to identify unhealthy pods
- Check events for the specific pods that are failing
- Look at deployment status to see if a rollout is in progress
- Read pod logs for the most recently restarted containers
- Note restart counts and termination reasons

Return structured findings with: resource name, status, key observations, and relevant events.`,
  model: 'anthropic/claude-sonnet-4-6',
  tools: { listPods, getPodStatus, getPodLogs, listDeployments, listServices, getEvents },
})
```

- [ ] **Step 3: Create database querier agent**

Create `packages/server/src/mastra/agents/db-querier.ts`:

```typescript
import { Agent } from '@mastra/core/agent'
import { executeQuery, getSchema, searchEntities } from '../tools/postgres/index.js'

export const dbQuerier = new Agent({
  id: 'db-querier',
  name: 'Database Querier',
  description: 'Queries PostgreSQL to find entities, check data consistency, and investigate application state. Delegate to this agent when you need to inspect database records.',
  instructions: `You are a database investigation specialist. Your job is to:
1. Search for entities by ID across tables
2. Check entity states and recent state transitions
3. Find data anomalies (null values, unexpected states, orphan records)
4. Query for recent activity around the time of an incident
5. Check for failed operations or error records

When investigating:
- First get the schema to understand available tables
- Search by entity ID to find all related records
- Use targeted queries to check specific conditions
- Look for records created/modified near the incident timestamp
- Only use SELECT queries (writes are not allowed)

Return structured findings with: table name, query used, key observations, and relevant records.`,
  model: 'anthropic/claude-sonnet-4-6',
  tools: { executeQuery, getSchema, searchEntities },
})
```

- [ ] **Step 4: Create metrics analyzer agent**

Create `packages/server/src/mastra/agents/metrics-analyzer.ts`:

```typescript
import { Agent } from '@mastra/core/agent'
import { queryMetrics, queryRange, getAlerts } from '../tools/prometheus/index.js'

export const metricsAnalyzer = new Agent({
  id: 'metrics-analyzer',
  name: 'Metrics Analyzer',
  description: 'Queries Prometheus for metrics, detects anomalies, and correlates metric changes with events. Delegate to this agent when you need to check resource utilization, request rates, or error rates.',
  instructions: `You are a metrics and observability specialist. Your job is to:
1. Check active alerts for relevant firing conditions
2. Query resource metrics (CPU, memory, disk, network)
3. Check application metrics (request rate, error rate, latency)
4. Detect anomalies: spikes, drops, trends
5. Correlate metric changes with incident timestamps

Common PromQL patterns:
- CPU: rate(container_cpu_usage_seconds_total[5m])
- Memory: container_memory_usage_bytes
- Request rate: rate(http_requests_total[5m])
- Error rate: rate(http_requests_total{status=~"5.."}[5m])
- Latency: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

When investigating:
- Start with alerts to see if anything is already flagged
- Check resource metrics for the affected services
- Use range queries to see trends over the last hour
- Compare current values to normal baselines
- Note exact times when metrics changed

Return structured findings with: metric name, current value, trend description, and whether it's anomalous.`,
  model: 'anthropic/claude-sonnet-4-6',
  tools: { queryMetrics, queryRange, getAlerts },
})
```

- [ ] **Step 5: Create investigation supervisor agent**

Create `packages/server/src/mastra/agents/investigation-supervisor.ts`:

```typescript
import { Agent } from '@mastra/core/agent'
import { logAnalyzer } from './log-analyzer.js'
import { k8sInspector } from './k8s-inspector.js'
import { dbQuerier } from './db-querier.js'
import { metricsAnalyzer } from './metrics-analyzer.js'
import { searchPlaybooks, correlateTimeline, formatReport } from '../tools/shared/index.js'

export const investigationSupervisor = new Agent({
  id: 'investigation-supervisor',
  name: 'Investigation Supervisor',
  description: 'Orchestrates incident investigations by coordinating specialized agents and producing root cause analysis reports.',
  instructions: `You are an incident investigation coordinator. You manage a team of specialized agents to diagnose operational issues.

YOUR TEAM:
- log-analyzer: Searches container/pod logs for errors and patterns
- k8s-inspector: Checks Kubernetes infrastructure health (pods, deployments, events)
- db-querier: Queries PostgreSQL for entity states and data anomalies
- metrics-analyzer: Checks Prometheus metrics for resource issues and anomalies

YOUR WORKFLOW:
1. First, search for a matching playbook using the symptom description
2. If a playbook is found, follow its steps as a guide (adapt as needed)
3. If no playbook, reason about the symptom and decide which agents to consult
4. Delegate to specialized agents based on what information you need
5. After each agent reports back, reason about findings and decide next steps
6. When you have enough evidence, correlate findings into a timeline
7. Produce a final report with root cause, evidence, timeline, and recommendations

RULES:
- Always start by searching for a playbook
- Delegate to agents rather than trying to use their tools directly
- After each delegation, summarize what you learned before proceeding
- If findings from one agent suggest checking another source, do so
- Build the timeline as you go -- note timestamps from every finding
- When you have identified the root cause, use the format-report tool
- If you cannot determine the root cause, say so and list what was checked`,
  model: 'anthropic/claude-sonnet-4-6',
  agents: { logAnalyzer, k8sInspector, dbQuerier, metricsAnalyzer },
  tools: { searchPlaybooks, correlateTimeline, formatReport },
})
```

- [ ] **Step 6: Commit**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
git add packages/server/src/mastra/agents/
git commit -m "feat(server): add investigation agents (log, k8s, db, metrics, supervisor)"
```

---

## Task 10: Server - Register All Agents & Tools in Mastra

**Files:**
- Modify: `packages/server/src/mastra/index.ts`

- [ ] **Step 1: Update Mastra instance with all agents, tools, workflows**

Replace `packages/server/src/mastra/index.ts` with:

```typescript
import { Mastra } from '@mastra/core'
import { LibSQLStore } from '@mastra/libsql'

import { investigationSupervisor } from './agents/investigation-supervisor.js'
import { logAnalyzer } from './agents/log-analyzer.js'
import { k8sInspector } from './agents/k8s-inspector.js'
import { dbQuerier } from './agents/db-querier.js'
import { metricsAnalyzer } from './agents/metrics-analyzer.js'

import * as k8sTools from './tools/kubernetes/index.js'
import * as dockerTools from './tools/docker/index.js'
import * as pgTools from './tools/postgres/index.js'
import * as promTools from './tools/prometheus/index.js'
import * as sharedTools from './tools/shared/index.js'

export const mastra = new Mastra({
  agents: {
    investigationSupervisor,
    logAnalyzer,
    k8sInspector,
    dbQuerier,
    metricsAnalyzer,
  },
  tools: {
    ...k8sTools,
    ...dockerTools,
    ...pgTools,
    ...promTools,
    ...sharedTools,
  },
  storage: new LibSQLStore({
    id: 'mission-control-storage',
    url: 'file:./mission-control.db',
  }),
  server: {
    port: 3100,
    cors: {
      origin: ['http://localhost:5173'],
      credentials: true,
    },
    build: {
      swaggerUI: true,
      openAPIDocs: true,
      apiReqLogs: true,
    },
  },
})
```

- [ ] **Step 2: Verify server starts with all agents registered**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control/packages/server
pnpm dev
```

Expected: Server starts, Studio shows all 5 agents and all tools.

- [ ] **Step 3: Commit**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
git add packages/server/src/mastra/index.ts
git commit -m "feat(server): register all agents and tools in Mastra instance"
```

---

## Task 11: Server - API Routes (Investigations, Playbooks, Adapters, Config)

**Files:**
- Create: `packages/server/src/services/investigations.ts`
- Create: `packages/server/src/services/adapter-health.ts`
- Create: `packages/server/src/api/investigations.ts`
- Create: `packages/server/src/api/playbooks.ts`
- Create: `packages/server/src/api/adapters.ts`
- Create: `packages/server/src/api/config.ts`
- Create: `packages/server/src/api/routes.ts`

- [ ] **Step 1: Create investigation persistence service**

Create `packages/server/src/services/investigations.ts`:

```typescript
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig, ensureConfigDirs } from './config.js'

export interface Investigation {
  id: string
  symptom: string
  playbook?: string
  startedAt: string
  completedAt?: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  report?: {
    rootCause: string
    evidence: Array<{ source: string; finding: string; data?: string }>
    timeline: Array<{ timestamp: string; event: string }>
    recommendations: string[]
  }
}

export function saveInvestigation(investigation: Investigation): void {
  ensureConfigDirs()
  const config = loadConfig()
  const filePath = join(config.investigations.path, `${investigation.id}.json`)
  writeFileSync(filePath, JSON.stringify(investigation, null, 2))
}

export function loadInvestigation(id: string): Investigation | undefined {
  const config = loadConfig()
  const filePath = join(config.investigations.path, `${id}.json`)
  if (!existsSync(filePath)) return undefined
  return JSON.parse(readFileSync(filePath, 'utf-8')) as Investigation
}

export function listInvestigations(): Investigation[] {
  const config = loadConfig()
  const dir = config.investigations.path
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  return files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as Investigation)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}
```

- [ ] **Step 2: Create adapter health service**

Create `packages/server/src/services/adapter-health.ts`:

```typescript
import { loadConfig } from './config.js'
import * as k8s from '@kubernetes/client-node'
import Docker from 'dockerode'
import pg from 'pg'

export interface AdapterStatus {
  id: string
  name: string
  enabled: boolean
  connected: boolean
  error?: string
}

export async function checkAdapterHealth(): Promise<AdapterStatus[]> {
  const config = loadConfig()
  const statuses: AdapterStatus[] = []

  // Kubernetes
  if (config.adapters.kubernetes.enabled) {
    try {
      const kc = new k8s.KubeConfig()
      kc.loadFromFile(config.adapters.kubernetes.kubeconfig)
      const api = kc.makeApiClient(k8s.CoreV1Api)
      await api.listNamespace({ limit: 1 })
      statuses.push({ id: 'kubernetes', name: 'Kubernetes', enabled: true, connected: true })
    } catch (e) {
      statuses.push({ id: 'kubernetes', name: 'Kubernetes', enabled: true, connected: false, error: String(e) })
    }
  } else {
    statuses.push({ id: 'kubernetes', name: 'Kubernetes', enabled: false, connected: false })
  }

  // Docker
  if (config.adapters.docker.enabled) {
    try {
      const docker = new Docker({ socketPath: config.adapters.docker.socketPath })
      await docker.ping()
      statuses.push({ id: 'docker', name: 'Docker', enabled: true, connected: true })
    } catch (e) {
      statuses.push({ id: 'docker', name: 'Docker', enabled: true, connected: false, error: String(e) })
    }
  } else {
    statuses.push({ id: 'docker', name: 'Docker', enabled: false, connected: false })
  }

  // PostgreSQL
  if (config.adapters.postgresql.enabled) {
    try {
      const client = new pg.Client({ connectionString: config.adapters.postgresql.connectionString })
      await client.connect()
      await client.query('SELECT 1')
      await client.end()
      statuses.push({ id: 'postgresql', name: 'PostgreSQL', enabled: true, connected: true })
    } catch (e) {
      statuses.push({ id: 'postgresql', name: 'PostgreSQL', enabled: true, connected: false, error: String(e) })
    }
  } else {
    statuses.push({ id: 'postgresql', name: 'PostgreSQL', enabled: false, connected: false })
  }

  // Prometheus
  if (config.adapters.prometheus.enabled) {
    try {
      const response = await fetch(`${config.adapters.prometheus.url}/-/healthy`)
      statuses.push({ id: 'prometheus', name: 'Prometheus', enabled: true, connected: response.ok })
    } catch (e) {
      statuses.push({ id: 'prometheus', name: 'Prometheus', enabled: true, connected: false, error: String(e) })
    }
  } else {
    statuses.push({ id: 'prometheus', name: 'Prometheus', enabled: false, connected: false })
  }

  return statuses
}
```

- [ ] **Step 3: Create investigation API routes**

Create `packages/server/src/api/investigations.ts`:

```typescript
import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { mastra } from '../mastra/index.js'
import { saveInvestigation, loadInvestigation, listInvestigations, type Investigation } from '../services/investigations.js'

export const investigationsRouter = new Hono()

investigationsRouter.get('/', (c) => {
  const investigations = listInvestigations()
  return c.json(investigations)
})

investigationsRouter.get('/:id', (c) => {
  const investigation = loadInvestigation(c.req.param('id'))
  if (!investigation) return c.json({ error: 'Not found' }, 404)
  return c.json(investigation)
})

investigationsRouter.post('/', async (c) => {
  const body = await c.req.json<{ symptom: string }>()
  const id = `inv-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`

  const investigation: Investigation = {
    id,
    symptom: body.symptom,
    startedAt: new Date().toISOString(),
    status: 'running',
  }
  saveInvestigation(investigation)

  const supervisor = mastra.getAgent('investigationSupervisor')

  // Run investigation asynchronously
  supervisor.generate(body.symptom)
    .then((result) => {
      investigation.status = 'completed'
      investigation.completedAt = new Date().toISOString()
      saveInvestigation(investigation)
    })
    .catch((err) => {
      investigation.status = 'failed'
      investigation.completedAt = new Date().toISOString()
      saveInvestigation(investigation)
    })

  return c.json({ id, status: 'running' }, 201)
})
```

- [ ] **Step 4: Create playbooks API routes**

Create `packages/server/src/api/playbooks.ts`:

```typescript
import { Hono } from 'hono'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadPlaybooks } from '../services/playbooks.js'
import { loadConfig } from '../services/config.js'

export const playbooksRouter = new Hono()

playbooksRouter.get('/', (c) => {
  const playbooks = loadPlaybooks()
  return c.json(playbooks.map((p) => ({ title: p.title, triggers: p.triggers, priority: p.priority, filePath: p.filePath })))
})

playbooksRouter.get('/:index', (c) => {
  const playbooks = loadPlaybooks()
  const idx = Number(c.req.param('index'))
  if (idx < 0 || idx >= playbooks.length) return c.json({ error: 'Not found' }, 404)
  return c.json(playbooks[idx])
})

playbooksRouter.post('/', async (c) => {
  const body = await c.req.json<{ filename: string; content: string }>()
  const config = loadConfig()
  const filePath = join(config.playbooks.path, body.filename.endsWith('.md') ? body.filename : `${body.filename}.md`)
  writeFileSync(filePath, body.content)
  return c.json({ filePath }, 201)
})
```

- [ ] **Step 5: Create adapters API routes**

Create `packages/server/src/api/adapters.ts`:

```typescript
import { Hono } from 'hono'
import { checkAdapterHealth } from '../services/adapter-health.js'

export const adaptersRouter = new Hono()

adaptersRouter.get('/', async (c) => {
  const statuses = await checkAdapterHealth()
  return c.json(statuses)
})

adaptersRouter.get('/:id/status', async (c) => {
  const statuses = await checkAdapterHealth()
  const status = statuses.find((s) => s.id === c.req.param('id'))
  if (!status) return c.json({ error: 'Unknown adapter' }, 404)
  return c.json(status)
})
```

- [ ] **Step 6: Create config API routes**

Create `packages/server/src/api/config.ts`:

```typescript
import { Hono } from 'hono'
import { loadConfig, saveConfig } from '../services/config.js'

export const configRouter = new Hono()

configRouter.get('/', (c) => {
  const config = loadConfig()
  // Mask sensitive values
  const masked = {
    ...config,
    ai: { ...config.ai, apiKey: config.ai.apiKey ? '***' : '' },
    adapters: {
      ...config.adapters,
      postgresql: {
        ...config.adapters.postgresql,
        connectionString: config.adapters.postgresql.connectionString ? '***' : '',
      },
    },
  }
  return c.json(masked)
})

configRouter.put('/', async (c) => {
  const body = await c.req.json()
  const current = loadConfig()
  const merged = { ...current, ...body }
  saveConfig(merged)
  return c.json({ success: true })
})
```

- [ ] **Step 7: Create route aggregator**

Create `packages/server/src/api/routes.ts`:

```typescript
import { Hono } from 'hono'
import { investigationsRouter } from './investigations.js'
import { playbooksRouter } from './playbooks.js'
import { adaptersRouter } from './adapters.js'
import { configRouter } from './config.js'

export const apiRouter = new Hono()

apiRouter.route('/investigations', investigationsRouter)
apiRouter.route('/playbooks', playbooksRouter)
apiRouter.route('/adapters', adaptersRouter)
apiRouter.route('/config', configRouter)
```

- [ ] **Step 8: Register custom routes in Mastra**

Update `packages/server/src/mastra/index.ts` to add the API routes. Add this import and server.apiRoutes config:

Add to the imports at the top of `packages/server/src/mastra/index.ts`:

```typescript
import { registerApiRoute } from '@mastra/core/server'
import { apiRouter } from '../api/routes.js'
```

Add to the `server` config in the Mastra constructor:

```typescript
    apiRoutes: [
      registerApiRoute('/mc', {
        method: 'ALL',
        handler: async (c) => apiRouter.fetch(c.req.raw),
      }),
    ],
```

- [ ] **Step 9: Verify server starts and API responds**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control/packages/server
pnpm dev
# In another terminal:
curl http://localhost:3100/mc/adapters
curl http://localhost:3100/mc/config
curl http://localhost:3100/mc/playbooks
```

Expected: JSON responses from each endpoint.

- [ ] **Step 10: Commit**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
git add packages/server/src/api/ packages/server/src/services/ packages/server/src/mastra/index.ts
git commit -m "feat(server): add API routes for investigations, playbooks, adapters, config"
```

---

## Task 12: UI Package - React Scaffold

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/vite.config.ts`
- Create: `packages/ui/tailwind.config.ts`
- Create: `packages/ui/index.html`
- Create: `packages/ui/src/main.tsx`
- Create: `packages/ui/src/App.tsx`
- Create: `packages/ui/src/index.css`

- [ ] **Step 1: Create UI package directory**

```bash
mkdir -p /home/tbaderts/data/workspace/oms/mission-control/packages/ui/src
```

- [ ] **Step 2: Create UI package.json**

Create `packages/ui/package.json`:

```json
{
  "name": "@mission-control/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0",
    "zustand": "^5.0.0",
    "@xyflow/react": "^12.0.0",
    "lucide-react": "^0.500.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.5.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "typescript": "^5.8.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 3: Create vite.config.ts**

Create `packages/ui/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/mc': 'http://localhost:3100',
      '/api': 'http://localhost:3100',
    },
  },
})
```

- [ ] **Step 4: Create tsconfig.json**

Create `packages/ui/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 5: Create index.html**

Create `packages/ui/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mission Control</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create index.css**

Create `packages/ui/src/index.css`:

```css
@import "tailwindcss";
```

- [ ] **Step 7: Create main.tsx**

Create `packages/ui/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App.js'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
```

- [ ] **Step 8: Create App.tsx with route skeleton**

Create `packages/ui/src/App.tsx`:

```tsx
import { Routes, Route, NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Search,
  Workflow,
  Bot,
  History,
  BookOpen,
  Settings,
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/investigations', icon: Search, label: 'Investigations' },
  { to: '/workflows', icon: Workflow, label: 'Workflows' },
  { to: '/agents', icon: Bot, label: 'Agents' },
  { to: '/runs', icon: History, label: 'Run History' },
  { to: '/playbooks', icon: BookOpen, label: 'Playbooks' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-full text-zinc-400">
      <h2 className="text-2xl">{title}</h2>
    </div>
  )
}

export function App() {
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <nav className="w-56 border-r border-zinc-800 flex flex-col">
        <div className="p-4 border-b border-zinc-800">
          <h1 className="text-lg font-semibold">Mission Control</h1>
        </div>
        <div className="flex-1 py-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 text-sm ${
                  isActive
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </div>
        {/* Status bar */}
        <div className="p-3 border-t border-zinc-800 text-xs text-zinc-500">
          Adapters: loading...
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Placeholder title="Dashboard" />} />
          <Route path="/investigations" element={<Placeholder title="Investigations" />} />
          <Route path="/workflows" element={<Placeholder title="Workflow Builder" />} />
          <Route path="/agents" element={<Placeholder title="Agents" />} />
          <Route path="/runs" element={<Placeholder title="Run History" />} />
          <Route path="/playbooks" element={<Placeholder title="Playbooks" />} />
          <Route path="/settings" element={<Placeholder title="Settings" />} />
        </Routes>
      </main>
    </div>
  )
}
```

- [ ] **Step 9: Install UI dependencies**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
pnpm install
```

- [ ] **Step 10: Verify UI starts**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control/packages/ui
pnpm dev
```

Expected: Vite dev server on port 5173, sidebar navigation visible with placeholder views.

- [ ] **Step 11: Commit**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
git add packages/ui/
git commit -m "feat(ui): scaffold React app with sidebar navigation and route skeleton"
```

---

## Task 13: UI - API Client & Types

**Files:**
- Create: `packages/ui/src/types/index.ts`
- Create: `packages/ui/src/api/client.ts`

- [ ] **Step 1: Create shared types**

Create `packages/ui/src/types/index.ts`:

```typescript
export interface AdapterStatus {
  id: string
  name: string
  enabled: boolean
  connected: boolean
  error?: string
}

export interface Investigation {
  id: string
  symptom: string
  playbook?: string
  startedAt: string
  completedAt?: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  report?: {
    rootCause: string
    evidence: Array<{ source: string; finding: string; data?: string }>
    timeline: Array<{ timestamp: string; event: string }>
    recommendations: string[]
  }
}

export interface Playbook {
  title: string
  triggers: string[]
  priority: number
  content?: string
  filePath: string
}

export interface AgentInfo {
  id: string
  name: string
  description: string
}

export interface ToolInfo {
  id: string
  description: string
}

export interface WorkflowDefinition {
  id: string
  name: string
  description: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export interface WorkflowNode {
  id: string
  type: 'agent' | 'tool' | 'workflow' | 'branch' | 'parallel' | 'approval' | 'map' | 'input' | 'output'
  position: { x: number; y: number }
  config: Record<string, unknown>
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  dataMapping?: Record<string, string>
}

export interface MissionControlConfig {
  server: { port: number }
  ai: { provider: string; model: string; apiKey: string }
  adapters: {
    kubernetes: { enabled: boolean; kubeconfig: string; defaultNamespace: string }
    docker: { enabled: boolean; socketPath: string }
    postgresql: { enabled: boolean; connectionString: string }
    prometheus: { enabled: boolean; url: string }
  }
}
```

- [ ] **Step 2: Create API client**

Create `packages/ui/src/api/client.ts`:

```typescript
import type { AdapterStatus, Investigation, Playbook, MissionControlConfig } from '../types/index.js'

const BASE = '/mc'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`POST ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PUT ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

export const api = {
  adapters: {
    list: () => get<AdapterStatus[]>('/adapters'),
    status: (id: string) => get<AdapterStatus>(`/adapters/${id}/status`),
  },
  investigations: {
    list: () => get<Investigation[]>('/investigations'),
    get: (id: string) => get<Investigation>(`/investigations/${id}`),
    start: (symptom: string) => post<{ id: string; status: string }>('/investigations', { symptom }),
  },
  playbooks: {
    list: () => get<Playbook[]>('/playbooks'),
    create: (filename: string, content: string) => post<{ filePath: string }>('/playbooks', { filename, content }),
  },
  config: {
    get: () => get<MissionControlConfig>('/config'),
    update: (config: Partial<MissionControlConfig>) => put<{ success: boolean }>('/config', config),
  },
}
```

- [ ] **Step 3: Commit**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
git add packages/ui/src/types/ packages/ui/src/api/
git commit -m "feat(ui): add shared types and API client"
```

---

## Task 14: UI - Dashboard View

**Files:**
- Create: `packages/ui/src/stores/app.ts`
- Create: `packages/ui/src/views/dashboard.tsx`
- Modify: `packages/ui/src/App.tsx`

- [ ] **Step 1: Create app store**

Create `packages/ui/src/stores/app.ts`:

```typescript
import { create } from 'zustand'
import type { AdapterStatus, Investigation } from '../types/index.js'
import { api } from '../api/client.js'

interface AppState {
  adapters: AdapterStatus[]
  investigations: Investigation[]
  loading: boolean
  fetchAdapters: () => Promise<void>
  fetchInvestigations: () => Promise<void>
}

export const useAppStore = create<AppState>((set) => ({
  adapters: [],
  investigations: [],
  loading: false,

  fetchAdapters: async () => {
    try {
      const adapters = await api.adapters.list()
      set({ adapters })
    } catch {
      set({ adapters: [] })
    }
  },

  fetchInvestigations: async () => {
    set({ loading: true })
    try {
      const investigations = await api.investigations.list()
      set({ investigations, loading: false })
    } catch {
      set({ investigations: [], loading: false })
    }
  },
}))
```

- [ ] **Step 2: Create dashboard view**

Create `packages/ui/src/views/dashboard.tsx`:

```tsx
import { useEffect } from 'react'
import { useAppStore } from '../stores/app.js'
import { Activity, AlertTriangle, CheckCircle, Wifi } from 'lucide-react'

export function Dashboard() {
  const { adapters, investigations, fetchAdapters, fetchInvestigations } = useAppStore()

  useEffect(() => {
    fetchAdapters()
    fetchInvestigations()
  }, [fetchAdapters, fetchInvestigations])

  const activeInvestigations = investigations.filter((i) => i.status === 'running')
  const completedToday = investigations.filter(
    (i) => i.status === 'completed' && i.startedAt.startsWith(new Date().toISOString().slice(0, 10))
  )
  const connectedAdapters = adapters.filter((a) => a.connected)

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard icon={Activity} label="Active Investigations" value={activeInvestigations.length} color="text-blue-400" />
        <SummaryCard icon={AlertTriangle} label="Pending Approvals" value={0} color="text-amber-400" />
        <SummaryCard icon={CheckCircle} label="Completed Today" value={completedToday.length} color="text-green-400" />
        <SummaryCard icon={Wifi} label="Adapters Online" value={`${connectedAdapters.length}/${adapters.length}`} color="text-cyan-400" />
      </div>

      {/* Recent investigations */}
      <div>
        <h2 className="text-lg font-medium mb-3">Recent Investigations</h2>
        {investigations.length === 0 ? (
          <p className="text-zinc-500">No investigations yet. Start one from the Investigations view.</p>
        ) : (
          <div className="space-y-2">
            {investigations.slice(0, 10).map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                <div>
                  <span className="text-sm font-medium">{inv.symptom}</span>
                  <span className="ml-3 text-xs text-zinc-500">{inv.id}</span>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={inv.status} />
                  <span className="text-xs text-zinc-500">
                    {new Date(inv.startedAt).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Adapter status */}
      <div>
        <h2 className="text-lg font-medium mb-3">Adapter Status</h2>
        <div className="grid grid-cols-4 gap-3">
          {adapters.map((a) => (
            <div key={a.id} className={`p-3 rounded-lg border ${a.connected ? 'border-green-800 bg-green-950/30' : a.enabled ? 'border-red-800 bg-red-950/30' : 'border-zinc-800 bg-zinc-900'}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{a.name}</span>
                <span className={`text-xs ${a.connected ? 'text-green-400' : a.enabled ? 'text-red-400' : 'text-zinc-500'}`}>
                  {a.connected ? 'Connected' : a.enabled ? 'Disconnected' : 'Disabled'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color: string }) {
  return (
    <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
      <div className="flex items-center gap-3">
        <Icon size={20} className={color} />
        <div>
          <p className="text-2xl font-semibold">{value}</p>
          <p className="text-xs text-zinc-500">{label}</p>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'bg-blue-500/20 text-blue-400',
    completed: 'bg-green-500/20 text-green-400',
    failed: 'bg-red-500/20 text-red-400',
    cancelled: 'bg-zinc-500/20 text-zinc-400',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs ${colors[status] ?? colors.cancelled}`}>
      {status}
    </span>
  )
}
```

- [ ] **Step 3: Update App.tsx to use Dashboard**

In `packages/ui/src/App.tsx`, replace the Dashboard route placeholder:

Replace:
```tsx
<Route path="/" element={<Placeholder title="Dashboard" />} />
```

With:
```tsx
<Route path="/" element={<Dashboard />} />
```

Add import at the top:
```tsx
import { Dashboard } from './views/dashboard.js'
```

Also update the sidebar status bar to use the app store. Replace the status bar `<div>`:

```tsx
        <div className="p-3 border-t border-zinc-800 text-xs text-zinc-500">
          Adapters: loading...
        </div>
```

With a component that reads from the store (add `useAppStore` import and `useEffect`):

```tsx
        <StatusBar />
```

And add this component inside App.tsx:

```tsx
function StatusBar() {
  const { adapters, fetchAdapters } = useAppStore()

  useEffect(() => {
    fetchAdapters()
  }, [fetchAdapters])

  return (
    <div className="p-3 border-t border-zinc-800 text-xs text-zinc-500 flex gap-2">
      {adapters.map((a) => (
        <span key={a.id} className={a.connected ? 'text-green-400' : a.enabled ? 'text-red-400' : 'text-zinc-600'}>
          {a.name.slice(0, 3)}
        </span>
      ))}
      {adapters.length === 0 && 'No adapters'}
    </div>
  )
}
```

Add required imports:
```tsx
import { useEffect } from 'react'
import { useAppStore } from './stores/app.js'
```

- [ ] **Step 4: Verify dashboard renders**

Run both server and UI, navigate to `http://localhost:5173`. Dashboard should show summary cards and adapter status.

- [ ] **Step 5: Commit**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
git add packages/ui/src/stores/app.ts packages/ui/src/views/dashboard.tsx packages/ui/src/App.tsx
git commit -m "feat(ui): add dashboard view with summary cards and adapter status"
```

---

## Task 15: UI - Investigation View

**Files:**
- Create: `packages/ui/src/stores/investigation.ts`
- Create: `packages/ui/src/components/investigation/symptom-input.tsx`
- Create: `packages/ui/src/components/investigation/investigation-timeline.tsx`
- Create: `packages/ui/src/components/investigation/report-view.tsx`
- Create: `packages/ui/src/views/investigations.tsx`
- Modify: `packages/ui/src/App.tsx`

- [ ] **Step 1: Create investigation store**

Create `packages/ui/src/stores/investigation.ts`:

```typescript
import { create } from 'zustand'
import type { Investigation } from '../types/index.js'
import { api } from '../api/client.js'

interface InvestigationState {
  investigations: Investigation[]
  activeInvestigation: Investigation | null
  loading: boolean
  fetchInvestigations: () => Promise<void>
  startInvestigation: (symptom: string) => Promise<void>
  selectInvestigation: (id: string) => Promise<void>
  pollActive: () => Promise<void>
}

export const useInvestigationStore = create<InvestigationState>((set, get) => ({
  investigations: [],
  activeInvestigation: null,
  loading: false,

  fetchInvestigations: async () => {
    const investigations = await api.investigations.list()
    set({ investigations })
  },

  startInvestigation: async (symptom: string) => {
    set({ loading: true })
    const result = await api.investigations.start(symptom)
    const investigation = await api.investigations.get(result.id)
    set({ activeInvestigation: investigation, loading: false })
    await get().fetchInvestigations()
  },

  selectInvestigation: async (id: string) => {
    const investigation = await api.investigations.get(id)
    set({ activeInvestigation: investigation })
  },

  pollActive: async () => {
    const { activeInvestigation } = get()
    if (!activeInvestigation || activeInvestigation.status !== 'running') return
    const updated = await api.investigations.get(activeInvestigation.id)
    set({ activeInvestigation: updated })
    if (updated.status !== 'running') {
      await get().fetchInvestigations()
    }
  },
}))
```

- [ ] **Step 2: Create symptom input component**

Create `packages/ui/src/components/investigation/symptom-input.tsx`:

```tsx
import { useState } from 'react'
import { Search } from 'lucide-react'

export function SymptomInput({ onSubmit, loading }: { onSubmit: (symptom: string) => void; loading: boolean }) {
  const [symptom, setSymptom] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (symptom.trim() && !loading) {
      onSubmit(symptom.trim())
      setSymptom('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="flex-1 relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          value={symptom}
          onChange={(e) => setSymptom(e.target.value)}
          placeholder="Describe the symptom, e.g. 'pods restarting in production namespace'"
          className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          disabled={loading}
        />
      </div>
      <button
        type="submit"
        disabled={!symptom.trim() || loading}
        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Starting...' : 'Investigate'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Create investigation timeline component**

Create `packages/ui/src/components/investigation/investigation-timeline.tsx`:

```tsx
import type { Investigation } from '../../types/index.js'
import { CheckCircle, Loader2, XCircle, Clock } from 'lucide-react'

export function InvestigationTimeline({ investigation }: { investigation: Investigation }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">{investigation.symptom}</h3>
          <p className="text-xs text-zinc-500">{investigation.id} -- Started {new Date(investigation.startedAt).toLocaleString()}</p>
        </div>
        <StatusIcon status={investigation.status} />
      </div>

      {investigation.playbook && (
        <div className="p-3 bg-zinc-900 rounded border border-zinc-800">
          <p className="text-xs text-zinc-400">Playbook matched: <span className="text-white">{investigation.playbook}</span></p>
        </div>
      )}

      {investigation.status === 'running' && (
        <div className="flex items-center gap-2 text-blue-400 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Investigation in progress...
        </div>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return <Loader2 size={20} className="text-blue-400 animate-spin" />
    case 'completed':
      return <CheckCircle size={20} className="text-green-400" />
    case 'failed':
      return <XCircle size={20} className="text-red-400" />
    default:
      return <Clock size={20} className="text-zinc-400" />
  }
}
```

- [ ] **Step 4: Create report view component**

Create `packages/ui/src/components/investigation/report-view.tsx`:

```tsx
import type { Investigation } from '../../types/index.js'

export function ReportView({ investigation }: { investigation: Investigation }) {
  const report = investigation.report
  if (!report) return null

  return (
    <div className="space-y-4 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
      <h3 className="text-lg font-medium">Investigation Report</h3>

      <div>
        <h4 className="text-sm font-medium text-zinc-400 mb-1">Root Cause</h4>
        <p className="text-sm">{report.rootCause}</p>
      </div>

      <div>
        <h4 className="text-sm font-medium text-zinc-400 mb-1">Evidence</h4>
        <div className="space-y-2">
          {report.evidence.map((e, i) => (
            <div key={i} className="p-2 bg-zinc-800 rounded text-sm">
              <span className="text-zinc-400">[{e.source}]</span> {e.finding}
              {e.data && <pre className="mt-1 text-xs text-zinc-500 overflow-x-auto">{e.data}</pre>}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium text-zinc-400 mb-1">Timeline</h4>
        <div className="space-y-1">
          {report.timeline.map((t, i) => (
            <div key={i} className="flex gap-3 text-sm">
              <span className="text-zinc-500 font-mono text-xs">{t.timestamp}</span>
              <span>{t.event}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium text-zinc-400 mb-1">Recommendations</h4>
        <ul className="list-disc list-inside space-y-1 text-sm">
          {report.recommendations.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create investigations view**

Create `packages/ui/src/views/investigations.tsx`:

```tsx
import { useEffect } from 'react'
import { useInvestigationStore } from '../stores/investigation.js'
import { SymptomInput } from '../components/investigation/symptom-input.js'
import { InvestigationTimeline } from '../components/investigation/investigation-timeline.js'
import { ReportView } from '../components/investigation/report-view.js'

export function Investigations() {
  const { investigations, activeInvestigation, loading, fetchInvestigations, startInvestigation, selectInvestigation, pollActive } = useInvestigationStore()

  useEffect(() => {
    fetchInvestigations()
  }, [fetchInvestigations])

  useEffect(() => {
    if (activeInvestigation?.status !== 'running') return
    const interval = setInterval(pollActive, 3000)
    return () => clearInterval(interval)
  }, [activeInvestigation?.status, pollActive])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Investigations</h1>

      <SymptomInput onSubmit={startInvestigation} loading={loading} />

      {activeInvestigation && (
        <div className="space-y-4">
          <InvestigationTimeline investigation={activeInvestigation} />
          {activeInvestigation.status === 'completed' && <ReportView investigation={activeInvestigation} />}
        </div>
      )}

      <div>
        <h2 className="text-lg font-medium mb-3">History</h2>
        <div className="space-y-2">
          {investigations.map((inv) => (
            <button
              key={inv.id}
              onClick={() => selectInvestigation(inv.id)}
              className={`w-full text-left p-3 rounded-lg border text-sm ${
                activeInvestigation?.id === inv.id
                  ? 'bg-zinc-800 border-blue-600'
                  : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{inv.symptom}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  inv.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                  inv.status === 'running' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-zinc-500/20 text-zinc-400'
                }`}>{inv.status}</span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">{new Date(inv.startedAt).toLocaleString()}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Update App.tsx to use Investigations view**

In `packages/ui/src/App.tsx`, replace the Investigations route:

Replace:
```tsx
<Route path="/investigations" element={<Placeholder title="Investigations" />} />
```

With:
```tsx
<Route path="/investigations" element={<Investigations />} />
```

Add import:
```tsx
import { Investigations } from './views/investigations.js'
```

- [ ] **Step 7: Verify investigation view renders**

Navigate to `http://localhost:5173/investigations`. Should see symptom input and empty history.

- [ ] **Step 8: Commit**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
git add packages/ui/src/stores/investigation.ts packages/ui/src/components/investigation/ packages/ui/src/views/investigations.tsx packages/ui/src/App.tsx
git commit -m "feat(ui): add investigation view with symptom input, timeline, and report"
```

---

## Task 16: UI - Visual Workflow Builder (Basic)

**Files:**
- Create: `packages/ui/src/stores/workflow.ts`
- Create: `packages/ui/src/components/workflow-builder/canvas.tsx`
- Create: `packages/ui/src/components/workflow-builder/node-palette.tsx`
- Create: `packages/ui/src/components/workflow-builder/nodes/agent-node.tsx`
- Create: `packages/ui/src/components/workflow-builder/nodes/tool-node.tsx`
- Create: `packages/ui/src/components/workflow-builder/nodes/input-node.tsx`
- Create: `packages/ui/src/components/workflow-builder/nodes/output-node.tsx`
- Create: `packages/ui/src/views/workflow-builder.tsx`
- Modify: `packages/ui/src/App.tsx`

- [ ] **Step 1: Create workflow store**

Create `packages/ui/src/stores/workflow.ts`:

```typescript
import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'

interface WorkflowState {
  nodes: Node[]
  edges: Edge[]
  name: string
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  setName: (name: string) => void
  addNode: (node: Node) => void
  reset: () => void
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  nodes: [],
  edges: [],
  name: 'New Workflow',
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setName: (name) => set({ name }),
  addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
  reset: () => set({ nodes: [], edges: [], name: 'New Workflow' }),
}))
```

- [ ] **Step 2: Create custom node components**

Create `packages/ui/src/components/workflow-builder/nodes/agent-node.tsx`:

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Bot } from 'lucide-react'

export function AgentNode({ data }: NodeProps) {
  return (
    <div className="px-4 py-3 bg-blue-950 border border-blue-700 rounded-xl min-w-[160px]">
      <Handle type="target" position={Position.Top} className="!bg-blue-500" />
      <div className="flex items-center gap-2">
        <Bot size={16} className="text-blue-400" />
        <span className="text-sm font-medium text-blue-100">{(data as { label?: string }).label ?? 'Agent'}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500" />
    </div>
  )
}
```

Create `packages/ui/src/components/workflow-builder/nodes/tool-node.tsx`:

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Wrench } from 'lucide-react'

export function ToolNode({ data }: NodeProps) {
  return (
    <div className="px-4 py-3 bg-amber-950 border border-amber-700 rounded-lg min-w-[160px]">
      <Handle type="target" position={Position.Top} className="!bg-amber-500" />
      <div className="flex items-center gap-2">
        <Wrench size={16} className="text-amber-400" />
        <span className="text-sm font-medium text-amber-100">{(data as { label?: string }).label ?? 'Tool'}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-amber-500" />
    </div>
  )
}
```

Create `packages/ui/src/components/workflow-builder/nodes/input-node.tsx`:

```tsx
import { Handle, Position } from '@xyflow/react'
import { ArrowRightCircle } from 'lucide-react'

export function InputNode() {
  return (
    <div className="px-4 py-3 bg-green-950 border border-green-700 rounded-full">
      <div className="flex items-center gap-2">
        <ArrowRightCircle size={16} className="text-green-400" />
        <span className="text-sm font-medium text-green-100">Input</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-green-500" />
    </div>
  )
}
```

Create `packages/ui/src/components/workflow-builder/nodes/output-node.tsx`:

```tsx
import { Handle, Position } from '@xyflow/react'
import { ArrowLeftCircle } from 'lucide-react'

export function OutputNode() {
  return (
    <div className="px-4 py-3 bg-red-950 border border-red-700 rounded-full">
      <Handle type="target" position={Position.Top} className="!bg-red-500" />
      <div className="flex items-center gap-2">
        <ArrowLeftCircle size={16} className="text-red-400" />
        <span className="text-sm font-medium text-red-100">Output</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create node palette**

Create `packages/ui/src/components/workflow-builder/node-palette.tsx`:

```tsx
import { Bot, Wrench, GitBranch, ArrowRightCircle, ArrowLeftCircle, Shield, Columns } from 'lucide-react'

const nodeTypes = [
  { type: 'agent', label: 'Agent', icon: Bot, color: 'text-blue-400' },
  { type: 'tool', label: 'Tool', icon: Wrench, color: 'text-amber-400' },
  { type: 'branch', label: 'Branch', icon: GitBranch, color: 'text-purple-400' },
  { type: 'parallel', label: 'Parallel', icon: Columns, color: 'text-cyan-400' },
  { type: 'approval', label: 'Approval', icon: Shield, color: 'text-amber-400' },
  { type: 'input', label: 'Input', icon: ArrowRightCircle, color: 'text-green-400' },
  { type: 'output', label: 'Output', icon: ArrowLeftCircle, color: 'text-red-400' },
]

export function NodePalette() {
  const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
    event.dataTransfer.setData('application/reactflow-type', nodeType)
    event.dataTransfer.setData('application/reactflow-label', label)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-48 border-r border-zinc-800 p-3 space-y-1">
      <p className="text-xs text-zinc-500 font-medium uppercase mb-2">Nodes</p>
      {nodeTypes.map(({ type, label, icon: Icon, color }) => (
        <div
          key={type}
          draggable
          onDragStart={(e) => onDragStart(e, type, label)}
          className="flex items-center gap-2 p-2 rounded cursor-grab hover:bg-zinc-800 text-sm"
        >
          <Icon size={16} className={color} />
          <span className="text-zinc-300">{label}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Create canvas component**

Create `packages/ui/src/components/workflow-builder/canvas.tsx`:

```tsx
import { useCallback } from 'react'
import {
  ReactFlow,
  addEdge,
  Background,
  Controls,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useWorkflowStore } from '../../stores/workflow.js'
import { AgentNode } from './nodes/agent-node.js'
import { ToolNode } from './nodes/tool-node.js'
import { InputNode } from './nodes/input-node.js'
import { OutputNode } from './nodes/output-node.js'

const nodeTypes = {
  agent: AgentNode,
  tool: ToolNode,
  input: InputNode,
  output: OutputNode,
}

export function WorkflowCanvas() {
  const { nodes, edges, setNodes, setEdges, addNode } = useWorkflowStore()

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes(applyNodeChanges(changes, nodes)),
    [nodes, setNodes]
  )

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges(applyEdgeChanges(changes, edges)),
    [edges, setEdges]
  )

  const onConnect = useCallback(
    (connection: Connection) => setEdges(addEdge(connection, edges)),
    [edges, setEdges]
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const type = event.dataTransfer.getData('application/reactflow-type')
      const label = event.dataTransfer.getData('application/reactflow-label')
      if (!type) return

      const bounds = (event.target as HTMLElement).closest('.react-flow')?.getBoundingClientRect()
      if (!bounds) return

      const position = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      }

      addNode({
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: { label },
      })
    },
    [addNode]
  )

  return (
    <div className="flex-1 h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        fitView
        className="bg-zinc-950"
      >
        <Background color="#333" gap={20} />
        <Controls className="!bg-zinc-800 !border-zinc-700" />
      </ReactFlow>
    </div>
  )
}
```

- [ ] **Step 5: Create workflow builder view**

Create `packages/ui/src/views/workflow-builder.tsx`:

```tsx
import { NodePalette } from '../components/workflow-builder/node-palette.js'
import { WorkflowCanvas } from '../components/workflow-builder/canvas.js'
import { useWorkflowStore } from '../stores/workflow.js'
import { Save, Play, Trash2 } from 'lucide-react'

export function WorkflowBuilder() {
  const { name, setName, reset } = useWorkflowStore()

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-transparent text-lg font-medium text-zinc-100 focus:outline-none"
        />
        <div className="flex gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 text-sm bg-zinc-800 rounded hover:bg-zinc-700">
            <Save size={14} /> Save
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 rounded hover:bg-blue-500">
            <Play size={14} /> Run
          </button>
          <button onClick={reset} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-zinc-800 rounded hover:bg-zinc-700 text-red-400">
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </div>

      {/* Canvas + Palette */}
      <div className="flex flex-1 overflow-hidden">
        <NodePalette />
        <WorkflowCanvas />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Update App.tsx to use WorkflowBuilder view**

In `packages/ui/src/App.tsx`, replace the Workflows route:

Replace:
```tsx
<Route path="/workflows" element={<Placeholder title="Workflow Builder" />} />
```

With:
```tsx
<Route path="/workflows" element={<WorkflowBuilder />} />
```

Add import:
```tsx
import { WorkflowBuilder } from './views/workflow-builder.js'
```

- [ ] **Step 7: Verify workflow builder renders**

Navigate to `http://localhost:5173/workflows`. Should see palette on the left and a canvas where you can drag and drop nodes.

- [ ] **Step 8: Commit**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
git add packages/ui/src/stores/workflow.ts packages/ui/src/components/workflow-builder/ packages/ui/src/views/workflow-builder.tsx packages/ui/src/App.tsx
git commit -m "feat(ui): add visual workflow builder with React Flow canvas and drag-and-drop nodes"
```

---

## Task 17: UI - Settings View

**Files:**
- Create: `packages/ui/src/views/settings.tsx`
- Modify: `packages/ui/src/App.tsx`

- [ ] **Step 1: Create settings view**

Create `packages/ui/src/views/settings.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import type { MissionControlConfig } from '../types/index.js'
import { Save, RefreshCw } from 'lucide-react'

export function SettingsView() {
  const [config, setConfig] = useState<MissionControlConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    api.config.get().then(setConfig)
  }, [])

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    await api.config.update(config)
    setSaving(false)
    setMessage('Saved!')
    setTimeout(() => setMessage(''), 2000)
  }

  if (!config) return <div className="p-6 text-zinc-400">Loading...</div>

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <div className="flex items-center gap-2">
          {message && <span className="text-green-400 text-sm">{message}</span>}
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 rounded hover:bg-blue-500 disabled:opacity-50">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            Save
          </button>
        </div>
      </div>

      {/* AI Provider */}
      <Section title="AI Provider">
        <Field label="Provider" value={config.ai.provider} onChange={(v) => setConfig({ ...config, ai: { ...config.ai, provider: v } })} />
        <Field label="Model" value={config.ai.model} onChange={(v) => setConfig({ ...config, ai: { ...config.ai, model: v } })} />
        <Field label="API Key" value={config.ai.apiKey} onChange={(v) => setConfig({ ...config, ai: { ...config.ai, apiKey: v } })} type="password" />
      </Section>

      {/* Kubernetes */}
      <Section title="Kubernetes">
        <Toggle label="Enabled" checked={config.adapters.kubernetes.enabled} onChange={(v) => setConfig({ ...config, adapters: { ...config.adapters, kubernetes: { ...config.adapters.kubernetes, enabled: v } } })} />
        <Field label="Kubeconfig" value={config.adapters.kubernetes.kubeconfig} onChange={(v) => setConfig({ ...config, adapters: { ...config.adapters, kubernetes: { ...config.adapters.kubernetes, kubeconfig: v } } })} />
        <Field label="Default Namespace" value={config.adapters.kubernetes.defaultNamespace} onChange={(v) => setConfig({ ...config, adapters: { ...config.adapters, kubernetes: { ...config.adapters.kubernetes, defaultNamespace: v } } })} />
      </Section>

      {/* Docker */}
      <Section title="Docker">
        <Toggle label="Enabled" checked={config.adapters.docker.enabled} onChange={(v) => setConfig({ ...config, adapters: { ...config.adapters, docker: { ...config.adapters.docker, enabled: v } } })} />
        <Field label="Socket Path" value={config.adapters.docker.socketPath} onChange={(v) => setConfig({ ...config, adapters: { ...config.adapters, docker: { ...config.adapters.docker, socketPath: v } } })} />
      </Section>

      {/* PostgreSQL */}
      <Section title="PostgreSQL">
        <Toggle label="Enabled" checked={config.adapters.postgresql.enabled} onChange={(v) => setConfig({ ...config, adapters: { ...config.adapters, postgresql: { ...config.adapters.postgresql, enabled: v } } })} />
        <Field label="Connection String" value={config.adapters.postgresql.connectionString} onChange={(v) => setConfig({ ...config, adapters: { ...config.adapters, postgresql: { ...config.adapters.postgresql, connectionString: v } } })} type="password" />
      </Section>

      {/* Prometheus */}
      <Section title="Prometheus">
        <Toggle label="Enabled" checked={config.adapters.prometheus.enabled} onChange={(v) => setConfig({ ...config, adapters: { ...config.adapters, prometheus: { ...config.adapters.prometheus, enabled: v } } })} />
        <Field label="URL" value={config.adapters.prometheus.url} onChange={(v) => setConfig({ ...config, adapters: { ...config.adapters, prometheus: { ...config.adapters.prometheus, url: v } } })} />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium border-b border-zinc-800 pb-2">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-zinc-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-80 px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
      />
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-zinc-400">{label}</label>
      <button
        onClick={() => onChange(!checked)}
        className={`w-10 h-5 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-zinc-700'}`}
      >
        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Update App.tsx to use Settings view**

In `packages/ui/src/App.tsx`, replace:

```tsx
<Route path="/settings" element={<Placeholder title="Settings" />} />
```

With:
```tsx
<Route path="/settings" element={<SettingsView />} />
```

Add import:
```tsx
import { SettingsView } from './views/settings.js'
```

- [ ] **Step 3: Commit**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
git add packages/ui/src/views/settings.tsx packages/ui/src/App.tsx
git commit -m "feat(ui): add settings view with adapter configuration"
```

---

## Task 18: Sample Playbooks

**Files:**
- Create: `packages/server/playbooks/pod-crashloop.md`
- Create: `packages/server/playbooks/high-latency.md`
- Create: `packages/server/playbooks/database-connection.md`

- [ ] **Step 1: Create sample playbooks directory**

```bash
mkdir -p /home/tbaderts/data/workspace/oms/mission-control/packages/server/playbooks
```

- [ ] **Step 2: Create pod crashloop playbook**

Create `packages/server/playbooks/pod-crashloop.md`:

```markdown
---
title: Pod CrashLoopBackOff Investigation
triggers: [crashloop, restart, oomkill, crash, backoff, oom, killed]
priority: 10
---

## Investigation Steps

1. Check pod status and restart count across all namespaces
2. Read pod events for OOMKilled, Error, or CrashLoopBackOff reasons
3. Pull last 200 lines of container logs before the most recent crash
4. Check resource limits vs actual usage (memory and CPU)
5. Look for recent deployments that changed the image, config, or resource limits
6. Query database for application-level errors near the crash time
7. Check Prometheus metrics for memory and CPU spikes leading up to the crash
8. Correlate timeline: when did restarts begin? What changed just before?
```

- [ ] **Step 3: Create high latency playbook**

Create `packages/server/playbooks/high-latency.md`:

```markdown
---
title: High Latency Investigation
triggers: [latency, slow, timeout, response time, p99, p95, delay]
priority: 10
---

## Investigation Steps

1. Check Prometheus for current request latency (p50, p95, p99)
2. Compare current latency to baseline (last 24 hours)
3. Check if any alerts are firing for latency or error rate
4. Look at pod resource utilization -- is CPU or memory saturated?
5. Check container logs for timeout errors or connection pool exhaustion
6. Query database for slow queries or lock contention
7. Check Kafka consumer lag if message processing is involved
8. Look for recent deployments that might have introduced the regression
9. Build timeline: when did latency increase? What correlated?
```

- [ ] **Step 4: Create database connection playbook**

Create `packages/server/playbooks/database-connection.md`:

```markdown
---
title: Database Connection Investigation
triggers: [database, connection, refused, pool, exhausted, pg, postgres, sql]
priority: 10
---

## Investigation Steps

1. Check if the database pod/container is running and healthy
2. Read database container logs for connection limit or OOM errors
3. Check application logs for connection refused or pool exhaustion errors
4. Query database for active connections count vs max_connections
5. Look for long-running queries or lock contention
6. Check if any recent deployments changed connection pool settings
7. Verify network connectivity between application pods and database
8. Check Prometheus for database metrics (connections, query duration)
```

- [ ] **Step 5: Commit**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
git add packages/server/playbooks/
git commit -m "feat(server): add sample investigation playbooks (crashloop, latency, database)"
```

---

## Task 19: End-to-End Verification

- [ ] **Step 1: Install all dependencies from root**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
pnpm install
```

Expected: All packages installed successfully.

- [ ] **Step 2: Start server**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control/packages/server
pnpm dev
```

Expected: Mastra dev server running on port 3100. Studio available.

- [ ] **Step 3: Start UI (in separate terminal)**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control/packages/ui
pnpm dev
```

Expected: Vite dev server on port 5173.

- [ ] **Step 4: Verify dashboard**

Open `http://localhost:5173`. Dashboard shows:
- Summary cards (all zeros initially)
- Adapter status (connected/disconnected based on local environment)

- [ ] **Step 5: Verify investigation view**

Navigate to Investigations. Type a symptom and click Investigate. Verify the investigation starts (status shows "running").

- [ ] **Step 6: Verify workflow builder**

Navigate to Workflows. Drag nodes from palette onto canvas. Connect them with edges. Verify Save/Clear buttons work.

- [ ] **Step 7: Verify settings**

Navigate to Settings. Adapter toggles and configuration fields should load from config.

- [ ] **Step 8: Verify Mastra Studio**

Open `http://localhost:3100`. Studio should show all 5 registered agents and all tools.

- [ ] **Step 9: Final commit**

```bash
cd /home/tbaderts/data/workspace/oms/mission-control
git add -A
git commit -m "feat(mission-control): complete MVP with investigation agents, workflow builder, and dashboard"
```

---

## Deferred Items (Post-MVP Tasks)

The following spec features are intentionally deferred from this plan:

1. **Agents view** -- Browse registered agents, test with ad-hoc prompts. Mastra Studio already provides this for development. A custom UI can be added in a follow-up.
2. **Run History view** -- Browse all workflow/investigation runs. Depends on workflow execution being fully wired. Stub route is in place.
3. **Playbooks view** -- Browse/edit playbooks in UI. API endpoints exist (Task 11), UI view is a follow-up.
4. **Workflow runtime compiler** -- Compile visual workflow JSON definitions into executable Mastra workflows. The builder UI (Task 16) supports designing workflows; executing them from the builder requires the compiler (`runtime/workflow-compiler.ts`).
5. **SSE streaming for investigations** -- Real-time step-by-step streaming of investigation progress. The current implementation uses polling (Task 15). SSE streaming is a follow-up.
6. **Approval UI in investigations** -- Inline approval dialogs during live investigations. Requires SSE streaming to detect approval requests in real time.
