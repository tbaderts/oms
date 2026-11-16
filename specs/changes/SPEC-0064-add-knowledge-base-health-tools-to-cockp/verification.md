# Verification — SPEC-0064: Add knowledge base health tools to cockpit

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

Checker tests: `cd tools/okf-check && npm test`, 66 of 66 pass on 2026-11-16. These tests are not
in the spec gate yet; that is TD-14 and human-only. Cockpit tests: `npm test` in
`evidence/developer-cockpit-2.log`, 733 pass and 2 are skipped.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | The explorer shows front matter; deprecated and draft are marked; nothing without front matter | `FrontMatterPanel.test.tsx`: "shows type, status, description, updated, tags and sources", "marks deprecated and draft documents", "lists every other key once, formatted by type", "formats a Date value and an unquoted updated", "renders nothing without front matter", "the document viewer shows the panel…" (evidence/developer-cockpit-2.log) | PASS |
| AC-2 | `--json` prints errors, warnings and stats with the text mode's exit code; text output unchanged | `report.test.mjs`: "--json prints errors, warnings and stats with the text exit code", "text output is unchanged without --json" | PASS |
| AC-3 | Exact counts by type, status, folder, requirement implementation and priority, and review age; `index.md` and `log.md` not counted | `report.test.mjs`: "stats count documents by type, status, folder, requirements and review age", "review age splits current and due documents by review_after_days", "a document without front matter counts under (none)" | PASS |
| AC-4 | OMS-AGE, OMS-STALE, OMS-DEPRECATED and OMS-DRIFT (amended rule, re-approved 2026-11-16), each with a firing and a non-firing fixture; warnings never change the exit code | `report.test.mjs`: OMS-AGE warns / leaves archived alone (and the current documents in the review-age test); OMS-STALE warns once stale_after has passed (the same `stale_after` checked before the date gives no warning); OMS-DEPRECATED warns outside archive/ and not inside it; OMS-DRIFT warns / "counts a document committed with its code as up to date" / folder source / non-ASCII / archived / many paths / no git; "warnings do not change the exit code" | PASS |
| AC-5 | Index fix: the dry run writes nothing; apply adds title and description entries, keeps text byte for byte, creates a missing index, clears OKF-INDEX; a second run is a no-op | `fix-indexes.test.mjs`: "dry run lists the entries and writes nothing", "apply adds the entries, keeps the text, creates a missing index and clears OKF-INDEX", "an index without a matching section gets one at the end", "a second run changes nothing", "keeps CRLF line endings", "titles and file names are escaped…", "a clean bundle needs no fix" | PASS |
| AC-6 | The Health panel shows statistics and findings grouped by rule with counts; a finding opens its document; loading state; checker failure shown | `KbHealthPanel.test.tsx`: "shows stats and findings grouped by rule, errors first", "opens the document of a finding", "shows the loading state, then the report; and an error when the check fails", "opens the health panel, and a finding opens its document in the explorer" (evidence/developer-cockpit-2.log) | PASS |
| AC-7 | Fix indexes previews before writing; apply runs the fix, re-runs the check and refreshes the panel and tree; cancel writes nothing | `KbHealthPanel.test.tsx`: "fix indexes previews, applies on confirm and refreshes", "cancel writes nothing", "says so when no index needs a change", "says so when the applied changes differ from the preview"; `kb.ipc.test.ts`: "kb:fixIndexes previews without rescanning, and applies with a rescan", "…treats anything but true as a dry run" | PASS |
| AC-8 | The cockpit runs the repository's `tools/okf-check` CLI with the configured workspace and KB path, and reimplements no rule | `OkfCli.test.ts`: "report runs the repository CLI on the given bundle", "a report with errors is a result, not a failure", "fixIndexes previews, then applies", "a workspace without the checker rejects…"; `kb.ipc.test.ts`: "kb:health runs the checker of the configured workspace on the configured knowledge base". Code: `OkfCli.ts` only runs `execFile` and parses the JSON | PASS |
| AC-9 | Cockpit typecheck and tests, the checker tests, and `okf-check oms-knowledge-base` with 0 errors | `evidence/last-run.json`: typecheck exit 0, `npm test` exit 0. Checker tests 66/66. `node tools/okf-check/okf-check.mjs oms-knowledge-base`: 204 concepts, 0 errors, 1 warning | PASS |

## Goal Assessment

The goal asked for:
- the front matter in the cockpit's knowledge base explorer;
- a tool to check the knowledge base's status;
- a fix for the folder indexes;
- statistics about document types;
- warnings for outdated content.

All five are built and tested.
- **Front matter.** The explorer shows it above every document (AC-1).
- **Health panel.** It runs the repository checker and shows:
  - errors and warnings by rule;
  - statistics by type, status, folder, requirement implementation and priority, and review age;
  - Fix indexes, with a preview first (AC-6 to AC-8).
- **Outdated content.** Four warning rules cover it (AC-4).

On the real knowledge base:
- 0 errors and 1 warning, a genuine drift: `architecture/context/oms-ui.md` against `App.tsx`;
- the index fix finds nothing to change, so no index edits were needed;
- review age: 197 documents current.

**Left out on purpose** (proposal, Out of scope):
- reviewing the outdated pages;
- automatic fixes other than index links;
- editing front matter;
- the `oms-kb-explorer` web app;
- adding the checker to the gate configuration (TD-14).

**Known limit of the amended drift rule.** A later unrelated commit to a page counts as a review.
The human accepted this trade-off when re-approving the proposal on 2026-11-16.

## Policy Review

The change touches no Java module, contract, database or Kafka path.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contract added or changed |
| P-02 | Specification before code, generated models only | PASS | The proposal and design came before the code. The cockpit's IPC types are hand-written TypeScript, as for all cockpit IPC; no OpenAPI or Avro model applies |
| P-03 | Never edit generated code | PASS | No generated file changed |
| P-04 | Contracts evolve compatibly | PASS | The checker's text output and exit codes are unchanged (tested); `--json` and `--fix-indexes` are additive. Unknown flags now exit 2, where before they were ignored |
| P-05 | Every state change is recorded in the event log | N/A | No order state |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database |
| P-08 | Concurrency and idempotency are explicit | PASS | The index fix is idempotent (test "a second run changes nothing"). Apply re-plans from disk and the panel reports any difference from the preview |
| P-09 | Commands and queries stay separate | PASS | `kb:health` only reads; `kb:fixIndexes` writes only when `apply === true` (tested) |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No order state |
| P-11 | Layering and conventions | PASS | Main process: a CLI wrapper (`OkfCli`, following `SpecCli`) and IPC. Preload: a typed bridge. Renderer: components. Shared types are in `shared/types/kb.ts` |
| P-12 | Jackson 3 only | N/A | No Java |
| P-13 | Errors and validation follow the framework specs | PASS | Cockpit conventions: CLI failures become readable errors (a missing checker; unparseable output tells you to run npm install), shown in the panel's `role=alert` |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC maps to named passing tests (table above) |
| P-15 | Observability | N/A | Desktop tool and CLI; no service telemetry |
| P-16 | Security | PASS | `execFile` with an argument array, no shell. The script path comes from the configured workspace. Git is called with `-C` and `--` before paths. The fix writes only `index.md` files inside the bundle |
| P-17 | Simplicity and dependencies | PASS | No new dependencies. One implementation of the rules: the CLI |
| P-18 | Modules build standalone | PASS | The cockpit's typecheck and tests pass on their own. The checker runs with its own `node_modules` |
| P-19 | Documentation follows behaviour | PASS | Updated: `tools/okf-check/README.md`, `okf-conventions.md`, `semantic-layer/schema-and-constraints.md`, `semantic-layer/knowledge-base-strategy.md`, `tools/developer-cockpit.md`, `developer-cockpit/spec/04-backend-services.md`, `log.md` |

## Independent Review

The spec-reviewer agent ran twice.

**First pass: NOT MET, 10 findings.** `design.md`, section "After the first independent review",
lists each fix.
- **Finding 1, the AC-4 drift wording.** The rule I built differed from the approved wording. The
  ticket went back to the proposal stage, AC-4 was amended, and the human re-approved it on
  2026-11-16.
- **Findings 2–9 were fixed:**
  - index-fix escaping;
  - git batching under the Windows command-line limit;
  - `core.quotePath=false` for non-ASCII paths;
  - timestamps in drift messages;
  - a description for created indexes;
  - a notice when the applied changes differ from the preview;
  - picking a document closes Health, and a missing document is explained;
  - the `OkfCli` documentation.
- **Finding 10** was `verification.md` itself; this file answers it.

**Second pass: MET, with 6 non-blocking findings.**
1. **The deprecated/draft test checked only `data-status`.** Fixed: the badge exposes its
   variant, and a new test checks that deprecated, draft and stable get three different variants
   and classes.
2. **No view-level test that Apply reloads the tree.** Fixed: a new test in
   `KbHealthPanel.test.tsx` checks that `getCategories` runs again after Apply.
3. **A source outside the repository (`repo:../x`, or a knowledge base outside the workspace)
   made one git batch fail.** That switched drift off for the whole bundle. Fixed: such paths are
   left undated and not passed to git. New test: "OMS-DRIFT still checks when a source points
   outside the repository".
4. **An unknown `--flag` now exits 2; before, it was ignored.** Accepted: the change is
   documented in the README, and nothing in the repository passes extra flags. It is also noted
   under P-04.
5. **The "not a document" notice could mislead.** Fixed in two places:
   - `kb:health` now rescans the explorer, so a document created since the last scan opens (new
     test in `kb.ipc.test.ts`);
   - the notice suggests Fix indexes only for an `index.md`.
6. **An `updated` value that is not a date was hidden.** Fixed: it is now shown as written (new
   test).

There are no unresolved findings.

## Automated Evidence

`evidence/last-run.json` was written on 2026-11-16 at 05:24:02 UTC. Result: pass. Modules:
developer-cockpit and oms-knowledge-base.
- Policy check (changes since main, merge-base 199c36e3): PASS, with no errors or warnings.
- `npm run typecheck` (developer-cockpit): exit 0 in 13 s.
- `npm test` (developer-cockpit): exit 0 in 72 s. 733 passed, 2 skipped.

Outside the gate, run the same day:
- `cd tools/okf-check && npm test`: 66 pass, 0 fail.
- `node tools/okf-check/okf-check.mjs oms-knowledge-base`: 204 concepts, 0 errors, 1 warning
  (OMS-DRIFT).
- `--fix-indexes --dry-run`: no index changes needed.

## Follow-ups

- **TD-14** (human-only): add the okf-check tests and `okf-check oms-knowledge-base` to
  `specs/config.json`, so the gate runs them.
- **Review `architecture/context/oms-ui.md`** against `oms-ui/frontend/src/App.tsx`: this is the
  one drift warning.

## Verdict

Verdict: GOAL MET
