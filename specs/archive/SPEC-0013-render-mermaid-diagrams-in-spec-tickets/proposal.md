# Proposal — SPEC-0013: Render Mermaid diagrams in spec tickets

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The requester: *"I like to see mermaid diagrams rendered in the spec tickets feature when reviewing
specs."*

Today (developer-cockpit) every spec document in the Spec Tickets view (`TicketDetail`, read mode)
and every knowledge-base page (`knowledge-base/DocumentViewer`) is rendered by one shared component,
`src/renderer/components/MarkdownContent.tsx` (react-markdown + remark-gfm + rehype-highlight). A
` ```mermaid ` fence is treated like any other code block: the reviewer sees the diagram source,
syntax-highlighted, not the diagram. `mermaid` is not a dependency of the cockpit.

That matters because diagrams are part of what gets reviewed: the design template
(`specs/templates/design.md`) asks for Mermaid, and the designs of SPEC-0001…0004 and 0007…0012
contain Mermaid blocks, as do most knowledge-base concept pages. Reviewers today have to read
sequence and state diagrams as text, or open the file in another tool (VS Code preview,
oms-kb-explorer), to review a design. The cockpit's own feature spec already lists the capability
(`developer-cockpit/spec/03-features.md` §Knowledge Base "Mermaid diagram support (rendered
inline)"; `10-implementation-guide.md` has it unticked).

Doing nothing keeps design review split across tools, which is the opposite of the cockpit's
purpose as the single workbench for the spec workflow.

## What Changes

- In developer-cockpit, a fenced code block whose language is `mermaid` is rendered as a diagram
  (SVG) wherever `MarkdownContent` is used: the spec ticket documents in Spec Tickets (read mode) and
  the knowledge-base document viewer.
- Diagrams follow the cockpit theme: the dark Mermaid theme when the app is in dark mode, the default
  theme in light mode, and they re-render when the theme is switched.
- A diagram with invalid Mermaid syntax does not break the page: the block shows an error message and
  the diagram source, and the rest of the document renders normally.
- A rendered diagram keeps a way to see or copy its source (reviewers sometimes need the text).
- All other code blocks render exactly as today.
- New runtime dependency `mermaid` in developer-cockpit only. Nothing is **BREAKING**.

## Scope

### In scope

- Mermaid rendering in `MarkdownContent` (and so in Spec Tickets and the KB viewer of the cockpit).
- Theme handling, error fallback, copy/view source.
- Keeping the existing Content-Security-Policy (`script-src 'self'`) intact; Mermaid runs in its
  default `strict` security level (no click handlers or scripts from diagram text).
- Automated tests for every AC; a runtime check in the built app against a real ticket with diagrams.
- Ticking "Mermaid diagram support" in `developer-cockpit/spec/10-implementation-guide.md` and
  correcting the library named in `09-tech-stack-options.md`.

### Out of scope

- Live preview of diagrams inside the document editor (Monaco edit mode / Source tab) while typing.
- Zoom, pan, full-screen or export (PNG/SVG) of diagrams.
- Storyboard Mermaid export (`spec/11-storyboards.md` §8): a separate feature.
- Other diagram languages (PlantUML, Graphviz, …).
- oms-kb-explorer and other modules: they are untouched (oms-kb-explorer already renders Mermaid).

## Acceptance Criteria

- **AC-1** — Given a spec ticket whose design.md contains a ` ```mermaid ` block with valid syntax,
  when the document is shown in read mode in Spec Tickets, then the block is rendered as an SVG
  diagram and the Mermaid source text is not shown as a code block in its place.
- **AC-2** — Given a knowledge-base document with a valid ` ```mermaid ` block, when it is opened in
  the cockpit's knowledge-base viewer, then the block is rendered as an SVG diagram (same component as
  AC-1).
- **AC-3** — Given a ` ```mermaid ` block with invalid syntax followed by other Markdown content, when
  the document is rendered, then the block shows an error indicator together with the diagram source,
  and the content after it is rendered normally (no crash, no error boundary).
- **AC-4** — Given the cockpit is in dark mode, when a diagram is rendered, then Mermaid is
  initialised with its `dark` theme; given light mode, with its `default` theme; and when the theme is
  switched while a diagram is shown, then the diagram is re-rendered with the new theme.
- **AC-5** — Given a rendered diagram, when the user activates its copy-source control, then the exact
  Mermaid source of that block is written to the clipboard.
- **AC-6** — Given a document with a fenced code block in another language (e.g. ` ```java `) and an
  inline code span, when it is rendered, then both render as before (highlighted `<code>` block /
  inline code), unaffected by the change.
- **AC-7** — Given Mermaid diagram text that contains a script or event handler (e.g.
  `<img src=x onerror=alert(1)>` in a node label or a `click` directive), when it is rendered, then no
  script runs and the rendered SVG contains no `<script>` element or `on*` attributes (Mermaid
  `securityLevel: 'strict'`); the CSP in `src/renderer/index.html` is unchanged.
- **AC-8** — Given the change, when `npm run typecheck` and `npm test` run in developer-cockpit and the
  app is built (`npm run build`), then all pass and a real ticket's design.md with Mermaid blocks shows
  rendered diagrams in the running app (runtime check recorded in evidence).

## Impact

| Area | Impact |
|---|---|
| Modules | developer-cockpit |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | none |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | none; the renderer change is internal to the cockpit |
| Knowledge base | none in oms-knowledge-base; cockpit spec pages `developer-cockpit/spec/10-implementation-guide.md` (tick item) and `09-tech-stack-options.md` (library) |

## Open Questions

- [resolved] Render in the renderer (client-side `mermaid`) or at build time (`rehype-mermaid`, which
  needs a headless browser)? → assumption: client-side `mermaid`, as oms-kb-explorer already does;
  cheap to reverse and confined to one component. Recorded for the design.
- [resolved] Should the KB viewer also get diagrams, or only Spec Tickets? → assumption: both, since
  they share `MarkdownContent` and excluding the KB viewer would take extra code; reversible.
- [resolved] Bundle size: Mermaid is large. → assumption: load it lazily (dynamic import) on the first
  document that contains a diagram, so startup is unaffected; the design states how.
- [deferred] Rendering diagrams in the editor's live preview while editing → out of scope; the read
  view after save is enough for review, which is the goal.
