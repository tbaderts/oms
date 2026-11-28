# Proposal — SPEC-0080: Extract knowledge server into its own repository

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The goal asks to move `oms-mcp-server` and `oms-kb-explorer` into the new repository
https://github.com/tbaderts/knowledge-server, make both OMS-agnostic, and rename them after what
they really are: a general-purpose knowledge server with a React user interface.

Today the two modules are general-purpose in substance but tied to OMS in many places:

- **Build.** `oms-mcp-server` includes `../oms-contracts` (`includeBuild`) only to get query models
  for the `searchOrders` tool. It is part of the root composite build (`settings.gradle`,
  `build.gradle`).
- **OMS-only features.** `OrderSearchMcpTools`, `OrderQueryClient`, `DemoOrderController`,
  `OmsClientProperties` and the `oms.base-url` setting exist only to query oms-core.
- **Wording and defaults.** The MCP prompts say "OMS specification" (`KbMcpFeaturesConfig`).
  - The server defaults to `../oms-knowledge-base`.
  - Its OTLP resource is `service.namespace: oms`.
  - The retrieval eval's golden queries name `oms-knowledge-base/...` documents.
- **UI.** The explorer reuses the oms-ui shell (Acme Capital header and footer, `AcmeLogo`).
  Its sample data and path handling assume `oms-knowledge-base/`.
- **Runtime.** The root `docker-compose.yml` runs the server and makes it depend on `oms-core`
  and `alloy`.

So the knowledge server cannot be reused for another knowledge base, or evolved on its own, without
carrying OMS along. Its knowledge source is a single comma-separated list of directories, with no
notion of separate, named knowledge repositories.

If nothing changes, every improvement to the knowledge tooling lands in the OMS repo and its spec
process, and the tool stays unusable outside OMS. Related knowledge-base pages:
`capabilities/knowledge-services.md`, `tools/knowledge-server.md`, `tools/kb-explorer.md`.

## What Changes

The product is the **knowledge server** (repository `knowledge-server`). It has two components:

- **`kb-server`** is the MCP and REST knowledge server, formerly `oms-mcp-server`.
- **`kb-explorer`** is the React knowledge browser, formerly `oms-kb-explorer`.

- **New repository.** `github.com/tbaderts/knowledge-server` holds both components as a clean copy
  with no OMS git history.
  - It has its own Gradle build, `npm` build, README and `docker-compose.yml` running
    `kb-server` and `kb-explorer`.
  - The initial commit is pushed to its `main`.
- **Multiple, configurable knowledge repositories.** The knowledge server is configured with a list of named
  knowledge repositories. Each one is a directory: a local clone or a mounted volume.
  - Every document, search hit, citation and `kb://` resource is attributed to its repository.
  - The UI shows which repository a document belongs to and can filter by repository.
  - No repository is built in or defaulted to OMS.
- **OMS-agnostic.**
  - No OMS names, OMS endpoints, `oms-contracts` dependency or OMS branding remain in either
    component.
  - MCP prompts, the server name, the OTLP service identity and the UI shell are neutral.
  - The retrieval eval runs against a sample knowledge repository that ships with the knowledge server.
- **BREAKING (agents using the OMS MCP server):** the `searchOrders` MCP tool and the demo order
  endpoint are removed. FR-034 is marked deprecated.
- **BREAKING (OMS developers):** these OMS-repo modules are removed:
  - `oms-mcp-server/` and `oms-kb-explorer/` are deleted;
  - they leave the root composite build, `specs/config.json`, `docker-compose.yml` (service
    `mcp-server` and volume `mcp-kb-index`) and `cockpit.yaml`.

  OMS uses the knowledge server instead:
  - `.mcp.json` and `.vscode/mcp.json` point at a running `kb-server` that is configured with
    `oms-knowledge-base` as a knowledge repository;
  - `CLAUDE.md`, `README.md` and the OMS knowledge base say how to run it.
- **OMS knowledge stays in OMS.** `oms-knowledge-base/` remains in this repository. Its pages about
  the knowledge server and explorer are updated to name `kb-server`, `kb-explorer` and their repository. They stay in
  the OMS knowledge base and are not moved.

## Scope

### In scope

- Create the `knowledge-server` repository from the current code of both modules, renamed and stripped of
  OMS coupling. Push it to `github.com/tbaderts/knowledge-server` `main`.
- Replace the single docs-path list with configuration for several named knowledge repositories in
  the server, its REST API, its MCP tools and resources, and the UI.
- Neutral naming throughout the moved code: server name, MCP prompts, OTLP identity, UI shell and
  branding, Java packages and Gradle group, and the npm package name.
- Move the Docker Compose definition for the knowledge server into the new repository, and add the
  UI to it.
- A small sample knowledge repository with its own golden-query set in the new repository, so its tests
  and retrieval eval do not depend on OMS.
- Remove both modules and every reference to them from the OMS repository.
  - Re-point MCP client registrations, the cockpit check, docs and the spec config.
  - Update the OMS knowledge-base pages that describe the tool.

### Out of scope

- New search, indexing or UI features beyond repository attribution and filtering.
- Fetching knowledge repositories from a git URL. A repository is a directory you clone or mount
  yourself; cloning or syncing from a URL is deferred.
- Re-homing `searchOrders` in oms-core or anywhere else. That would be its own ticket.
- CI/CD for the new repository, publishing container images, and releases or versioning.
- Bundling an observability stack or Ollama in the `knowledge-server` compose file. OTLP export and
  embeddings stay optional and configurable, as they are today.

## Acceptance Criteria

- **AC-1** — Given a fresh clone of `github.com/tbaderts/knowledge-server` `main`, when the server
  build (`./gradlew check`) and the UI build (`npm ci && npm run build`) run with no sibling
  directories present, then both succeed. This includes the retrieval eval against the bundled
  sample repository, which keeps recall@5 ≥ the value it records for that set.
- **AC-2** — Given the `knowledge-server` repository, when it is searched case-insensitively for `oms`,
  `acme`, `oms-contracts` and `org.example.oms`, then there are no matches outside a migration note
  in the README.
- **AC-3** — Given `kb-server` configured with two knowledge repositories, `alpha` and
  `beta`, each with distinct documents, when an MCP client calls `searchKnowledgeBase` for a term
  in each, then hits come from both repositories. Each hit and each citation names its repository,
  and `getKnowledgeBaseOverview` lists the documents of both, grouped or labelled by repository.
- **AC-4** — Given the same two-repository configuration, when `searchKnowledgeBase` or
  `GET /api/kb/search` is called with a repository filter of `beta`, then only `beta` documents are
  returned. With an unknown repository name, the result is an empty list for MCP and a 400 for
  REST, not an error from the server.
- **AC-5** — Given a configured repository whose directory does not exist, when `kb-server`
  starts, then it starts and serves the other repositories. It logs a warning naming the missing
  repository and path, and the overview reports that repository as unavailable.
- **AC-6** — Given `docker compose up -d` in the `knowledge-server` repository, with a knowledge
  repository directory set through configuration (env var / `.env`), when the stack is up, then:
  - the MCP endpoint answers an MCP `initialize` and `tools/list` request on its published port;
  - the UI at its published port lists and renders a document from that repository;
  - `tools/list` contains no `searchOrders` tool.
- **AC-7** — Given the OMS repository after the change, when `./gradlew build` runs at the root and
  `node specs/tools/spec.mjs` checks run, then both pass, and:
  - neither `oms-mcp-server/` nor `oms-kb-explorer/` exists;
  - `settings.gradle`, `build.gradle`, `docker-compose.yml`, `specs/config.json` and
    `cockpit.yaml` no longer reference them;
  - `docker compose config` at the root succeeds.
- **AC-8** — Given the OMS repository after the change, when a search runs for `oms-mcp-server` and
  `oms-kb-explorer` in the live documents, then there are no matches. Historical records are
  excluded, because rewriting them would falsify history:
  - spec tickets: `specs/archive/` and every ticket folder under `specs/changes/` (their records
    of past work);
  - dated reviews: `ARCHITECTURE-REVIEW.md` (2026-08-15) and the knowledge-base pages marked
    `point_in_time: true`;
  - `oms-knowledge-base/archive/` and `oms-knowledge-base/log.md`.

  Also:
  - `.mcp.json` and `.vscode/mcp.json` register kb-server.
  - `node tools/okf-check/okf-check.mjs oms-knowledge-base` passes.
  - FR-034 is `status: deprecated`.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-mcp-server, oms-kb-explorer (both removed from this repo and recreated as `kb-server` and `kb-explorer` in the new repo); root build files, `docker-compose.yml`, `cockpit.yaml`, `specs/config.json`, MCP client configs |
| Contracts (OpenAPI / Avro) | none — `oms-contracts` loses a consumer (`oms-mcp-server` drops out of its `impacts` list); no spec or schema changes |
| Data (tables, migrations) | none |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | **BREAKING** for AI agents: `searchOrders` MCP tool removed; MCP server registration and tool names in `.mcp.json`, `.vscode/mcp.json`, `.claude/settings.local.json` and `.github/` agent files change. Mission Control / cockpit KB chat re-pointed at `kb-server`. oms-ui unaffected. |
| Knowledge base | `tools/knowledge-server.md`, `tools/kb-explorer.md`, `tools/index.md`, `tools/developer-cockpit.md`, `capabilities/knowledge-services.md`, FR-033/034/035/045/046/047, NFR-009, NFR-007, `delivery/ai-augmented-development.md`, `delivery/ci-cd.md`, `architecture/patterns/service-template.md`, technical-debt register, `ui/design-system.md`, `semantic-layer/*` mentions; `CLAUDE.md`, `README.md`, `AGENTS.md`, `specs/policies/architecture-policies.md`, `.claude/skills/spec-verify/SKILL.md` |

## Open Questions

- [resolved] Product and component names? → `kb-server` and `kb-explorer` (renamed from an earlier name, "ContextCore", on 2026-11-28).
  The GitHub repository stays `knowledge-server`.
- [resolved] Keep git history? → No, it is a clean copy.
- [resolved] What happens to the OMS-only `searchOrders` tool and `DemoOrderController`? → They are
  dropped and FR-034 is deprecated. Re-homing them is a separate ticket if wanted.
- [resolved] Where do the knowledge-base pages about the server and explorer live? → They stay in
  the OMS knowledge base, updated to name the knowledge server. The knowledge server supports multiple, configurable
  knowledge repositories, and `oms-knowledge-base` is one of them.
- [resolved] Does the ticket push to GitHub? → Yes. Implementation commits and pushes the initial
  version to `main` of `github.com/tbaderts/knowledge-server` once AC-1 passes locally.
- [resolved] Does the compose setup move? → Yes. The knowledge server's compose definition moves
  to the new repository, which also runs the UI. Its old dependencies on `oms-core` and `alloy` go
  away.
- [resolved] What is a "knowledge repository" in configuration? → assumption: a name plus a
  directory path, which is a local clone or a mounted volume. Cloning from a git URL is deferred
  (see Out of scope). This is reversible, since a URL source can be added later.
- [resolved] Where is the new repository worked on locally? → assumption: a sibling clone at
  `c:\data\workspace\knowledge-server`.
- [resolved] How does OMS run the knowledge server after the move? → assumption: the OMS MCP client configs
  point at a `kb-server` instance on `localhost` over HTTP, configured with
  `../oms/oms-knowledge-base` as a repository. `CLAUDE.md` documents the one-time setup.
- [resolved] Java package and Gradle group in the new repository? → assumption: a neutral
  `io.kbserver` (the design confirms it). This is reversible and internal.
- [resolved] Does AC-8 cover historical records (other spec tickets, dated reviews)? → No. Found
  during implementation: 62 other ticket folders under `specs/changes/`, the dated
  `ARCHITECTURE-REVIEW.md` and the point-in-time assessment `architecture-review-2026-10-30.md`
  name the old modules as records of past work. AC-8 now checks live documents only (reopened
  2026-11-28; needs re-approval).
