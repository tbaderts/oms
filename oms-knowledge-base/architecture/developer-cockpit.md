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
  - resource: "repo:developer-cockpit/src/main/services/MonitorService.ts"
  - resource: "repo:developer-cockpit/src/shared/prometheusParser.ts"
  - resource: "repo:developer-cockpit/src/renderer/views/monitor/MonitorView.tsx"
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

## Monitoring

The **Monitoring** view (Infrastructure group, SPEC-0053) shows the health and headline metrics of
a running oms-core so a developer can see the system's pulse without leaving the cockpit. It is
read-only: it only *reads* actuator endpoints, never sends commands.

- **Data source.** `MonitorService` (main process) calls the two Spring Boot Actuator endpoints
  that oms-core already exposes (`/actuator/health` for the service state, `/actuator/prometheus`
  for the Micrometer meters, per SPEC-0038/SPEC-0033). The base URL is the configured
  `infrastructure.omsCoreUrl` from Settings (default `http://localhost:8090`), read per poll so a
  settings change applies to the next refresh.
- **Polling.** While the view is open it polls every 10 s (a renderer-side timer, started on mount
  and cleared on unmount); the interval is reset after each response so a slow request cannot stack
  polls. A manual **Refresh** fires immediately and restarts the timer.
- **Tiles.** The `/actuator/prometheus` text is parsed in-process (`parsePrometheus`) into the
  OMS-domain series the tiles display: orders by state, order events (+ a per-minute rate
  derived from the accumulated counter), time-to-ACK and time-to-market (p99, interpolated from
  the Prometheus histogram buckets and therefore approximate), and the outbox pending/stuck/oldest
  age. The `/actuator/health` status (UP / DOWN / OUT_OF_SERVICE) is shown in a dedicated tile.
- **Resilience.** A poll that fails while a previous sample exists keeps the last sample on screen
  and marks it *Connection lost*; a first-ever failure shows an error banner naming the configured
  URL. The raw prometheus text is always available in a read-only pane (truncated at 5 MB) as the
  source of truth for any metric the tiles do not surface.
- **Scope.** JVM/system metrics (`jvm_*` series), historical time series and charting are out of
  scope for this ticket; the raw pane still exposes `jvm_*` if needed.

Context: [System Context](system-context.md).
