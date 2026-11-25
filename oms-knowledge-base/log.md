# Knowledge Base Log

## 2026-11-25

The developer cockpit is a generic tool with its own repository,
[github.com/tbaderts/developer-cockpit](https://github.com/tbaderts/developer-cockpit) (SPEC-0076).
Everything OMS-specific it used to carry — knowledge-base and contract paths, code generation, the
API Explorer's oms-core convention, the Monitoring tiles — now comes from `cockpit.yaml` at the
repository root. Its Monitoring view checks all compose services and shows the order-flow metrics
as panels; the API Explorer works from the OpenAPI operations, with the order templates in
`tools/api-templates/`. See [Developer Cockpit](tools/developer-cockpit.md).

## 2026-11-24

oms-ui has an **Order Entry** tab (SPEC-0072): a new order's instrument, economics and account,
checked like oms-core checks them and sent as an `OrderCreateCmd` with one `clOrdId` per ticket.
Instrument lookup and quotes come from oms-ui's new [Market Data API](domain/interfaces/market-data-api.md):
Alpha Vantage when `ALPHAVANTAGE_API_KEY` is set (no bid/ask on its free tier), else the exchange
simulator's instruments. See [Order Entry](ui/order-entry.md).

The streaming service holds no orders or executions any more (SPEC-0071). Each subscription's
snapshot is read from the database through the query API (executions from the execution search),
so a deleted fill is no longer shown; live fills come from `oms_executions`, without their order.
The caches, their startup load from the projection (SPEC-0067), the cached fallback and the unused
routes `blotter.stream`, `orders.snapshot` and `executions.snapshot` are gone. See
[Streaming Service](architecture/context/streaming-service.md).

Stored fills have a contracted search (SPEC-0070): `GET /api/query/executions/search` filters,
pages and sorts the `executions` table like `/search` does orders, newest first, with a matching
count. oms-ui's REST execution blotter reads it, so its filters now apply. The hidden
`/api/executions` is gone (TD-3 resolved for executions). See
[Query API](domain/interfaces/query-api.md#execution-search).

Executions carry the FIX Instrument block (SPEC-0069): `symbol`, `securityId` and
`securityIdSource`, on the fill command, the `executions` table and the `Execution` record on
`oms_executions`. A fill without an instrument, or with one that differs from its order's, is
refused. The exchange simulator sends the order's instrument; stored fills were backfilled from
their order. The execution blotter offers `symbol` (a default column) and `securityId`. See
[Execution](domain/model/execution.md) and
[Execution Processing](capabilities/execution-processing.md).

The execution blotter offers only the execution report fields the OMS records (SPEC-0068):
`execId`, `orderId`, `execType`, `lastQty`, `lastPx`, `lastMkt`, `leavesQty`, `cumQty`, `avgPx`,
`transactTime` and `status`. `lastMkt` is now a default column. Never-filled fields (the day-order
statistics, `secondaryExecID`, `creationDate`, `execRefId`, `lastCapacity`) and internal ones
(`id`, `orderVersion`, `rootOrderId`, `bustedAtVersion`) are no longer offered; the APIs keep them.
See [Admin UI](ui/admin-ui.md).

## 2026-11-17

Streaming executions survive a restart (SPEC-0067). The
[streaming service](architecture/context/streaming-service.md#snapshots) loads the newest stored
fills from the query API at startup, so the executions snapshot is no longer empty after a restart.
`GET /api/query/executions` gained `order=newest`
([query API](domain/interfaces/query-api.md#fills-with-their-order)).

## 2026-11-16

The Developer Cockpit's Knowledge Base view shows one of **Document**, **Chat** or **Health** at a
time in its centre, instead of the chat in a narrow side panel. See
[Developer Cockpit](tools/developer-cockpit.md#kb-chat).

KB chat source and run details (SPEC-0065). Each chat answer now shows more about its sources and
its run:
- **Sources:** each source shows its best match (rank, score, section) next to its link. A toggle
  lists every match, with the query, the ranks and the excerpt.
- **Run details:** a collapsible section with what the run did (model, tokens, tool calls,
  duration, outcome, steps).

The [knowledge server](tools/knowledge-server.md)'s search hits now state their fused score and
their keyword and semantic ranks. Its knowledge base tools return their Markdown as written; before,
it was a JSON-encoded string with escaped line breaks.

## 2026-11-15

Knowledge base health (SPEC-0064). `okf-check` now warns about pages to review (`OMS-AGE` with
`review_after_days: 180`, `OMS-STALE`, `OMS-DEPRECATED`, `OMS-DRIFT` when a `repo:` source changed
after the page), prints a JSON report with statistics (`--json`), and adds missing index entries
(`--fix-indexes`). The Developer Cockpit shows each document's front matter and has a
**Health** panel. See [Schema and Constraints](semantic-layer/schema-and-constraints.md#freshness-warnings-spec-0064)
and [Developer Cockpit](tools/developer-cockpit.md#health).

[Design System](ui/design-system.md#modules) (SPEC-0060): the grid font sizes and the logo now
take their values from tokens, and the token rule covers the TS/TSX sources too. The grids register
only the AG Grid modules they use, checked by a real-grid test, which makes the main bundle 69 kB
smaller gzipped. Boolean columns filter on Yes/No with the Community text filter.

The OMS UI blotters became more comfortable to work in (SPEC-0059): right-aligned numbers, prices
with 2 to 8 decimals, FIX ExecType names, readable start-truncated ids, newest-first executions,
keyboard shortcuts (Escape, Enter, F, C, R, P), the Live / History mode names and one shared
toolbar. See [Admin UI](ui/admin-ui.md#formatting-toolbar-and-keyboard-spec-0059).

## 2026-11-14

Reorganised and reviewed the whole knowledge base (SPEC-0061). See the
[review register](semantic-layer/kb-review-2026-11.md) for what happened to each of the 161 earlier
documents, and the [Knowledge Base Strategy](semantic-layer/knowledge-base-strategy.md) for the new
layout.

- **New sections.** [Capabilities](capabilities/index.md) (now with use cases, actors and the
  requirements), [Domain](domain/index.md) (model, concepts, interfaces),
  [Core Framework](framework/index.md), [Architecture](architecture/index.md) (context, concepts,
  decisions as ADR-001 to ADR-005, patterns, technical debt, assessments, illustrations),
  [Infrastructure](infrastructure/index.md), [User Interface](ui/index.md), [Tools](tools/index.md),
  [Software Delivery](delivery/index.md), [Semantic Layer](semantic-layer/index.md) and the
  [Archive](archive/index.md). The old folders `oms-concepts`, `oms-framework`, `oms-methodolgy`,
  `illustrations` and `interfaces` are gone; every moved document keeps its old id in `aliases`.
- **Reviewed against the code.** Wrong facts were corrected (stack versions, topic names, tables,
  MCP tools, the Qdrant claim); specifications describing more than is built got an implementation
  status banner (order lifecycle, replace, execution reporting, grouping, validation engine,
  exception handling, …); superseded documents were archived (the February review, the
  ReadySet-era read store and state store designs, the old OpenAPI guide, the February strategy,
  the old architecture specification, a generic role profile).
- **Written.** Implementation patterns (Kafka messaging, transaction handling, logging and tracing,
  service template, contract-first code generation), the technical debt register, the state store and
  query engine, infrastructure (local Docker stack, observability, Cozystack as planned), the design
  system, the market adapter (planned), delivery (spec-driven development, CI/CD, release), the
  knowledge graph and the schema and constraints.
- **Capability catalogue.** 8 actors and 22 use cases (UC-001 to UC-022); every requirement is
  exercised by a use case. New requirements FR-047 to FR-056 and NFR-011 for behaviour built since
  SPEC-0010 (command log, expected version, event metadata, reconciliation, order history, fills
  with order, expiry and end of day, several instances) and for this ticket. NFR-005 is now
  implemented, NFR-010 partial.
- **Tools.** The checker enforces the new layout, use cases, actors, ADR ids, review date, retired
  terms, archive and aliases; `check-kb-refs` finds dead references anywhere in the repository. The
  knowledge server resolves old paths and hides deprecated documents from search by default; the
  developer cockpit's Requirements view opens on the capability catalogue.

## 2026-10-31

`sessionId` is required by the command contract (SPEC-0034). `oms-cmd-api.yml` 2.0.0 marks
`Order.sessionId` required and non-empty, matching what oms-core already enforced. Over HTTP, a
body that breaks the contract is now answered with the `validation-failed` problem, which lists
each failing field. [FR-002](capabilities/functional-requirements/FR-002-validate-new-orders.md),
[error handling](framework/exception-handling.md) and
[OpenAPI contracts](architecture/patterns/contract-first-codegen.md) are updated.

## 2026-10-29

Storyboards (SPEC-0014): `storyboards/` holds process journeys that the Developer Cockpit reads,
presents, edits and exports. It is outside the OKF bundle (see the exception in
[okf-conventions.md](okf-conventions.md)) and has its own check, `npm run check:storyboards`.
The first storyboard, *Place and fill a client order*, follows an order from the trader through the
OMS and the exchange simulator to the blotter, with an evidence card pinned to the code it
describes. The [Developer Cockpit](tools/developer-cockpit.md) page describes the new view.

## 2026-10-28

The KB explorer is OKF-aware (SPEC-0012): a *Types* view (capabilities by maturity, requirements by
id) and a *Folders* view with status and trust filters, a metadata header on every document
(type, status, trust tier, staleness, keys, sources), a links / "cited by" panel, and links between
documents that open in the explorer. The MCP server adds `okf.sources` and
`/api/kb/documents/links`. New requirement
[FR-046](capabilities/functional-requirements/FR-046-okf-aware-kb-explorer.md).

## 2026-10-27

The MCP server now reads this bundle as OKF (SPEC-0011): its tools show each concept's type,
status, trust tier and staleness, search can filter by type, tag and status, whole-document reads
list links and "cited by", and `index.md`/`log.md` are no longer treated as concepts. New
requirement [FR-045](capabilities/functional-requirements/FR-045-okf-aware-knowledge-tools.md); the
[Knowledge Services](capabilities/knowledge-services.md) gap on OKF metadata is closed.

Structured the knowledge base around what the OMS does (SPEC-0010): 19
[capabilities](capabilities/index.md) (12 implemented, 1 partial, 6 planned), 44
[functional](capabilities/functional-requirements/index.md) and 10
[non-functional requirements](capabilities/non-functional-requirements/index.md), [domain](domain/index.md)
concepts and a glossary, [interfaces](domain/interfaces/index.md) covering every API path, controller,
Kafka topic and Avro schema, and the [architecture](architecture/index.md) (system context,
components, decisions). Every new document cites the code, contracts and tests it describes
(`repo:` sources), is marked `draft` and machine-generated, and awaits human review. Findings
recorded as known gaps include: replace, execution bust/whack and quotes are specified or modelled
but not built; `order-replace.md` reads as current behaviour; a referenced SLA Measurement page
does not exist. The root index is reorganised by section; existing documents are unchanged.

Converted the knowledge base into an Open Knowledge Format (OKF v0.2) bundle (SPEC-0009). Every
document now has YAML front matter (`type`, `title`, `description`, `tags`, `status`, and
`version`/`updated` where the old header had them). Added a root `index.md` declaring
`okf_version: "0.2"`, an `index.md` per folder, this log, and
[Knowledge Base Conventions](okf-conventions.md) with the type vocabulary. Fixed broken links
between documents. No document was moved, renamed or marked as verified. The checker
`tools/okf-check` validates the bundle.
