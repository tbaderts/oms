# 11 - Storyboards (Process Journeys)

> **Status:** Built in SPEC-0014 · **Date:** 2026-10-29 · **Group:** Knowledge

A storyboard answers the question *how does this process actually run?* for people who may never
read the code: operations leads, analysts, new joiners and workshop participants. It is an ordered
sequence of steps. Each step is a hand-off of responsibility between **lanes** (actors, channels,
systems, external parties) and carries prose, optional sketches, links to the contracts, data in
and out, and alternate paths.

The business journey is the primary artefact. Sequence diagrams, the HTML handout and the
presentation are **generated** from it, so nothing is maintained twice. Storyboards are plain files
reviewed in git: there is no database.

The original requirements, as supplied, are in
`specs/changes/SPEC-0014-…/source-spec.md`. This page describes what the cockpit implements.

---

## 1. Why not just a sequence diagram?

| Question | Sequence diagram | Storyboard |
|---|---|---|
| Who does what, in what order? | Yes | Yes (Strip, Lanes, and a generated Sequence) |
| What does the user see and decide at this moment? | No | Yes (sketch and prose) |
| What business rules apply in this step? | Only as notes | Yes (prose) |
| What can go wrong, and what happens then? | `alt` blocks get unreadable | Yes (structured alternate paths, labelled `3a`, `3b` …) |
| Which data does a step read and produce? | No | Yes (lightweight `in` / `out` annotations, checked) |
| Which API, event, state transition or requirement is involved? | Partially | Yes (typed links, checked against the workspace) |
| Does it still match the code? | Unknown | Evidence card with drift detection |
| Can a non-technical stakeholder follow it in a workshop? | Rarely | Yes (presentation mode) |

---

## 2. Example in the repository

`oms-knowledge-base/storyboards/order-lifecycle/place-and-fill-order/`: *Place and fill a client
order*.

| # | Step | Hand-off | Kind |
|---|---|---|---|
| 1 | Trader submits a new order | Trader → OMS | user |
| 2 | OMS publishes the order to the venue | OMS → Exchange simulator | system |
| 3 | The venue accepts the order (alternate path 3a: the venue rejects it) | Exchange simulator → OMS | external |
| 4 | Fills arrive from the venue (alternate path 4a: a partial fill keeps the order LIVE) | Exchange simulator → OMS | external |
| 5 | The fill shows up on the trade blotter | OMS → Trade blotter | system |

Its evidence card pins `oms-core`, `oms-exchange-simulator` and `oms-streaming-service`.

---

## 3. Libraries

| Need | Choice | Why |
|---|---|---|
| Drawing sketches | `@excalidraw/excalidraw` (MIT) | A complete hand-drawn editor. Its "SVG with embedded scene" is one file that renders as an image everywhere and reopens for editing. tldraw was rejected (production licence key) |
| Generated sketch frames, lane arrows, placeholders | `roughjs` (MIT) | Hand-drawn look with a seed per step id, so a sketch never "wiggles" between renders |
| Front matter | `yaml` (ISC) | Parses with source ranges, so a save rewrites only the changed keys and leaves the rest of the text as written |
| SVG checks | `@xmldom/xmldom` (MIT) | A real XML parser for the reject rules (no regex) |
| Markdown in the HTML export | `unified` + `remark-*` + `rehype-stringify` | Already in the tree through `react-markdown` |
| Electron end-to-end tests | `@playwright/test` (dev only) | Drives the built app: lazy loading, protocol, PDF |

Not used: MDXEditor (the editor is Monaco source plus a live preview), React Flow (no free-form
graph is needed), an AI SDK (one `fetch` call is enough).

---

## 4. User experience

### 4.1 Placement

- The **Storyboards** view (icon `Clapperboard`) sits in the Knowledge group, after Requirements.
- Command palette: "Open storyboard…", "New storyboard" and "Present storyboard" (the last only
  while a storyboard is open).
- Backlinks: each functional requirement in the Requirements view, and each knowledge-base
  document, lists the storyboards that link to it.

### 4.2 Catalogue (left)

- Grouped by domain.
- A case-insensitive substring filter over title, summary and step titles, plus filters for
  domain, status and tag.
- Each card shows the step count, status, trust badge, drift badge and a thumbnail strip (one per
  step).
- Scan diagnostics (duplicate ids, symlinks, oversized or malformed files, missing roots) appear
  above the list and never hide valid entries.
- **Rescan** is always available. **New** appears only when storyboards are writable and a root
  exists.

### 4.3 Journey (right)

- **Header.** Title, domain, status, trust and drift badges, the mode switch, the layer toggles,
  Present, HTML and PDF export, and Edit story.
- **Checks panel.** Validation findings grouped by severity, above the journey, never replacing
  it. Clicking a finding selects its step. Two safe quick fixes exist, for a normal step's own data
  only: *Mark as external* (an input with no source) and *Mark as final* (an output nobody reads).
  They go through the normal save and conflict path.
- **Provenance panel.** Trust tier, drift, pinned modules, changed or missing sources,
  knowledge-base links and verifications.
- **Pinned overview**, in one of three modes:
  - **Strip.** A filmstrip of sketch panels with placeholder panels for missing illustrations. It
    has optional data and alternate-path layers, offered only when the storyboard has data or
    alternate paths. The same layers show as badges under each card in Lanes, and as data notes and
    `opt` blocks in Sequence. Drag a panel to reorder; the `+` between panels inserts a step.
  - **Lanes.** Swimlanes in lane declaration order. Each step sits in its responsible lane
    (`from`, else `to`), with rough arrows between consecutive steps. There is no drag here,
    because a drag would ambiguously mean "reorder" and "move responsibility".
  - **Sequence.** The generated Mermaid diagram, read-only, with copy and "Download .mmd". It
    includes alternate paths when that layer is on.
- **Shared state.** Strip and Lanes share the selected and the hovered step.
- **Step detail** below the overview:
  - position and title, the hand-off and kind, Prev / Next / Overview;
  - illustrations beside the prose on wide screens, stacked above it below 1280 px;
  - illustrations are always shown through `<img>`, with a "not editable" badge on plain images
    and a placeholder when one is missing;
  - safe Markdown, link chips (requirements open the Requirements view, API and events open
    Contracts, states open the Knowledge Base), the data list, and the alternate paths with When,
    Then and where the journey continues.

### 4.4 Keyboard (outside text fields and editors)

| Key | Effect |
|---|---|
| → or j / ← or k | Next / previous step (stops at the ends) |
| Home / End | First / last step |
| Esc | Back to the overview |
| E | Edit the current step (when writable) |
| P | Presentation mode |
| D / A | Toggle the data / alternate-paths layer (one state, shared with presentation mode) |

### 4.5 Presentation mode

An in-app overlay, not browser fullscreen. It shows the storyboard title, a large illustration or
placeholder, **only** the step's `What happens` section, and a slim progress bar. ← / → and Space
move between steps, and Esc exits on the current step.

Two toggles, as buttons or keys, start from the reader's layers:
- **D** shows the step's data: its inputs with their sources, and its outputs.
- **A** shows the step's alternate paths as cards, each with its own sketch, When, Then and where the
  journey continues.

### 4.6 Authoring

- **New-storyboard wizard.** Target root (from the scan), domain, title, lanes (label, id, kind)
  and one or more step titles. It scaffolds the folder from the root's `_templates/` or from
  built-in templates.
- **Step editor.**
  - Form fields: title, kind, from lane and to lane.
  - Illustrations with captions. "Draw sketch" and "Edit" open the lazily loaded Excalidraw editor
    with the shared stencil library. A new sketch is saved as an asset at once; the step references
    it only when the step is saved.
  - Markdown source (Monaco) with a live preview.
  - Link pickers that autocomplete from the workspace link index; unresolved values are marked.
  - Data editor: inputs with a source picker (an earlier step, an alternate path, a lane or a
    free-text external source; "add from an earlier output"), and outputs with "leaves the
    journey".
  - Alternate-path editor: unique id, When, Then, a continuation limited to *retry this step*,
    *end of journey* or a **later** step, its own sketches and its own data.
  - Optional AI assists (§9).
  - Remove step: the step leaves the order, and its file and the sketches only it uses are
    deleted only if the user ticks that choice.
- **Story editor.** Title, status, owner, tags, lanes and prose of `story.md`.
- **Drafts.** Unsaved drafts live in the browser's session storage. Only the explicit Save writes
  files.
- **Conflicts.** A save based on an old revision opens a dialog: *Reload* (take the disk version)
  or *Overwrite* (resend on top of the latest revision).

---

## 5. Storage model

### 5.1 Layout

```text
oms-knowledge-base/storyboards/            default root; roots are configurable (§10)
  README.md
  _templates/story.md, step.md            placeholders {{id}}, {{title}}, {{domain}}
  _library/oms-storyboard.excalidrawlib   person, phone frame, desktop window, service box, OMS box,
                                          venue / exchange, back-office ledger, document, envelope
  <domain>/                               domain folders may be nested
    <storyboard-id>/                      a folder is a storyboard when it contains story.md
      story.md
      story.card.yaml                     optional evidence card (§6)
      steps/<step-id>.md
      assets/<name>.excalidraw.svg        also .svg, .png, .jpg, .jpeg, .webp (read-only)
```

- `storyboards/` is **outside the OKF bundle**: `tools/okf-check` and the cockpit's
  knowledge-base view skip it.
- Storyboard, step, extension and lane ids, and asset file stems, are slugs
  (`^[a-z0-9][a-z0-9-]{0,63}$`).
- A storyboard id is unique across all roots. A duplicate makes **both** folders scan errors.
- Step order lives only in `story.md`. Reordering never renames or rewrites step files, and labels
  such as `3a` are derived from the order, never stored.

### 5.2 `story.md`

```markdown
---
id: place-and-fill-order
title: Place and fill a client order
domain: order-lifecycle
status: draft                  # draft | stable | deprecated
owner: oms-team
tags: [order-lifecycle, exchange-simulator]
lanes:
  - { id: trader, label: Trader, kind: actor }          # actor | channel | system | external
  - { id: oms-core, label: OMS, kind: system }
  - { id: exchange, label: Exchange simulator, kind: external }
steps:
  - submit-order
  - publish-order
---

## Summary

The first paragraph here is the catalogue description (unless the evidence card has one).

## Scope and assumptions
```

Unknown front-matter keys are kept on every save.

### 5.3 Step file

```markdown
---
id: venue-accepts                 # must equal the file name
title: The venue accepts the order
kind: external                    # user | system | external | manual
from: exchange
to: oms-core
illustrations:
  - src: venue-accepts.excalidraw.svg      # a flat file name in assets/, never a path
    caption: The simulator acknowledges
links:
  api: [oms-cmd-api#OrderAcceptCmd]        # <spec file>#<operationId or command type>
  events: [OrderMessage]                   # Avro record names
  states: ["UNACK -> LIVE"]                # from the order-state diagram
  requirements: [FR-027]
in:
  - name: Order message                    # case-insensitive matching key
    shape: "OrderMessage on oms_orders"    # free text, not a schema
    origin: { kind: step, ref: publish-order }
    # or { kind: extension, ref: <step>/<ext> } | { kind: external, lane: <lane> }
    #  | { kind: external, label: <text> } | { kind: unknown }
out:
  - name: Live order
  - name: Audit entry
    final: true                            # deliberately leaves the journey
extensions:
  - id: venue-rejects
    when: The venue decides to reject the order
    then: The OMS moves the order to REJ and keeps the reason.
    continueAt: { kind: end }              # { kind: stay } | { kind: step, step: <later step> } | { kind: end }
    illustrations: []
    in: []
    out: [{ name: Reject reason, final: true }]
---

## What happens          (stands alone; presentation mode shows only this)

## Business rules

## Notes                 (caveats and decisions; alternate paths belong in extensions)
```

Extensions are one level deep. A jump goes only to a **later** step, because loops are out of scope.

---

## 6. Evidence and provenance (`story.card.yaml`)

```yaml
id: place-and-fill-order
title: "Place and fill a client order"          # the card wins for title, description, status, tags
description: "…"
kb_links: [/capabilities/order-capture.md]       # must exist in the knowledge base
evidence:
  repos:
    - module: oms-core                           # a module folder of this repository
      commit: "8dc1ced"                          # always quoted
  sources:
    - module: oms-core
      path: src/main/java/org/example/oms/service/command/OrderCreateCommandProcessor.java
      line: 64
      end_line: 88
      label: "order capture"
verified:
  - by: human:reviewer-id                        # only after walking the process end to end
    at: 2026-10-21T00:00:00Z
```

- **Trust.** No card gives *unevidenced*; a card gives *evidenced*; a `human:` verification gives
  *human-verified*.
- **Drift** is computed during the scan only, never on a detail click.
  - A source whose cited line range changed between the pinned commit and `HEAD` (in a
    `git diff --unified=0`) is *drifted*. A file gone from `HEAD` is *missing*. An unknown commit
    is *unknown* and counts as broken evidence.
  - The storyboard takes the worst status. Uncommitted edits never count.
  - After reviewing a drifted storyboard, update the prose and re-pin the commit and line ranges.
- **Broken evidence:** an unknown commit or module, a malformed source, or a missing `kb_links`
  target.

---

## 7. Backend (Electron main process)

### 7.1 Services (`src/main/storyboards/`, no Electron imports)

| Service | Responsibility |
|---|---|
| `StoryboardService` | `scan`, `detail`, writes, revision tokens, watcher echo suppression, `storyboards:changed` |
| `LinkIndexService` | Link targets from `oms-contracts` (operation ids and command types, Avro records), `domain/order-state.md` and the FR/NFR files; cached until a source changes |
| `EvidenceService` | Trust, drift and `kb_links` per card, cached per `HEAD` |
| `StoryboardExportService` | Mermaid and standalone HTML |
| `StoryboardAiService` + `AnthropicAdapter` | Optional assists (§9) |
| `svgSafety.checkSvg` / `assets.resolveAsset` | SVG reject rules and safe asset serving |

### 7.2 IPC (`window.cockpit.storyboards.*`)

No channel accepts a filesystem path: storyboards are named by id, and the create root by an
opaque `rootId` returned by the scan. Every input is validated in the service.

| Method | Purpose |
|---|---|
| `scan()` | Catalogue, scan errors, roots, `writable` |
| `detail(id)` | Storyboard, steps in order, resolved illustrations, headings, revisions, evidence, problems |
| `create({ rootId, domain, title, lanes, stepTitles })` | New storyboard folder |
| `saveStory(id, patch, body, revision)`, `saveStep(id, stepId, patch, body, revision)` | Patch allowlisted keys and the body |
| `createStep(id, title, afterStepId, revision)`, `deleteStep(id, stepId, deleteAssets, revision)`, `reorder(id, stepIds, revision)` | Change the order (only the `steps` list of story.md) |
| `saveIllustration(id, name, svg)`, `readIllustration(id, name)`, `library(id)` | Sketches |
| `links()`, `backlinks(target)` | Link index, references from requirements and KB documents |
| `exportMermaid(id, extensions, save)`, `exportHtml(id, sequenceSvg, save)`, `exportPdf(id, sequenceSvg)` | Exports (save dialogs in main) |
| `aiAvailable()`, `aiAssist(kind, id, stepId)` | AI assists |

Results are `{ ok: true, … }` or `{ ok: false, code, message }` with the codes `conflict` (plus
`latestRevision`), `read-only`, `not-found`, `invalid`, `too-large` and `exists`. Handlers never
throw across IPC.

### 7.3 Validation (advisory; a broken storyboard still opens)

| Code | Severity | Condition |
|---|---|---|
| `step-unreadable` | error | A listed step file is missing, malformed, symlinked or oversized, or its id differs from the file name |
| `unknown-lane` | error | `from` or `to` is not a declared lane |
| `missing-illustration` | warning | A referenced illustration is absent |
| `unresolved-link` | warning | A link is not in its (non-empty) index category |
| `orphan-step` | warning | A file in `steps/` is not listed in story.md |
| `data-no-source` | warning | An input's origin is unknown |
| `data-never-read` | warning | A non-final output is not read later in the journey |
| `data-origin-unresolved` | warning | An input names an absent or non-earlier step or alternate path, or an undeclared lane |
| `extension-unknown-target` | error | `continueAt.step` is not declared |
| `extension-backward-target` | error | `continueAt.step` is the owning step or an earlier one |
| `extension-duplicate-id` | error | Two alternate paths of one step share an id |

### 7.4 Writes

- **Revision.** Every write checks `<mtime>-<sha256 prefix>` and refuses a stale revision with the
  latest one.
- **Patching.** A save rewrites only the source text of the keys it changes; comments, quoting and
  flow style elsewhere stay byte for byte.
- **Checks.** The result is parsed again before it is written. A save that changes nothing writes
  nothing, so the mtime is unchanged.
- **Atomic.** Files are written to a temporary file in the same folder and renamed.
- **Delete.** `deleteStep` without `deleteAssets` keeps every file, so the step reappears as an
  orphan and the removal can be undone. With it, the step file and the assets that only this step
  references are deleted.
- **Read-only.** `writable: false` refuses every write before touching the disk.
- **Watcher.** Writes this service made itself (same content hash, within 5 s) are not
  broadcast. Anything else under a root triggers one debounced rescan and one
  `storyboards:changed` event, on which the renderer rescans everything.

### 7.5 Assets and SVG safety

- **Serving.** `storyboard-asset://<id>/<name>` is resolved through the last scan:
  - the name must be a flat asset name;
  - the file must be a regular, non-symlinked file inside that storyboard's `assets/` folder, also
    after resolving real paths;
  - it must be within `maxAssetBytes`;
  - it is served with an explicit `Content-Type` and `nosniff`.
- **SVG responses** carry
  `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:`.
- **Uploads.** An SVG is **rejected**, never rewritten, when it has:
  - script, `foreignObject` or embedded-document elements, or XHTML-namespaced elements;
  - `on*` attributes;
  - `href` or `xlink:href` other than `#…` or `data:image/*`;
  - CSS `url()` other than `#…`, `data:image/*` or `data:font/*` (Excalidraw inlines its fonts
    this way);
  - `@import`, `javascript:`, or DOCTYPE or entity declarations;
  - more than `maxAssetBytes`.
- **Excalidraw** is self-hosted: its fonts are copied to `excalidraw-assets/` at build time. A
  Vite transform points Excalidraw's built-in CDN fallback at the same local folder, and the page
  CSP blocks every remote host.

---

## 8. Generated outputs

- **Mermaid `sequenceDiagram`.**
  - Participants follow lane order (`actor` for actor lanes).
  - A step with a full hand-off becomes a numbered message (`-->>` for external steps). Any
    other step becomes a note, never dropped.
  - An undeclared lane becomes a fallback participant.
  - With alternate paths, each one is an `opt` block (condition, outcome, continuation).
  - Text is sanitised.
- **Standalone HTML.**
  - One script-free file with print CSS and its own restrictive CSP.
  - It contains the metadata, the story prose and the sequence diagram (an SVG rendered by the
    renderer and checked again, else the Mermaid source), then every step in order.
  - Illustrations are inline SVGs (checked again) or `data:` images, with a readable fallback for
    anything unreadable. Data tables and alternate paths are included.
  - Links that leave the document become text, and nothing refers to the cockpit or the network.
- **PDF.** The HTML printed by a hidden, script-less window (`printToPDF`).

---

## 9. AI assists (optional)

Enabled only when `ai.provider` is `anthropic` and the API key variable (`ai.apiKeyEnvVar`) is set.
All assists return **proposals** that the user applies to the editor draft; no assist writes a file,
and the service has no file-system access.

- **Draft prose.** Markdown with the three house sections, from the title, lanes, links and up to
  three linked documents (2 000 characters each).
- **Review alternate paths.** Compares the step with the known state transitions. Suggestions
  with invalid or backward continuations are dropped; one click adds a suggestion as a draft
  alternate path.
- **Suggest links.** Picks from the link index. Values that are not exactly in the index are
  discarded.

The prompt is capped at 12 000 characters and carries no file paths and no other storyboards.

---

## 10. Configuration and CI

`CockpitConfig.storyboards`, editable in Settings → Knowledge Base:

| Key | Default |
|---|---|
| `enabled` | `true` |
| `roots` | `["oms-knowledge-base/storyboards"]` (workspace-relative; `*` matches one folder level) |
| `maxSourceBytes` | 1 MiB |
| `maxAssetBytes` | 512 KiB |
| `writable` | `true` |

`COCKPIT_STORYBOARDS_ENABLED`, `_ROOTS` (`;`-separated), `_MAX_SOURCE_BYTES`, `_MAX_ASSET_BYTES`
and `_WRITABLE` override the saved values. A configuration change clears the catalogue and the link
index and rescans.

Content gate, in `developer-cockpit`. It uses the defaults plus the environment and ignores the
personal config:

```bash
npm run check:storyboards              # fails on scan errors, error-level problems, broken evidence
npm run check:storyboards -- --strict  # also on warnings, drift and unevidenced storyboards
```

---

## 11. Design principles

1. **Sketches, never mock-ups.** The rough look keeps discussions on the process.
2. **The overview is always visible.** A step is never an isolated page.
3. **Prose carries the substance.** A step without a sketch is complete; it gets a placeholder
   panel.
4. **Plain files, reviewed in git.** Every write is a reviewable diff of only what changed.
5. **Link, don't duplicate.** Steps reference contracts, events, states and requirements by id.
6. **Advise, don't block.** Validation explains; it never stops a storyboard from opening.

## 12. Out of scope

Arbitrary branching, loops and nested alternate paths; real-time co-editing and comments (use
pull requests); replaying live order events against a journey; AI-generated sketches; PPTX; a
database; fuzzy search over prose; a WYSIWYG Markdown editor; exposing storyboards through
`oms-mcp-server` (a planned follow-up).

## 13. Tests

- **Unit** (`test/main`, `test/shared`): scan, detail, writes, evidence (on a temporary git
  repository), assets, SVG safety, link index, Mermaid, HTML export, AI service, IPC, CLI.
- **Component** (`test/renderer`): catalogue, reader keys and modes, presentation, step editor and
  conflicts, quick fixes, wizard and reorder, AI menu, palette, backlinks, Settings.
- **End-to-end** (`npm run test:e2e`, Playwright on the built Electron app):
  - the Excalidraw chunk loads only when the editor opens, from local files;
  - the round trip from the wizard to the exports;
  - the PDF export.

## 14. History

This page replaces the draft of 2026-10-21. Compared with that draft:

- **Status values** are now `draft / stable / deprecated`.
- **Exceptions** are structured alternate paths, no longer a prose section.
- **Illustration paths** are flat file names.
- **New:** data annotations, evidence cards with drift, revision tokens, SVG reject rules,
  session-storage drafts and the CI content gate.
- **Story-level links** are superseded by the card's `kb_links`; an existing key is kept on save
  but not interpreted.
