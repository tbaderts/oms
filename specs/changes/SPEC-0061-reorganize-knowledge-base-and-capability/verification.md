# Verification — SPEC-0061: Reorganize knowledge base and capability catalogue

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

The okf-check suites are not part of `spec verify`: `oms-knowledge-base` has `verify: []` in
`specs/config.json` (TD-14). They were run by hand on 2026-11-14, after the last change:
`node tools/okf-check/okf-check.mjs oms-knowledge-base` reported 204 concepts, 0 errors;
`cd tools/okf-check && npm test` passed 39/39; `node tools/okf-check/check-kb-refs.mjs` reported 0
findings. The independent reviewer re-ran all three and got the same results.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Bundle passes okf-check; root holds only the agreed sections; no legacy folders | `kb-coverage.test.mjs#bundle root has only the target layout`, `okf-check.test.mjs#real bundle conforms`, CLI exit 0 | PASS |
| AC-2 | Register lists every pre-reorganisation `.md` once, with a disposition and an existing new path | `kb-coverage.test.mjs#review register covers every pre-reorganisation document` (git ls-tree 33f4e20, 161 files) | PASS |
| AC-3 | `updated` ≥ review date and no retired terms in prose outside the archive; fixtures prove each failure | `okf-check.test.mjs#review date applies…(OMS-REVIEWED)`, `#retired terms…(OMS-RETIRED)`; rules active on the real bundle (conventions set `reviewed_since`, `retired_terms`) | PASS |
| AC-4 | Archive documents are deprecated with a resolvable `superseded_by`; deprecated-outside-archive fixture fails | `okf-check.test.mjs#archive documents are deprecated and say what replaced them (OMS-ARCHIVE)` | PASS |
| AC-5 | Capability → use case, use case id/actors/requirements, every requirement traced, commands in one capability; failure fixtures | `okf-check.test.mjs#use case rules (OMS-UC)` (incl. duplicate UC-001), `#actor rules`, `#capabilities link a use case and every requirement is traced…`; `kb-coverage.test.mjs#every command schema belongs to exactly one capability` | PASS |
| AC-6 | Implemented/partial items cite existing tests; dispatch check against the current dispatcher | `okf-check` OMS-SRC on the real bundle (0 errors); `kb-coverage.test.mjs#every command schema…` with the extractor reading `CommandDispatcher` and `#extractors find known members` (handled and unhandled commands) | PASS |
| AC-7 | Cockpit reads the new layout: UC, actors, capabilities, all FR/NFR, implementation, Capabilities tab, categories from folders | `RequirementsService.test.ts` (6 tests, incl. real-KB counts and no legacy names in `src/`), `RequirementsView.test.tsx` (5), `KbService.test.ts` (3), `CategoryTree.test.tsx` (2); typecheck and `npm test` 622/622 (evidence/developer-cockpit-1.log, -2.log) | PASS |
| AC-8 | MCP returns a moved document under a former id; unknown id still not found | `DocumentRepositoryTest$MovedDocuments` (4 tests), `KnowledgeBaseToolsTest#readKnowledgeBaseReportsMove`, `#searchHidesDeprecatedByDefault` (evidence/oms-mcp-server-1.log) | PASS |
| AC-9 | recall@5 ≥ 0.90, a golden query per section, no expected path to a removed location | `RetrievalEvalTest#recallAt5AndMrrMeetBaseline` (recall@5 1.000, MRR 0.808 ≥ 0.80), `#goldenSetCoversEveryTopLevelFolder`, `#expectedPathsExist` (evidence/oms-mcp-server-1.log) | PASS |
| AC-10 | No dangling KB references in the repository; explorer build and storyboard check pass | `check-kb-refs.test.mjs` (8 tests: prefixed paths, retired folder and file names, `oms-core/docs/` paths, exclusions); CLI 0 findings; `oms-kb-explorer npm run build` (evidence/oms-kb-explorer-1.log); `check:storyboards` normal and `--strict` pass | PASS |

## Goal Assessment

The goal asked for four things:
- a more logical, user-friendly structure;
- no misleading or outdated documents;
- capabilities (use cases, requirements) organised, complete and current, with the developer cockpit
  as the way to work with them;
- good retrieval for agents over MCP.

- **Structure.** The bundle follows the requester's outline: capabilities, domain, framework,
  architecture, infrastructure, ui, tools, delivery, semantic-layer, plus archive. The outline's
  `specs/` section became `framework/` + `domain/`, as decided at the proposal approval. Every
  folder has an index that says what belongs in it.
- **Misleading content.**
  - Every document was scanned for checkable claims. Documents with findings and every
    specification were read against the code.
  - Wrong facts were corrected. Specifications that describe more than is built carry an
    implementation-status banner, and nine superseded documents are archived. Retired terms and
    dead references are now guarded by the checker and `check-kb-refs`.
  - An independent review found further stale pages: the schema-version rule existed only in the
    archive, the target-architecture status table was out of date, and the agent profile used old
    names. All are fixed, and the re-review found no material gap.
  - Honest limit: 107 documents with disposition *keep* passed the mechanical scan but were not
    read line by line. The register says so and lists them for a human eye.
- **Capabilities.**
  - 22 use cases and 8 actors were added. Every requirement is exercised by a use case.
  - FR-047 to FR-056 and NFR-011 cover behaviour built since SPEC-0010.
  - Maturity and implementation were re-checked (NFR-005 is now implemented, NFR-010 partial).
  - In the cockpit, the Requirements view opens on a Capabilities tab and shows the full use case
    and implementation status. The Knowledge Base view shows the nested folder tree.
- **Agents.**
  - Old paths resolve through `aliases`, and deprecated documents are hidden from search by default.
  - The `category` filter now means the section.
  - The golden set covers every section.
  - The Copilot agent, chat mode and instructions use the current tools and paths.

Left out on purpose:
- human sign-off (`verified`);
- building the planned items (Cozystack, market adapter, knowledge graph, CI);
- adding the knowledge base checks to `specs/config.json` (gate config, human-only, TD-14).

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contract files added or moved |
| P-02 | Specification before code, generated models only | PASS | Rules and conventions were written before the migration; no hand-written models |
| P-03 | Never edit generated code | PASS | No generated files touched; OpenWiki untouched |
| P-04 | Contracts evolve compatibly | PASS | No OpenAPI/Avro change; MCP tool signatures unchanged, old KB ids still resolve |
| P-05 | Every state change is recorded in the event log | N/A | No order state change; oms-core edits are Javadoc/comments only |
| P-06 | Kafka only through the transactional outbox | N/A | No messaging change |
| P-07 | Schema changes through new Liquibase changesets | PASS | No changelog diff. An accidental comment edit in `014-…yaml` was reverted at once, and the folder is excluded from reference rewriting |
| P-08 | Concurrency and idempotency are explicit | N/A | No commands or consumers changed |
| P-09 | Commands and queries stay separate | N/A | No API change |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No transition logic changed |
| P-11 | Layering and conventions | PASS | MCP: alias resolution in `docs/DocumentRepository`, presentation in `kb/KnowledgeBaseTools`. Cockpit: services, IPC, store and views as before |
| P-12 | Jackson 3 only | PASS | No new Jackson usage. Existing Jackson 2 usage is recorded as TD-1 |
| P-13 | Errors and validation follow the framework specs | PASS | The MCP unknown-path error is unchanged |
| P-14 | Test first, every AC proven by an automated test | PASS | Each AC traces to named tests above (red first for the rules, MCP, cockpit). The knowledge base suites run by hand (TD-14) |
| P-15 | Observability | N/A | No runtime order-flow change; MCP alias hits are logged at info |
| P-16 | Security | PASS | Alias resolution stays under the configured base dirs; `check-kb-refs` only reads `git ls-files` output |
| P-17 | Simplicity and dependencies | PASS | No new dependencies. The unused Qdrant service was removed from compose, recorded in design.md and confirmed by the maintainer. The policy check's R10 warning is that rule firing on any compose change |
| P-18 | Modules build standalone | PASS | Changes are internal to each module; every module's verify passes on its own |
| P-19 | Documentation follows behaviour | PASS | This ticket is the knowledge base update: conventions, schema and constraints, tool pages, okf-check README and log entry are updated |

## Independent Review

The spec-reviewer agent ran twice.

**First pass: GOAL NOT MET.** All ten ACs passed their tests, but the review found 13 findings:

| # | Severity | Finding | Fixed by |
|---|---|---|---|
| 1 | major | Schema-version rule only in the archive | New section in `architecture/concepts/state-store.md` |
| 2 | major | target-architecture §10 marked finished work as planned | Status column updated to the ticket states |
| 3 | major | `ci-cd.md` claimed the knowledge base checks run in verify | Page corrected; TD-14 recorded |
| 4 | major | Agent profile pointed at retired file names | Table and pattern lines use new paths |
| 5 | minor | Dead link in `oms-core/README.md` | Links the knowledge base pages |
| 6 | minor | Stale prose references in three domain and architecture pages | References fixed |
| 7 | minor | The register over-claimed what "keep" means | Method states the limit; "keep" documents listed for a human eye |
| 8 | minor | `order-lifecycle.md` kept `status: stable` despite its banner | Set to `draft` |
| 9 | minor | Wrong embedding model named | `mxbai-embed-large` named everywhere |
| 10 | minor | F-11 and TD-8 in the debt register out of date | F-11 marked resolved, TD-8 reworded |
| 11 | minor | Qdrant still mentioned in `README.md` and `ARCHITECTURE-REVIEW.md` | Mentions fixed |
| 12 | minor | Dispatch extractor read the wrong classes | Reads `CommandDispatcher` |
| 13 | minor | `verification.md` not yet written | This document |

The weak AC evidence was strengthened in the same pass:
- `check-kb-refs` now also catches retired file names and `oms-core/docs/` paths;
- a duplicate-UC fixture was added;
- the duplicate golden entry was removed.

**Second pass: GOAL MET.** All 13 findings were confirmed fixed, and AC-5, AC-6 and AC-10 are
proven. One new minor point (the transaction-handling table did not say that REFUSED and FAILED rows
are written in their own transaction) was fixed before the final verify run. One note was accepted
as is: relative `docs/x.md` links inside oms-core are not scanned; the only real one was fixed.

## Automated Evidence

`evidence/last-run.json`: ran 2026-11-14T11:40:37Z, result **pass**, fingerprint `d67a3f0edcdf329c`.
Modules: oms-knowledge-base, developer-cockpit, oms-mcp-server, oms-kb-explorer.

| Module | Command | Exit | Log |
|---|---|---|---|
| developer-cockpit | `npm run typecheck` | 0 | evidence/developer-cockpit-1.log |
| developer-cockpit | `npm test` (622 passed, 2 skipped) | 0 | evidence/developer-cockpit-2.log |
| oms-mcp-server | `./gradlew check` | 0 | evidence/oms-mcp-server-1.log |
| oms-kb-explorer | `npm run build` | 0 | evidence/oms-kb-explorer-1.log |

Policy check (changes since merge-base 33f4e201): PASS, with one warning, R10 P-17. The compose
change is recorded in design.md.

## Follow-ups

- **TD-14:** add `okf-check`, its tests and `check-kb-refs` to `oms-knowledge-base.verify` in
  `specs/config.json`. This is gate config, so the maintainer edits it.
- **Human review:** read the 107 "keep" documents, starting with the two flagged in the register:
  - the order lifecycle disagrees with the state machine;
  - the validation engine design is not built.
- **Technical debt register:** TD-1 (Jackson 2), TD-5 (bust/whack handlers, SPEC-0030), TD-13 (no
  CI on push).
- **Retrieval quality:** MRR is 0.808 against a floor of 0.80. Watch it as use cases and
  requirements grow.

## Verdict

Verdict: GOAL MET
