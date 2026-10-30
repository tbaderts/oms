<!-- Source specification supplied by the requester on 2026-10-29. Written on another
     system/platform and may need adjusting to this repository; the proposal and design record
     the adjustments. Content kept as supplied, with only the doubled blank lines from the paste
     collapsed. -->

# Developer Cockpit Storyboards: Standalone Implementation Specification

## 1. Purpose

Implement a file-backed Storyboards feature that lets business and technical users describe, read, validate, present, and maintain end-to-end process journeys without storing content in a database.

A storyboard answers: "How does this process actually run?" It is intended for people who may never read implementation code: operations leads, analysts, new joiners, and workshop participants.

The feature must make the business journey the primary artefact. Technical sequence diagrams, data-flow views, and exports are generated from the storyboard so that equivalent information is not maintained twice.

## 2. Goals

- Discover storyboards from configured workspace content roots.
- Render an ordered business journey with persistent context and selectable steps.
- Support authoring directly into reviewable Markdown, YAML, and SVG files.
- Represent responsibility hand-offs with declared participant lanes.
- Link a step to technical records such as API operations, events, state transitions, requirements, and knowledge-base documents.
- Model lightweight data inputs and outputs without turning the storyboard into a schema registry.
- Model one-level alternate paths without supporting arbitrary flow graphs or loops.
- Generate a sequence diagram, a standalone HTML handout, and a workshop presentation from the same source.
- Show provenance, trust, and implementation-drift status where available.
- Make malformed or incomplete content visible and fixable instead of hiding it.

## 3. Non-goals

- UI mockups or pixel-perfect product design.
- Arbitrary branching, loops, free-form graph layout, or nested alternate paths.
- Real-time collaborative editing, comments, or approval workflows. Git and merge requests remain the review mechanism.
- Live replay of domain events against a journey.
- Automatic or AI-generated illustrations.
- PPTX generation.
- Database persistence for storyboard content.

## 4. Core Principles

1. A storyboard is a plain-file folder, not a database record.
2. A step is a unit of responsibility transfer or a meaningful process precondition, not every low-level action.
3. Step order is declared once in `story.md`; reordering must not rename or rewrite step files.
4. Validation is advisory in the reader. A broken storyboard must still open so its author can see and repair it.
5. Browser clients use opaque storyboard identifiers, never filesystem paths.
6. Every write is explicit, guarded by optimistic concurrency, and produces normal reviewable file diffs.
7. An illustration is an owned asset. A storyboard must not depend on images elsewhere in the workspace.
8. Generated views are derived from source content and are never separately editable.

## 5. Content Model

### 5.1 Content roots

The implementation scans one or more configured roots. A useful default is:

```text
*/*/docs/storyboards
```

This supports roots such as:

```text
<stream>/<project>/docs/storyboards/
```

Each root may contain:

```text
docs/storyboards/
  _templates/
    story.md
    step.md
  _library/
    oms-storyboard.excalidrawlib
  <domain>/
    <storyboard-id>/
      story.md
      story.card.yaml                 # optional evidence sidecar
      steps/
        <step-id>.md
      assets/
        <asset-name>.excalidraw.svg
```

Domain directories may be nested. A directory is a storyboard only when it contains `story.md`.

### 5.2 Identifier rules

Storyboard, step, extension, lane, and asset stems must use slugs matching:

```text
^[a-z0-9][a-z0-9-]{0,63}$
```

Use stable ids rather than indexes. IDs are never derived from a step's position because positions change when users reorder a journey.

The storyboard id must be globally unique across configured roots. A duplicate is a scan error; the system must not silently choose one as a replacement for the other.

### 5.3 Story document: `story.md`

`story.md` owns the storyboard's identity, presentation metadata, declared lanes, and step order.

```markdown
---
id: buy-gold-mobile
title: Buy gold via mobile app
domain: precious-metals
status: draft
owner: analyst-id
tags: [retail, mobile]
lanes:
  - { id: customer, label: Customer, kind: actor }
  - { id: app, label: Mobile App, kind: channel }
  - { id: oms, label: OMS, kind: system }
  - { id: market, label: Market, kind: external }
steps:
  - request-quote
  - accept-quote
  - route-to-market
---

## Summary

The customer requests and accepts a quote, after which OMS routes the order to market.

## Scope and assumptions

- The customer is onboarded and has sufficient funds.
```

Required front matter:

- `id`: storyboard slug.
- `title`: non-empty display title.
- `status`: `draft`, `stable`, or `deprecated`.
- `lanes`: array of unique lane ids.
- `steps`: ordered array of unique step ids.

Optional front matter:

- `domain`, `owner`, `tags`.
- Unknown keys must survive save operations.

Supported lane kinds:

- `actor`: a person doing work.
- `channel`: a user-facing channel such as an application or telephone interface.
- `system`: a service or component operated by the organisation.
- `external`: a counterparty or service operated by someone else.

The body is ordinary Markdown. The first paragraph under `## Summary`, when present, is the catalogue description unless the evidence card supplies a description.

### 5.4 Step document: `steps/<step-id>.md`

Each listed step has exactly one Markdown document. It carries the responsibility hand-off, links, optional illustrations, data annotations, structured alternate paths, and prose.

```markdown
---
id: route-to-market
title: Route order to market
kind: system
from: oms
to: market
illustrations:
  - src: route-to-market.excalidraw.svg
    caption: OMS sends the market instruction
links:
  api: [oms-command-api#createOrder]
  events: [OrderMessage]
  states: ["NEW -> PLACED"]
  requirements: [FR-OMS-044]
in:
  - name: Order
    shape: "{ id, side, quantity, price }"
    origin: { kind: step, ref: accept-quote }
out:
  - name: Market instruction
extensions:
  - id: venue-rejects
    when: The venue rejects the instruction
    then: OMS records the rejection and notifies operations.
    continueAt: { kind: end }
    out:
      - name: Operations alert
        final: true
---

## What happens

OMS creates the market instruction from the accepted order and submits it to the selected venue.

## Business rules

- The venue must support the instrument and order type.

## Notes

- Venue selection is outside this journey.
```

Required step front matter:

- `id`: must match the filename and declared `steps` entry.
- `title`: non-empty display title.
- `kind`: `user`, `system`, `external`, or `manual`.

Optional step front matter:

- `from` and `to`: declared lane ids.
- `illustrations`.
- `links`.
- `in`, `out`, and `extensions`.

Step prose follows a house convention rather than a strict schema:

```markdown
## What happens

## Business rules

## Notes
```

`What happens` must stand alone because presentation mode reads it aloud. `Notes` contains caveats, decisions, and evidence gaps; alternate paths belong in `extensions`.

### 5.5 Illustrations

Illustrations reside in the owning storyboard's `assets/` directory. Supported read formats are SVG, PNG, JPG, JPEG, and WebP. Only `*.excalidraw.svg` is editable in the integrated editor.

An Excalidraw SVG is both:

- an ordinary SVG image that renders in Git hosting, static HTML, and the reader; and
- an SVG with an embedded Excalidraw scene that can reopen losslessly in the illustration editor.

Each `illustrations[]` item contains:

```yaml
- src: route-to-market.excalidraw.svg
  caption: OMS sends the market instruction
```

The persisted `src` is a flat asset filename, not `../assets/...`, an absolute path, URL, or API route. The API resolves it to a safe asset URL when serving a reader.

### 5.6 Links

Steps may declare links in four categories:

```yaml
links:
  api: [openapi-spec#operationId]
  events: [AvroRecordName]
  states: ["FROM -> TO"]
  requirements: [FR-OMS-044]
```

The application builds a workspace index of valid API operation ids, Avro records, recognised state transitions, and requirement ids. The editor provides autocomplete from that index. A typed unresolved target is retained but reported as a warning, allowing documentation to reference a target that will be introduced later.

### 5.7 Lightweight data flow

Data annotations explain what the journey reads and produces. They are intentionally not schemas.

```yaml
in:
  - name: Quote
    shape: "{ price, expiry }"
    origin: { kind: step, ref: request-quote }
  - name: Market status
    origin: { kind: external, lane: market }
out:
  - name: Market instruction
  - name: Customer receipt
    final: true
```

An input has:

- `name`: human-readable, case-insensitive matching key.
- `shape`: optional free text for a lightweight structure.
- `origin`: required in the resolved model, with one of the following forms.

```yaml
origin: { kind: step, ref: earlier-step-id }
origin: { kind: extension, ref: earlier-step-id/extension-id }
origin: { kind: external, lane: declared-lane-id }
origin: { kind: external, label: free-text-source }
origin: { kind: unknown }
```

An output has `name`, optional `shape`, and optional `final: true`. Set `final` when the output deliberately leaves the journey and no downstream step reads it.

### 5.8 Alternate paths (extensions)

An extension is one alternate path attached to a normal step. It is deliberately one level deep: extensions cannot own more extensions.

```yaml
extensions:
  - id: quote-expired
    when: The quote is older than ten seconds
    then: The order is not submitted and the customer is offered a new quote.
    continueAt: { kind: stay }
    illustrations: []
    in: []
    out: []
```

Required fields:

- `id`: unique within the owning step.
- `when`: condition that triggers the alternate path.
- `then`: what happens in that path.
- `continueAt`: exactly one of the forms below.

```yaml
continueAt: { kind: stay }
continueAt: { kind: step, step: later-step-id }
continueAt: { kind: end }
```

`stay` represents a retry at the same step. A jump must target a later declared step. Backward jumps are rejected because they introduce loops, which are out of scope.

Extension labels such as `2a`, `2b`, and `3a` are derived from the current step order and extension order. They are not stored in files, so a reorder changes labels without rewriting every step file.

## 6. Evidence and Provenance

`story.card.yaml` is optional. A cardless storyboard remains valid and displays as `unevidenced`.

The card is the authority for its `id`, `title`, `description`, `status`, and `tags` when present. Keep these fields consistent with `story.md` to avoid author confusion.

```yaml
id: buy-gold-mobile
title: "Buy gold via mobile app"
description: "Customer journey from quote to market instruction."
tags: [retail, mobile]
status: draft

kb_links:
  - /requirements/use-cases/UC-OMS-001_capture-order.md

evidence:
  repos:
    - module: ri-oms-core
      root: ../../../../../ri-oms-core
      commit: "9f8e7d6"
  sources:
    - module: ri-oms-core
      path: src/main/java/example/OrderCaptureService.java
      line: 88
      end_line: 140
      label: "order capture and validation"

verified:
  - by: human:reviewer-id
    at: 2026-10-21T00:00:00Z
```

Requirements:

- Pin evidence by repository commit, not one workspace-wide commit.
- Always quote commit values so all-numeric short SHAs remain strings in YAML.
- A card's `kb_links` must resolve to existing knowledge-base documents.
- Evidence drift is calculated per referenced repository and the storyboard takes the worst status.
- A human verification entry gives a human-reviewed trust tier. Do not create one until a person has walked the process end-to-end.
- Re-pin evidence after committed implementation changes. Uncommitted working-tree changes do not establish drift because drift compares committed references.

## 7. Backend Requirements

The backend can be implemented in any stack. It must expose a service boundary equivalent to the following logical operations.

### 7.1 Configuration

```text
enabled: boolean                         default true
roots: string[]                          default ["*/*/docs/storyboards"]
maxSourceBytes: integer                  default 1 MiB
maxAssetBytes: integer                   default 512 KiB
writable: boolean                        default true
```

Configuration precedence should be environment overrides, user/application config, then defaults. When configuration changes, clear the catalogue and link index, then rescan.

### 7.2 Catalogue scan

`scan()` must:

1. Expand configured roots against the workspace root.
2. Walk for folders containing `story.md`.
3. Ignore symlinked files and directories.
4. Ignore files exceeding configured size limits.
5. Parse story metadata and optional cards.
6. Reject duplicate ids as scan diagnostics.
7. Evaluate evidence drift during the scan, not at every detail request.
8. Build knowledge-base backlinks from evidence cards.
9. Return a sorted catalogue by domain then title and structured non-fatal scan errors.

Catalogue metadata must provide id, title, description, domain, status, owner, tags, workspace-relative source path, modified time, step count, one thumbnail per declared step, trust tier, drift status, and whether a card exists.

### 7.3 Detail read and validation

`detail(id)` resolves an id through the last successful scan and returns:

- story metadata and body;
- lanes;
- steps in the order in `story.md`;
- resolved illustration URLs and missing flags;
- Markdown headings and anchors;
- save revision tokens;
- evidence and provenance details;
- advisory validation problems.

Validation must include:

| Code | Severity | Condition |
| --- | --- | --- |
| `step-unreadable` | error | A declared step file is missing, malformed, symlinked, or oversized. |
| `unknown-lane` | error | A step `from` or `to` does not name a declared lane. |
| `missing-illustration` | warning | A referenced illustration is absent. |
| `unresolved-link` | warning | A link cannot be found in a non-empty workspace index category. |
| `orphan-step` | warning | A Markdown file exists in `steps/` but is not listed in `story.md`. |
| `data-no-source` | warning | An input origin is unknown. |
| `data-never-read` | warning | A non-final output is not read later in the journey. |
| `data-origin-unresolved` | warning | An input claims an absent or non-earlier step/extension source. |
| `extension-unknown-target` | error | `continueAt.step` is not declared. |
| `extension-backward-target` | error | `continueAt.step` is the owning or an earlier step. |
| `extension-duplicate-id` | error | Two extensions on one step use the same id. |

Warnings and errors are returned to the reader; neither must suppress a storyboard from the catalogue.

### 7.4 Writes and revisions

All writes require a revision token calculated from the file modification time and content hash. A stale write returns HTTP 409 (or the equivalent conflict result) and the latest revision so the client can offer reload or intentional overwrite.

Supported write operations:

- Create a story from a selected scanned root, domain, title, lanes, and at least one step title.
- Save selected story front-matter fields and its body.
- Create a step after a specified step or at the end.
- Save selected step front-matter fields and its body.
- Delete a step from the order, with a separate explicit choice to delete its file and directly referenced assets.
- Reorder the complete existing set of step ids.
- Save an Excalidraw SVG illustration.
- Return the shared Excalidraw library for the root when it exists.

Write rules:

- Reject every write when `writable` is false.
- The create root is a capability selected from a scan response, not a client-composed filesystem path.
- Create a folder from the title slug, scaffolding templates from `_templates` or built-in defaults.
- Preserve unknown front-matter keys.
- Parse the generated file again before committing it to disk.
- If a save changes no bytes, do not write or change mtime.
- Reorder only rewrites the `steps` field in `story.md`.
- Removing a step without deletion leaves files and assets on disk and produces an orphan warning; this makes accidental removal recoverable.
- Suppress filesystem watcher notifications for the immediate hash-identical echo of the server's own write, but broadcast external edits.

### 7.5 Asset serving and storage safety

Asset requests take only a storyboard id and a flat filename. They must not take a general relative path.

For each request:

1. Resolve the storyboard id through the scanned catalogue.
2. Validate the asset filename using the asset-name pattern and allowed extension.
3. Resolve the file only within that storyboard's `assets/` directory.
4. Check the file is regular, not a symlink, within the size limit, and still contained after `realpath` resolution.
5. Serve explicit image content types.
6. For SVG responses, set a restrictive CSP such as `default-src 'none'`.
7. Render SVG in the UI through `<img>`, never through inline unsanitised HTML.

Before writing an SVG, reject:

- `<script>` elements;
- event handler attributes such as `onload`;
- `<foreignObject>`;
- external `href` or `xlink:href` values. Permit only fragment references and `data:image/*` URLs;
- content exceeding `maxAssetBytes`.

### 7.6 HTTP API

The exact route names are optional, but the following shape is recommended:

```text
POST /api/storyboards/scan
POST /api/storyboards/detail                 { id }
POST /api/storyboards/create                 { root, domain, title, lanes, stepTitles }
POST /api/storyboards/story/save             { id, patch, body, revision }
POST /api/storyboards/step/create            { id, title, afterStepId }
POST /api/storyboards/step/save              { id, stepId, patch, body, revision }
POST /api/storyboards/step/delete            { id, stepId, deleteAssets }
POST /api/storyboards/reorder                { id, stepIds }
POST /api/storyboards/illustration/save      { id, name, svg }
POST /api/storyboards/library                { id }
POST /api/storyboards/links
GET  /api/storyboards/assets/:id/:name
GET  /api/storyboards/export/mermaid?id=:id&extensions=0|1
GET  /api/storyboards/export/html?id=:id
```

Use a server event, WebSocket event, or equivalent `storyboards:changed` notification when any content root changes. The client must rescan because a change can add or remove an entire storyboard.

## 8. User Experience Requirements

### 8.1 Catalogue

Provide a Storyboards navigation entry in the knowledge/discovery area. The catalogue must:

- Group storyboards by domain.
- Filter by case-insensitive substring across title, summary, and step titles.
- Show title, step count, status, evidence/trust badge, drift badge, and a thumbnail strip.
- Show scan diagnostics without hiding valid entries.
- Offer a `New` action only where the user can write and at least one root is configured.
- Offer a rescan action.

### 8.2 Reader and overview modes

Use a master-detail layout: catalogue on the left and selected journey on the right.

The journey must keep its overview visible whenever a reader opens a step. Do not present a step as an isolated wiki page; sequence is the feature's central value.

Provide three overview modes:

- **Strip**: a horizontal filmstrip with one sketch-like panel per step, selected step state, placeholder panels for missing illustrations, and optional layers for data and alternate paths.
- **Lanes**: swimlanes grouped by declared participant. Display each step in the lane responsible for it and draw arrows between consecutive steps.
- **Sequence**: generated Mermaid sequence diagram. This is read-only and supports copy/download of source.

Both Strip and Lanes must share the same selected and hovered step state. Use deterministic visual seeds derived from step id if applying a rough/sketch renderer, so visuals do not change between renders.

Keyboard behaviour outside text inputs:

| Key | Behaviour |
| --- | --- |
| Right Arrow | Select next step. |
| Left Arrow | Select previous step. |
| Home | Select first step. |
| End | Select final step. |
| Escape | Return from selected step to overview. |
| E | Enter edit mode for the current step, if supported. |
| P | Start presentation mode, if supported. |

### 8.3 Step detail

The step detail view must show:

- step position and title;
- lane hand-off and kind;
- illustration(s) and captions;
- Markdown body rendered safely;
- link chips that navigate to the relevant requirements view or search the knowledge base;
- input/output data annotations;
- alternate paths with When, Then, continuation, and linked illustrations;
- next, previous, and overview navigation.

On desktop, present illustrations and prose side by side. Below approximately 1280 px, stack illustrations above prose. Keep the overview pinned and give prose its own scrollable region where appropriate.

### 8.4 Checks and provenance

Show validation findings above the journey without replacing the journey. Group by severity and allow the user to select the affected step.

Offer safe quick fixes only for a normal step's own data:

- Mark an input with no source as external.
- Mark an unread output as a final journey output.

These actions must use the normal save and revision-conflict path.

Show provenance from evidence cards: trust tier, drift status, pinned repositories, changed/missing sources, and knowledge-base links.

### 8.5 Authoring

Authoring must be file-first. The browser is a structured editor over source documents, not an alternate database.

The new-story wizard asks for:

- target root;
- domain;
- title;
- lanes with label and kind;
- one or more step titles.

The step editor provides:

- form fields for title, kind, from/to lanes, and illustrations;
- Markdown source and live preview;
- link pickers backed by the workspace index;
- data input/output editing and picker support for earlier outputs and external/system lanes;
- extension editing with unique ids, `when`, `then`, a continuation selector limited to later steps plus stay/end, data, and illustration support;
- a lazy-loaded illustration editor for editable SVGs;
- explicit Save;
- a conflict dialog on stale revisions with Reload and Overwrite choices.

Store unsaved drafts in browser memory or session storage, not the repository. The only persistence into files is an explicit save. It is acceptable to save a newly drawn asset immediately; its reference should not be added to the step until the step save.

Strip mode may support drag reordering and inserting a step between panels. Do not support drag reorder in lanes mode because it ambiguously means both resequencing and moving responsibility.

### 8.6 Illustration editor

Use an illustration tool that supports an SVG-with-embedded-scene format such as Excalidraw. It must be lazy loaded so browsing and reading never load its large editor bundle.

Do not use a CDN for fonts, workers, or assets. Self-host any required editor assets and configure the editor to use local paths. Optionally load a shared library from `_library/oms-storyboard.excalidrawlib` to keep sketch symbols consistent.

Suggested common shapes: person, phone frame, desktop window, service box, OMS box, venue/exchange, back-office ledger, document, and message envelope.

### 8.7 Presentation mode

Presentation mode is an in-app overlay, not a browser fullscreen dependency. It must show:

- the storyboard title;
- a large current illustration or generated placeholder;
- only the `What happens` section by default;
- a slim step progress indicator;
- arrow-key navigation;
- Escape to exit;
- an optional overlay for alternate paths.

## 9. Generated Outputs

### 9.1 Mermaid sequence diagram

Generate Mermaid `sequenceDiagram` source from the story:

- participants follow lane declaration order;
- `actor` lanes use Mermaid `actor`; all others use `participant`;
- a step with `from` and `to` becomes a numbered message;
- external-driven steps use a response arrow;
- a step without a full hand-off becomes a note over its available lane rather than being dropped;
- an undeclared lane referenced by a step is added as a fallback participant so the export remains complete while validation reports the underlying issue;
- with `extensions=1`, emit each extension as an `opt` block with the condition, outcome, and continuation.

Sanitise text for Mermaid syntax: collapse whitespace and remove characters that can terminate or reinterpret a Mermaid message.

### 9.2 Standalone HTML

Generate a self-contained, script-free HTML handout suitable for download and browser print-to-PDF. It must include:

- title, metadata, and summary;
- rendered story body;
- generated sequence diagram rendered as sanitised SVG;
- every step in order;
- rendered Markdown;
- inline sanitised SVG illustrations where possible;
- a readable fallback where an image cannot be read;
- data inputs/outputs and alternate paths;
- print CSS.

The output must not refer to the Cockpit server or external image URLs after it is downloaded.

## 10. Optional AI Assists

AI assistance is optional and only enabled when an approved provider is configured. Every assist returns a proposal only; no AI operation writes to files.

Provide three assists:

1. **Draft step prose**: produces Markdown with `What happens`, `Business rules`, and `Notes` based on the title, lanes, declared links, and bounded extracts from linked requirements or knowledge documents.
2. **Review alternate paths**: compares the journey with declared state transitions and returns missing exception-path suggestions. A user may add a suggestion as an extension draft.
3. **Suggest links**: matches step prose against the existing workspace link index. Discard values not exactly present in the candidate index to prevent invented identifiers.

Never give the AI filesystem write access. Limit prompt context sizes and expose to it only information necessary for the requested assist.

## 11. Security Requirements

- Never accept a filesystem path from the browser.
- Resolve every storyboard id through a current server-side scan map.
- Enforce slug validation for ids and flat asset-name validation for assets.
- Reject symlinks in scanned content and asset serving.
- Enforce source and asset size limits on both read and write.
- Ensure post-resolution paths stay contained in the expected root.
- Sanitize SVG at write time and re-sanitize it before placing it in standalone HTML.
- Render reader illustrations through image elements, not raw HTML injection.
- Render Markdown with HTML disabled or sanitised.
- Disable all write endpoints when configured read-only.
- Use revision tokens to avoid silent concurrent overwrites.
- Preserve the original content if serialisation or validation of the updated content fails.

## 12. Performance Requirements

- Evaluate evidence drift during scans; do not run version-control commands on every detail click.
- Cache the workspace link index and invalidate it with relevant configuration or workspace changes.
- Keep the reader usable when an illustration is missing or invalid.
- Lazy-load the drawing editor and assert it is absent from the application entry/browse path.
- Bound all source and asset reads.
- Use a single scan-triggered broadcast and rescan rather than attempting unsafe partial catalogue patches.

## 13. Validation and Test Plan

### Unit tests

- Discover valid storyboard folders, nested domains, cardless stories, and missing roots.
- Reject or report duplicate ids, symlinks, oversized files, malformed front matter, and malformed cards.
- Parse all data-flow and extension vocabulary, including absent optional sections.
- Confirm extension labels are derived and change after reorder without rewriting step files.
- Validate every diagnostic code and its severity.
- Validate Mermaid participant and message order.
- Confirm Mermaid with extensions is opt-in and produces balanced `opt`/`end` blocks.
- Verify front-matter unknown keys survive a changed save.
- Verify an unchanged save does not alter file bytes or mtime.
- Verify story and step stale revisions return a conflict.
- Verify reorder changes only the `steps` order.
- Verify step deletion with and without asset deletion.
- Verify all SVG sanitisation rejection cases.
- Verify long extension-asset names remain valid and collision-resistant.
- Verify standalone HTML has no executable script and inlines supported illustrations.

### Route tests

- Reject unknown storyboard ids.
- Reject traversal, absolute paths, nested asset paths, symlink assets, and disallowed extensions.
- Verify asset MIME types and SVG CSP.
- Verify all write routes fail with read-only configuration.
- Verify create only accepts a root returned by a scan.
- Verify conflict responses include the latest revision.

### Component tests

- Keyboard navigation and boundary behaviour.
- Selection and hover remain synchronised between Strip and Lanes.
- Missing illustrations show a placeholder.
- Validation findings remain visible without hiding the journey.
- Layer toggles reveal data and extensions without changing a storyboard that has neither.
- Presentation mode shows `What happens`, moves with keys, and exits with Escape.
- Conflict dialog supports reload and overwrite.

### End-to-end tests

1. Create a storyboard with the wizard.
2. Add prose and lane hand-offs.
3. Draw and save an editable sketch.
4. Add data annotations and an alternate path.
5. Reorder a step.
6. Reload and verify source files, reader state, Mermaid, and HTML export.
7. Confirm the drawing-editor bundle is not requested until the editor opens.
8. Confirm malformed assets and traversal attempts are rejected.

### CI content gate

Provide a `check:storyboards` command with two modes:

```text
check:storyboards             fail scan errors, structural errors, broken evidence
check:storyboards --strict    additionally fail warnings, drift, and unevidenced stories
```

The command reports each storyboard, provenance state, scan error, and validation problem with a non-zero exit code on failure.

## 14. Delivery Sequence

1. Implement shared types, configuration, scanning, safe parsing, and a content-check command.
2. Implement read-only catalogue, detail service, asset serving, and Strip reader.
3. Add Lanes and Sequence generated views, links, and exports.
4. Add evidence card support, drift/trust panels, and presentation mode.
5. Add safe authoring, revisions, conflict handling, templates, and lazy illustration editing.
6. Add data flow and alternate paths.
7. Add optional AI proposals after the deterministic feature is complete.

## 15. Definition of Done

- Storyboards are discoverable from configured file roots and readable despite advisory defects.
- All content changes are reviewable files under the storyboard folder.
- Reader, authoring, evidence, generated exports, and validation operate from one source model.
- No endpoint accepts a client filesystem path or serves content outside an allowlisted storyboard asset directory.
- Illustrations render safely and editable SVGs round-trip through the editor.
- Concurrent saves fail explicitly rather than overwriting another edit.
- The drawing editor does not load on browse/read paths and has no runtime CDN dependency.
- The normal and strict content checks pass for the repository corpus.
- Unit, route, component, and end-to-end tests cover the behaviours listed above.
