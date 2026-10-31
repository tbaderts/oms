# Proposal — SPEC-0014: Add file-backed storyboards to developer cockpit

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

Nothing in the repository today describes how an OMS process runs from end to end, in a form that
someone who does not read code can follow. The knowledge base has concept pages, functional
requirements (`FR-001` …), domain pages and contracts, but each describes one piece. Operations
leads, analysts, new joiners and workshop participants have to piece the journey together from
them. Sequence diagrams written by hand drift away from the code, and nobody can see when that
happens.

The requester supplied a storyboard specification that is already implemented and tested on
another platform ([source-spec.md](./source-spec.md)). The cockpit also has an earlier draft of the
same feature, [developer-cockpit/spec/11-storyboards.md](../../../developer-cockpit/spec/11-storyboards.md)
(2026-10-21), which was never implemented. If nothing is done, journey knowledge stays in people's
heads and in slide decks that go stale. There is also no way to tell whether a documented journey
still matches the committed code.

This ticket delivers the whole of `source-spec.md`, AI assists included, adapted to the cockpit's
Electron architecture and to this repository's layout. The table under Scope records how
`source-spec.md` differs from `11-storyboards.md`, so that neither loses anything.

## What Changes

- **New Storyboards view** in the cockpit's *Knowledge* group. It shows a catalogue grouped by
  domain on the left and the selected journey on the right. The journey has three overview modes,
  *Strip*, *Lanes* and *Sequence*, and a step detail pane under a pinned overview.
- **New content tree** `oms-knowledge-base/storyboards/` (the default root). It holds the
  storyboard folders (`story.md`, `steps/*.md`, `assets/*`, optional `story.card.yaml`), plus
  `_templates/` and the `_library/oms-storyboard.excalidrawlib` stencil set. The tree contains at
  least one OMS storyboard that passes the strict content check.
- **New main-process `StoryboardService`**: scan, detail with advisory validation, writes guarded
  by revision tokens, evidence and drift, a link index, Mermaid and HTML exports. It is exposed
  through `window.cockpit.storyboards.*` IPC, not HTTP; `source-spec.md` §7.6 allows any
  equivalent service boundary.
- **New asset protocol**: illustrations are served by storyboard id and flat filename only. SVG
  responses carry `Content-Security-Policy: default-src 'none'`.
- **Authoring in the cockpit**: a new-story wizard, a step editor (form, Markdown source with live
  preview, link and data pickers, alternate-path editor), reorder, insert and delete, and a
  conflict dialog with Reload and Overwrite.
- **Illustration editor**: Excalidraw is lazy-loaded and self-hosted (no CDN), and it reads and
  writes `*.excalidraw.svg` with the scene embedded.
- **Presentation mode** as an in-app overlay. **Exports**: Mermaid `sequenceDiagram`, standalone
  script-free HTML, and PDF of that HTML through Electron `printToPDF`.
- **Evidence and provenance** from `story.card.yaml`: trust tier, per-module drift computed during
  the scan, and knowledge-base backlinks.
- **`storyboards:changed`** events over the existing cockpit WebSocket. The renderer rescans when
  it receives one.
- **`npm run check:storyboards [-- --strict]`** in `developer-cockpit`, a CI content gate.
- **AI assists** (draft prose, review alternate paths, suggest links). They return proposals only,
  never write files, and are enabled only when the configured provider's API key is present.
- **New storyboard configuration** in `CockpitConfig`: `enabled`, `roots`, `maxSourceBytes`,
  `maxAssetBytes` and `writable`. Environment overrides take precedence.
- No **BREAKING** changes. Nothing outside `developer-cockpit` and `oms-knowledge-base` changes
  behaviour.

## Scope

### In scope

Everything in [source-spec.md](./source-spec.md) §§1–15, with these adaptations to this
repository:

| Topic | `source-spec.md` says | This ticket does |
|---|---|---|
| Service boundary | HTTP routes (§7.6) | IPC channels on `window.cockpit.storyboards.*`, with the same operations and inputs. Assets use a custom protocol (`storyboard-asset://<id>/<name>`), never `file://` |
| Change notification | server event or WebSocket | `storyboards:changed` on the existing WebSocket, from `WatcherService` |
| Default root | `*/*/docs/storyboards` | `oms-knowledge-base/storyboards` (still a configurable list of globs) |
| Configuration | env > user/app config > defaults | env (`COCKPIT_STORYBOARDS_*`) > `~/.developer-cockpit/config.json` > `DEFAULT_CONFIG` |
| Evidence `repos` | separate repositories with their own commits | `module` names a directory in this monorepo (for example `oms-core`). `commit` is a commit of this repository. Drift means the pinned source lines changed between that commit and `HEAD`, judged on committed content only |
| Requirement links | `FR-OMS-044` | the knowledge base's ids (`FR-001`, `NFR-…`), as read by `RequirementsService` |
| API and event links | `openapi-spec#operationId`, Avro record name | operation ids from `oms-contracts/src/main/openapi/*.yml`, records from `oms-contracts/src/main/avro/*.avsc` |
| State links | "recognised transitions" | transitions from the order state machine as documented in the knowledge base (`oms-knowledge-base/domain/order-state.md`) |
| Requirements view | navigate to "the relevant requirements view" | link chips open the cockpit's Requirements view, Contracts view (API and events) or a knowledge-base search |
| End-to-end tests | §13 | Electron end-to-end tests that drive the packaged renderer |

**Merged from `11-storyboards.md`**, so that nothing that draft specified is lost:

| Item in `11-storyboards.md` | Decision |
|---|---|
| Status `Draft / In Review / Approved / Deprecated` | Replaced by `draft / stable / deprecated` (source-spec). `11-storyboards.md` is updated to match |
| `## Exceptions` section in step prose | Replaced by structured `extensions`. Templates no longer scaffold an Exceptions section |
| `illustrations[].src: ../assets/x.svg` | Replaced by a flat filename (source-spec §5.5) |
| Story-level `links: { useCases, requirements }` in `story.md` | Superseded by the card's `kb_links`. An existing key is kept on save (unknown keys survive) but not interpreted |
| Fuzzy search over prose (Fuse.js) | The catalogue filter is the case-insensitive substring match from source-spec §8.1. Fuzzy search over prose is out of scope |
| Filters for domain, status and tag | Adopted |
| `j` / `k` as aliases for previous and next | Adopted |
| Command palette: "Open storyboard…", "New storyboard", "Present storyboard" | Adopted |
| Link chips that open Contracts (API and events) | Adopted, see the adaptation table |
| WYSIWYG Markdown (MDXEditor) | Not adopted. Monaco source with live preview, as in source-spec §8.5, adds no dependency |
| Draft autosave to `~/.developer-cockpit/drafts/` | Replaced by drafts in renderer session storage (source-spec §8.5) |
| "Not editable" badge on non-Excalidraw images | Adopted |
| PDF export through `printToPDF` | Adopted |
| Phase 0 spike (Excalidraw fonts and CSP in Electron) | Folded into design as a risk with a test |
| Storyboards exposed as MCP resources | Out of scope (see below) |
| Requirements backlinks ("storyboards referencing this") | Adopted through card `kb_links` and step `links.requirements`; shown in the Requirements and Knowledge Base views |

### Out of scope

- The non-goals of `source-spec.md` §3: UI mock-ups, arbitrary branching or loops or nested
  alternate paths, real-time co-editing and comments, live event replay, AI-generated
  illustrations, PPTX, and any database.
- Exposing storyboards through `oms-mcp-server`. That is Java work in another module and becomes a
  follow-up ticket.
- Fuzzy search over step prose and a WYSIWYG Markdown editor.
- Showing storyboards in `oms-kb-explorer` or in `oms-ui`.
- Any change to `oms-core`, `oms-contracts` or other services. Storyboards only *reference* their
  contracts and states.

## Acceptance Criteria

All criteria are run against fixture workspaces in `developer-cockpit/test/`, except AC-17, which
runs against the repository itself.

- **AC-1** — Given a fixture workspace with storyboards in two roots, nested domain folders, a cardless story, a missing root, a duplicated storyboard id, a symlinked folder and an oversized `story.md`, when `scan()` runs, then the catalogue lists every valid storyboard sorted by domain then title, each with the metadata of source-spec §7.2 (cardless stories have trust tier `unevidenced`), and returns one structured scan error each for the duplicate id, the symlink and the oversized file, without dropping the valid entries.
- **AC-2** — Given a storyboard with each defect listed in the source-spec §7.3 table (11 codes), when `detail(id)` runs, then it returns the story with its steps in `story.md` order and exactly one problem per defect, with the code and severity from that table, and the storyboard still opens in the reader.
- **AC-3** — Given a story whose step 2 has two extensions, when the steps are reordered so that this step is third, then the reader labels the extensions `3a` and `3b`, and the reorder rewrote only the `steps` list in `story.md` (every step file is byte-identical).
- **AC-4** — Given a step file with unknown front-matter keys, when it is saved (a) with a changed title, (b) with no changes, and (c) with a stale revision token, then (a) keeps the unknown keys and changes only the title in the front matter, (b) leaves the file's bytes and mtime unchanged, and (c) is rejected with a conflict result that carries the latest revision and leaves the file unchanged. The same holds for `story.md`.
- **AC-5** — Given `writable: false`, when any write operation is called (create story, save story, create, save or delete step, reorder, save illustration), then each one is rejected and no file under the root changes. Given `writable: true`, story creation is rejected for any `root` value that a scan did not return.
- **AC-6** — Given a story whose step has its own assets and an asset shared with another step, when that step is deleted with `deleteAssets: false`, then its file and assets stay on disk and `detail` reports `orphan-step`. When it is deleted with `deleteAssets: true`, then its file and only the assets it references and no other step references are removed.
- **AC-7** — Given asset requests for an unknown id, `../` traversal, an absolute path, a nested path, a symlinked asset, a disallowed extension and an oversized file, when they are served, then each is refused. A valid SVG is served with `image/svg+xml` and `Content-Security-Policy: default-src 'none'`, and PNG, JPEG and WebP get their explicit types.
- **AC-8** — Given SVG uploads containing `<script>`, an `on*` handler attribute, `<foreignObject>`, an external `href` or `xlink:href`, and more than `maxAssetBytes` bytes, when `saveIllustration` is called, then each is rejected and nothing is written. An SVG that uses only fragment references and `data:image/*` URLs is saved, and Excalidraw reopens it with its embedded scene unchanged.
- **AC-9** — Given the source-spec §5.3/§5.4 example story with lanes `customer, app, oms, market`, when Mermaid is exported, then the participants appear in lane order (`actor` for actor lanes), every step appears as a numbered message or as a note (none is dropped), an undeclared lane is added as a fallback participant, and `extensions=1` produces one balanced `opt … end` block per extension while `extensions=0` produces none.
- **AC-10** — Given that story with an illustration that cannot be read, when HTML is exported, then the document contains no `<script>`, no `on*` attributes and no `http(s)://` or `storyboard-asset:` references. It contains every step in order, inline sanitised SVG illustrations, a readable fallback for the unreadable image, the data annotations, the alternate paths and a rendered sequence diagram. The PDF export of the same story produces a non-empty PDF.
- **AC-11** — Given a card that pins `oms-core` at commit C and cites lines of a source file, when that file's cited lines change in a later commit, then the next scan reports drift `drifted` for the storyboard. Uncommitted edits to those lines do not change the drift status. A card with a `verified` entry gets trust tier `human-verified`, and a `kb_links` entry pointing to a missing knowledge-base document is reported as broken evidence.
- **AC-12** — Given the reader with a story open, when the keys `→`, `←`, `Home`, `End`, `j`, `k`, `Esc`, `e` and `p` are pressed outside text inputs, then the selection moves and stops at the boundaries, Esc returns to the overview, `e` opens the step editor and `p` opens presentation mode. Selection and hover stay the same when switching between Strip and Lanes. A step with a missing illustration shows a placeholder panel. Validation findings appear above the journey without hiding it.
- **AC-13** — Given an open story, when presentation mode starts, then it shows the story title, the current illustration or a placeholder, only the step's `What happens` section and a progress indicator. When arrow keys are pressed, the step changes. When Esc is pressed, the overlay closes.
- **AC-14** — Given the step editor with a stale revision, when the user saves, then a conflict dialog offers Reload (which shows the on-disk version) and Overwrite (which saves over it). The quick fixes "mark input external" and "mark output final" use the same save path.
- **AC-15** — Given a production build of the cockpit, when the app opens a storyboard in the reader, then no Excalidraw chunk has been loaded. When the illustration editor then opens, the chunk loads from local files, and no editor font, worker or asset request goes to a remote host.
- **AC-16** — Given an end-to-end run of the Electron app on a temporary workspace, when a user creates a storyboard with the wizard, adds prose and lane hand-offs, draws and saves a sketch, adds data annotations and an alternate path, reorders a step and reloads, then the source files on disk, the reader, the Mermaid export and the HTML export all reflect those edits.
- **AC-17** — Given the repository's `oms-knowledge-base/storyboards/`, when `npm run check:storyboards` and `npm run check:storyboards -- --strict` run in `developer-cockpit`, then both exit 0 and list each storyboard with its provenance. Given a fixture with an `unknown-lane` error, the normal mode exits non-zero. Given a fixture with only warnings, or that is unevidenced, or that has drifted, the strict mode exits non-zero and the normal mode exits 0.
- **AC-18** — Given AI assists with a fake provider, when "suggest links" returns ids that are and are not in the link index, then only the ids present in the index are offered. No assist writes a file, and none receives more than the configured context bound. With the provider's API key environment variable unset, the assist actions are hidden.

## Impact

| Area | Impact |
|---|---|
| Modules | `developer-cockpit` (feature, tests, config, `check:storyboards` script); `oms-knowledge-base` (new `storyboards/` tree with templates, stencil library and at least one OMS storyboard) |
| Contracts (OpenAPI / Avro) | None. They are read only, to build the link index |
| Data (tables, migrations) | None. Storyboards are files only |
| Events / Kafka topics | None. The new `storyboards:changed` event is on the cockpit's local WebSocket, not Kafka |
| Consumers (oms-ui, oms-mcp-server, downstream) | None. Exposing storyboards through MCP is a follow-up |
| Knowledge base | New `oms-knowledge-base/storyboards/`; `architecture/developer-cockpit.md` (new view and service); `developer-cockpit/spec/11-storyboards.md` rewritten to match what is built; `developer-cockpit/spec/README.md`, `03-features.md`, `04-backend-services.md` and `05-data-model.md` (storyboard config) |
| Dependencies | New packages (decision per package recorded in design under P-17): `@excalidraw/excalidraw`, `roughjs`, an SVG/HTML sanitiser, and an Electron end-to-end test runner (devDependency) |
| Build / CI | `specs/config.json` → `developer-cockpit.verify` should add `npm run check:storyboards`. That file is human-owned, so the requester makes the change |

## Open Questions

- [resolved] How much of the spec does this ticket deliver? → All of `source-spec.md` §§1–15, AI assists included (requester, 2026-10-29).
- [resolved] Where do storyboards live? → `oms-knowledge-base/storyboards/` is the single default root; roots stay configurable (requester).
- [resolved] Evidence cards in a monorepo? → Included, adapted: `module` names a directory in this repository and `commit` a commit of this repository; drift compares the pinned commit with `HEAD` and ignores uncommitted changes (requester).
- [resolved] Which spec wins, `source-spec.md` or `11-storyboards.md`? → They should agree. `source-spec.md` is the implemented and tested baseline. The comparison table under Scope adopts or explicitly drops every item that only `11-storyboards.md` has, and `11-storyboards.md` is updated to match (requester asked for the comparison).
- [resolved] HTTP routes or IPC? → assumption: IPC plus a custom asset protocol. The cockpit has no HTTP API, and source-spec §7.6 allows an equivalent boundary.
- [resolved] Which AI provider? → assumption: the provider already declared in `CockpitConfig.ai` (`anthropic`, key read from `ANTHROPIC_API_KEY`), behind a small adapter. Assists are hidden when the key is absent. Tests use a fake adapter.
- [resolved] How are end-to-end tests run? → assumption: an Electron end-to-end runner is added as a devDependency, and design records the decision under P-17. This is reversible if the requester prefers component tests plus a scripted build check.
- [resolved] What content ships with the feature? → assumption: at least one real OMS journey storyboard (for example, a client order captured, routed to the exchange simulator, filled and streamed to the UI), with an evidence card pinned to current commits, so that the strict check has real content to pass.
