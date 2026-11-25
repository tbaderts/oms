# Developer Cockpit

A desktop workbench for spec-driven development, with lightweight infrastructure management. One
window for a project's spec tickets, knowledge base, contracts, storyboards, Git, Docker, service
monitoring and an AI assistant.

The cockpit knows nothing about any particular project. What it shows — where the knowledge base
lives, which contracts and APIs exist, which code generators to run, which services to monitor —
comes from a `cockpit.yaml` file in the project's repository.

## Views

| Group | View | What it does |
|---|---|---|
| Development | Dashboard | Spec ticket KPIs and signals |
| | Spec Tickets | The spec workflow (proposal → design → plan → implement → verify) through the project's spec CLI |
| | Contracts | Edit OpenAPI and Avro files, browse the model, run the project's code generators |
| | API Explorer | The operations of the project's OpenAPI specs, `.http` templates, request history |
| Source Control | Git Overview, Branch Manager | Status, diffs, log, branches |
| Knowledge | Knowledge Base | Browse, search and chat with the project's Markdown knowledge base; health checks |
| | Requirements | Capabilities, use cases, functional and non-functional requirements, actors |
| | Storyboards | End-to-end journeys with sketches, prose and evidence |
| | File Explorer | The workspace's files |
| Infrastructure | Docker | Containers, stats and logs from the local Docker daemon |
| | Monitoring | The project's services and metric panels (see below) |
| System | AI Assistant, Settings | An agent with MCP tools; personal settings and AI keys |

## Getting started

Requirements: Node.js 22 or later, Git, and Docker if you want the Docker view.

```bash
npm install
npm run dev        # Vite + Electron with hot reload
npm run build      # production build into dist/
npm run package    # installers via electron-builder
npm test           # unit and component tests (Vitest)
npm run typecheck
```

The cockpit opens the Git repository it is started from. To point it at another project, set the
workspace root in Settings, or start it with `COCKPIT_WORKSPACE_ROOT=/path/to/project`.

## The project file: `cockpit.yaml`

Put a `cockpit.yaml` at the root of the project's repository and commit it. Every section is
optional; without the file the cockpit starts with empty defaults and tells you where to add it.
[`examples/cockpit.yaml`](examples/cockpit.yaml) is a complete, commented example.

| Section | Used by | Keys |
|---|---|---|
| `project` | Titles, AI prompts | `name`, `description` |
| `knowledgeBase` | Knowledge Base, Requirements, KB chat | `root` (default `knowledge-base`), `checkScript` (KB health checker), `stateDiagramDoc` (storyboard links to state transitions), `serverUrl` (knowledge server, below) |
| `specs` | Spec Tickets, Contracts | `cli` (default `specs/tools/spec.mjs`), `openApiPaths`, `avroPaths` |
| `codegen` | Contracts → code generation | list of `{ id, name, description, cwd, command, windowsCommand?, inputs? }`; `command` is an argument list, run in `cwd` without a shell |
| `watch` | Live refresh | extra folders to watch |
| `links` | Help menu, Monitoring header | list of `{ label, url }` |
| `storyboards` | Storyboards | `roots` (default `<knowledge base>/storyboards`), `library` (Excalidraw library file in `_library`) |
| `apiExplorer` | API Explorer | `templateSources` (`.http` files), `apis` (list of `{ name, spec, baseUrl }`) |
| `monitoring` | Monitoring | `intervalSeconds`, `prometheusUrl`, `services`, `panels` |

The file is validated when it is read and re-read when it changes. An invalid entry is reported
with its path (for example `monitoring.services[2].check.url: Must be an http(s) URL`) in Settings →
Project file and in the Monitoring view; the rest of the app keeps working with the defaults.

**Trust.** `cockpit.yaml` decides what the cockpit runs and calls: the code-generation commands,
the spec CLI and KB checker scripts, and the hosts it monitors and sends requests to. Opening a
repository with the cockpit is like running its build: only open repositories you trust.

Personal settings — theme, AI provider and keys, the workspace root — stay in
`~/.developer-cockpit/config.json` (override the folder with `COCKPIT_CONFIG_DIR`). Settings that
`cockpit.yaml` states are shown read-only there.

## Monitoring

Each entry under `monitoring.services` becomes a tile, grouped by `group`:

| `check.kind` | UP when |
|---|---|
| `http` | `GET url` answers with a status below 400 |
| `spring-actuator` | `GET url` (an actuator health endpoint) reports `status: UP`; components are listed |
| `tcp` | `host:port` accepts a connection |

A tile shows the status, why a service is down, its response-time sparkline and a strip of the
last 30 checks. The header counts the services that are up, and a timeline lists every status
change. History is kept in memory for the session (it survives switching views, not a restart); use
Grafana for long-term history.

Panels show metrics as a single value (`stat`), a line over time (`timeseries`) or one bar per
label value (`bars`), in the units `count`, `ms`, `s`, `percent`, `bytes` or `perMinute`. A panel
reads either:

- `source: { kind: promql, query }` from `monitoring.prometheusUrl` (Prometheus, Mimir or any
  compatible API); a timeseries panel covers the last 15 minutes; or
- `source: { kind: scrape, service, metric, labels?, by?, quantile?, rate? }` from a service's
  `metricsUrl` (Prometheus text format), fetched once per poll. `quantile` reads a histogram's
  `_bucket` series; `rate` turns a counter into a per-minute rate.

A panel whose source fails shows its error; the others are unaffected. All requests are made by the
main process, only to the URLs in the file.

## API Explorer

Lists the operations of each spec under `apiExplorer.apis`. Picking one fills the request editor:
path and query parameters, and a body built from the request schema. A polymorphic body (OpenAPI
`discriminator` or `oneOf`) offers one variant per concrete schema. The body is checked against the
schema as you type. `.http` files under `templateSources` are listed as templates; their
`@variables` and `{{$guid}}`, `{{$timestamp}}`, `{{$datetime iso8601}}` and `{{$randomInt a b}}`
are resolved when you send. Requests other than GET, HEAD and OPTIONS to a host that is not local
ask for confirmation first, and redirects are shown rather than followed. Sent requests are kept in
a history of 100; the values of credential headers (`Authorization`, `Cookie`, API keys, tokens)
are not stored.

## Knowledge server

The KB chat answers from the knowledge base. With `knowledgeBase.serverUrl` (or the AI settings'
knowledge server URL, which wins) it uses an MCP server over streamable HTTP that offers the tools
`searchKnowledgeBase(query)`, `readKnowledgeBase(path, anchor?, offset?, limit?)` and
`getKnowledgeBaseOverview()`; paths are given as `<knowledge base root>/<path>`. Without a server,
or while it is unreachable, the chat uses the cockpit's own search and read tools.

## Spec workflow

The Spec Tickets view drives the project's own spec CLI (`specs.cli`); the cockpit only calls it
and shows the result, so the workflow rules live with the project. Approvals are recorded by the
CLI under the Git user.

## Other environment variables

| Variable | Effect |
|---|---|
| `COCKPIT_WORKSPACE_ROOT` | Workspace for this run only |
| `COCKPIT_CONFIG_DIR` | Folder of the personal `config.json` |
| `COCKPIT_STORYBOARDS_ROOTS`, `_ENABLED`, `_WRITABLE`, `_MAX_SOURCE_BYTES`, `_MAX_ASSET_BYTES` | Storyboard overrides |
| `COCKPIT_WS_PORT` | Port of the internal event WebSocket |
| `COCKPIT_DEVTOOLS` | Open the developer tools |

## Design documents

[`spec/`](spec/README.md) holds the blueprint the cockpit was built from. It was written while the
cockpit was developed inside an order management system, and its examples still refer to it.
