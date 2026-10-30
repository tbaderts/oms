# Runtime check — SPEC-0013

Built app (`npm run build`, then `electron . --remote-debugging-port=9333`), driven through the
Chrome DevTools Protocol, 2026-10-29. `ELECTRON_RUN_AS_NODE` had to be unset (the VS Code terminal
sets it). Screenshots were taken but are not committed (media).

| # | Check | Observed | ACs |
|---|---|---|---|
| 1 | Spec Tickets → SPEC-0013 → design.md tab, dark theme | 1 `[data-testid=mermaid-diagram]` with an `<svg>`; 0 `code.language-mermaid`; 0 error panels; `<html class="dark">`; Mermaid dark palette | AC-1, AC-4 |
| 2 | Theme switched to Light in Settings, back to design.md | `<html class="light">`; node fill `rgb(236, 236, 255)` (Mermaid `default` theme) | AC-4 |
| 3 | KB viewer, temporary page `oms-concepts/zz-mermaid-runtime-check.md` with a valid sequence diagram, an invalid flowchart (`A -->>> INVALID`) and a heading after it (page deleted afterwards) | 1 rendered SVG; error panel "Diagram could not be rendered" with Mermaid's parse error and the source; heading "After the invalid diagram" rendered | AC-2, AC-3 |
| 4 | Copy diagram source on the valid KB diagram (focus emulated) | clipboard = the block's source; icon switches to the check mark. The Windows clipboard stores line breaks as CRLF, so it reads back with `\r\n` | AC-5 |
| 5 | Renderer console during 1–4 | no Content-Security-Policy violations. Only messages: Mermaid parse error (expected, from 3) and the pre-existing `ws://localhost:9321` connection refusal (see Findings) | AC-7, AC-8 |
| 6 | Build output | `mermaid.core-*.js` (686 kB) and diagram chunks separate; entry `index-*.js` (270 kB) contains no Mermaid code | AC-8 |

### Re-check on the final build

After the review fix (fresh render id per attempt) and the error-message fix, the app was rebuilt
(`npm run build`, exit 0) and checked again. SPEC-0013 design.md in Spec Tickets: 1 diagram with SVG,
dark theme. A temporary KB page with an invalid flowchart (deleted afterwards): error message in a
`<pre>` with `white-space: pre-wrap`; the following heading rendered. No CSP violations.

## Findings during the check

- **Fixed:** `navigator.clipboard.writeText` rejects when the window is not focused. The copy button
  showed success anyway and the rejection went unhandled. It now shows the check mark only on
  success and logs the failure. Test: `MermaidDiagram.test.tsx#reports a failed copy instead of
  claiming success`.
- **Fixed:** the parse error message lost its line breaks (caret line); it now renders preformatted.
- **Not this ticket:** Mermaid's layout overlaps two parallel labelled edges in design.md's
  Approach flowchart. The labels fit their boxes, so this is Mermaid's Dagre layout, not the
  renderer.
- **Not this ticket (pre-existing):** the status bar shows *Disconnected*. The renderer connects to
  `ws://localhost:9321`, which resolves to IPv4, while the server only accepts on IPv6 (`[::1]:9321`).
- **Not this ticket (pre-existing):** the KB tree lists root-level `.md` files (`index.md`,
  `log.md`, …) as folders.
