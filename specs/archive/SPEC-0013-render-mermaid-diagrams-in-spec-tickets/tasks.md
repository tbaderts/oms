# Tasks — SPEC-0013: Render Mermaid diagrams in spec tickets

> **Stage 3 of 3 — the executable plan.** The implement stage works top to bottom and ticks each
> box only when its `verify:` check passes. Keep tasks small (one focused change, about one
> red→green cycle) and in dependency order:
>
> 1. Contracts (oms-contracts) and regeneration
> 2. Migration (new Liquibase changelog)
> 3. Behaviour, one task per AC or slice: write the failing test, implement, make it green
> 4. Wiring: API, messaging, configuration
> 5. Observability (logs, metrics)
> 6. Knowledge base and docs
> 7. Full verification (`spec verify`)
>
> Format, which the gate parses:
>
> ```
> - [ ] **T-1** Imperative summary (AC-1, AC-2)
>   - files: path/one.java, path/two.yaml
>   - verify: `./gradlew test --tests 'org.example.oms…SomeTest'` passes
> ```
>
> Every AC must be covered by at least one task, and every task needs a `verify:` line. Tasks may
> be added during implementation; record why under Notes.

## Tasks

- [x] **T-1** Add the `mermaid` dependency (AC-8)
  - files: developer-cockpit/package.json, developer-cockpit/package-lock.json
  - verify: `cd developer-cockpit && npm install mermaid@^12.2.0 && npm ls mermaid` shows mermaid 12.x and `npm run typecheck` passes

- [x] **T-2** Write failing component tests for MermaidDiagram via MarkdownContent: success, error, theme, copy, other code unchanged, KB viewer (AC-2, AC-3, AC-4, AC-5, AC-6)
  - files: developer-cockpit/test/renderer/MermaidDiagram.test.tsx
  - verify: `cd developer-cockpit && npx vitest run test/renderer/MermaidDiagram.test.tsx` fails because `MermaidDiagram` does not exist or `language-mermaid` still renders as code

- [x] **T-3** Implement `MermaidDiagram` (lazy import, strict security, theme from `useConfigStore`, render queue + cancellation, loading/ok/error states, copy button) and route `language-mermaid` to it in `MarkdownContent`, unwrapping the `pre` (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6)
  - files: developer-cockpit/src/renderer/components/MermaidDiagram.tsx, developer-cockpit/src/renderer/components/MarkdownContent.tsx
  - verify: `cd developer-cockpit && npx vitest run test/renderer/MermaidDiagram.test.tsx` passes

- [x] **T-4** Add the Spec Tickets test: a design.md with a mermaid fence renders as a diagram in `TicketDetail` read mode (AC-1)
  - files: developer-cockpit/test/renderer/TicketDetail.mermaid.test.tsx
  - verify: `cd developer-cockpit && npx vitest run test/renderer/TicketDetail.mermaid.test.tsx` passes, and fails when the `language-mermaid` branch in MarkdownContent is temporarily removed

- [x] **T-5** Add the security tests: real mermaid output sanitised for script/handlers/click directives, `securityLevel: 'strict'` passed, CSP string unchanged (AC-7)
  - files: developer-cockpit/test/renderer/MermaidDiagram.security.test.tsx
  - verify: `cd developer-cockpit && npx vitest run test/renderer/MermaidDiagram.security.test.tsx` passes (if real rendering cannot run under jsdom, record the fallback from design.md → Risks in Notes)

- [x] **T-6** Build and check the bundle split: mermaid lands in separate chunks, not in the main entry chunk (AC-8)
  - files: (none)
  - verify: `cd developer-cockpit && npm run build` exits 0, and `grep -l "mermaid" dist/renderer/assets/index-*.js` finds no mermaid library code in the entry chunk (only the dynamic import reference)

- [x] **T-7** Runtime check in the Electron app: open SPEC-0013 design.md in Spec Tickets, diagram renders in dark and light themes, copy works, an invalid block shows the error panel; record the observations (AC-1, AC-4, AC-8)
  - files: specs/changes/SPEC-0013-render-mermaid-diagrams-in-spec-tickets/runtime-check.md
  - verify: runtime-check.md records each observation as observed; no CSP violation in the renderer console

- [x] **T-8** Update the cockpit docs: tick Mermaid in the implementation guide, correct the tech-stack row, note Mermaid for Spec Tickets documents in features (no AC; P-19)
  - files: developer-cockpit/spec/10-implementation-guide.md, developer-cockpit/spec/09-tech-stack-options.md, developer-cockpit/spec/03-features.md
  - verify: `grep -n "Mermaid" developer-cockpit/spec/10-implementation-guide.md` shows `[x] Mermaid diagram support`, and 09 names `mermaid` (lazy, client-side)

- [x] **T-9** Run spec verify (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8)
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0013` exits 0

## Notes

- T-2 before T-3 is the test-first red step. T-4 and T-5 add tests after T-3 because they exercise
  existing views (`TicketDetail`) and real mermaid output, which only exist once the component does;
  T-4's verify includes the removal check so the test is shown to fail without the change.
- T-7 needs the app running with a display; if it cannot be run by the agent, the runtime check is
  handed to the maintainer and recorded as such in verification.
- Changed during implementation: T-7's notes go to `runtime-check.md` in the ticket folder, not
  `evidence/`, which only `spec verify` writes (the hook blocks agent edits there).
- Changed during implementation: T-7 found that the copy button claimed success when the clipboard
  write was rejected. Fixed in `MermaidDiagram.tsx`, with an extra test in
  `MermaidDiagram.test.tsx` (AC-5). The parse error message now renders preformatted.
- Changed during verify (independent review, finding 1): `mermaid.render` removes any element with
  the target id before rendering, and the SVG on screen carried the same `useId`-based id. A re-render
  therefore deleted the live diagram, and a quick dark→light→dark toggle could leave it blank. Each
  render attempt now gets its own id (`<id>-<n>`). Test:
  `MermaidDiagram.test.tsx#keeps the diagram on screen when re-rendering for a theme switch`
  (red before the fix). Implement was reopened for this; the app was rebuilt and re-checked
  (runtime-check.md).
