---
type: Component
title: "Developer Cockpit"
description: "Electron desktop tool for the spec workflow, the knowledge base, requirements and storyboards."
tags: [component, electron, tooling, storyboards]
status: draft
component: "developer-cockpit"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-29T12:00:00Z" }
sources:
  - resource: "repo:developer-cockpit/src/main/index.ts"
  - resource: "repo:developer-cockpit/src/main/services/RequirementsService.ts"
  - resource: "repo:developer-cockpit/src/main/storyboards/StoryboardService.ts"
  - resource: "repo:developer-cockpit/src/main/ipc/storyboards.ipc.ts"
  - resource: "repo:developer-cockpit/src/main/storyboards/cli/checkStoryboards.ts"
  - resource: "repo:developer-cockpit/test/main/StoryboardService.writes.test.ts"
---
# Developer Cockpit

Reads `functional-requirements/` and `non-functional-requirements/` of this knowledge base for
its Requirements view. Not part of the runtime system.

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
  repository's storyboards.

Context: [System Context](system-context.md).
