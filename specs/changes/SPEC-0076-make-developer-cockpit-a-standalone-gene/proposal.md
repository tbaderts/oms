# Proposal — SPEC-0076: Make developer cockpit a standalone generic tool

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The developer cockpit (`developer-cockpit/`, Electron) started as the OMS team's workbench and is
now mostly generic: spec tickets, the knowledge base, storyboards, contracts, Git, Docker and the
AI assistant work on any repository that follows the same conventions. But OMS knowledge is
compiled into it, so no other project can use it:

- **Monitoring** (SPEC-0053) reads one hard-coded service, oms-core's actuator
  (`infrastructure.omsCoreUrl`), and its six tiles parse OMS metric names
  (`oms-orders-by-state`, `oms-order-time-to-ack-seconds`, outbox gauges). Of the 17 services in
  the root `docker-compose.yml` it shows one.
- **Defaults and code**: the KB root `oms-knowledge-base`, contract paths in `oms-contracts`, the
  Gradle code-generation tasks (`CodeGenService`), the file-watcher paths (`WatcherService`), the
  AI system prompts ("an order management system"), the Help menu's "OMS Documentation" and the
  API Explorer's Orders tab and order follow-up. In total `src/` names `oms` about 130 times.

The requester wants the cockpit in its own repository,
<https://github.com/tbaderts/developer-cockpit.git> (it exists and is empty), as a generic tool for
spec-driven development with lightweight infrastructure management. What a project monitors must
come from configuration, and no project-specific (proprietary) logic may remain in the tool. If we
do nothing, every new project needs a fork, and the OMS monitoring stays a one-service view.

Related pages: `oms-knowledge-base/tools/developer-cockpit.md`, `delivery/spec-driven-development.md`,
`infrastructure/local-docker-stack.md`.

## What Changes

- **Project configuration file.** A project describes itself in a committed `cockpit.yaml` at its
  workspace root: name and description, knowledge-base root, contract paths, code-generation
  tasks, watched paths, API-template sources, documentation links, and the services to monitor.
  The per-user settings (`~/.developer-cockpit/config.json`: theme, AI provider and keys, workspace
  root) stay where they are. The file is validated on load; errors are shown with their path, never
  as a crash.
- **Generic Monitoring view**, driven by the `monitoring` section of `cockpit.yaml`:
  - **Service status board**: one tile per configured service, grouped (e.g. "Application",
    "Data", "Observability"), with a health check of kind `http` (status below 400),
    `spring-actuator` (the body's `status` and its components) or `tcp` (port accepts a connection).
    The header sums it up ("14 of 17 up").
  - **Liveliness, from data the tool already collects**: a response-time sparkline and an
    up/down history strip of the recent checks on each tile, a status-change timeline ("oms-core
    DOWN → UP, 10:42"), and per-service links (Grafana, Swagger, UI).
  - **Configurable metric panels** (stat, time series, bar-by-label), each either a PromQL query
    against a Prometheus-compatible API (Prometheus, Mimir) or a metric read from a service's
    Prometheus text endpoint. The six OMS tiles become panels in the OMS config, not code.
- **No OMS logic in the tool.** OMS names, metric names, Gradle tasks, prompts and the Orders tab
  leave the code. Behaviour that only made sense for OMS is replaced by configuration or by
  generic features (the AI prompt names the configured project; code generation runs the configured
  commands).
- **OMS keeps working** through a `cockpit.yaml` at the OMS repository root, the sample the goal
  asks for: all 17 compose services, the six former OMS tiles as panels, the OMS paths and code
  generation tasks. The OMS `.http` templates move next to it.
- **New home.** The cockpit, with its Git history, is pushed to
  `github.com/tbaderts/developer-cockpit` (`main`), with its own README and a generic example
  config. Approving this proposal authorises that push.

## Scope

### In scope

- `cockpit.yaml` (schema, loading, validation, defaults when absent) and moving every OMS-specific
  default and literal out of `developer-cockpit/src`.
- The generic Monitoring view described above (status board, sparklines, history strip,
  status-change timeline, links, metric panels).
- The OMS `cockpit.yaml` covering every service in the root `docker-compose.yml`.
- Publishing the cockpit with history to the new repository, with a README and an example config.
- Updating the knowledge base (`tools/developer-cockpit.md` and pages that link it) to describe the
  cockpit as an external tool configured by `cockpit.yaml`.

### Out of scope

- **Deleting `developer-cockpit/` from the OMS repository.** The ticket's own verify gate runs the
  module's checks there, and removing the module from `specs/config.json` is a human change. A
  follow-up chore removes the folder and the module entry after this ticket is archived.
- Moving the spec toolkit (`specs/tools/spec.mjs`, templates, policies, the `spec-*` skills) or
  `tools/okf-check` into the cockpit repository. The cockpit keeps calling the project's own CLIs,
  now at configurable paths.
- A Kubernetes view, alerting or notifications, service topology diagrams, and persistent metric
  history (history lives in memory for the session).
- Packaging and releasing installers, CI for the new repository.
- Changes to `mission-control` and `oms-kb-explorer`.

## Acceptance Criteria

- **AC-1** — Given a workspace whose `cockpit.yaml` lists services with `http`, `spring-actuator`
  and `tcp` health checks, when the Monitoring view polls, then it shows one tile per service, in
  its configured group, with status UP, DOWN or UNKNOWN as the check defines it, plus a header
  count of services up.
- **AC-2** — Given one configured service is unreachable or times out, when the view polls, then
  that tile shows DOWN with the reason and the URL, the other tiles still update, and a status
  change UP → DOWN is added to the status-change timeline with its time.
- **AC-3** — Given several successful polls, when the view renders a service tile, then it shows a
  response-time sparkline and an up/down history strip of at most the last 30 checks.
- **AC-4** — Given metric panels of type stat, time series and bar-by-label, with a PromQL source
  (against a stubbed Prometheus HTTP API) and a scrape source (a stubbed Prometheus text endpoint),
  when the view polls, then each panel shows the values the stub returns, and a panel whose source
  fails shows its error without affecting the other panels.
- **AC-5** — Given a `cockpit.yaml` with an invalid entry (e.g. a service without a URL, an unknown
  health-check kind), when the cockpit loads it, then the Monitoring view and Settings show a
  validation error naming the file and the entry's path, and the rest of the app works. Given no
  `cockpit.yaml`, the app starts and the Monitoring view shows an empty state that names the file.
- **AC-6** — Given the cockpit source, when the test suite runs, then a test finds no occurrence of
  `oms` (case-insensitive, as a word or `oms-`/`oms_` prefix) in `developer-cockpit/src`, and the
  defaults, prompts, menu, watcher paths and code-generation tasks come from `cockpit.yaml`
  (asserted by tests that load a non-OMS fixture project).
- **AC-7** — Given the OMS repository's `cockpit.yaml`, when it is validated by the cockpit's
  schema, then it passes, it has one service for each service in the root `docker-compose.yml`,
  and it has panels for orders by state, order events, time to ack p99, time to market p99 and the
  outbox (the former OMS tiles).
- **AC-8** — Given the new repository `github.com/tbaderts/developer-cockpit`, when `main` is
  cloned fresh and `npm ci && npm run typecheck && npm test` runs, then it passes; `git log` there
  includes the cockpit's history from the OMS repository; and its README describes `cockpit.yaml`
  with a generic example.

## Impact

| Area | Impact |
|---|---|
| Modules | developer-cockpit, oms-knowledge-base (plus the new `cockpit.yaml` at the OMS root) |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | none |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | none at runtime. Cockpit users: `infrastructure.omsCoreUrl` and the OMS defaults go away; the OMS `cockpit.yaml` supplies them. The API Explorer's Orders tab is removed (see Open Questions) |
| Knowledge base | `tools/developer-cockpit.md`, `tools/index.md`, `delivery/spec-driven-development.md`, `infrastructure/local-docker-stack.md`, `capabilities/non-functional-requirements/NFR-007-observability.md` (links to the Monitoring view) |

## Open Questions

- [resolved] Keep the monitoring basic or add more? → assumption: a status board plus things the
  tool can show from its own polling (sparklines, history strip, status-change timeline, links)
  and configurable metric panels via PromQL or scrape. Topology diagrams, alerting and persisted
  history are out of scope. Easy to extend later.
- [resolved] Where does project configuration live? → assumption: a committed `cockpit.yaml` at the
  workspace root (YAML, so it can be commented). Personal settings and AI keys stay in
  `~/.developer-cockpit/config.json`.
- [resolved] What happens to the API Explorer's Orders tab and order follow-up, which are OMS
  logic? → assumption: removed from the tool. The generic request builder, OpenAPI-driven commands,
  history and `.http` templates stay; the OMS order and lifecycle templates move to the OMS
  repository and are listed in its `cockpit.yaml`. **Review this one**: it removes a feature OMS
  users have today.
- [resolved] Keep the Git history when moving? → assumption: yes, by splitting
  `developer-cockpit/` into its own history (`git subtree split`) and pushing that to the new
  repository's `main`.
- [deferred] Removing `developer-cockpit/` from the OMS repository → a follow-up chore after
  archive, because this ticket's verify gate runs the module's checks in that folder and the
  module list in `specs/config.json` is changed by a human.
- [deferred] Moving the spec toolkit and `okf-check` into the cockpit repository → the cockpit only
  calls them through configurable paths, so they can move later without changing the tool.
