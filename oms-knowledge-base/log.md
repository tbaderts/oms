# Knowledge Base Log

## 2026-10-31

`sessionId` is required by the command contract (SPEC-0034). `oms-cmd-api.yml` 2.0.0 marks
`Order.sessionId` required and non-empty, matching what oms-core already enforced. Over HTTP, a
body that breaks the contract is now answered with the `validation-failed` problem, which lists
each failing field. [FR-002](functional-requirements/FR-002-validate-new-orders.md),
[error handling](oms-framework/error-handling.md) and
[OpenAPI contracts](oms-framework/openapi-contracts.md) are updated.

## 2026-10-29

Storyboards (SPEC-0014): `storyboards/` holds process journeys that the Developer Cockpit reads,
presents, edits and exports. It is outside the OKF bundle (see the exception in
[okf-conventions.md](okf-conventions.md)) and has its own check, `npm run check:storyboards`.
The first storyboard, *Place and fill a client order*, follows an order from the trader through the
OMS and the exchange simulator to the blotter, with an evidence card pinned to the code it
describes. The [Developer Cockpit](architecture/developer-cockpit.md) page describes the new view.

## 2026-10-28

The KB explorer is OKF-aware (SPEC-0012): a *Types* view (capabilities by maturity, requirements by
id) and a *Folders* view with status and trust filters, a metadata header on every document
(type, status, trust tier, staleness, keys, sources), a links / "cited by" panel, and links between
documents that open in the explorer. The MCP server adds `okf.sources` and
`/api/kb/documents/links`. New requirement
[FR-046](functional-requirements/FR-046-okf-aware-kb-explorer.md).

## 2026-10-27

The MCP server now reads this bundle as OKF (SPEC-0011): its tools show each concept's type,
status, trust tier and staleness, search can filter by type, tag and status, whole-document reads
list links and "cited by", and `index.md`/`log.md` are no longer treated as concepts. New
requirement [FR-045](functional-requirements/FR-045-okf-aware-knowledge-tools.md); the
[Knowledge Services](capabilities/knowledge-services.md) gap on OKF metadata is closed.

Structured the knowledge base around what the OMS does (SPEC-0010): 19
[capabilities](capabilities/index.md) (12 implemented, 1 partial, 6 planned), 44
[functional](functional-requirements/index.md) and 10
[non-functional requirements](non-functional-requirements/index.md), [domain](domain/index.md)
concepts and a glossary, [interfaces](interfaces/index.md) covering every API path, controller,
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
