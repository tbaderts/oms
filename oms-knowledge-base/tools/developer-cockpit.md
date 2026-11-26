---
aliases: [architecture/developer-cockpit]
type: Component
title: "Developer Cockpit"
description: "Generic Electron workbench for the spec workflow, knowledge base, storyboards and service monitoring; the OMS configures it with cockpit.yaml."
tags: [component, electron, tooling, storyboards]
status: draft
updated: "2026-11-25T12:00:00Z"
component: "developer-cockpit"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-29T12:00:00Z" }
sources:
  - resource: "repo:developer-cockpit/src/main/index.ts"
  - resource: "repo:developer-cockpit/src/main/services/RequirementsService.ts"
  - resource: "repo:developer-cockpit/src/main/services/kbLayout.ts"
  - resource: "repo:developer-cockpit/src/main/services/OkfCli.ts"
  - resource: "repo:developer-cockpit/src/renderer/views/knowledge-base/KbHealthPanel.tsx"
  - resource: "repo:developer-cockpit/src/renderer/views/knowledge-base/FrontMatterPanel.tsx"
  - resource: "repo:developer-cockpit/test/main/RequirementsService.test.ts"
  - resource: "repo:developer-cockpit/src/main/storyboards/StoryboardService.ts"
  - resource: "repo:developer-cockpit/src/main/ipc/storyboards.ipc.ts"
  - resource: "repo:developer-cockpit/src/main/storyboards/cli/checkStoryboards.ts"
  - resource: "repo:developer-cockpit/test/main/StoryboardService.writes.test.ts"
  - resource: "repo:developer-cockpit/src/main/services/MonitorService.ts"
  - resource: "repo:developer-cockpit/src/shared/prometheusParser.ts"
  - resource: "repo:developer-cockpit/src/renderer/views/monitor/MonitorView.tsx"
  - resource: "repo:developer-cockpit/src/shared/projectConfig.ts"
  - resource: "repo:developer-cockpit/src/main/services/ApiCatalogService.ts"
  - resource: "repo:cockpit.yaml"
  - resource: "repo:tools/api-templates/orders.http"
  - resource: "repo:developer-cockpit/src/main/ai/KbChatTools.ts"
  - resource: "repo:developer-cockpit/src/renderer/views/knowledge-base/KbChatPanel.tsx"
  - resource: "repo:developer-cockpit/src/renderer/views/knowledge-base/KbChatDetails.tsx"
  - resource: "repo:developer-cockpit/src/renderer/lib/kbChatTrace.ts"
  - resource: "repo:developer-cockpit/test/main/kbChat.ipc.test.ts"
  - resource: "repo:developer-cockpit/src/main/ai/KeyStore.ts"
  - resource: "repo:developer-cockpit/src/main/ai/keyMigration.ts"
  - resource: "repo:developer-cockpit/src/main/ipc/aiKeys.ipc.ts"
---
# Developer Cockpit

An Electron desktop tool for the people building the OMS: the spec-ticket workflow, the knowledge
base, storyboards, an API explorer, an AI assistant, Docker and monitoring. Not part of the runtime
system.

## A generic tool, configured by `cockpit.yaml`

Since SPEC-0076 the cockpit is project-neutral; its home is
[github.com/tbaderts/developer-cockpit](https://github.com/tbaderts/developer-cockpit), with the
history it had here. Its source contains nothing about the OMS. Everything OMS-specific comes from
`cockpit.yaml` at the root of this repository:

| Section | OMS value |
|---|---|
| `knowledgeBase` | `oms-knowledge-base`, the `okf-check` script, `domain/model/order-state.md` as the state diagram storyboard steps link to, and the [knowledge server](knowledge-server.md) (`http://localhost:8091/mcp`) for the KB chat |
| `specs` | `specs/tools/spec.mjs`; contracts in `oms-contracts/src/main/{openapi,avro}` |
| `codegen` | The oms-contracts model generation, then oms-core's API interfaces (`./gradlew`, `gradlew.bat` on Windows) |
| `apiExplorer` | The command API (`/api/command`) and query API (`/api/query`) of oms-core, and the `.http` templates in `tools/api-templates/` and `oms-core/rest.http` |
| `monitoring` | Every service of the root `docker-compose.yml`, and the panels below |
| `links` | Grafana, Swagger UI, the OMS UI, Alloy |

Personal settings (theme, AI provider and keys, the workspace root) stay in
`~/.developer-cockpit/config.json`. The cockpit's README in its repository documents every key.
The `developer-cockpit/` folder still exists in this repository until a follow-up removes it.

## Requirements

The **Requirements** view is how people browse the [capability catalogue](../capabilities/index.md)
(SPEC-0061). `RequirementsService` (main process) reads it from the folders named in one module,
`src/main/services/kbLayout.ts`, which matches what `okf-check` enforces:

| Tab | Folder | Shows |
|---|---|---|
| Capabilities (default) | `capabilities/` | Each capability with its maturity (implemented, partial, planned), the number of use cases and requirements; selecting one lists its commands, use cases and requirements |
| Use Cases | `capabilities/use-cases/` | UC-nnn with actors, preconditions, main and alternative flows, postconditions |
| Functional Requirements | `capabilities/functional-requirements/` | FR-nnn with priority and **implementation** (implemented, partial, not-implemented), and storyboards that reference it |
| Non-Functional Requirements | `capabilities/non-functional-requirements/` | NFR-nnn with category, metric and target |
| Actors | `capabilities/actors/` | People and systems, by kind (human, system, external) |

The Use Cases tab also shows each use case's capability, alternative flows and linked requirements;
the Non-Functional tab shows implementation. The storyboard link index (`LinkIndexService`) and the
AI extracts (`kbExtracts`) use the same layout module for requirement ids; the order-state document
is `knowledgeBase.stateDiagramDoc` in `cockpit.yaml`.

## AI provider keys

The AI assistant, the KB chat and the storyboard assists share one provider stack and one way of
finding the provider's API key (SPEC-0063).

- **One key per provider.** Settings → AI → *API keys* has a row each for Anthropic, OpenAI and
  Local. A run uses the key of the provider it runs with, never another provider's key.
- **Encrypted, write-only.**
  - **Storage.** Keys are encrypted with the OS account (Electron `safeStorage`: DPAPI on Windows,
    Keychain on macOS, the secret service on Linux) and stored as ciphertext in
    `~/.developer-cockpit/ai-keys.json`. They never appear in `config.json`.
  - **The window.** It can save, replace or clear a key and see whether one is saved, but it never
    receives a key value: `config:load` carries none, and the `ai:keys:*` channels return only
    status.
  - **Settings saves.** A settings save cannot change a key.
  - **Linux.** The plain-text `basic_text` backend counts as "encryption unavailable", and then no
    key can be saved.
- **Precedence.** A saved key wins, and the environment variable named in Settings is the fallback.
  - The name must be a variable name: a pasted key is refused. A pasted key that is still in the
    config is never shown in the window.
  - A provider never reads **another provider's** usual variable. Local never reads
    `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, so switching to a local or remote model server cannot
    send it your Anthropic or OpenAI key.
  - With neither a saved key nor a fallback, the provider is "not configured". Settings shows which
    source the active provider uses.
- **One-time migration.** On the first start of a build with this feature:
  - A plain-text `ai.apiKey` in `config.json` (the old field, shown only for Local) becomes the
    **Local** key.
  - A key pasted into the variable-name field becomes the **configured provider's** key. The field
    is reset to `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`, or to empty (no fallback) for Local.
  - Neither overwrites a working saved key; a losing value is discarded with a `[keys]` warning
    that names the provider, never the value.
  - A value that cannot be stored stays in `config.json`, with a warning. So does every value when
    OS encryption is unavailable.
- **Failure behaviour.** If `ai-keys.json` exists but can't be read or parsed, the cockpit never
  overwrites it. Saving or clearing a key then fails with "The key file could not be read or
  written", and a `[keys]` warning is logged.
- **What it protects against.** It stops agents and tools from picking up a key by reading files
  or the environment. It does **not** stop a process that runs as the same OS user and deliberately
  calls the OS to decrypt `ai-keys.json`. A profile copied to another machine can't decrypt its
  keys: they read as not set, with a `[keys]` warning, and must be entered again.

## Knowledge Base

The **Knowledge Base** view shows the bundle as a folder tree to any depth (`KbService.getCategories`:
one node per folder, id = its path such as `domain/model`), and each folder lists only its own
documents. Navigation files (`index.md`, `log.md`) are not listed but stay searchable; deprecated
(archived) documents are struck through and marked. Nothing in the tree is hard-coded.

An opened document shows its front matter under the title (SPEC-0064):
- type, status (draft and deprecated marked) and the `updated` date;
- the description, tags and sources, with `repo:` sources as code paths;
- former ids (`aliases`) and `superseded_by`;
- every other key, such as a requirement's priority and implementation.

### Health

The **Health** switch shows the knowledge base's health in the centre of the view (SPEC-0064). The
cockpit runs the repository's checker, `tools/okf-check` (`okf-check --json`, through `OkfCli`), so
it reports exactly what the command line reports. The panel shows:
- **Statistics:** documents, errors and warnings; documents by type, status and folder;
  requirements by implementation and priority; and review age against `review_after_days`.
- **Findings:** errors, then warnings, grouped by rule with counts. Clicking one opens its
  document. The warnings are listed in
  [Schema and Constraints](../semantic-layer/schema-and-constraints.md#freshness-warnings-spec-0064).
- **Fix indexes:** lists the entries folder indexes miss (`--fix-indexes --dry-run`). **Apply**
  adds them, then re-checks and reloads the tree; **Cancel** writes nothing.

If `tools/okf-check` has no `node_modules`, the panel shows the checker's error; run
`npm --prefix tools/okf-check install`.

### KB Chat

The **Chat** switch shows the chat in the centre of the Knowledge Base view (SPEC-0062). It answers questions
about the knowledge base and summarises documents, using the AI provider set under Settings → AI.

The centre shows one of **Document**, **Chat** or **Health** at a time, so the chat has the full
width. Switching keeps the conversation. Opening a source from an answer switches to the document;
"Summarise this document" names the document it means.

- **Tools.** The chat connects over MCP to the
  [knowledge server](knowledge-server.md) at `ai.knowledgeServerUrl` (Settings → AI, default
  `http://localhost:8091/mcp`).
  - It gives the model only the three read-only KB tools: `searchKnowledgeBase`,
    `readKnowledgeBase` and `getKnowledgeBaseOverview`. Order tools such as `searchOrders` are
    left out.
  - When the server is unreachable, the chat falls back to local tools: `search_knowledge_base`
    over the cockpit's own index, and `read_knowledge_base_document`, which reads only indexed KB
    documents. The panel then shows "Knowledge server unavailable — using local search". The
    cockpit tries the server again after 60 s.
- **Sources.** Each answer lists the documents its tools found or read. Clicking one opens it in
  the document viewer.
- **Source details and Run details (SPEC-0065).**
  - **In the Sources list,** each source shows its best match next to its link:
    - for a knowledge server search, e.g. `#1 · score 0.0325 · Summary (lines 18-28) · Capability ·
      draft · unverified`;
    - for the local fallback search, `#1 · distance 0.123 (lower is better)`, a fuzzy-match
      distance where 0 is an exact match;
    - for a document only read, `read #anchor`.

    Its toggle (closed by default) lists every match: the query, rank, score and keyword and
    semantic ranks, the section, the type, status and trust tier, and the excerpt.
  - **Run details** (closed by default) start with a summary line: provider and model, input,
    output and total tokens, the number of tool calls, the duration, and the outcome (complete,
    stopped, step limit, or failed with its error). Then the steps follow in order: the text the
    model wrote between tool calls, and each call with its input and a collapsed result. A result
    shows as text, up to 4,000 characters.
  - Tool text that arrives JSON-encoded (quoted, with escaped line breaks, as the knowledge server
    sent it before SPEC-0065) is decoded first (`shared/mcpText.ts`).
  - Each answer keeps its own details for the session. Clear removes them.
  - Code: `kbChatTrace.ts`, the trace in the `kbChat` store, and `KbChatDetails.tsx`.
- **Summarise this document.** This button asks the chat to read and summarise the open document.
- **Conversation.** The chat is multi-turn for the session. Each question is sent with the last 10
  question/answer pairs, and Clear starts over. Nothing is persisted.
- **Usage.** Runs are recorded in the AI usage log with the feature `kb-chat`.
- **Code.** The main process has `KbChatTools` and the `ai:kbChat` IPC channel, with
  `AiService.runChat` behind it. The renderer has the `kbChat` store and `KbChatPanel`.

## Storyboards

The **Storyboards** view (Knowledge group, SPEC-0014) reads and edits the process journeys under
`oms-knowledge-base/storyboards/`, which sit outside the OKF bundle (see
[Knowledge Base Conventions](../okf-conventions.md)). Its parts:

- **`StoryboardService` (main process).** It scans the configured roots, reads one storyboard
  with advisory validation, and does every write. Each write is checked against a revision token
  (file time plus content hash), so a stale save is refused rather than overwriting someone
  else's edit. Front-matter edits change only the keys they touch.
- **Identifiers, not paths.** The renderer reaches the service through IPC
  (`window.cockpit.storyboards.*`) and names storyboards by id; no channel accepts a filesystem
  path.
- **Illustrations** are served through the `storyboard-asset://<id>/<file>` protocol: one flat
  file name, inside that storyboard's `assets/` folder, never a symbolic link. SVG responses
  carry a restrictive Content-Security-Policy. Uploaded SVGs are rejected if they contain script,
  event handlers, `foreignObject` or external references.
- **Evidence.** An optional `story.card.yaml` per storyboard pins module commits and source
  lines. The scan reports drift when those lines changed in later commits, and a trust tier.
- **Exports.** Mermaid sequence diagrams, a standalone script-free HTML handout and its PDF are
  generated from the same files.
- **Sketches** are drawn with Excalidraw, loaded only when the editor opens and served from local
  files, never a CDN.
- **Optional AI assists** (draft prose, review alternate paths, suggest links) only propose
  changes; the user applies them to the editor draft.
- **CI gate.** `npm run check:storyboards [-- --strict]` in `developer-cockpit` checks the
  repository's storyboards, with the roots and library named in `cockpit.yaml`.

## Monitoring

The **Monitoring** view (Infrastructure group) watches the services and metrics listed under
`monitoring` in `cockpit.yaml` (SPEC-0076; it replaced the oms-core-only view of SPEC-0053). It
is read-only and polls every `intervalSeconds` (10 s for the OMS) while it is open.

- **Service board.** One tile per service, grouped as Application, Messaging, Data and
  Observability, with a count of services up. A tile is UP, DOWN (with the reason) or UNKNOWN by
  its check: Spring Boot actuator health for oms-core, oms-streaming-service, oms-price-service and
  oms-exchange-simulator; an HTTP status for oms-ui, the Schema Registry, Control Center, pgAdmin,
  Grafana, Loki, Alloy, Mimir and Tempo; a TCP connect for the broker, both Postgres instances,
  oms-mcp-server and grafana-mcp. Each tile also shows a response-time sparkline and the last 30
  checks; a timeline lists every status change while the view is open.
- **Panels.** Orders by state, order events per minute, outbox pending, stuck and oldest age, heap
  used and active DB connections are read from oms-core's `/actuator/prometheus`, and the price
  service's Alpha Vantage requests left today from its own (SPEC-0079), so they work on
  a host-native run without the observability stack. Time to ACK and time to market p99
  (milliseconds) exist only as histograms in Mimir (`http://localhost:9009/prometheus`), so those
  two need the stack. The raw Prometheus text pane of SPEC-0053 is gone; Grafana Explore covers it.
- **Resilience.** Every check and panel fails on its own: a service that is down, or a query that
  fails, shows its reason while the rest update. An invalid `cockpit.yaml` is reported with the
  path of the bad entry.
- **Scope.** Check history is kept in memory for the session; Grafana (linked from the header)
  holds the long-term series.

## API Explorer

The API Explorer lists the operations of the OpenAPI specs under `apiExplorer.apis`. For the OMS
that is oms-core's command API, whose `Command` discriminator becomes one body variant per command
type (OrderCreateCmd, OrderAcceptCmd, …), and its query API with the search parameters. Requests and
their bodies are checked against the contract before sending. The order and lifecycle requests are
`.http` templates in `tools/api-templates/`. The OMS-specific Orders tab and order follow-up of
SPEC-0007 are gone; the order's events are one query operation away.

Context: [System Context](../architecture/context/system-context.md).
