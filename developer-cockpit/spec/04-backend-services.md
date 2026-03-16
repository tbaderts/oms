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
| `*/specs/**` | `specs:changed` |
| KB root `**/*.md` | `kb:changed` |
| Roadmap file | `roadmap:changed` |
| Review directories | `reviews:changed` |

---

### 2.3 SpecService

**Responsibility**: Discover, parse, and serve spec metadata and content.

| Method | Description |
|--------|-------------|
| `listSpecs()` | Scan all module spec directories, return metadata array |
| `getSpec(module, ticketId)` | Return full spec content (proposal, design, tasks) |
| `getSpecMetadata(module, ticketId)` | Return parsed front-matter only |
| `getTaskProgress(module, ticketId)` | Count checked/total checkboxes in tasks.md |

**Spec status derivation logic:**
```
if only proposal.md exists -> "proposal_only"
if design.md exists but no tasks.md -> "design_ready"
if tasks.md exists and has unchecked items -> "in_progress"
if tasks.md exists and all items checked -> "completed"
```

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

Single WebSocket connection at `/ws`. Messages are JSON:

```json
{
  "event": "specs:changed",
  "data": { "module": "backend", "ticketId": "PROJ-123" }
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
