# Design — SPEC-0012: Make KB explorer OKF-aware

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

**oms-kb-explorer** (React 19, Vite, TanStack Query, Tailwind, react-markdown; `npm test` =
`node --test "src/**/*.test.ts"` with native type stripping, tests excluded from `tsconfig.app.json`;
`allowImportingTsExtensions` is on):

- `App.tsx` holds `selectedDoc`, search mode/query/results; layout: header, `SearchBar`, left
  `TreeView`, centre `DocumentViewer` or `SearchResults`, right `TableOfContents`.
- `TreeView` groups `kbApi.listDocuments()` by `path.split('/')[1]` and shows a check mark for
  `status === 'Complete'`.
- `DocumentViewer` renders `stripFrontMatter(document.content)` with `ReactMarkdown`; custom
  renderers for headings (ids) and code (Mermaid, Prism). No `a` renderer, so relative links leave
  the app.
- `SearchResults` shows path, snippet, scores, match type. `services/api.ts`: `listDocuments`,
  `readDocument`, `searchKeyword(query, topK, filterStatus?, filterCategory?)`, `searchSemantic`,
  `searchHybrid`, `listSections`; a `mockKbApi` for offline use.
- `types/index.ts`: `DocMeta` without `concept`/`okf`.
- Only `src/utils/frontMatter.ts` is unit-tested (the SPEC-0009 pattern this ticket follows).

**oms-mcp-server** (after SPEC-0011): `GET /api/kb/documents` returns `DocMeta` with `concept` and
`okf` (`OkfMetadata`: type, title, description, tags, status, legacyStatus, version, updated,
staleAfter, stale, trustTier, maturity, id, priority, implementation, capability) — no sources.
`ConceptLinks` computes outgoing links (`Link(target, exists)`) and backlinks (reserved sources
excluded) but has no REST endpoint. `KbExplorerController(DocumentRepository, MarkdownParser,
KnowledgeIndexService)`, tested by `KbExplorerControllerTest` (WebTestClient). Search endpoints
accept `filterType`/`filterTag`. Document paths are portable: `<base>/<folder>/<file>.md`, e.g.
`oms-knowledge-base/capabilities/order-capture.md`.

## Approach

```mermaid
flowchart LR
  API[services/api.ts] --> D[(DocMeta[] with okf)]
  D --> S[okf/sidebar.ts<br/>folderTree, typeGroups, filters]
  D --> H[okf/header.ts<br/>documentHeader]
  D --> R[okf/search.ts<br/>decorateHits]
  L[okf/links.ts<br/>resolveDocLink] --> V
  ST[okf/status.ts<br/>statusBadge, trustBadge] --> S & H & R
  S --> TV[TreeView] 
  H --> DH[DocumentHeader]
  R --> SR[SearchResults]
  API --> LP[LinksPanel] 
  DH & V[DocumentViewer]
```

### Pure modules (`oms-kb-explorer/src/okf/`, each with a `*.test.ts`)

- **`status.ts`** — `statusBadge(status?: string): 'stable' | 'draft' | 'deprecated' | 'unknown'`
  (case-insensitive; `stable`, `active`, `complete`, `implementation complete` → stable; `draft`
  and anything starting with `draft` → draft; `deprecated` → deprecated) and
  `trustBadge(tier?: string)` → `{ label, tone }` for unverified / machine-confirmed /
  human-reviewed.
- **`sidebar.ts`** —
  - `folderTree(docs, filter): FolderNode` with `FolderNode = { name, path, index?: DocMeta,
    folders: FolderNode[], docs: DocMeta[] }`. Nesting by every folder segment after the base;
    a folder's `index.md` becomes `node.index`, not a child; `log.md` is a root doc; names sorted.
  - `typeGroups(docs, filter): TypeGroup[]` with `TypeGroup = { type, subgroups: { label, docs }[] }`:
    concepts only (`concept !== false`), by `okf.type` ("Untyped" last), type order following the
    vocabulary (Capability, Requirement, Domain Concept, Glossary, Interface, Architecture,
    Component, Decision, Specification, Concept Paper, Diagram, Methodology, Assessment, Strategy,
    Reference, then others alphabetically); Capability subgroups by maturity (implemented, partial,
    planned); Requirement subgroups FR / NFR, sorted by `id`; others one subgroup sorted by title.
  - `Filter = { statuses: string[]; trust: string[] }` (empty = no filter); status compared via
    `statusBadge`; folders/groups left empty are dropped; `matches(doc, filter)` exported.
  - `displayTitle(doc)` = `okf.title` ?? file name.
- **`header.ts`** — `documentHeader(doc: DocMeta | undefined): Header | null`: null without
  `okf.type`; otherwise title, type, status badge, trust badge, `stale`, `staleAfter`, version,
  updated, tags, description, `keys` (maturity, id, priority, implementation; capability as
  `{ label, path }` resolved with `resolveDocLink`), and `sources: Source[]` with
  `Source = { kind: 'doc', path } | { kind: 'repo', path } | { kind: 'url', href } | { kind: 'text', value }`.
- **`links.ts`** — `resolveDocLink(currentPath, href)` →
  `{ kind: 'doc', path, anchor? } | { kind: 'anchor', anchor } | { kind: 'external', href } | null`:
  scheme (`https:`, `mailto:` …) → external; `#x` → anchor; `/x` → `<base>/x`; relative →
  normalised against the current document's folder; a trailing `/` or no extension → `…/index.md`;
  a result outside `<base>/` → null (not an in-app link); percent-decoding as in `ConceptLinks`.
  `repoSource(resource)` helper for `repo:` strings.
- **`search.ts`** — `decorateHits(hits, docs)` adds `{ title, type, status, trustTier }` from the
  document list by path (undefined fields for unknown paths); `searchParams(query, topK, filters)`
  builds the `URLSearchParams` (with `filterType`/`filterTag` when set) used by `api.ts`.

Module imports use explicit `.ts` extensions (Node runner).

### Components (thin; render the models)

- `TreeView`: toggle *Types* (default) / *Folders*; status and trust filter chips; renders
  `typeGroups`/`folderTree`; folder name clickable when `node.index`; badges from `status.ts`.
- New `DocumentHeader` (above the body in `DocumentViewer`): renders `documentHeader(doc)`; doc
  sources and capability as buttons calling `onSelectDoc`, URLs as `target="_blank"` links, repo
  paths as `<code>`.
- `DocumentViewer`: receives `docs` (from the shared `['documents']` query) and `onSelectDoc`;
  ReactMarkdown `a` renderer uses `resolveDocLink` (doc → `onSelectDoc(path)` and scroll to the
  anchor after load; anchor → scroll; external → new tab; null → plain text link).
- New `LinksPanel` in the right sidebar under `TableOfContents`: `kbApi.getLinks(path)`; outgoing
  (broken marked, not clickable) and "Cited by", titles via `displayTitle`.
- `SearchResults`: renders `decorateHits(results, docs)` (title, type, status, trust badges).
- `SearchBar`: optional type select (from the vocabulary present in the docs) and tag input; App
  passes them to the `kbApi` search calls.
- `types/index.ts`: `OkfMetadata`, `DocMeta.concept`, `DocMeta.okf`, `Links`.
- `api.ts`: search functions take an optional `{ type?, tag? }` and use `searchParams`; new
  `getLinks(path)`; `mockKbApi` updated with `okf` examples.

### Server (oms-mcp-server)

- `OkfMetadata` gains `List<String> sources` (each entry's `resource`, or the entry itself when it
  is a string; empty without front matter); JSON `okf.sources`.
- `KbExplorerController` gets `ConceptLinks` injected and
  `GET /api/kb/documents/links?path=` → `LinksResponse(List<Link> outgoing, List<String> backlinks)`;
  unknown paths give empty lists (ConceptLinks behaviour).

## Contract Changes

None in `oms-contracts`. `/api/kb` (not a contract module API): additive field `okf.sources` and a
new endpoint `/api/kb/documents/links`. Consumer: oms-kb-explorer only.

## Data & Persistence

None — no database.

## Events & Messaging

None — no Kafka.

## Domain, State & Orchestration

None — no order state.

## Alternatives & Decisions

- **Logic in pure `.ts` modules, tested with `node --test`; no component test framework** —
  approved assumption. Rejected: Vitest + Testing Library + jsdom (three dev dependencies for what
  the models already prove). Rendered UI checked once in the browser at verify.
- **Links from a server endpoint** rather than parsing every document client-side (backlinks need
  the whole bundle: ~134 fetches).
- **Sources in `/api/kb/documents`** (small list per document) rather than a per-document call.
- **Type order follows `okf-conventions.md`'s vocabulary** (structured types first) — the bundle's
  entry points are capabilities and requirements.
- **Default view *Types*** — approved assumption.
- **No new dependencies** in either module.
- **Changed during implementation:**
  - *Deep links* `?doc=<path>#anchor` (`docFromLocation`/`locationForDoc` in `links.ts`, tested):
    needed to reach document views in the browser check (the Chrome extension was not connected;
    headless Chrome cannot click) and useful for sharing; navigation pushes the URL.
  - *`slugify`* in `links.ts` (tested) for heading ids and the table of contents: the old ids only
    replaced spaces, so `#1-introduction` never matched "1. Introduction".
  - *`VITE_KB_API_URL`* (default `http://localhost:8091/api/kb`) so the explorer can use a locally
    started server while Docker runs another version on 8091.
  - *`mockKbApi`* is unused by the app; it only gets a `getLinks` stub (no OKF sample data).
  - *Trust badge in the sidebar* only for reviewed documents: every current document is unverified,
    so a badge on each row would be noise; the header and search results always show it.
  - *Changed at verify (independent review)*: a `popstate` listener restores the document named by
    the URL on Back/Forward; folder documents are ordered by their displayed title; in-app links
    only for `.md`/`.markdown` files and folders (other files — images, YAML — are not documents),
    so a dotted folder needs a trailing slash; only `http`, `https` and `mailto` sources are
    clickable; `entryLabel`, `showTrustInTree`, `typesPresent` and the search title fallback moved
    from components into the models; the header renders its model's title and trust badge.
  - The browser check was driven over the Chrome DevTools protocol with Node's built-in WebSocket
    (script kept outside the repository), screenshots in `screenshots/`.

## Risks & Mitigations

- **Models drift from components** → components only map model output to JSX; AC-8 review checks no
  logic is duplicated; the browser check at verify exercises them.
- **Path conventions** (`<base>/…` prefix) → `links.ts` derives the base from the current path and
  tests cover root, relative, folder, outside-bundle and decoding cases.
- **Large lists** (45 FRs) → grouped and collapsible; no virtualisation needed at this size.
- **Server down / mock mode** → `mockKbApi` carries `okf` so the UI renders offline.

## Test Strategy

| AC | Level (unit / web-mvc / integration / e2e) | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | unit | `src/okf/sidebar.test.ts` → "folder tree nests, index.md is the folder entry, log.md at root, each concept once"; "type groups: order, untyped, reserved excluded, requirements by id, capabilities by maturity" | model shape for a fixture list mirroring the bundle |
| AC-2 | unit | `sidebar.test.ts` → "filters by status and trust and drops empty groups" | filter semantics incl. legacy statuses |
| AC-3 | unit | `src/okf/header.test.ts` → "builds header with keys and classified sources", "no header without type", "stale only when okf.stale" | all fields; source kinds doc/repo/url/text; capability link resolved |
| AC-4 | unit | `src/okf/links.test.ts` → relative, root, folder, anchor-only, doc+anchor, external schemes, outside bundle, percent-encoded | `resolveDocLink` results |
| AC-5 | web (server) | `kbexplorer/KbExplorerControllerTest#linksEndpointListsOutgoingAndBacklinks`, `#documentsCarryOkfSources`; `docs/OkfMetadataTest#collectsSources` | JSON of the new endpoint and field |
| AC-6 | unit | `src/okf/search.test.ts` → "decorates hits from the document list", "search params carry type and tag filters"; `src/services/api.test.ts` → "search functions send filterType and filterTag" (mocked `fetch`) | decoration; URL parameters actually sent |
| AC-7 | unit | `src/okf/status.test.ts` → status and trust mappings | table of inputs → badges |
| AC-8 | build | `cd oms-kb-explorer && npm test && npm run build`; `cd oms-mcp-server && ./gradlew check`; review of components (no logic beyond rendering) | all green |

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | no OpenAPI/Avro change |
| P-02 | Specification before code, generated models only | n/a | no contract-backed models |
| P-03 | Never edit generated code | comply | no generated code touched |
| P-04 | Contracts evolve compatibly | comply | `/api/kb` changes are additive |
| P-05 | Every state change is recorded in the event log | n/a | no order state |
| P-06 | Kafka only through the transactional outbox | n/a | no Kafka |
| P-07 | Schema changes through new Liquibase changesets | n/a | no database |
| P-08 | Concurrency and idempotency are explicit | n/a | read-only UI and endpoint; `ConceptLinks` thread safety from SPEC-0011 unchanged |
| P-09 | Commands and queries stay separate | n/a | read-only |
| P-10 | State transitions go through the state machine and task pipeline | n/a | none |
| P-11 | Layering and conventions | comply | UI logic in `src/okf` models, components render; server endpoint in the existing controller with constructor injection |
| P-12 | Jackson 3 only | comply | no Jackson 2 imports |
| P-13 | Errors and validation follow the framework specs | comply | missing links/docs render gracefully; endpoint returns empty lists for unknown paths |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | table above; models written test-first |
| P-15 | Observability | comply | server logs the new endpoint like the others; UI drops the theme `console.log` noise it touches |
| P-16 | Security | comply | external links open with `rel="noopener noreferrer"`; repo paths rendered as text; no HTML injection (react-markdown without raw HTML) |
| P-17 | Simplicity and dependencies | comply | no new dependency |
| P-18 | Modules build standalone | comply | `npm run build` / `./gradlew check` per module |
| P-19 | Documentation follows behaviour | comply | explorer README, knowledge-services capability + new FR, kb-explorer component, log |

## Knowledge Base Updates

- `capabilities/knowledge-services.md`: explorer gap closed; new `FR-046` (OKF-aware explorer,
  implemented, sources and tests).
- `architecture/kb-explorer.md`: views, header, links panel, endpoints used.
- `log.md`: entry. `oms-kb-explorer/README.md`: features and the `/api/kb` endpoints it uses.
