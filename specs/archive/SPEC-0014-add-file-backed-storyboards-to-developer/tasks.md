# Tasks — SPEC-0014: Add file-backed storyboards to developer cockpit

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

All paths are relative to the repository root. `vt <file>` below means
`cd developer-cockpit && npx vitest run <file>`.

### Setup and spike

- [x] **T-1** Add the dependencies `yaml`, `@xmldom/xmldom`, `roughjs`, `@excalidraw/excalidraw`, `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-stringify` and the devDependency `@playwright/test`, with exact versions pinned (P-17)
  - files: developer-cockpit/package.json, developer-cockpit/package-lock.json
  - verify: `cd developer-cockpit && npm ci && npm run typecheck && npm test` passes
- [x] **T-2** Spike: self-host the Excalidraw assets (`scripts/copy-excalidraw-assets.mjs` as `predev`/`prebuild`, gitignored `src/renderer/public/excalidraw-assets/`) and confirm that a throwaway lazy `IllustrationEditor` mounts in the built app under the current CSP; record the outcome under design → Risks (AC-15)
  - files: developer-cockpit/scripts/copy-excalidraw-assets.mjs, developer-cockpit/package.json, developer-cockpit/.gitignore, developer-cockpit/src/renderer/index.html
  - verify: `cd developer-cockpit && npm run build` passes, `dist/renderer/excalidraw-assets/` exists, and the editor renders in `npm start` with no CSP error in the console
- [x] **T-3** Add the Playwright Electron harness (`e2e/playwright.config.ts`, `e2e/fixtures.ts` launching `dist/main/index.js` against a temporary workspace through `COCKPIT_WORKSPACE_ROOT`) and the `test:e2e` script, with a smoke spec that opens the app (AC-15, AC-16)
  - files: developer-cockpit/e2e/playwright.config.ts, developer-cockpit/e2e/fixtures.ts, developer-cockpit/e2e/smoke.spec.ts, developer-cockpit/package.json, developer-cockpit/src/main/services/ConfigService.ts
  - verify: `cd developer-cockpit && npm run test:e2e -- smoke.spec.ts` passes

### Shared model and pure logic

- [x] **T-4** Add the shared types (`types/storyboards.ts`), the `storyboards` config section with defaults, and `resolveStoryboardsConfig` with the env overrides; write `test/main/ConfigService.test.ts#storyboards defaults and env overrides` first (AC-5)
  - files: developer-cockpit/src/shared/types/storyboards.ts, developer-cockpit/src/shared/types/config.ts, developer-cockpit/src/main/services/ConfigService.ts, developer-cockpit/test/main/ConfigService.test.ts
  - verify: `vt test/main/ConfigService.test.ts` passes
- [x] **T-5** Write `test/shared/storyboardIds.test.ts` (slug, asset name, `slugify`, long `assetStem` valid and distinct, derived labels `3a`), then implement `shared/storyboards/ids.ts` and `labels.ts` (AC-3, AC-8)
  - files: developer-cockpit/src/shared/storyboards/ids.ts, developer-cockpit/src/shared/storyboards/labels.ts, developer-cockpit/test/shared/storyboardIds.test.ts
  - verify: `vt test/shared/storyboardIds.test.ts` passes
- [x] **T-6** Write `test/shared/storyboardValidate.test.ts` with one case per problem code (11), then implement `shared/storyboards/validate.ts` (AC-2)
  - files: developer-cockpit/src/shared/storyboards/validate.ts, developer-cockpit/test/shared/storyboardValidate.test.ts
  - verify: `vt test/shared/storyboardValidate.test.ts` passes
- [x] **T-7** Write `test/shared/storyboardMermaid.test.ts` (lane order, actor vs participant, notes instead of drops, fallback participant, response arrow, opt-in balanced `opt`, sanitising), then implement `shared/storyboards/mermaid.ts` (AC-9)
  - files: developer-cockpit/src/shared/storyboards/mermaid.ts, developer-cockpit/test/shared/storyboardMermaid.test.ts
  - verify: `vt test/shared/storyboardMermaid.test.ts` passes

### Main: reading

- [x] **T-8** Add the fixture storyboards and the `createStoryboardWorkspace()` helper (valid, nested domain, cardless, duplicate id, symlink, oversized, missing root, every defect from the §7.3 table, an Excalidraw-exported SVG)
  - files: developer-cockpit/test/fixtures/storyboards.ts, developer-cockpit/test/fixtures/storyboards/**
  - verify: `vt test/fixtures` passes and the helper builds a workspace whose symlink is created (or the test is skipped with a logged reason on Windows without symlink rights)
- [x] **T-9** Write `test/main/StoryboardService.scan.test.ts`, then implement `storyboards/roots.ts`, `parse.ts` (bounded, symlink-safe reads, `yaml` parsing, normalisation, headings) and `StoryboardService.scan()` (AC-1)
  - files: developer-cockpit/src/main/storyboards/roots.ts, developer-cockpit/src/main/storyboards/parse.ts, developer-cockpit/src/main/storyboards/StoryboardService.ts, developer-cockpit/test/main/StoryboardService.scan.test.ts
  - verify: `vt test/main/StoryboardService.scan.test.ts` passes
- [x] **T-10** Write `test/main/LinkIndexService.test.ts` (operation ids, command types, Avro records, `order-state.md` transitions, FR/NFR ids, cache invalidation), then implement `LinkIndexService` (AC-2)
  - files: developer-cockpit/src/main/storyboards/LinkIndexService.ts, developer-cockpit/test/main/LinkIndexService.test.ts
  - verify: `vt test/main/LinkIndexService.test.ts` passes
- [x] **T-11** Write `test/main/StoryboardService.detail.test.ts#broken storyboard still opens` (steps in order, asset URLs and missing flags, headings, revisions, all problems), then implement `detail(id)` (AC-2)
  - files: developer-cockpit/src/main/storyboards/StoryboardService.ts, developer-cockpit/test/main/StoryboardService.detail.test.ts
  - verify: `vt test/main/StoryboardService.detail.test.ts` passes
- [x] **T-12** Write `test/main/EvidenceService.test.ts` on a git workspace (drift after a committed change, uncommitted change ignored, missing source, unknown commit, human-verified tier, missing `kb_links`, backlinks), then implement `EvidenceService` and hook it into `scan()` (AC-11)
  - files: developer-cockpit/src/main/storyboards/EvidenceService.ts, developer-cockpit/src/main/storyboards/StoryboardService.ts, developer-cockpit/test/main/EvidenceService.test.ts
  - verify: `vt test/main/EvidenceService.test.ts` passes

### Main: safety and assets

- [x] **T-13** Write `test/main/svgSafety.test.ts` (each rejection rule, plus acceptance of the Excalidraw fixture), then implement `storyboards/svgSafety.ts` (AC-8)
  - files: developer-cockpit/src/main/storyboards/svgSafety.ts, developer-cockpit/test/main/svgSafety.test.ts
  - verify: `vt test/main/svgSafety.test.ts` passes
- [x] **T-14** Write `test/main/storyboardAssets.test.ts` (unknown id, traversal, absolute, nested, symlink, bad extension, oversized; content types; SVG CSP; nosniff), then implement `storyboards/assets.ts#resolveAsset` (AC-7)
  - files: developer-cockpit/src/main/storyboards/assets.ts, developer-cockpit/test/main/storyboardAssets.test.ts
  - verify: `vt test/main/storyboardAssets.test.ts` passes

### Main: writes

- [x] **T-15** Write the `test/main/StoryboardService.writes.test.ts` cases for saving (unknown keys survive, unchanged save keeps bytes and mtime, stale revision conflicts with `latestRevision`, for story and step), then implement `frontMatter.ts`, revision tokens, atomic writes, `saveStory` and `saveStep` (AC-4)
  - files: developer-cockpit/src/main/storyboards/frontMatter.ts, developer-cockpit/src/main/storyboards/StoryboardService.ts, developer-cockpit/test/main/StoryboardService.writes.test.ts
  - verify: `vt test/main/StoryboardService.writes.test.ts -t "save"` passes
- [x] **T-16** Write the write-test cases for reorder (labels `3a`/`3b`, step files byte-identical, only the `steps` node changes), `createStep` and `deleteStep` (with and without assets, a shared asset kept), then implement them (AC-3, AC-6)
  - files: developer-cockpit/src/main/storyboards/StoryboardService.ts, developer-cockpit/test/main/StoryboardService.writes.test.ts
  - verify: `vt test/main/StoryboardService.writes.test.ts -t "reorder|delete|createStep"` passes
- [x] **T-17** Write the write-test cases for `create` (templates from `_templates` or built-in, slug collisions, unknown `rootId` rejected) and for read-only mode (every write rejected, the tree hash unchanged), then implement `create` and the `writable` guard (AC-5)
  - files: developer-cockpit/src/main/storyboards/StoryboardService.ts, developer-cockpit/test/main/StoryboardService.writes.test.ts
  - verify: `vt test/main/StoryboardService.writes.test.ts -t "create|read-only"` passes
- [x] **T-18** Write the write-test cases for `saveIllustration` (unsafe rejected and nothing written, the Excalidraw fixture saved with its embedded payload byte-identical) and `library`, then implement them (AC-8)
  - files: developer-cockpit/src/main/storyboards/StoryboardService.ts, developer-cockpit/test/main/StoryboardService.writes.test.ts
  - verify: `vt test/main/StoryboardService.writes.test.ts -t "illustration|library"` passes
- [x] **T-19** Write `test/main/StoryboardService.watch.test.ts` (own-write echo suppressed, an external edit causes one debounced rescan and one broadcast, config change resets), then implement `onWatcherPath`, `WatcherService.onPath`, and `reconfigure()` (AC-1, AC-4)
  - files: developer-cockpit/src/main/storyboards/StoryboardService.ts, developer-cockpit/src/main/services/WatcherService.ts, developer-cockpit/src/shared/types/events.ts, developer-cockpit/test/main/StoryboardService.watch.test.ts, developer-cockpit/test/main/WatcherService.test.ts
  - verify: `vt test/main/StoryboardService.watch.test.ts test/main/WatcherService.test.ts` passes

### Main: exports, AI, CLI

- [x] **T-20** Write `test/main/StoryboardExport.test.ts#standalone html` (no script, `on*` or remote/protocol URLs; steps in order; inline SVG; fallback figure; data and extensions; sequence SVG re-checked or `<pre>` fallback), then implement `markdownHtml.ts` and `StoryboardExportService.html` (AC-10)
  - files: developer-cockpit/src/main/storyboards/markdownHtml.ts, developer-cockpit/src/main/storyboards/StoryboardExportService.ts, developer-cockpit/test/main/StoryboardExport.test.ts
  - verify: `vt test/main/StoryboardExport.test.ts` passes
- [x] **T-21** Write `test/main/StoryboardAiService.test.ts` (`suggestLinks` filtered to the index, context ≤ `MAX_CONTEXT_CHARS`, no fs dependency, unavailable without the key, `reviewExtensions` drops invalid entries), then implement `ai/AiAdapter.ts`, `ai/AnthropicAdapter.ts` and `StoryboardAiService` (AC-18)
  - files: developer-cockpit/src/main/storyboards/ai/AiAdapter.ts, developer-cockpit/src/main/storyboards/ai/AnthropicAdapter.ts, developer-cockpit/src/main/storyboards/StoryboardAiService.ts, developer-cockpit/test/main/StoryboardAiService.test.ts
  - verify: `vt test/main/StoryboardAiService.test.ts` passes
- [x] **T-22** Write `test/main/checkStoryboards.test.ts` (normal mode fails on errors, scan errors and broken evidence; strict mode also fails on warnings, drift and unevidenced; output lines), then implement `cli/checkStoryboards.ts` and the `check:storyboards` script (AC-17)
  - files: developer-cockpit/src/main/storyboards/cli/checkStoryboards.ts, developer-cockpit/package.json, developer-cockpit/test/main/checkStoryboards.test.ts
  - verify: `vt test/main/checkStoryboards.test.ts` passes

### Wiring

- [x] **T-23** Add `ipc/storyboards.ipc.ts` (input validation, every channel, save dialogs, PDF through a hidden window), the preload `storyboards` namespace and the `CockpitAPI` types; write `test/main/storyboards.ipc.test.ts` (invalid inputs rejected, no path parameter accepted, results passed through) first (AC-5, AC-7, AC-10)
  - files: developer-cockpit/src/main/ipc/storyboards.ipc.ts, developer-cockpit/src/main/preload.ts, developer-cockpit/src/shared/types/ipc.ts, developer-cockpit/test/main/storyboards.ipc.test.ts
  - verify: `vt test/main/storyboards.ipc.test.ts` passes and `cd developer-cockpit && npm run typecheck` passes
- [x] **T-24** Wire into `main/index.ts`: the privileged `storyboard-asset` scheme plus `protocol.handle` to `resolveAsset`, IPC registration, watcher extra paths for the roots, and the `reconfigure` call from `config.ipc.ts`; the CSP gets `img-src storyboard-asset:` (AC-7)
  - files: developer-cockpit/src/main/index.ts, developer-cockpit/src/main/ipc/config.ipc.ts, developer-cockpit/src/renderer/index.html
  - verify: `cd developer-cockpit && npm run typecheck && npm run build` passes and `npm run test:e2e -- smoke.spec.ts` still passes
- [x] **T-25** Make `KbService` skip `<kbRoot>/storyboards`; write `test/main/KbService.test.ts#skips storyboards` first
  - files: developer-cockpit/src/main/services/KbService.ts, developer-cockpit/test/main/KbService.test.ts
  - verify: `vt test/main/KbService.test.ts` passes
- [x] **T-26** Make `tools/okf-check` skip `<bundle>/storyboards`; write `okf-check.test.mjs#skips storyboards subtree` first
  - files: tools/okf-check/okf-check.mjs, tools/okf-check/test/okf-check.test.mjs, tools/okf-check/README.md
  - verify: `cd tools/okf-check && npm test` passes and `node tools/okf-check/okf-check.mjs oms-knowledge-base` exits 0

### Renderer

- [x] **T-27** Add the `storyboards` store, `useStoryboardsLiveRefresh`, the navigation item, the `ContentArea` entry, and `StoryboardsView` with `StoryboardBrowser` (group by domain, substring filter, domain/status/tag filters, badges, thumbnails, scan errors, New and Rescan); write `test/renderer/StoryboardBrowser.test.tsx` first (AC-1, AC-12)
  - files: developer-cockpit/src/renderer/stores/storyboards.ts, developer-cockpit/src/renderer/hooks/useStoryboardsLiveRefresh.ts, developer-cockpit/src/renderer/stores/navigation.ts, developer-cockpit/src/renderer/components/layout/ContentArea.tsx, developer-cockpit/src/renderer/views/storyboards/StoryboardsView.tsx, developer-cockpit/src/renderer/views/storyboards/StoryboardBrowser.tsx, developer-cockpit/test/renderer/StoryboardBrowser.test.tsx
  - verify: `vt test/renderer/StoryboardBrowser.test.tsx` passes
- [x] **T-28** Write `test/renderer/StoryboardReader.test.tsx` (keys and boundaries, keys ignored in inputs, Strip/Lanes shared selection and hover, missing-illustration placeholder, checks panel above the journey, layers absent without data or extensions), then implement `StripOverview`, `LanesOverview`, `SequenceOverview`, `StepDetail`, `ChecksPanel`, `ProvenancePanel` and the key handler (AC-12)
  - files: developer-cockpit/src/renderer/views/storyboards/StripOverview.tsx, developer-cockpit/src/renderer/views/storyboards/LanesOverview.tsx, developer-cockpit/src/renderer/views/storyboards/SequenceOverview.tsx, developer-cockpit/src/renderer/views/storyboards/StepDetail.tsx, developer-cockpit/src/renderer/views/storyboards/ChecksPanel.tsx, developer-cockpit/src/renderer/views/storyboards/ProvenancePanel.tsx, developer-cockpit/src/renderer/views/storyboards/StoryboardsView.tsx, developer-cockpit/test/renderer/StoryboardReader.test.tsx
  - verify: `vt test/renderer/StoryboardReader.test.tsx` passes
- [x] **T-29** Write `test/renderer/StoryboardPresentation.test.tsx`, then implement `PresentationMode` (AC-13)
  - files: developer-cockpit/src/renderer/views/storyboards/PresentationMode.tsx, developer-cockpit/test/renderer/StoryboardPresentation.test.tsx
  - verify: `vt test/renderer/StoryboardPresentation.test.tsx` passes
- [x] **T-30** Write `test/renderer/StoryboardStepEditor.test.tsx` (conflict Reload, conflict Overwrite resending `latestRevision`, quick fixes through `saveStep`, session drafts), then implement `StepEditor`, `StoryEditor`, `ConflictDialog`, the quick fixes, link pickers, the data editor and the extension editor (AC-14)
  - files: developer-cockpit/src/renderer/views/storyboards/StepEditor.tsx, developer-cockpit/src/renderer/views/storyboards/StoryEditor.tsx, developer-cockpit/src/renderer/views/storyboards/ConflictDialog.tsx, developer-cockpit/src/renderer/views/storyboards/ChecksPanel.tsx, developer-cockpit/test/renderer/StoryboardStepEditor.test.tsx
  - verify: `vt test/renderer/StoryboardStepEditor.test.tsx` passes
- [x] **T-31** Implement `NewStoryWizard`, strip reorder (drag) and insert, delete-step with the explicit asset choice; extend `StoryboardStepEditor.test.tsx` with wizard and reorder cases first (AC-3, AC-6, AC-16)
  - files: developer-cockpit/src/renderer/views/storyboards/NewStoryWizard.tsx, developer-cockpit/src/renderer/views/storyboards/StripOverview.tsx, developer-cockpit/test/renderer/StoryboardStepEditor.test.tsx
  - verify: `vt test/renderer/StoryboardStepEditor.test.tsx` passes
- [x] **T-32** Implement the real lazy `IllustrationEditor` (asset path, library through IPC, `exportToSvg` with `exportEmbedScene`, save through `saveIllustration`, reopen from the SVG) and the export buttons (Mermaid with an extensions toggle, HTML with the renderer-rendered sequence SVG, PDF) (AC-8, AC-10, AC-15)
  - files: developer-cockpit/src/renderer/views/storyboards/IllustrationEditor.tsx, developer-cockpit/src/renderer/views/storyboards/StepEditor.tsx, developer-cockpit/src/renderer/views/storyboards/StoryboardsView.tsx
  - verify: `cd developer-cockpit && npm run typecheck && npm run build` passes and the build output has a separate chunk containing `excalidraw` that the entry chunk does not import statically
- [x] **T-33** Write `test/renderer/StoryboardAiMenu.test.tsx` (hidden without a provider, the proposal applied into the draft only), then implement `AiAssistMenu`; add the command palette entries and the backlink rows in `FunctionalReqTab` and `DocumentViewer` (AC-18)
  - files: developer-cockpit/src/renderer/views/storyboards/AiAssistMenu.tsx, developer-cockpit/src/renderer/components/CommandPalette.tsx, developer-cockpit/src/renderer/views/requirements/FunctionalReqTab.tsx, developer-cockpit/src/renderer/views/knowledge-base/DocumentViewer.tsx, developer-cockpit/test/renderer/StoryboardAiMenu.test.tsx
  - verify: `vt test/renderer/StoryboardAiMenu.test.tsx` passes
- [x] **T-34** Add a Storyboards section to Settings (roots, writable, size limits); extend `SettingsView.test.tsx` first
  - files: developer-cockpit/src/renderer/views/settings/SettingsView.tsx, developer-cockpit/test/renderer/SettingsView.test.tsx
  - verify: `vt test/renderer/SettingsView.test.tsx` passes

### End-to-end

- [x] **T-35** Write and pass `e2e/storyboards.lazy.spec.ts` (no Excalidraw chunk before the editor opens, loaded after, no remote requests) (AC-15)
  - files: developer-cockpit/e2e/storyboards.lazy.spec.ts
  - verify: `cd developer-cockpit && npm run test:e2e -- storyboards.lazy.spec.ts` passes
- [x] **T-36** Write and pass `e2e/storyboards.authoring.spec.ts` (wizard, prose, hand-offs, sketch draw and save and reopen, data, alternate path, reorder, reload; files, reader, Mermaid and HTML checked) and `e2e/storyboards.export.spec.ts` (PDF non-empty `%PDF`) (AC-10, AC-16)
  - files: developer-cockpit/e2e/storyboards.authoring.spec.ts, developer-cockpit/e2e/storyboards.export.spec.ts
  - verify: `cd developer-cockpit && npm run test:e2e` passes

### Content and documentation

- [x] **T-37** Add `oms-knowledge-base/storyboards/` (README, `_templates`, `_library/oms-storyboard.excalidrawlib`, the `order-lifecycle/place-and-fill-order` storyboard with at least one `*.excalidraw.svg` and a `story.card.yaml` pinned to the current commit with `oms-core` sources), and add the repository-corpus case to `checkStoryboards.test.ts` (AC-17)
  - files: oms-knowledge-base/storyboards/**, developer-cockpit/test/main/checkStoryboards.test.ts
  - verify: `cd developer-cockpit && npm run check:storyboards && npm run check:storyboards -- --strict` both exit 0, and `vt test/main/checkStoryboards.test.ts` passes
- [x] **T-38** Update the documentation: `oms-knowledge-base/architecture/developer-cockpit.md`, `okf-conventions.md` (the storyboards exclusion), `log.md`; rewrite `developer-cockpit/spec/11-storyboards.md` to match what was built; update `spec/README.md`, `03-features.md`, `04-backend-services.md` and `05-data-model.md` (P-19)
  - files: oms-knowledge-base/architecture/developer-cockpit.md, oms-knowledge-base/okf-conventions.md, oms-knowledge-base/log.md, developer-cockpit/spec/11-storyboards.md, developer-cockpit/spec/README.md, developer-cockpit/spec/03-features.md, developer-cockpit/spec/04-backend-services.md, developer-cockpit/spec/05-data-model.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` exits 0, and `11-storyboards.md` no longer mentions `In Review`, `../assets/` or an `## Exceptions` section

### Verification

- [x] **T-39** Run the full module checks: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run check:storyboards -- --strict` in developer-cockpit, and `npm test` in tools/okf-check
  - files: (none)
  - verify: every command exits 0
- [x] **T-40** Run spec verify
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0014` exits 0

## Notes

- T-2 is a spike that comes first on purpose: if Excalidraw cannot run under the cockpit's
  CSP and sandbox, the fallback in design → Risks is applied before any editor code is written.
- T-3 makes `ConfigService` honour `COCKPIT_WORKSPACE_ROOT`, so that end-to-end runs never touch
  the developer's real workspace or `~/.developer-cockpit/config.json`. Its config directory comes
  from `COCKPIT_CONFIG_DIR`, set by the harness.
- `specs/config.json` → `developer-cockpit.verify` runs only `typecheck` and `npm test`. The
  requester should add `npm run check:storyboards` and decide whether `npm run test:e2e` belongs in
  `spec verify`. Until then, T-39 runs them explicitly and the verification records their output.
- Symlink fixtures need symlink rights on Windows (Developer Mode). Those cases use `it.skipIf`
  with a logged reason; they always run in Linux CI.
  - Added during implementation: folder links use NTFS junctions on Windows, which need no
    privilege, so the symlinked-folder cases (scan, assets) run here too.
  - Only the two file-symlink cases are skipped on this machine.
- Added during implementation:
  - **T-8.** The Excalidraw fixture (`test/fixtures/storyboards/excalidraw-export.excalidraw.svg`)
    and the repository sketch (T-37) were drawn in the real editor by one-off Playwright scripts,
    which were then deleted.
  - **T-32.** A `manualChunks` rule naming the Excalidraw chunk was tried and reverted, because
    Rollup moved shared modules into it and the entry then imported it statically. The e2e test
    finds the chunk by its content instead.
  - **T-39.** `tools/okf-check` has two more tests with their own file walkers
    (`kb-coverage.test.mjs`, `mcp-metadata.test.mjs`). They now use the exported `SKIP_ROOT_DIRS`,
    so the storyboards exclusion is defined once.
  - **T-39.** A full-suite run exposed git timeouts being reported as unknown commits; see
    design → Alternatives & Decisions.
- `tools/okf-check` is changed by this ticket (T-26, T-39) but is not a module in
  `specs/config.json`, so `spec set … modules` cannot add it and `spec verify` does not run its
  tests. T-39 ran `npm test` there (22/22 passing).
- `@excalidraw/excalidraw` adds `npm audit` advisories (design → Risks).
