# Proposal — SPEC-0012: Make KB explorer OKF-aware

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The goal asks for the KB explorer to support OKF. After SPEC-0009/0010/0011 the knowledge base is a
typed OKF bundle (capabilities, requirements, domain, interfaces, architecture, specifications) and
`GET /api/kb/documents` returns each document's OKF metadata (`okf`, `concept`). The explorer
(`oms-kb-explorer`, React/Vite) ignores it:

- **Navigation by folder only.** `TreeView` groups documents by the first path segment, so the 45
  functional requirement documents are one flat list and there is no way to browse "all capabilities" or
  "planned capabilities". `index.md`/`log.md` appear as ordinary documents.
- **No metadata.** `DocumentViewer` shows only the body. Type, status, trust tier (every new
  document is an unverified machine draft), staleness, tags, maturity/implementation and the cited
  sources are invisible, so a reader cannot tell a planned capability or a draft from reviewed,
  built behaviour — the problem SPEC-0010 set out to fix.
- **Stale status logic.** The only badge is a check mark for `status === 'Complete'`; after
  SPEC-0011 OKF documents report `draft`/`stable`, so no document gets it.
- **Links are broken in the app.** Markdown links such as `../capabilities/order-capture.md` are
  rendered as plain anchors and navigate the browser away; there is no backlinks view although the
  bundle is a link graph.
- **Search shows paths only**, with no type/status/trust and no type or tag filter, although the
  server supports `filterType`/`filterTag` since SPEC-0011.
- Two server gaps block the rest: `/api/kb/documents` does not include the `sources` list, and
  links/backlinks are only available through the MCP tool, not REST.

## What Changes

- **Sidebar** with two views: *Folders* (the bundle hierarchy, nested, each folder's `index.md`
  opened by clicking the folder name) and *Types* (concepts grouped by OKF type; requirements ordered
  by id; capabilities grouped by maturity). Status and trust badges per entry; a filter for status
  and trust tier.
- **Document header** above the body: title, type, status, trust tier, stale warning, version and
  updated, tags, description, the project keys (maturity, id, priority, implementation, capability
  as a link) and the cited sources (bundle links open in the explorer; `repo:` paths and URLs shown
  as text/links).
- **Links panel** in the right sidebar: outgoing links (broken ones marked) and "cited by", each
  opening the document in the explorer; the table of contents stays.
- **In-document links**: relative and `/`-rooted markdown links to bundle documents open in the
  explorer instead of navigating away; external links open in a new tab; `#anchors` scroll.
- **Search**: results show the document's title, type, status and trust tier; type and tag filters
  are sent to the server.
- **Server (oms-mcp-server)**: `okf.sources` added to `/api/kb/documents`; new
  `GET /api/kb/documents/links?path=` returning outgoing links and backlinks (from `ConceptLinks`).
- Documents without front matter keep working: listed under their folder and an "Untyped" group,
  shown without a header.

No **BREAKING** changes (server changes are additive).

## Scope

### In scope

- The explorer UI changes above, with their logic in pure, unit-tested TypeScript modules.
- The two additive server changes in oms-mcp-server, with tests.
- Explorer README and knowledge base updates (knowledge-services capability, kb-explorer component).

### Out of scope

- Graph visualisation of the link graph (the OKF reference visualizer style); a later ticket.
- Editing documents or recording `verified` reviews from the UI.
- Changes to search ranking, the MCP tools or the bundle content.
- Authentication, deployment of the explorer (still `npm run dev`), docker-compose.
- A component-rendering test framework (see Open Questions).

## Acceptance Criteria

- **AC-1** — Given the document list from `/api/kb/documents`, when the sidebar model is built in
  *Folders* view, then documents are nested by their full folder path, each folder's `index.md` is
  the folder's own entry rather than a child document, `log.md` is listed once at the root, and
  every concept appears exactly once; in *Types* view, concepts are grouped by `okf.type`
  (documents without a type under "Untyped", reserved files excluded), requirements sorted by `id`
  and capabilities grouped by `maturity`.
- **AC-2** — Given a status or trust filter, when the sidebar model is built, then only concepts
  matching every selected filter remain, and folders or groups left empty are dropped.
- **AC-3** — Given a document's metadata, when the document header model is built, then it contains
  the title, type, status, trust tier, a stale flag exactly when `okf.stale` is true, version,
  updated, tags, description, each present project key (the capability as an in-app link) and every
  source, classified as bundle link, `repo:` path or URL; given a document without front matter,
  no header is produced.
- **AC-4** — Given a link in a document body, when it is resolved against the document path, then a
  relative or `/`-rooted link to a bundle file yields that document path (with its `#anchor` kept),
  a folder link yields the folder's `index.md`, a pure `#anchor` stays in the document, and an
  external URL or a path leaving the bundle is not treated as an in-app link.
- **AC-5** — Given `GET /api/kb/documents/links?path=` on the MCP server, when a concept is
  requested, then the response lists its outgoing links with `exists` flags and its backlinks
  (reserved files excluded), and an unknown path returns empty lists; and `/api/kb/documents`
  includes `okf.sources` as written in the front matter.
- **AC-6** — Given search hits and the document list, when results are decorated, then each hit
  carries the document's title, type, status and trust tier (or none for unknown paths), and a
  search with a type or tag filter sends `filterType`/`filterTag` to the server.
- **AC-7** — Given legacy and OKF status values, when a status badge is computed, then `stable`,
  `Active`, `Complete` and `Implementation Complete` show as stable, `draft` and `Draft…` as draft,
  `deprecated` as deprecated, and anything else as unknown.
- **AC-8** — Given the module, when `npm test` and `npm run build` run in `oms-kb-explorer` and
  `./gradlew check` in `oms-mcp-server`, then all pass, and the components use the tested models
  (no duplicated logic in components).

## Impact

| Area | Impact |
|---|---|
| Modules | oms-kb-explorer (UI), oms-mcp-server (two additive REST changes), oms-knowledge-base (docs) |
| Contracts (OpenAPI / Avro) | none (`/api/kb` is not in oms-contracts) |
| Data (tables, migrations) | none |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | KB explorer users; `/api/kb/documents` gains `okf.sources`, new `/api/kb/documents/links` (additive) |
| Knowledge base | `capabilities/knowledge-services.md` (explorer gap closed, new FR), `architecture/kb-explorer.md`, `log.md`; explorer README |

## Open Questions

- [resolved] Rendering tests: add Vitest + Testing Library + jsdom, or test logic only? →
  assumption: keep the no-new-dependency approach from SPEC-0009 — all behaviour lives in pure
  `.ts` modules tested with `node --test`, components only render the models; the rendered UI is
  checked once in the browser at verify (screenshots as evidence). Reviewer: say so if you want a
  component test framework added.
- [resolved] Sources: show `repo:` paths as links to a code host? → assumption: shown as text
  (there is no canonical remote/branch configured); bundle sources are in-app links, URLs external.
- [resolved] Default sidebar view → assumption: *Types*, since the bundle is now organised around
  capabilities and requirements; *Folders* one click away.
- [deferred] Link-graph visualisation (force-directed, like the OKF reference visualizer) → separate
  ticket; the links panel covers navigation.
