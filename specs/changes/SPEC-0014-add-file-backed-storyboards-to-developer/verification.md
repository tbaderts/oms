# Verification — SPEC-0014: Add file-backed storyboards to developer cockpit

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

**Where the evidence is.**
- *Unit and component tests* are vitest files under `developer-cockpit/test/`. All of them ran and
  passed in the latest `spec verify` (`evidence/developer-cockpit-2.log`: 427 passed, 2 skipped).
- *E2e* is Playwright on the built Electron app, `npm run test:e2e`; the latest run passed 5 of 5
  (`verify-logs/e2e.log`).
- The 2 skipped cases need **file** symlinks, which this Windows machine cannot create without
  Developer Mode. The same refusals are proven on every OS by `test/main/storyboardSymlinks.test.ts`
  (lstat reports a symlink) and `test/main/storyboardContainment.test.ts` (junctions).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Scan: roots, nested domains, cardless, sorted; scan errors for duplicate, symlink, oversized, missing root | `StoryboardService.scan.test.ts#discovers roots, nested domains, cardless…`, `#expands * segments…`, `#reports malformed story…`; `storyboardSymlinks.test.ts#a symlinked story.md is a scan error…`; `storyboardContainment.test.ts#a linked assets/ folder is a scan error…` | PASS |
| AC-2 | Exactly one problem per defect, with its severity; a broken storyboard still opens | `StoryboardService.detail.test.ts#reports exactly one problem per defect, with its severity, for all 11 codes` (exact code:severity:step list), `#a broken storyboard still opens…`; `storyboardValidate.test.ts` (one case per code) | PASS |
| AC-3 | Reorder relabels alternate paths (3a/3b) and rewrites only `steps` | `StoryboardService.writes.test.ts#reorder relabels extensions and rewrites only the steps list` (step files byte-identical; story.md differs only in the `steps` block) | PASS |
| AC-4 | Unknown keys survive; unchanged save keeps bytes and mtime; stale revision → conflict with latest revision (story and step) | `writes.test.ts#save keeps unknown front-matter keys, comments and flow style…`, `#save keeps unknown keys (story)…`, `#an unchanged save writes nothing…`, `#a stale revision conflicts… (step)`, `#a stale revision conflicts (story)` (file unchanged, `latestRevision` = current); through the real editor path: `stepDraft.roundtrip.test.ts#a title-only edit changes exactly the title line` | PASS |
| AC-5 | Read-only rejects every write with no change on disk; `create` only with a scanned `rootId` | `writes.test.ts#read-only rejects every write and changes nothing on disk` (7 operations, tree snapshot equal), `#create rejects unknown roots…`; `storyboards.ipc.test.ts#create accepts only a rootId from the scan, never a path` | PASS |
| AC-6 | Delete keeps files (orphan) or removes only the assets no other step uses | `writes.test.ts#delete without deleteAssets keeps the file and assets and reports an orphan`, `#delete with deleteAssets removes the step file and only the assets no other step uses` | PASS |
| AC-7 | Assets: refuse unknown id, traversal, absolute, nested, symlink, extension, oversize; types, SVG CSP | `storyboardAssets.test.ts` (all refusal cases, `#serves an SVG with an explicit type, a restrictive CSP and nosniff`, `#serves raster images…`, `#refuses an assets folder that is a link…`); `storyboardSymlinks.test.ts#a symlinked asset file is refused` | PASS |
| AC-8 | Unsafe SVGs rejected and nothing written; an Excalidraw SVG is saved byte for byte and reopens with its scene | `svgSafety.test.ts` (script, `on*`, `foreignObject`, external href/xlink, CSS `url`, quoted/escaped CSS, `image-set`, presentation attributes, `xml:base`, DOCTYPE, size; accepts real Excalidraw exports); `writes.test.ts#saveIllustration writes an Excalidraw SVG byte for byte…`, `#saveIllustration rejects unsafe SVGs and bad names, and writes nothing`; e2e `storyboards.authoring.spec.ts` step 8 (reopens with its scene) | PASS |
| AC-9 | Mermaid: lane order, actor/participant, every step as message or note, fallback participant, opt-in balanced `opt` | `storyboardMermaid.test.ts` (7 cases) | PASS |
| AC-10 | Standalone HTML: no script, no `on*`, no external or protocol URLs; steps in order; inline SVG; fallback; data; alternate paths; sequence; PDF | `StoryboardExport.test.ts#produces a standalone, script-free handout…`, `#falls back to the Mermaid source…`; e2e `storyboards.export.spec.ts#html export from the reader` (real Mermaid SVG inlined, no remote refs), `#pdf export` (`%PDF-`, > 1000 bytes) | PASS |
| AC-11 | Drift on committed change, uncommitted ignored, human-verified tier, missing `kb_links` broken | `EvidenceService.test.ts` (10 cases on a temporary git repo, including `#a git timeout leaves drift unknown…`) | PASS |
| AC-12 | Keys and boundaries; keys ignored in inputs; Strip/Lanes share selection and hover; placeholder; checks above the journey | `StoryboardReader.test.tsx` (12 cases) | PASS |
| AC-13 | Presentation: title, illustration or placeholder, only "What happens", progress; arrows; Esc | `StoryboardPresentation.test.tsx` (4 cases) | PASS |
| AC-14 | Conflict dialog Reload/Overwrite; quick fixes through the save path | `StoryboardStepEditor.test.tsx#on a stale revision, Overwrite resends…`, `#…Reload drops the draft…`, `Quick fixes#…through saveStep`, `#a quick fix on a stale revision opens the conflict dialog` | PASS |
| AC-15 | Excalidraw chunk not loaded while reading; loads from local files on open; no remote request | e2e `storyboards.lazy.spec.ts#editor chunk loads only on open and never from remote` | PASS |
| AC-16 | Wizard → prose, hand-offs, sketch, data, alternate path, reorder, reload → files, reader, Mermaid, HTML | e2e `storyboards.authoring.spec.ts#wizard to export round trip` (files on disk, reader including the Data region, Mermaid `opt 3a`, HTML data rows, sketch reopens) | PASS |
| AC-17 | `check:storyboards` normal and strict exit 0 on the repo; fail modes on fixtures | `checkStoryboards.test.ts` (6 cases, including the repository corpus); `verify-logs/check-storyboards.log`, `verify-logs/check-storyboards-strict.log` (exit 0, `trust=evidenced drift=current 0 error(s), 0 warning(s)`) | PASS |
| AC-18 | Suggest links filtered to the index; context bounded; no file writes; hidden without a key | `StoryboardAiService.test.ts` (9 cases), `StoryboardAiMenu.test.tsx#are hidden when no provider is configured`, `#apply a proposal to the draft only…` | PASS |

## Goal Assessment

> Developer Cockpit can discover, read, validate, author, present and export file-backed
> storyboards as described in `source-spec.md`, adapted to this repo and reconciled with
> `11-storyboards.md`. Done when storyboards stored as plain files in the repo open in the cockpit
> even if they have defects, every edit is a reviewable file diff, nothing from the browser is used
> as a filesystem path, and both the normal and strict content checks pass on the repository's
> storyboards.

**Each condition, with its evidence:**
- **Open in the cockpit despite defects.** All 11 validation codes are advisory, and a storyboard
  with every defect still opens (AC-2). Broken stories and cards are scan errors that never hide
  the others (AC-1).
- **Every edit is a reviewable file diff.**
  - Saves rewrite only the keys that change, and the editor sends only what the user changed
    (`stepDraft.roundtrip.test.ts`: a title edit is a one-line diff).
  - Reorder touches only the `steps` block; unchanged saves write nothing.
  - The first review found the editor rewrote untouched keys; that was fixed and re-reviewed.
- **Nothing from the browser is used as a filesystem path.**
  - No IPC channel takes a path, and storyboards are named by id.
  - Assets are served by id and flat name.
  - Writes and deletes are confined to the storyboard folder even when the repository contains
    linked folders. The independent review found and re-checked that last part (findings 1 and
    its `create()` residual).
- **Both content checks pass on the repository.** Normal and `--strict` exit 0 (AC-17).

**Fit with the spec.** The implementation covers source-spec §§1–15 with the adaptations agreed in
the proposal: IPC instead of HTTP, the knowledge-base root, monorepo evidence, and the repository's
link sources. `11-storyboards.md` is rewritten to match.

**Left out on purpose** (the proposal's Out of scope): MCP exposure, fuzzy search over prose, a
WYSIWYG editor, and showing storyboards in `oms-kb-explorer` or `oms-ui`.

**No material gap remains.**

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contract files added or changed; the contracts are only read for the link index |
| P-02 | Specification before code, generated models only | PASS | `source-spec.md`, proposal and design came before the code; `11-storyboards.md` describes the result. No OpenAPI or Avro models involved |
| P-03 | Never edit generated code | PASS | No generated sources touched; the copied Excalidraw fonts are a gitignored build output |
| P-04 | Contracts evolve compatibly | N/A | No contract change; `CockpitConfig.storyboards` is additive and filled from defaults (`ConfigService.test.ts#a saved config without a storyboards section gets the defaults`) |
| P-05 | Every state change is recorded in the event log | N/A | No OMS state |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka; `storyboards:changed` is on the cockpit's local WebSocket |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database |
| P-08 | Concurrency and idempotency are explicit | PASS | Revision tokens on every write with `latestRevision` on conflict (AC-4); atomic temp file and rename; unchanged saves write nothing; the change event is idempotent (full rescan) |
| P-09 | Commands and queries stay separate | PASS | Read channels (scan, detail, links, backlinks, exports) never write; writes are separate channels |
| P-10 | State transitions go through the state machine and task pipeline | N/A | Storyboards only reference order-state transitions |
| P-11 | Layering and conventions | PASS | Shared types → `src/main/storyboards` (no Electron) → `ipc/storyboards.ipc.ts` → preload → zustand store → lazy view, as in the existing views; file-layout deviations recorded in design |
| P-12 | Jackson 3 only | N/A | No Java |
| P-13 | Errors and validation follow the framework specs | PASS | Inputs validated in the service, behind the IPC boundary; results are the typed `StoryboardResult`; thrown file-system errors become `{ ok: false }` (`storyboards.ipc.test.ts#turns a file-system error…`) |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC maps to tests that ran and passed (table above); tests were written before each slice's code |
| P-15 | Observability | PASS | `[storyboards]`-prefixed logs for scans (count, duration, errors), writes, conflicts, rejected illustrations and assets, exports, git failures; no file contents or secrets logged |
| P-16 | Security | PASS | No client paths. Id and slug validation. Symlink and junction containment for reads, writes, deletes and create (fixed after the review). SVG reject rules covering attributes and CSS. Asset CSP and nosniff. Markdown without raw HTML. Script-free export. API key only from an env var and only in main. The re-review's last P-16 item (`create()` through a linked domain) is fixed: `storyboardContainment.test.ts#create refuses a domain path…` |
| P-17 | Simplicity and dependencies | PASS | Each new dependency is justified in design → Alternatives & Decisions (`yaml`, `@xmldom/xmldom`, `@excalidraw/excalidraw`, `roughjs`, direct `unified`/`remark`/`rehype`, dev `@playwright/test`); no AI SDK, no HTTP server. The policy-check warning about `oms-mcp-server/build.gradle` comes from earlier uncommitted work, not this ticket |
| P-18 | Modules build standalone | PASS | `developer-cockpit` typecheck, test and build pass on their own. `tools/okf-check` keeps its own suite green (22/22, `verify-logs/okf-check-test.log`) and the bundle check is clean (`verify-logs/okf-check-bundle.log`) |
| P-19 | Documentation follows behaviour | PASS | `architecture/developer-cockpit.md`, the `okf-conventions.md` exclusion, `log.md`, `storyboards/README.md`, `11-storyboards.md` rewritten, and spec pages 03/04/05/README updated |

## Independent Review

The `spec-reviewer` agent reviewed twice: a full review, then a re-check after the fixes.

**First review: NOT MET.** 1 blocking, 2 major and 9 minor findings.

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | blocking | Writes and deletes followed a linked `steps/` or `assets/` folder out of the storyboard; `deleteStep` used a non-slug id from `story.md` | Fixed (see below) |
| 2 | major | The step editor sent all keys, so untouched keys were rewritten | Fixed: `stepDraft.patchFromDraft` sends only the changed keys; empty values count as absent; `stepDraft.roundtrip.test.ts` |
| 3 | major | The SVG checker missed external references in presentation attributes, quoted or escaped CSS, `image-set` and `xml:base` | Fixed: every attribute and all CSS checked; new cases in `svgSafety.test.ts`; e2e HTML export confirms the real Mermaid SVG still inlines |
| 4 | minor | A blank line and reversed order when appending keys | Fixed (`frontMatter.test.ts`) |
| 5 | minor | A flow root or a shared-line key lost data; a trailing comment was dropped | Fixed: refused as `invalid`, comment kept (`frontMatter.test.ts`) |
| 6 | minor | The closing `---` was not anchored to a line start | Fixed (`frontMatter.test.ts`) |
| 7 | minor | AC-2 exactness and the story-conflict assertions were weak | Fixed (`detail.test.ts`, `writes.test.ts`) |
| 8 | minor | AC-16 did not check data in the reader or HTML | Fixed (`storyboards.authoring.spec.ts`) |
| 9 | minor | File-system errors could reject IPC calls | Fixed: `handle()` wrapper plus test |
| 10 | minor | The repository-corpus test fails after committed changes to cited code | Kept on purpose, because drift should go red; the failure message now names the re-pin remedy. The reviewer accepted this |
| 11 | minor | The dev port changed to 5180 | Not this ticket: `package.json` and `vite.config.ts` were already modified before SPEC-0014 started. The reviewer withdrew the finding |
| 12 | minor | `verification.md` unfilled; no e2e evidence recorded | This document; supplementary logs in `verify-logs/` |

**How finding 1 was fixed.** `folderState()` and `assertContained()` now confine every write. A
linked folder is a scan error, its steps are unreadable and its illustrations count as missing.
`deleteStep` requires a slug id, and `_templates/` and `_library/` are used only when they are real
folders. Tests: `storyboardContainment.test.ts` (junctions) and `storyboardSymlinks.test.ts`.

**Re-check: NOT MET, for one residual.** Findings 2–11 were confirmed resolved, but `create()` still
wrote through a linked **domain** folder. That is fixed: each domain segment is checked before
`mkdir`, with `storyboardContainment.test.ts#create refuses a domain path that runs through a
linked folder…`. The reviewer stated that this fix, plus this document, was all that stood between
the ticket and MET.

## Automated Evidence

**`spec verify`** (`evidence/last-run.json`): ran at 2026-10-29T14:40:50Z, result `pass`,
fingerprint `eb2022f5ded8c99a`, modules `developer-cockpit` and `oms-knowledge-base`.
- Policy check: PASS. Its one warning is the earlier `oms-mcp-server/build.gradle` change, not this
  ticket.
- `npm run typecheck`: exit 0 (`evidence/developer-cockpit-1.log`).
- `npm test`: exit 0, 427 passed and 2 skipped (file-symlink cases), plus the performance test
  (`evidence/developer-cockpit-2.log`).

**Earlier verify runs in this stage:**
- One run failed on an unrelated timing test, `SpecTicketsService.documents.test.ts#draft gate
  result is available within 2 s` (5.9 s under load). It passed in the full run just before and in
  the next verify run, and it does not touch storyboard code.

**Not covered by `spec verify`, run separately after the last code change:**
- `npm run test:e2e`: 5 of 5 passed (`verify-logs/e2e.log`).
- `npm run check:storyboards` and `-- --strict`: exit 0 (`verify-logs/check-storyboards*.log`).
- `tools/okf-check`: `npm test` 22 of 22, bundle check 0 errors over 135 concepts
  (`verify-logs/okf-check-*.log`).

## Follow-ups

- **Expose storyboards through `oms-mcp-server`.** Until then its `DocumentRepository` also walks
  the storyboard files under `oms-knowledge-base/`. This is the planned follow-up from the proposal.
- **Add `npm run check:storyboards` to `developer-cockpit.verify` in `specs/config.json`**, and
  decide whether `npm run test:e2e` belongs there. The file is human-owned.
- **Add `tools/okf-check` as a module in `specs/config.json`**, so that `spec verify` runs its tests.
  This ticket changed it.
- **`@excalidraw/excalidraw` 0.18.1 `npm audit` advisories** (design → Risks): upgrade when fixed
  versions ship.
- **Re-pin the evidence card** for `place-and-fill-order` after future committed changes to the
  cited code (`oms-knowledge-base/storyboards/README.md`).
- **Human review.** Have someone walk *Place and fill a client order* end to end and add a
  `human:` verification, which raises it to human-verified.

## Verdict

Verdict: GOAL MET
