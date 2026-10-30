# Verification — SPEC-0013: Render Mermaid diagrams in spec tickets

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests below ran and passed in the latest `spec verify` (`evidence/developer-cockpit-2.log`:
47 files / 226 tests passed, plus the perf run). Runtime observations are in `runtime-check.md`.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | mermaid block in a spec ticket document renders as SVG in Spec Tickets | `TicketDetail.mermaid.test.tsx#renders a mermaid block in design.md as a diagram`: real `TicketDetail` + design.md tab shows `mermaid-diagram` with `<svg>`, not inside `<pre>`, no `code.language-mermaid`, render called with the exact source; fails with the branch removed (T-4 check). Runtime: SPEC-0013's design.md renders in the built app (runtime-check #1) | PASS |
| AC-2 | same in the KB viewer | `MermaidDiagram.test.tsx#renders mermaid in the knowledge-base DocumentViewer`; runtime-check #3 | PASS |
| AC-3 | invalid syntax → error + source, rest renders | `MermaidDiagram.test.tsx#shows error and source for invalid syntax and keeps rendering the rest` (`role=alert` with message and source, following heading present); runtime-check #3 with Mermaid's real parse error | PASS |
| AC-4 | dark/default theme, re-render on switch | `MermaidDiagram.test.tsx#uses the dark theme in dark mode and re-renders on theme switch` (initialize `dark`, then `default` and a second render after the store changes) and `#keeps the diagram on screen when re-rendering for a theme switch` (each attempt uses a fresh id, and the SVG stays on screen after the switch); runtime-check #1/#2 | PASS |
| AC-5 | copy puts the exact source on the clipboard | `MermaidDiagram.test.tsx#copies the exact source to the clipboard` (multi-line source, no trailing newline) and `#reports a failed copy instead of claiming success`; runtime-check #4 (Windows clipboard stores CRLF line breaks, which is a platform convention) | PASS |
| AC-6 | other code blocks / inline code unchanged | `MermaidDiagram.test.tsx#leaves other code blocks and inline code unchanged` (`pre > code.language-java` with block classes, inline `<code>` classes, render not called); full existing suite green | PASS |
| AC-7 | no script runs; strict; CSP unchanged | `MermaidDiagram.security.test.tsx#sanitises script and handlers in diagram text` (real mermaid 12.2.0: no `<script>`, no `on*` attributes, no `javascript:`, global not set, `securityLevel: 'strict'`). The same vectors survive under `loose`, so the test can fail. The test does not use the proposal's example `<img src=x onerror=…>`, because Mermaid waits for label images to load, which never happens in jsdom. An `onmouseover` handler stands in for it. AC-7 says "e.g.", and the same sanitiser handles both. `#keeps the CSP unchanged`. Runtime: no CSP violations (runtime-check #5) | PASS |
| AC-8 | typecheck, tests, build pass; real ticket renders in the running app | `evidence/last-run.json`: typecheck exit 0, test exit 0. `npm run build` exit 0 on the final code (it is not one of the module's spec-verify commands, so it was run by hand), with Mermaid in separate chunks (T-6). runtime-check #1–#6 and the re-check on the final build | PASS |

## Goal Assessment

Goal: *"I like to see mermaid diagrams rendered in the spec tickets feature when reviewing specs."*
Met. In Spec Tickets, ticket documents in read mode show ` ```mermaid ` blocks as diagrams. Tests
prove this, and so does the running app on this ticket's own design.md. They follow the theme, a
broken diagram cannot hide the rest of the document, and the source can still be copied. The KB
viewer gets the same rendering because it shares the component.

Left out on purpose, per the proposal: the document editor (Monaco) shows Mermaid source while you
type, and the diagram appears in read mode after saving. That does not affect reviewing.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | no contract files touched |
| P-02 | Specification before code, generated models only | PASS | behaviour specified in `developer-cockpit/spec/03-features.md` and this ticket before code; no models |
| P-03 | Never edit generated code | N/A | no generated code |
| P-04 | Contracts evolve compatibly | N/A | no contract change |
| P-05 | Every state change is recorded in the event log | N/A | no order state |
| P-06 | Kafka only through the transactional outbox | N/A | no Kafka |
| P-07 | Schema changes through new Liquibase changesets | N/A | no database |
| P-08 | Concurrency and idempotency are explicit | N/A | no persistence/messaging. UI render races handled by `renderQueue` + `cancelled` flag in `MermaidDiagram.tsx` |
| P-09 | Commands and queries stay separate | N/A | no OMS API |
| P-10 | State transitions go through the state machine and task pipeline | N/A | no order state |
| P-11 | Layering and conventions | PASS | shared component in `components/`; theme via `useConfigStore` as `FilePreview` does; Tailwind tokens, lucide icons, test layout as existing renderer tests |
| P-12 | Jackson 3 only | N/A | no Java |
| P-13 | Errors and validation follow the framework specs | PASS | render and clipboard errors are caught, shown in the UI and logged with `console.error`; none swallowed |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | T-2 red run recorded (4 of 5 failed for the right reason) before T-3; every AC has a passing test above |
| P-15 | Observability | N/A | renderer-only UI; no backend flow |
| P-16 | Security | PASS | `securityLevel: 'strict'` explicit; CSP unchanged (tested); sanitisation proven with real Mermaid; no secrets |
| P-17 | Simplicity and dependencies | PASS | one dependency (`mermaid@^12.2.0`), decision recorded in design.md. The R10 warning names `oms-mcp-server/build.gradle`, an uncommitted change from other work on this branch, not part of this ticket |
| P-18 | Modules build standalone | PASS | developer-cockpit typecheck + test (spec verify) and `npm run build` pass; no other module touched |
| P-19 | Documentation follows behaviour | PASS | cockpit spec pages 03/09/10 updated; no OMS domain change, so no `oms-knowledge-base/` page |

## Independent Review

The spec-reviewer agent judged the goal met: all ACs proven, with AC-8 weak at the time. It raised
five minor findings:

1. **Re-render reused the Mermaid id.** `mermaid.render` removes the element with the target id,
   which deleted the live SVG on each re-render and could leave it blank after a quick theme
   toggle.
   - **Fixed:** each attempt gets a fresh id, and a test that was red before the fix covers it.
   - Implement was reopened, and spec verify re-ran.
2. **The runtime check had used a build older than the final code**, and the build result was not
   in the automated evidence.
   - **Fixed:** rebuilt on the final code (exit 0) and re-checked in the app (runtime-check.md,
     "Re-check on the final build").
   - The build is still not one of the module's spec-verify commands; changing
     `specs/config.json` is out of scope for an agent.
3. **The AC-7 test swaps out the `<img onerror>` example.** **Accepted** and recorded under AC-7
   above.
4. **`developer-cockpit/package.json` also holds an unrelated, uncommitted dev-port change**
   (5173→5180, `concurrently -k`). It belongs with the uncommitted `vite.config.ts` /
   `src/main/index.ts` edits, not with this ticket.
   - **Open for the commit:** stage only the `mermaid` line (or commit the port change separately).
5. **verification.md was unfilled.** **Done** (this document).

## Automated Evidence

`evidence/last-run.json`: ran 2026-10-29T04:10:58Z (after the last code change), result **pass**,
module developer-cockpit. `npm run typecheck` exit 0 (9 s, `developer-cockpit-1.log`); `npm test`
exit 0 (31 s, `developer-cockpit-2.log`: 47 files / 226 tests, plus 1 perf test). Policy check PASS with 0 errors
and 1 warning (R10 on `oms-mcp-server/build.gradle`, not this ticket). `npm run build` (not part of
spec verify) exit 0, run during T-6, before the runtime check, and again on the final code.

## Follow-ups

- Pre-existing: the cockpit status bar shows *Disconnected*. The renderer connects to
  `ws://localhost:9321`, which goes to IPv4, while the WebSocket server only listens on IPv6.
- Pre-existing: the KB tree shows root-level `.md` files of `oms-knowledge-base/` as folders.
- Consider adding `npm run build` to developer-cockpit's verify commands in `specs/config.json`
  (maintainer decision), so build breakage shows up in spec-verify evidence.
- Optional: zoom/pan/export for large diagrams, and live diagram preview in the editor (out of
  scope in the proposal).

## Verdict

Verdict: GOAL MET
