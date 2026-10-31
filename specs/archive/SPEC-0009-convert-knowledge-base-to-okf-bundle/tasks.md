# Tasks — SPEC-0009: Convert knowledge base to OKF bundle

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

- [x] **T-1** Scaffold the checker package `tools/okf-check` (ESM, `js-yaml` dependency, `test` script `node --test`) and install it (AC-1)
  - files: tools/okf-check/package.json, tools/okf-check/package-lock.json
  - verify: `cd tools/okf-check && npm ls js-yaml` lists js-yaml and exits 0
- [x] **T-2** Port `MarkdownParser#extractMetadata` to `test/mcp-metadata.mjs` and capture `test/baseline-metadata.json` from the **unconverted** bundle; write the failing real-bundle tests `mcp-metadata.test.mjs` ("MCP metadata unchanged", "status mapping") (AC-7, AC-8)
  - files: tools/okf-check/test/mcp-metadata.mjs, tools/okf-check/test/baseline-metadata.json, tools/okf-check/test/mcp-metadata.test.mjs
  - verify: baseline has one entry per document whose first 20 lines contain a bold `Version:` or `Status:` (same count as `grep` over the bundle, captured before any KB edit); "MCP metadata unchanged" passes now and "status mapping" fails (no front matter yet)
- [x] **T-3** Test-first: fixtures `valid`, `no-frontmatter`, `bad-yaml`, `empty-type`; implement bundle walk, reserved-file detection and rules `OKF-FM`, `OKF-TYPE` in `okf-check.mjs` (`checkBundle` export) (AC-1, AC-2)
  - files: tools/okf-check/okf-check.mjs, tools/okf-check/test/okf-check.test.mjs, tools/okf-check/test/fixtures/{valid,no-frontmatter,bad-yaml,empty-type}/**
  - verify: `cd tools/okf-check && node --test --test-name-pattern="rejects missing" test/` passes
- [x] **T-4** Test-first: fixtures for missing `title`/`description`/`tags`, empty `tags`, bad `status`, unknown `type`, missing conventions file; implement `OMS-KEYS`, `OKF-STATUS`, `OMS-VOCAB` (AC-3)
  - files: tools/okf-check/okf-check.mjs, tools/okf-check/test/okf-check.test.mjs, tools/okf-check/test/fixtures/**
  - verify: `cd tools/okf-check && node --test --test-name-pattern="project keys" test/` passes
- [x] **T-5** Test-first: fixtures for root index front matter (missing / extra keys), sub-index with front matter, folder without index, unlisted concept, ascending log dates; implement `OKF-INDEX-ROOT`, `OKF-INDEX`, `OKF-LOG` (AC-4)
  - files: tools/okf-check/okf-check.mjs, tools/okf-check/test/okf-check.test.mjs, tools/okf-check/test/fixtures/**
  - verify: `cd tools/okf-check && node --test --test-name-pattern="index and log" test/` passes
- [x] **T-6** Test-first: fixtures for timestamp without offset, malformed actor, `verified` present, valid `+02:00`/`human:x`; implement `OKF-TIME`, `OKF-ACTOR`, `OMS-UNVERIFIED` (AC-5)
  - files: tools/okf-check/okf-check.mjs, tools/okf-check/test/okf-check.test.mjs, tools/okf-check/test/fixtures/**
  - verify: `cd tools/okf-check && node --test --test-name-pattern="timestamps" test/` passes
- [x] **T-7** Test-first: fixture with broken relative and `/`-prefixed links plus ignored cases (code fence, external URL, anchor); implement `OKF-LINK` (AC-6)
  - files: tools/okf-check/okf-check.mjs, tools/okf-check/test/okf-check.test.mjs, tools/okf-check/test/fixtures/**
  - verify: `cd tools/okf-check && node --test --test-name-pattern="internal links" test/` passes
- [x] **T-8** Test-first: CLI prints `ERROR <file> [<rule>]: <msg>` and a summary, exits 1 on errors and 0 on the `valid` fixture; write the failing "real bundle conforms" test (AC-1, AC-2)
  - files: tools/okf-check/okf-check.mjs, tools/okf-check/test/okf-check.test.mjs
  - verify: `node tools/okf-check/okf-check.mjs tools/okf-check/test/fixtures/valid` exits 0 and `… fixtures/empty-type` exits 1 naming the file and `OKF-TYPE`
- [x] **T-9** Test-first: `stripFrontMatter` unit tests (leading block, body thematic break, plain content, CRLF, BOM), implement `src/utils/frontMatter.ts`, use it in `DocumentViewer.tsx`, add `test` script and exclude tests from `tsconfig.app.json` (AC-9)
  - files: oms-kb-explorer/src/utils/frontMatter.ts, oms-kb-explorer/src/utils/frontMatter.test.ts, oms-kb-explorer/src/components/DocumentViewer.tsx, oms-kb-explorer/package.json, oms-kb-explorer/tsconfig.app.json
  - verify: `cd oms-kb-explorer && npm test` passes and `npm run build` passes
- [x] **T-9b** Fix the 7 pre-existing TypeScript errors that made `npm run build` fail on the base branch (unused imports/params, react-markdown v10 dropped `inline`, `style`/`ref` spread into SyntaxHighlighter) (AC-9)
  - files: oms-kb-explorer/src/components/DocumentViewer.tsx, oms-kb-explorer/src/components/TreeView.tsx, oms-kb-explorer/src/services/api.ts
  - verify: `cd oms-kb-explorer && npm run build` exits 0
- [x] **T-10** Add `okf-conventions.md` (type `Reference`, `type_vocabulary`, keys, status mapping, how to add a document, how to run the checker), root `index.md` with `okf_version: "0.2"`, and `log.md` (AC-3, AC-4)
  - files: oms-knowledge-base/okf-conventions.md, oms-knowledge-base/index.md, oms-knowledge-base/log.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports no `OMS-VOCAB` "missing conventions", `OKF-INDEX-ROOT` or `OKF-LOG` errors
- [x] **T-11** Add front matter to the 11 `oms-concepts/` documents per the design's type and status mapping (AC-1, AC-3, AC-5, AC-7, AC-8)
  - files: oms-knowledge-base/oms-concepts/*.md
  - verify: checker reports no `OKF-FM`/`OKF-TYPE`/`OMS-KEYS`/`OKF-STATUS`/`OMS-VOCAB`/`OKF-TIME` errors for `oms-concepts/`; `node --test tools/okf-check/test/mcp-metadata.test.mjs` "MCP metadata unchanged" still passes
- [x] **T-12** Add front matter to the 9 `oms-framework/` documents (AC-1, AC-3, AC-5, AC-7, AC-8)
  - files: oms-knowledge-base/oms-framework/*.md
  - verify: same checks as T-11 for `oms-framework/`
- [x] **T-13** Add front matter to `oms-methodolgy/` (6), `illustrations/` (3), `ui/` (1) and the two root documents (AC-1, AC-3, AC-5, AC-7, AC-8)
  - files: oms-knowledge-base/oms-methodolgy/*.md, oms-knowledge-base/illustrations/*.md, oms-knowledge-base/ui/*.md, oms-knowledge-base/KNOWLEDGE-BASE-REVIEW-REPORT.md, oms-knowledge-base/oms-knowledge-base-strategy.md
  - verify: checker reports no front matter errors anywhere; `node --test tools/okf-check/test/mcp-metadata.test.mjs` passes fully
- [x] **T-14** Add `index.md` to `oms-concepts/`, `oms-framework/`, `oms-methodolgy/`, `illustrations/`, `ui/` and link them from the root index (AC-4)
  - files: oms-knowledge-base/*/index.md, oms-knowledge-base/index.md
  - verify: checker reports no `OKF-INDEX` errors
- [x] **T-15** Fix every broken internal link the checker reports (known: `oms-framework/error-handling.md` → `../oms-concepts/streaming-architecture.md`) (AC-6)
  - files: oms-knowledge-base/**/*.md
  - verify: checker reports no `OKF-LINK` errors
- [x] **T-16** Make the full real-bundle suite green (AC-1, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8)
  - files: (none expected; fixes only)
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` exits 0 and `cd tools/okf-check && npm test` passes
- [x] **T-17** Docs: `tools/okf-check/README.md` (usage, rules), strategy note in `oms-knowledge-base-strategy.md`, `npm test` note in the explorer README, log entry complete (P-19)
  - files: tools/okf-check/README.md, oms-knowledge-base/oms-knowledge-base-strategy.md, oms-kb-explorer/README.md, oms-knowledge-base/log.md
  - verify: files exist with the described sections; checker still exits 0
- [x] **T-18** Run spec verify
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0009` exits 0

## Notes

- T-2 must run before any knowledge-base edit: the baseline is the "before" in AC-7.
- T-11–T-13 keep front matter compact (≤ 10 lines) so bold headers stay within line 20.
- T-3–T-7: only `valid/` and `empty-type/` fixtures live on disk; the other failure cases are built
  in the test by copying `valid/` to a temp dir and changing one file, so each case breaks exactly
  one rule.
- T-9b (added during implementation): `npm run build` in oms-kb-explorer already failed on the
  base branch with 7 TypeScript errors unrelated to this ticket (checked with the ticket's changes
  stashed). The module's gate verify is `npm run build`, so it had to be fixed for AC-9 to be
  verifiable. The fixes do not change runtime behaviour: react-markdown v10 never passed `inline`,
  so `!inline` was always true.
