# 04 - Backend Services

The cockpit backend is a set of services that provide data to the frontend via REST APIs and push updates via WebSocket. Services are organized by responsibility and designed around adapter interfaces for external system integration.

---

## 1. Service Architecture

```
+-----------+     REST / WebSocket     +-------------------+
|  Frontend | <======================> |   Backend Server   |
+-----------+                          +-------------------+
                                       |                   |
                                       |  +-------------+  |
                                       |  | ConfigSvc   |  |
                                       |  +-------------+  |
                                       |  | SpecSvc     |  |
                                       |  | KbSvc       |  |
                                       |  | ReqSvc      |  |
                                       |  | RoadmapSvc  |  |
                                       |  | FsSvc       |  |
                                       |  | ScmSvc      |  |
                                       |  | WorkspaceSvc|  |
                                       |  | SessionMgr  |  |
                                       |  | ReviewSvc   |  |
                                       |  | AISvc       |  |
                                       |  | InvestSvc   |  |
                                       |  | ContainerSvc|  |
                                       |  | K8sSvc      |  |
                                       |  | MsgBusSvc   |  |
                                       |  | DatabaseSvc |  |
                                       |  | FlightDeckSvc|  |
                                       |  | WatcherSvc  |  |
                                       |  +-------------+  |
                                       |                   |
                                       +-------------------+
```

All services are plain classes instantiated at server startup. No dependency injection framework is required, but one may be used if the chosen stack supports it.

---

## 2. Service Catalogue

### 2.1 ConfigService

**Responsibility**: Load, validate, and provide configuration to all other services.

| Method | Description |
|--------|-------------|
| `load()` | Read config.json and secrets.env, merge with defaults |
| `get(key)` | Get a config value by dot-notation key |
| `set(key, value)` | Update a config value (writes to disk) |
| `reload()` | Re-read from disk, broadcast `config:reloaded` |
| `getSecure(key)` | Read a value from secrets.env |

**Config file**: `~/.developer-cockpit/config.json`
**Secrets file**: `~/.developer-cockpit/secrets.env`
**Default config**: Shipped with the application as `default-config.json`

---

### 2.2 WatcherService

**Responsibility**: Watch filesystem paths and emit events when files change.

| Method | Description |
|--------|-------------|
| `watch(path, eventName)` | Add a path to watch; emit `eventName` on changes |
| `unwatch(path)` | Stop watching a path |
| `close()` | Stop all watchers |

**Implementation**: Use chokidar (Node.js), fsnotify (Go), notify (Rust), or WatchService (Java). Debounce rapid changes (100-300ms).

**Watched paths and events:**

| Path | Event |
|------|-------|
| `specs/changes/**`, `specs/archive/**` | `specs:tickets-changed` (one coalesced event per burst) |
| KB root `**/*.md` | `kb:changed` |
| Roadmap file | `roadmap:changed` |
| Review directories | `reviews:changed` |

---

### 2.2a SpecsService and CodeGenService (Contracts view)

**SpecsService** discovers contract files in the configured `specs.openApiPaths` / `specs.avroPaths`
(non-recursive), reads, validates (YAML/JSON syntax) and saves them, and parses domain entities.
Saves are refused outside the configured folders (a sibling such as `openapi-old/` does not count as
inside) and for extensions other than `.yml`, `.yaml`, `.avsc`.

**CodeGenService** has two fixed tasks: `contracts` (module `oms-contracts`: `generateAvroJava
openApiGenerateCmdModels openApiGenerateQueryModels`) and `api` (module `oms-core`:
`openApiGenerateCmd openApiGenerateQuery`). It runs `./gradlew <tasks>` in the module folder, or on
Windows `cmd.exe /d /s /c .\gradlew.bat <tasks>` (Node cannot `execFile` a `.bat`; the explicit `.\` is needed because with `NoDefaultCurrentDirectoryInExePath` set `cmd.exe` ignores the working folder for bare names). Only these constant
arguments are used; unknown task ids never start a process. Timeout 10 min; logs `[codegen]`.

**IPC** (`specs:*`): the services are rebuilt whenever the config object changes (Settings saved), so
new folders or workspace root apply without a restart.

**ConfigService** migrates, on load, contract paths that are exactly the legacy
`oms-core/src/main/{openapi,avro}` defaults to the `oms-contracts` defaults and saves once; custom
values are kept.

### 2.2b API Explorer services

**ApiCatalogService** reads `oms-cmd-api.yml` and `schema.yml` from `specs.openApiPaths` on every
call and returns the command types (keys of the `Command` discriminator mapping, in file order)
with one self-contained schema per type (`$ref` into the same file or `schema.yml` inlined, `allOf`
merged, discriminator and `x-*` keys dropped) plus `enum:State|CancelState|Side|OrdType`. A missing
or unparseable file is returned as `error`, never thrown. The watcher covers `oms-contracts/src/main`
so the view can reload on change.

**OmsHttpService** calls oms-core with `fetch` (Node, in main: no CSP or CORS involved):
`POST /api/command/execute`, `GET /api/query/search?…` and, for the follow-up, the search by
`orderId` plus `GET /api/query/orders/{orderId}/events` in parallel. The base URL
(`infrastructure.omsCoreUrl`, default `http://localhost:8090`) is read per request and must be
http(s). A command body must be JSON; search parameters must be known filter fields with valid
operators; a command to a host other than localhost/127.0.0.1/::1 is refused unless the renderer
passes the confirmed host. 10 s timeout, 5 MB response cap. It never throws: failures return
`status: null` with "oms-core not reachable at <url>: <cause>". Logs one line per request:
`[api-explorer] POST /api/command/execute 201 34ms orderId=…`.

**ApiHistoryService** keeps `~/.developer-cockpit/api-explorer-history.json`: newest first, at most
100 entries, bodies over 64 KB stored truncated, written atomically (temp file + rename); an
unreadable file reads as empty.

**IPC** (`apiExplorer:*`): `catalog`, `baseUrl`, `sendCommand(body, confirmedHost?)`,
`search(params, paging)`, `followUp(orderId)`, `history`, `clearHistory`. Each send and search is
recorded in the history (also failures; requests refused before sending carry `refused: true`);
follow-up reads are not, and a blank order id is refused. A history write that fails is logged
(`[api-explorer] history not written`) and the response is still returned.

**ApiTemplateService** (SPEC-0008) handles the `.http` template sources: every `*.http` file in
`developer-cockpit/api-templates`, then each `infrastructure.apiTemplateSources` entry.

- `list()` reads and parses (`shared/httpFile.ts`) on every call. A missing source is marked
  `missing`, an unreadable one carries `error`, and it never throws.
- `save()` only appends a block (`###`, `# @name`, the execute request, the body), in the
  file's line endings. Every byte already in the file stays the same. It writes only to:
  - a path `list()` returns, or
  - a new `name.http` in the shared folder, created with `wx` and starting with
    `@baseUrl = <oms-core URL>`.

  A name already used in the file is refused. Each save logs
  `[api-explorer] template saved <name> → <path>`.

IPC adds `templates()` and `saveTemplate(req)` (`{ path | newFile, name, body }` →
`{ ok, path } | { ok: false, error }`).

The **WatcherService** watches `developer-cockpit/api-templates` and, through `setExtraPaths`,
the configured extra files. Main calls `setExtraPaths` at startup and after every config save.

Variables are resolved in the renderer (`lib/api-templates.ts`), so `sendCommand` receives,
and History records, the body as sent.

---

### 2.3 SpecTicketsService

**Responsibility**: Serve spec workflow tickets and run workflow actions. It wraps the workflow CLI
(`specs/tools/spec.mjs`, through a small `SpecCli` runner) instead of re-implementing its rules.

| Method | Description |
|--------|-------------|
| `listTickets(includeArchived)` | `spec list [--all] --json` → tickets, current git user, ticket types from `specs/config.json`, folders that failed to load |
| `getTicket(id)` | `spec status <id> --json` (goal, log, tasks, current gate result, evidence freshness) plus the stage documents read from the ticket folder |
| `runAction(action)` | Validates the action (id `SPEC-NNNN`, known kind and stage) and runs the matching CLI command; returns exit code, stdout, stderr. Approve is refused unless the ticket is awaiting approval and a git user is configured. |
| `saveDocument(id, doc, content, baseContent, force)` | Writes the current stage's document (`editableDocument()`) exactly as given. Returns `{ status: 'conflict', diskContent }` without writing when the file no longer equals `baseContent`, unless `force`. |
| `draftGate(id, doc, content)` | `spec gate <id> <stage> --draft <file> --json` with `content` on stdin: the gate result as if the document had that text; nothing is written. |
| `toggleTask(id, taskId, done, baseContent, force)` | Implement stage only: sets the `[ ]`/`[x]` marker of `T-n` (outside HTML comments) in `tasks.md`; same conflict rule as `saveDocument`. |

Document requests are refused (thrown, so the IPC call rejects; logged as `[spec-tickets] refused:`)
for unknown document names, documents other than the current stage's, archived or done tickets,
paths outside `specs/changes/`, non-text or more than 1 MB of content, invalid task ids, and
documents that do not exist (the cockpit edits documents, it never creates them; `spec new` does).

The renderer's editors use the Monaco copy bundled by Vite (`src/renderer/lib/monaco.ts` calls
`loader.config({ monaco })` and provides same-origin workers); the `@monaco-editor/react` CDN default
is never used, because the renderer CSP (`script-src 'self'`) blocks it.

**SpecCli** runs `process.execPath specs/tools/spec.mjs …` with `ELECTRON_RUN_AS_NODE=1` (no
`node` on PATH needed), without a shell, with a timeout; read commands append `--json` last; an
optional input string is written to the CLI's stdin (otherwise stdin is closed); each call is logged
(`[spec-cli] <command> <id> <exit> <ms>`).

**IPC channels**: `specTickets:list`, `specTickets:get`, `specTickets:run`,
`specTickets:saveDocument`, `specTickets:draftGate`, `specTickets:toggleTask`. These are the only
way to reach the service; the WebSocket server does not accept commands.

---

### 2.4 KbService

**Responsibility**: Serve knowledge base documents with metadata.

| Method | Description |
|--------|-------------|
| `getTree()` | Return category tree structure |
| `getDocument(path)` | Return parsed markdown with front-matter |
| `search(query)` | Keyword search across all documents |
| `listByCategory(category)` | List documents in a category |
| `getSection(path, heading)` | Return content under a specific heading |

---

### 2.5 RequirementsService

**Responsibility**: Parse and serve structured requirements documents.

| Method | Description |
|--------|-------------|
| `listUseCases()` | Return all use cases with metadata |
| `getUseCase(id)` | Return full use case with linked FRs |
| `listFRs()` | Return all functional requirements |
| `getFR(id)` | Return full FR with linked UCs and specs |
| `listNFRs()` | Return all non-functional requirements |
| `getNFR(id)` | Return full NFR |
| `listActors()` | Return all actors with linked UCs |

---

### 2.5a StoryboardService and friends (Storyboards view)

**Responsibility**: scan, read, validate, write and export the storyboards under the configured
roots (SPEC-0014; full description in [11-storyboards.md](./11-storyboards.md) §6–7). The code lives
in `src/main/storyboards/` and does not import Electron, so the `check:storyboards` command and the
tests use it directly.

| Service | Responsibility |
|---|---|
| `StoryboardService` | `scan()` (id → folder map; duplicate ids, symlinks, oversized files and malformed files are scan errors). `detail(id)` returns advisory problems. Writes (`create`, `saveStory`, `saveStep`, `createStep`, `deleteStep`, `reorder`, `saveIllustration`) are guarded by revision tokens. It suppresses the watcher echo of its own writes and broadcasts `storyboards:changed` |
| `LinkIndexService` | Valid link targets: OpenAPI operation ids and command types, Avro records, order-state transitions, FR/NFR ids |
| `EvidenceService` | `story.card.yaml`: trust tier, drift per pinned module (`git diff <commit> HEAD`, committed history only), `kb_links` |
| `StoryboardExportService` | Mermaid source and standalone HTML (the PDF is rendered by a hidden window in `storyboards.ipc.ts`) |
| `StoryboardAiService` | Optional assists through `AnthropicAdapter`; proposals only, with bounded prompts |

IPC: `storyboards:*` channels in `ipc/storyboards.ipc.ts` (ids only, never paths). Assets are
served by the `storyboard-asset://<id>/<file>` protocol.

---

### 2.6 RoadmapService

**Responsibility**: Parse and serve roadmap data.

| Method | Description |
|--------|-------------|
| `getRoadmap()` | Return full roadmap data (epics, milestones, items) |
| `updateItem(id, changes)` | Update a work item (dates, status) -- writes to file |

---

### 2.7 FsService

**Responsibility**: General filesystem operations for the File Explorer view.

| Method | Description |
|--------|-------------|
| `listDirectory(path)` | Return directory entries with metadata |
| `readFile(path)` | Return file content with detected language |
| `getFileInfo(path)` | Return size, modified date, permissions |

**Security**: Enforce that all paths are within the configured project root. Reject path traversal attempts.

---

### 2.8 SCMService

**Responsibility**: Source control management operations via adapter pattern.

| Method | Description |
|--------|-------------|
| `listMRs(filters)` | List merge/pull requests |
| `getMR(id)` | Get MR/PR details |
| `getMRDiff(id)` | Get MR/PR diff |
| `getMRDiscussions(id)` | Get MR/PR discussion threads |
| `listIssues(filters)` | List issues |
| `getIssue(id)` | Get issue details |
| `listPipelines(filters)` | List pipelines/CI runs |
| `getPipeline(id)` | Get pipeline details |
| `getPipelineJobs(id)` | List jobs in a pipeline |
| `getJobLog(id)` | Get job log output |
| `createBranch(name, ref)` | Create a branch |
| `createMR(params)` | Create a merge/pull request |
| `commentOnMR(id, body)` | Add a comment to MR/PR |

**Adapter interface**: `SCMAdapter` with implementations for GitLab, GitHub, etc.

---

### 2.9 WorkspaceService

**Responsibility**: Multi-repo git status.

| Method | Description |
|--------|-------------|
| `scanRepos()` | Find all git repos under project root |
| `getRepoStatus(path)` | Return branch, dirty files, ahead/behind, last commit |
| `pullRepo(path)` | Run `git pull` |
| `pushRepo(path)` | Run `git push` |

**Implementation**: Shells out to `git` CLI or uses a git library (e.g., isomorphic-git, go-git, git2).

---

### 2.10 SessionManager

**Responsibility**: Manage AI CLI sessions with PTY support.

| Method | Description |
|--------|-------------|
| `createSession(config)` | Spawn AI CLI process with PTY |
| `listSessions()` | Return all sessions with status |
| `getSession(id)` | Return session details and recent output |
| `writeToSession(id, input)` | Send input to session's stdin |
| `stopSession(id)` | Send SIGTERM to session process |
| `killSession(id)` | Send SIGKILL to session process |

**PTY integration**: Use node-pty (Node.js), pty (Go/Rust), or ProcessBuilder (Java) to spawn a pseudo-terminal. Stream output chunks via WebSocket event `sessions:output`.

---

### 2.11 ReviewService

**Responsibility**: Manage code review reports.

| Method | Description |
|--------|-------------|
| `listReviews(module?)` | Scan review directories for report files |
| `getReview(path)` | Return rendered review report |
| `launchReview(config)` | Start a headless AI review session |

---

### 2.12 AIService

**Responsibility**: Uniform interface for AI model interactions.

| Method | Description |
|--------|-------------|
| `complete(messages, options)` | Single-turn completion (streaming) |
| `completeWithTools(messages, tools, options)` | Completion with tool calling (for agentic loops) |
| `explain(context, content)` | Convenience: explain a piece of content in context |
| `analyze(query, data)` | Convenience: analyze data with a question |
| `narrate(context, data)` | Convenience: generate narrative description |
| `naturalLanguageToSQL(description, schema)` | Convert natural language to SQL |

**Adapter interface**: `AIAdapter` with implementations for Anthropic, OpenAI, Azure OpenAI, Ollama.

**Streaming**: All completion methods return an async iterable/stream of text chunks. The backend pipes these to the frontend via WebSocket event `ai:stream`.

---

### 2.13 InvestigatorService

**Responsibility**: AI-powered multi-turn investigation with environment-aware tools.

See [07-ai-integration.md](./07-ai-integration.md) Section 3 for full specification.

---

### 2.14 ContainerService

**Responsibility**: Container management via adapter pattern.

| Method | Description |
|--------|-------------|
| `listContainers()` | List all containers with status |
| `getContainer(id)` | Get container details |
| `getLogs(id, options)` | Stream container logs |
| `start(id)` | Start a container |
| `stop(id)` | Stop a container |
| `restart(id)` | Restart a container |
| `remove(id)` | Remove a container (with confirmation) |
| `getStats(id)` | Get live CPU/memory stats |

**Adapter interface**: `ContainerAdapter` with implementations for Docker CLI, Podman CLI.

---

### 2.15 KubernetesService

**Responsibility**: Kubernetes cluster interaction.

| Method | Description |
|--------|-------------|
| `listPods(namespace)` | List pods with status |
| `getPod(namespace, name)` | Get pod details |
| `getPodLogs(namespace, name, container, options)` | Stream pod logs |
| `deletePod(namespace, name)` | Delete a pod |
| `listDeployments(namespace)` | List deployments |
| `listServices(namespace)` | List services |
| `listNamespaces()` | List available namespaces |

---

### 2.16 MessageBusService

**Responsibility**: Message bus interaction via adapter pattern.

| Method | Description |
|--------|-------------|
| `listTopics()` | List topics with metadata |
| `getMessages(topic, options)` | Read messages from a topic |
| `listConsumerGroups()` | List consumer groups with lag |
| `getConsumerGroup(id)` | Get consumer group details |
| `getSchemas()` | List schemas from schema registry |
| `getSchema(id)` | Get schema definition |

**Adapter interface**: `MessageBusAdapter` with implementations for Kafka (KafkaJS/confluent-kafka), RabbitMQ.

---

### 2.17 DatabaseService

**Responsibility**: Database interaction via adapter pattern.

| Method | Description |
|--------|-------------|
| `getSchema()` | Return database schema (tables, columns, types, FKs) |
| `executeQuery(sql)` | Execute a SELECT query, return results |
| `getQueryHistory()` | Return recent queries from local history |
| `getEntityLifecycle(entityType, id)` | Return entity with events and relationships |

**Adapter interface**: `DatabaseAdapter` with implementations for PostgreSQL, MySQL, SQLite.

**Security**: Only execute SELECT queries. Reject any DDL or DML (INSERT, UPDATE, DELETE, DROP, etc.) unless explicitly configured to allow writes.

---

### 2.18 FlightDeckService

**Responsibility**: Mission lifecycle management.

| Method | Description |
|--------|-------------|
| `listMissions()` | Return all missions |
| `getActiveMission()` | Return the currently active mission |
| `startPreflight(ticketId)` | Begin preflight checks for a ticket |
| `runPreflightChecks(missionId)` | Execute validation checks |
| `activateMission(missionId)` | Transition to active phase |
| `runLandingChecklist(missionId)` | Execute landing checks |
| `completeMission(missionId)` | Mark mission as completed |
| `generateBriefing()` | AI-generated team situational awareness |

**Persistence**: `~/.developer-cockpit/missions.json`

---

## 3. API Design

### REST Endpoints

All endpoints are prefixed with `/api/v1/`.

| Group | Example Endpoints |
|-------|-------------------|
| Config | `GET /config`, `PUT /config`, `POST /config/reload` |
| Specs | `GET /specs`, `GET /specs/:module/:ticketId` |
| KB | `GET /kb/tree`, `GET /kb/doc?path=...`, `GET /kb/search?q=...` |
| Requirements | `GET /requirements/use-cases`, `GET /requirements/frs`, `GET /requirements/nfrs`, `GET /requirements/actors` |
| Roadmap | `GET /roadmap`, `PUT /roadmap/items/:id` |
| Files | `GET /files?path=...`, `GET /files/content?path=...` |
| SCM | `GET /scm/mrs`, `GET /scm/issues`, `GET /scm/pipelines` |
| Workspace | `GET /workspace/repos`, `POST /workspace/repos/:path/pull` |
| Sessions | `GET /sessions`, `POST /sessions`, `DELETE /sessions/:id` |
| Reviews | `GET /reviews`, `GET /reviews/:path`, `POST /reviews/launch` |
| AI | `POST /ai/explain`, `POST /ai/analyze`, `POST /ai/nl2sql` |
| Investigate | `POST /investigate`, `GET /investigate/:id` |
| Containers | `GET /containers`, `POST /containers/:id/start`, `GET /containers/:id/logs` |
| K8s | `GET /k8s/pods`, `GET /k8s/deployments`, `GET /k8s/services` |
| MessageBus | `GET /bus/topics`, `GET /bus/messages`, `GET /bus/consumers` |
| Database | `GET /db/schema`, `POST /db/query`, `GET /db/lifecycle/:type/:id` |
| FlightDeck | `GET /missions`, `POST /missions/preflight`, `POST /missions/:id/activate` |

### WebSocket Protocol

The main process listens on `127.0.0.1:<port>` only (default 9321, `COCKPIT_WS_PORT` overrides
it), so the event stream is never reachable from the network. The renderer gets the URL
`ws://127.0.0.1:<port>` over IPC (`events:getWebSocketUrl`), and the page CSP allows
`ws://127.0.0.1:*` and no other WebSocket host (SPEC-0036).

Single WebSocket connection at `/ws`. Messages are JSON:

```json
{
  "event": "specs:tickets-changed",
  "data": { "path": "specs/changes/SPEC-0002-integrate-spec-workflow-into-developer-c/ticket.md" }
}
```

See [06-realtime.md](./06-realtime.md) for full event catalogue.

---

## 4. Error Handling

All API errors return:
```json
{
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Kubernetes cluster is not reachable",
    "service": "KubernetesService",
    "details": {}
  }
}
```

**Graceful degradation**: If an infrastructure service (K8s, Kafka, DB) is not configured or unreachable, the corresponding view shows a clear "Not Connected" state with a link to Settings. The rest of the cockpit continues to work.
