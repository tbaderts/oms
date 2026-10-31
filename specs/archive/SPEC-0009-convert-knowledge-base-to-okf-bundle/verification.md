# Verification — SPEC-0009: Convert knowledge base to OKF bundle

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

Test runs on 2026-10-27 17:46 (+01:00), after the last code change (the review fixes):
`tools/okf-check` `npm test` → 11 tests, 11 pass, 0 fail, 0 skipped; `oms-kb-explorer` `npm test`
→ 6 tests, 6 pass;
`node tools/okf-check/okf-check.mjs oms-knowledge-base` → `33 concepts, 0 error(s)`, exit 0.
(These modules have no test step in their gate `verify` list, so the runs are recorded here; see
Automated Evidence.)

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Real bundle: every non-reserved `.md` has parseable front matter with non-empty `type` | `okf-check.test.mjs#"real bundle conforms"` (asserts zero errors and ≥ 33 concepts parsed); CLI run on `oms-knowledge-base` exit 0, 33 concepts | PASS |
| AC-2 | Missing / unparseable front matter and empty `type` rejected, naming file and rule | `okf-check.test.mjs#"rejects missing front matter, unparseable YAML and empty type"` (5 variants + `fixtures/empty-type`, each asserts file + `OKF-FM`/`OKF-TYPE`); `#"CLI prints ERROR lines…"` asserts exit 1 and `ERROR sub/concept-b.md [OKF-TYPE]:` | PASS |
| AC-3 | `title`, `description`, non-empty `tags`, valid `status`, documented `type` | `okf-check.test.mjs#"requires project keys and vocabulary"` (8 variants incl. missing conventions file → `OMS-KEYS`/`OKF-STATUS`/`OMS-VOCAB` on the named file); real bundle clean | PASS |
| AC-4 | Root index `okf_version: "0.2"` only; sub-indexes without front matter linking every concept/sub-index; log newest-first | `okf-check.test.mjs#"index and log rules"` (11 variants: root index missing / extra key / unquoted version / absent, sub-index front matter, missing sub-index, unlisted concept, unlisted sub-folder, ascending log, non-date heading, log front matter); real bundle clean | PASS |
| AC-5 | ISO 8601 timestamps with offset, actor formats, no `verified` | `okf-check.test.mjs#"timestamps, actors and no verified"` (8 variants across `updated`, `stale_after`, `generated.at`, `sources[].last_modified`, `generated.by`, bare-mapping `verified`); valid fixture with `+02:00` and `human:` passes; real bundle has no `verified` | PASS |
| AC-6 | Zero broken internal links; broken ones reported | `okf-check.test.mjs#"internal links resolve"` (exactly 2 `OKF-LINK` errors for a broken relative and a broken `/` link, valid `/…#anchor` link accepted) and `#"internal links must stay in the bundle…"` (folder without `index.md` and a `../..` escape rejected, folder with index accepted); valid fixture's code-fence / inline-code / external / anchor links ignored; real bundle 0 (fixed `error-handling.md` → `../oms-concepts/streaming-architecture.md`) | PASS |
| AC-7 | MCP-extracted version/status unchanged | `mcp-metadata.test.mjs#"MCP metadata unchanged"`: port of `MarkdownParser#extractMetadata` returns the baseline for all 20 entries of `baseline-metadata.json` (captured before any KB edit, T-2). Cross-checked live: the running `oms` MCP server's `getKnowledgeBaseOverview` on the converted files shows the same version/status for all 20 documents | PASS |
| AC-8 | Status mapping from old headers; `draft` when absent | `mcp-metadata.test.mjs#"status mapping…"` checks every pre-existing concept (32) against the mapping, using the baseline header value | PASS |
| AC-9 | Explorer strips front matter before rendering; other content unchanged | `oms-kb-explorer/src/utils/frontMatter.test.ts` (6 tests: leading block removed and no YAML key left, blank lines dropped, body thematic breaks kept, plain content and unclosed block unchanged, CRLF + BOM); `DocumentViewer.tsx` renders `stripFrontMatter(document.content)`; `npm run build` exit 0 (evidence/oms-kb-explorer-1.log) | PASS |

## Goal Assessment

The Goal (ticket.md) is the requester's whole request: convert the knowledge base, MCP server and
KB explorer to OKF; strengthen the content with structured documentation, requirements and
capabilities; split into several tickets if needed. The bracketed scope note gives this ticket the
foundation: make `oms-knowledge-base` a conformant OKF v0.2 bundle with automated checking.

That part is met. All 32 existing documents carry OKF front matter with a controlled type
vocabulary; the bundle has the reserved `index.md` / `log.md` structure; provenance and trust
fields are defined and checked, honestly left unverified; links resolve; the checker makes
conformance repeatable. Existing consumers keep working: MCP metadata is unchanged (also confirmed
live), and the explorer no longer shows raw YAML (added at the requester's request).

Deliberately left to the sibling tickets, so not a gap in this one:
- the content work (capabilities, requirements, restructuring, folder renames): SPEC-0010;
- the MCP server reading and serving OKF metadata (type, tags, trust, links): SPEC-0011;
- the KB explorer browsing by type and trust, backlinks: SPEC-0012.

Residual observations: `sources` and `generated` are not yet filled for any document, so every
concept's trust tier is "unverified" and provenance is empty. That is intended (no false claims),
and SPEC-0010 is the natural place to add sources while rewriting content.

## Policy Review

Reviewed against the ticket's files in the working tree (the tree also holds unrelated uncommitted
work from other changes, not judged here).

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | no contract files touched |
| P-02 | Specification before code, generated models only | N/A | no API or message change |
| P-03 | Never edit generated code | PASS | nothing under `build/generated*` or `dist/` edited |
| P-04 | Contracts evolve compatibly | N/A | no contract change |
| P-05 | Every state change is recorded in the event log | N/A | no order state |
| P-06 | Kafka only through the transactional outbox | N/A | no Kafka |
| P-07 | Schema changes through new Liquibase changesets | N/A | no database |
| P-08 | Concurrency and idempotency are explicit | N/A | no commands; checker is read-only |
| P-09 | Commands and queries stay separate | N/A | no command/query API |
| P-10 | State transitions go through the state machine and task pipeline | N/A | no state transitions |
| P-11 | Layering and conventions | PASS | checker follows `specs/tools/spec.mjs` CLI style (ESM, `ERROR file: msg`, exit codes); explorer helper in `src/utils`, used by the existing component |
| P-12 | Jackson 3 only | N/A | no Java |
| P-13 | Errors and validation follow the framework specs | N/A | no API errors; checker reports every finding, nothing swallowed (unreadable YAML becomes an `OKF-FM` error) |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | every AC has a test that ran green above; tests were written and seen red first (T-2 status mapping red until T-11–T-13; checker tests red on missing module; explorer test red on missing module) |
| P-15 | Observability | N/A | no service runtime change |
| P-16 | Security | PASS | no secrets; checker only reads files under the given directory and only `existsSync`s link targets |
| P-17 | Simplicity and dependencies | PASS | one dependency (`js-yaml`, isolated in `tools/okf-check/package.json`); no explorer dependency; both recorded in design.md Alternatives & Decisions |
| P-18 | Modules build standalone | PASS | `oms-kb-explorer` `npm run build` exit 0 (it failed on the base branch; fixed in T-9b) |
| P-19 | Documentation follows behaviour | PASS | `okf-conventions.md`, `index.md` files, `log.md`, strategy note, `tools/okf-check/README.md`, explorer README "Run Tests" |

## Independent Review

The spec-reviewer agent (fresh context) concluded **MET**: all nine ACs proven by tests it re-ran
(checker 10/10, explorer 6/6, CLI exit 0). No blocking or major findings. It additionally ran the
`extractMetadata` port over the `main` versions of all 32 documents and the converted ones:
version, status, lastUpdated and category identical for every file; and oms-mcp-server's
`RetrievalEvalTest` against the converted KB: pass (recall@5 0.960, threshold 0.90).

| # | Finding (severity) | Resolution |
|---|---|---|
| 1 | `cd tools/okf-check && npm install` followed by a repo-root command fails when run in sequence (okf-conventions.md, checker README) (minor) | Fixed: `npm --prefix tools/okf-check install` |
| 2 | Lint: new unused `ref`, and a literal U+FEFF in four regexes/strings (`no-irregular-whitespace`) (minor) | Fixed: `﻿` escapes; scoped `eslint-disable-next-line` for the destructured-only `node`/`style`/`ref`; `npx eslint src/utils src/components/DocumentViewer.tsx` clean |
| 3 | `OKF-LINK` used `existsSync`, so directory links and links leaving the bundle passed (minor) | Fixed test-first: new test, links must stay in the bundle and hit a file or a folder with `index.md`; real bundle still 0 errors |
| 4 | Explorer: `style`/`ref` no longer spread into SyntaxHighlighter; "no runtime change" holds only because no raw-HTML plugin is used (minor, info) | Accepted, no action: markdown code nodes carry no `style` without rehype-raw; comment added in `DocumentViewer.tsx` |
| 5 | Wrong claim that `state-machine-framework_spec.md` has no header (minor) | It is in the approved proposal's Why (background only; the implementation maps it correctly to `stable`, v1.0, 2025-10-10). Corrected in design.md Context; the approved proposal is left as approved |
| 6 | `RetrievalEvalTest` recall@5 0.960 / MRR 0.847 vs a pinned comment of 1.000 / 0.903 from 2026-06-10; not compared against `main` (minor, info) | Passes its threshold. Not attributed: the KB has changed a lot since June (new concept papers). Follow-up below to compare against `main` |
| Goal gap | Provenance: rules and docs exist, but no concept carries `sources`/`generated`; `**Author:**` lines not mapped | Consistent with the approved proposal (no unverifiable claims; `generated` optional). Moved to SPEC-0010 as a follow-up (fill `sources` while restructuring content); flagged to the requester |

## Automated Evidence

`evidence/last-run.json` (2026-10-27T16:46:01Z, after the review fixes; result `pass`, modules
`oms-knowledge-base`, `oms-kb-explorer`): policy check PASS (no errors, no warnings, scope: changes
since main); `oms-kb-explorer` `npm run build` exit 0 in 21 s (`evidence/oms-kb-explorer-1.log`).
`oms-knowledge-base` has no gate verify command, so the checker and both test suites were run
explicitly (results in Acceptance Criteria Results above).

## Follow-ups

- Add `node tools/okf-check/okf-check.mjs oms-knowledge-base` (oms-knowledge-base) and `npm test`
  (oms-kb-explorer) to the module `verify` lists in `specs/config.json` so the gate enforces them
  (human edit: agents may not change the gate config).
- `tools/okf-check` is not run in CI; consider a CI step.
- SPEC-0010: populate provenance (`sources` pointing at code, specs and tickets; `generated` where
  the author is known) while restructuring content; map the old `**Author:**` lines.
- Compare oms-mcp-server `RetrievalEvalTest` recall/MRR on `main` vs this branch, and refresh its
  pinned baseline comment.
- oms-kb-explorer: `npm run lint` is not clean outside the files touched here; not gated.
- oms-mcp-server indexes non-markdown files under `animations/media/**` (`partial_movie_file_list.txt`)
  as documents; pre-existing, unrelated to OKF. Consider excluding them or cleaning up the media
  folder (out of scope here).

## Verdict

Verdict: GOAL MET
