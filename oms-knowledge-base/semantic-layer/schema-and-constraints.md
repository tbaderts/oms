---
type: Reference
title: "Schema and Constraints"
description: "Every rule that keeps the knowledge base consistent and truthful, what it protects and which tool enforces it: okf-check rules, its coverage tests against the code, check-kb-refs, the retrieval evaluation and the storyboard check."
tags: [semantic-layer, okf, checker, constraints, quality]
status: stable
updated: "2026-11-15T19:00:00Z"
sources:
  - resource: "repo:tools/okf-check/okf-check.mjs"
  - resource: "repo:tools/okf-check/test/kb-coverage.test.mjs"
  - resource: "repo:tools/okf-check/check-kb-refs.mjs"
  - resource: "repo:oms-mcp-server/src/test/java/org/example/mcp/index/RetrievalEvalTest.java"
---
# Schema and Constraints

The schema of the knowledge base (types, keys, folders) is defined in the
[conventions](../okf-conventions.md). This page lists the constraints that enforce it and what each
one protects. Run them all with:

```bash
node tools/okf-check/okf-check.mjs oms-knowledge-base   # the bundle rules
cd tools/okf-check && npm test                          # rules on fixtures, coverage against the code
node tools/okf-check/check-kb-refs.mjs                  # references to the knowledge base from the rest of the repo
```

## Bundle rules (`okf-check`)

| Rule | Checks | Protects |
|---|---|---|
| `OKF-FM`, `OKF-TYPE`, `OMS-KEYS`, `OKF-STATUS`, `OMS-VOCAB` | Front matter parses; `type` from the vocabulary; `title`, `description`, `tags`, `status` present | Every document is typed and findable |
| `OKF-TIME`, `OKF-ACTOR`, `OMS-UNVERIFIED` | Timestamps with offsets; actors well-formed; no `verified` claimed by tools | Provenance can be trusted |
| `OKF-INDEX-ROOT`, `OKF-INDEX`, `OKF-LOG` | Root declares `okf_version`; every folder's `index.md` links its documents and sub-folders; log newest first | Nothing is orphaned; navigation works |
| `OKF-LINK` | Every link stays in the bundle and resolves | No dead links |
| `OMS-CAP` | A Capability has `maturity`, `commands`, links at least one Requirement and one Use Case | The catalogue is complete |
| `OMS-UC` | A Use Case has a unique `UC-nnn`, actors that are Actors, a Capability, at least one Requirement link; lives in `capabilities/use-cases/` | Use cases are traceable |
| `OMS-ACTOR` | An Actor has `kind` (human, system, external); lives in `capabilities/actors/` | Actors are typed |
| `OMS-REQ` | A Requirement has a unique `FR-nnn`/`NFR-nnn` in its folder under `capabilities/`, a priority, an implementation and a capability | Requirements are traceable |
| `OMS-TRACE` | Every Requirement is linked from at least one Use Case | No requirement without a reason |
| `OMS-ADR` | A Decision has a unique `ADR-nnn` that starts its file name | Decisions are citable |
| `OMS-SRC`, `OMS-PROV` | `repo:` sources exist; implemented requirements cite code and a test; structured types say who generated them | Claims point at real code |
| `OMS-REVIEWED` | Outside the archive, `updated` is on or after `reviewed_since` | Nothing escapes a review |
| `OMS-RETIRED` | Outside the archive and point-in-time records, prose contains no `retired_terms` | Known-false claims cannot come back |
| `OMS-ARCHIVE` | Archived documents are `deprecated`; every deprecated document names `superseded_by` | Readers are sent to the current page |
| `OMS-ALIAS` | `aliases` are unique and do not shadow a current document | Old ids resolve to exactly one page |

### Freshness warnings (SPEC-0064)

Warnings ask for a review. They are printed as `WARN` lines and never change the exit code.

| Rule | Warns when | What to do |
|---|---|---|
| `OMS-AGE` | Outside the archive, `updated` is older than `review_after_days` (in the conventions) | Review the page and set `updated` |
| `OMS-STALE` | `stale_after` has passed | Review the page; move `stale_after` or archive it |
| `OMS-DEPRECATED` | A `deprecated` document is outside `archive/` | Move it to `archive/` |
| `OMS-DRIFT` | Outside the archive, a `repo:` source was committed after the page's `updated` and after the page's own last commit | Check the page still matches the code, then set `updated` |

`okf-check --json` prints the errors, the warnings and statistics: documents by type, status and
folder, requirements by implementation and priority, and review age. `okf-check --fix-indexes`
adds the entries that `OKF-INDEX` reports as missing; `--dry-run` only lists them. The Developer
Cockpit shows all of it in its Knowledge Base **Health** panel.

## Coverage against the code (`kb-coverage.test.mjs`)

- Every command schema belongs to exactly one capability, and a capability is not `implemented`
  while one of its commands is not dispatched.
- Every OpenAPI path, controller base path, Avro schema and Kafka topic is documented by exactly
  one Interface (`covers`).
- Every JPA entity and every order and cancel state is documented.
- Every concept is reachable from the root index; every product specification is linked from a
  capability.
- The developer cockpit's scan finds every requirement.
- The bundle root has exactly the agreed sections; the November 2026 review register covers every
  document that existed before.

## Outside the bundle

- **`check-kb-refs`** fails on any reference to a knowledge base path that no longer exists, and on
  the retired folder names, anywhere in the repository except history (archived tickets, OpenWiki,
  the archive, dated assessments, the log).
- **`RetrievalEvalTest`** (oms-mcp-server) keeps search recall@5 at 0.90 or better, with golden
  queries for every section ([NFR-009](../capabilities/non-functional-requirements/NFR-009-knowledge-retrieval-quality.md)).
- **`npm run check:storyboards`** (developer-cockpit) checks the storyboards, which are not part of
  the bundle.
