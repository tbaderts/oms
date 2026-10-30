# Verification — SPEC-0012: Make KB explorer OKF-aware

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

Runs after the last code change (T-12, 2026-10-28 07:19 +01:00): `cd oms-kb-explorer && npm test`
→ 31 tests, 31 pass, 0 fail (`src/okf/*.test.ts`, `src/services/api.test.ts`,
`src/utils/frontMatter.test.ts`); `npm run build` exit 0; `npx eslint src` clean.
oms-mcp-server: `OkfMetadataTest` 11/11 and `KbExplorerControllerTest` 5/5 (forced re-run
2026-10-28T06:12Z; no server change since), `spec verify` `./gradlew check` exit 0.
Browser evidence: `screenshots/01…10` from the running explorer against a locally started MCP server
(real knowledge base, 135 concepts), driven over the Chrome DevTools protocol.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Folders view (nesting, index.md as folder entry, log.md at root, each concept once); Types view (order, Untyped, reserved excluded, requirements by id, capabilities by maturity) | `sidebar.test.ts` "folder tree nests…" (also ordering by title), "type groups…", "entry labels…"; screenshots `01-types-view.png` (19 capabilities by maturity, 56 requirements FR-001…), `04-folders-view.png`, `09-folder-index.png` (folder name opens `capabilities/index.md`) | PASS |
| AC-2 | Status/trust filters, empty groups dropped | `sidebar.test.ts` "filters by status and trust and drops empty groups" (types and folders, AND of both, legacy Active = stable); `05-filter-stable.png` (only Specification group left) | PASS |
| AC-3 | Header model: all fields, stale flag, keys, capability link, classified sources; none without front matter | `header.test.ts` (3), `links.test.ts` "only http, https and mailto sources are links", "sources are classified…"; `02-requirement-header-links.png`, `08-header-sources-expanded.png` (repo sources), `03-capability.png`. No bundle document is stale, so the stale pill is proven by the unit test only | PASS |
| AC-4 | Link resolution: relative, root, folder, anchor, external, outside bundle; plus markdown-only in-app links | `links.test.ts` (9 tests incl. "only markdown documents and folders are in-app links", deep links); `07-after-in-app-link.png` (click on "Command API" → `?doc=…interfaces/command-api.md`, history +1) and `10-after-back.png` (Back → `order-capture.md`, view follows) | PASS |
| AC-5 | `/api/kb/documents/links` and `okf.sources` | `KbExplorerControllerTest#linksEndpointListsOutgoingAndBacklinks` (exists flags, reserved not a backlink, unknown path empty), `#documentsCarryOkfSources`, `OkfMetadataTest#collectsSources`; links panel in `02`/`03` screenshots with real data | PASS |
| AC-6 | Hits decorated with title/type/status/trust; type/tag filters sent | `search.test.ts` (2), `api.test.ts` "search functions send filterType and filterTag" (mocked fetch, all three modes), "getLinks…"; `06-search-requirements.png` (type filter Requirement, badges on every hit) | PASS |
| AC-7 | Status badge mapping | `status.test.ts` (2: OKF + legacy statuses, unknowns; trust tiers) | PASS |
| AC-8 | Tests, build, server check green; components render models only | runs above; `spec verify` (`evidence/last-run.json`); components use `folderTree`/`typeGroups`/`entryLabel`/`showTrustInTree`/`typesPresent`/`documentHeader`/`decorateHits`/`resolveDocLink`, remaining component code is markup, React state and event wiring (reviewed after T-12) | PASS |

## Goal Assessment

Scope note: "make oms-kb-explorer browse the OKF bundle by type and hierarchy, show status,
staleness, trust tier and sources, and navigate links and backlinks." All delivered and visible in
the running UI: *Types* and *Folders* views with filters, a metadata header with sources, a links /
cited-by panel, in-app link navigation with working Back/Forward and deep links, OKF-aware search.
Across SPEC-0009 – 0012 the whole request is now covered: the knowledge base is an OKF bundle with
structured capabilities, requirements, domain, interfaces and architecture; the MCP server and the
KB explorer both read it.

Not delivered, by design or pre-existing (follow-ups below): link-graph visualisation (out of
scope), GFM tables render as raw pipes (the explorer has no `remark-gfm`; adding it is a new
dependency), keyword relevance shows 0 % and section-level hits repeat a document (pre-existing).

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | no OpenAPI/Avro change |
| P-02 | Specification before code, generated models only | N/A | no contract-backed models |
| P-03 | Never edit generated code | PASS | none touched |
| P-04 | Contracts evolve compatibly | PASS | `/api/kb` changes additive (`okf.sources`, `/documents/links`) |
| P-05 | Every state change is recorded in the event log | N/A | no order state |
| P-06 | Kafka only through the transactional outbox | N/A | no Kafka |
| P-07 | Schema changes through new Liquibase changesets | N/A | no database |
| P-08 | Concurrency and idempotency are explicit | N/A | read-only UI and endpoint |
| P-09 | Commands and queries stay separate | N/A | read-only |
| P-10 | State transitions go through the state machine and task pipeline | N/A | none |
| P-11 | Layering and conventions | PASS | logic in `src/okf` models, components render; endpoint in the existing controller, constructor injection |
| P-12 | Jackson 3 only | PASS | no Jackson 2 imports |
| P-13 | Errors and validation follow the framework specs | PASS | broken links rendered struck through; unknown paths give empty link lists; non-document links shown as text |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | every AC has unit/web tests; component wiring (popstate, renderers) covered by the browser run as agreed in the proposal (no component test framework) |
| P-15 | Observability | PASS | endpoint logs like its siblings; theme `console.log` noise removed |
| P-16 | Security | PASS | external links `rel="noopener noreferrer"`; only http/https/mailto sources are links; no raw HTML rendering |
| P-17 | Simplicity and dependencies | PASS | no new dependency; the R10 warning concerns SPEC-0011's `build.gradle` change on the same branch |
| P-18 | Modules build standalone | PASS | explorer `npm run build`; server `./gradlew check` |
| P-19 | Documentation follows behaviour | PASS | explorer README, FR-046, knowledge-services capability, kb-explorer component, log |

## Independent Review

The spec-reviewer agent reviewed twice.

**First review: MET with one major finding.** Implement was reopened (T-12):

| # | Finding (severity) | Resolution |
|---|---|---|
| 1 | Navigation pushes history but nothing handles Back/Forward (major) | Fixed: `popstate` listener; browser run shows Back returning to the previous document (`10-after-back.png`) |
| 2 | Folders view sorted by file name but shows titles (minor) | Fixed: ordered by displayed title; tested |
| 3 | Screenshots did not show narrowing filter, expanded sources, folder index, untyped/log.md (minor) | Added `05-filter-stable`, `08-header-sources-expanded`, `09-folder-index`, `10-after-back`; stale pill only provable by unit test (no stale document in the bundle) |
| 4 | GFM tables raw, relevance 0 %, duplicate section hits (minor, pre-existing) | Follow-ups (remark-gfm is a new dependency) |
| 5 | Any URL scheme in sources clickable (minor) | Fixed: only http/https/mailto; tested |
| 6 | Link resolution edge cases differ from the server (minor) | Fixed: in-app only for markdown files and folders; tested |
| 7 | Small logic in components (minor) | Moved into models (`entryLabel`, `showTrustInTree`, `typesPresent`, search title fallback); header renders its model's title and trust |
| 8 | Explorer `npm test` not in the gate evidence (minor) | Recorded explicitly in this document; gate config change suggested |
| 9 | Multiple base directories merge into one tree (minor, speculative) | Follow-up |

**Re-review: MET.** All ACs proven by the reviewer's own run (31/31, build, lint). New minor points:

| # | Point | Resolution |
|---|---|---|
| 1 | A dotted folder link without a trailing slash (`../v1.2`) is plain text in the explorer, while the server resolves it when the folder exists | Accepted residual: no such link in the bundle; follow-up |
| 2 | Unknown search hits get a file-name title, so AC-6's "none for unknown paths" holds for type, status and trust only | Deliberate refinement (a result row always needs a label); the test pins it |

## Automated Evidence

- `evidence/last-run.json`: 2026-10-28T06:18:56Z (after T-12), result `pass`; policy check PASS
  (one R10 warning from SPEC-0011's build change); `oms-kb-explorer` `npm run build` exit 0
  (`evidence/oms-kb-explorer-1.log`), `oms-mcp-server` `./gradlew check` exit 0
  (`evidence/oms-mcp-server-1.log`).
- Explorer unit tests are not in the gate's verify list for this module (the gate runs the build);
  recorded explicitly above: 31/31. Add `npm test` to `specs/config.json` → `oms-kb-explorer.verify`
  to gate them (human edit).
- Browser run: 10 screenshots in `screenshots/`; console log of the scripted run: Folders → folder
  index (`?doc=…capabilities/index.md`), stable filter (Specification group only), search with type
  Requirement (requirement titles only), in-app link (history +1, `command-api.md`), Back
  (`order-capture.md`).

## Follow-ups

- Render GFM tables in the explorer (`remark-gfm`, a new dependency — decision for the team).
- Keyword search relevance shows 0 % (`score / 100` normalisation) and section hits repeat a
  document; show document-level results or the section anchor.
- Multiple base directories in `domain.docs.paths` would merge into one folder tree.
- Link-graph visualisation (OKF reference visualizer style).
- Add `npm test` to the explorer's gate verify list.
- Dotted folder links without a trailing slash: resolve them like the server (needs the document
  list to know which folders exist).

## Verdict

Verdict: GOAL MET
