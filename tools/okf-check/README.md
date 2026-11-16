# okf-check

Conformance checker for `oms-knowledge-base/` as an
[Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format) v0.2 bundle
(SPEC-0009). The project conventions it enforces are documented in
[`oms-knowledge-base/okf-conventions.md`](../../oms-knowledge-base/okf-conventions.md).

## Usage

Requires Node.js 22.18 or later.

```bash
# from the repository root
npm --prefix tools/okf-check install                    # first time only
node tools/okf-check/okf-check.mjs oms-knowledge-base
```

Output is one `ERROR <file> [<rule>]: <message>` line per finding, one `WARN …` line per
freshness warning, and a summary. Exit code `0` when the bundle conforms, `1` when there are
errors (warnings never fail), `2` on a usage error (directory missing, unknown option).

```bash
node tools/okf-check/okf-check.mjs oms-knowledge-base --json                  # { concepts, errors, warnings, stats }
node tools/okf-check/okf-check.mjs oms-knowledge-base --fix-indexes --dry-run  # list missing index entries
node tools/okf-check/okf-check.mjs oms-knowledge-base --fix-indexes            # add them
```

`--json` adds `stats`: documents by type, status and top-level folder; requirements by
`implementation` and `priority`; review age (`current`, `due`, `unknown` against
`review_after_days`; archive excluded); and whether git could date the sources (`drift`).
`--fix-indexes` only adds lines: each missing concept or sub-folder index gets
`- [Title](link) — description`, after the last entry of its kind, else at the end of its section
(`## Documents`/`## Concepts`, `## Sections`/`## Folders`), else in a new section; a folder
without `index.md` gets one. It is idempotent and keeps the file's line endings (SPEC-0064). The
Developer Cockpit's Knowledge Base Health panel runs both.

The `storyboards/` folder at the bundle root is not part of the bundle and is skipped. Storyboards
have their own file format and their own check, `npm run check:storyboards` in `developer-cockpit`
(SPEC-0014). A folder named `storyboards` deeper in the bundle is checked as usual.

```bash
cd tools/okf-check && npm test               # fixtures + the real bundle
```

## Rules

| Rule | Source | Check |
|---|---|---|
| `OKF-FM` | OKF §11.1 | every non-reserved `.md` starts with a parseable YAML mapping between `---` lines |
| `OKF-TYPE` | OKF §11.2 | `type` is a non-empty string |
| `OMS-KEYS` | project | `title`, `description` are non-empty strings; `tags` is a non-empty list of strings |
| `OKF-STATUS` | OKF §5.4 | `status` is `draft`, `stable` or `deprecated` (required by the project) |
| `OMS-VOCAB` | project | `type` is listed in `type_vocabulary` of `<bundle>/okf-conventions.md` |
| `OKF-TIME` | OKF §5 | `updated`, `stale_after`, `generated.at`, `verified[].at`, `sources[].last_modified` are ISO 8601 instants with an offset |
| `OKF-ACTOR` | OKF §7 | `generated.by`, `verified[].by` are `human:<id>`, `process:<id>` or `<producer>/<version>` |
| `OMS-UNVERIFIED` | project | no `verified` key; the conversion must not claim a review (relax once reviews are recorded) |
| `OKF-INDEX-ROOT` | OKF §8, §12 | root `index.md` exists with front matter exactly `okf_version: "0.2"` |
| `OKF-INDEX` | OKF §8 | other `index.md` files have no front matter; every folder with concepts has an `index.md` linking each concept and child folder index |
| `OKF-LOG` | OKF §9 | `log.md` has no front matter and `## YYYY-MM-DD` headings, newest first |
| `OKF-LINK` | OKF §6 | relative and `/`-prefixed markdown links outside code stay inside the bundle and resolve to a file, or to a folder that has an `index.md` |
| `OMS-CAP` | project (SPEC-0010, SPEC-0061) | a `Capability` has `maturity` (implemented, partial, planned), a `commands` list (may be `[]`) and links at least one `Requirement` and one `Use Case` |
| `OMS-REQ` | project (SPEC-0010) | a `Requirement` has a unique `id` (`FR-nnn` in `capabilities/functional-requirements/`, `NFR-nnn` in `capabilities/non-functional-requirements/`), a MoSCoW `priority`, an `implementation` (implemented, partial, not-implemented) and a `capability` pointing to a `Capability` |
| `OMS-UC` | project (SPEC-0061) | a `Use Case` has a unique `UC-nnn` that starts its file name, lives in `capabilities/use-cases/`, has `actors` that resolve to `Actor` concepts, a `capability`, and links at least one `Requirement` |
| `OMS-ACTOR` | project (SPEC-0061) | an `Actor` has `kind` (human, system, external) and lives in `capabilities/actors/` |
| `OMS-TRACE` | project (SPEC-0061) | every `Requirement` is linked from at least one `Use Case` |
| `OMS-ADR` | project (SPEC-0061) | a `Decision` has a unique `ADR-nnn` that starts its file name |
| `OMS-REVIEWED` | project (SPEC-0061) | outside `archive/`, `updated` is on or after the conventions' `reviewed_since` (off when it is not set) |
| `OMS-RETIRED` | project (SPEC-0061) | outside `archive/` and `point_in_time: true` documents, prose (not code) contains none of the conventions' `retired_terms`, case-insensitive |
| `OMS-ARCHIVE` | project (SPEC-0061) | documents in `archive/` are `deprecated`; every `deprecated` document has `superseded_by` (a concept path or `none`) |
| `OMS-ALIAS` | project (SPEC-0061) | `aliases` are strings, unique across the bundle, and never the id of an existing concept |
| `OMS-SRC` | project (SPEC-0010) | every `repo:<path>` source exists under the repository root; an implemented or partial requirement cites a main source (a file under a `src/` tree) and a test (`src/test/…`, `*.test.*` or `*Test.java`) |
| `OMS-PROV` | project (SPEC-0010) | concepts of the structured types (Capability, Requirement, Domain Concept, Glossary, Interface, Architecture, Component, Decision) carry `generated` by a tool actor and non-empty `sources` |
| `OMS-AGE` (warning) | project (SPEC-0064) | outside `archive/`, `updated` is older than the conventions' `review_after_days` (off when not set) |
| `OMS-STALE` (warning) | OKF §5 | `stale_after` has passed |
| `OMS-DEPRECATED` (warning) | project (SPEC-0064) | a `deprecated` document lies outside `archive/` |
| `OMS-DRIFT` (warning) | project (SPEC-0064) | outside `archive/`, a `repo:` source has a git commit later than both the document's `updated` and its own last commit (skipped without git) |

`repo:` paths resolve against the repository root, by default the bundle's parent directory;
override with `--repo <dir>` (the tests pass the fixture directory).

YAML is parsed with the JSON schema, so timestamps and versions stay strings and must be quoted.

## Reference check

```bash
node tools/okf-check/check-kb-refs.mjs        # from the repository root; exit 0 clean, 1 findings
```

`check-kb-refs.mjs` (SPEC-0061) scans every tracked and untracked, not ignored text file for
`oms-knowledge-base/<path>` and fails when the path does not exist, and on any mention of the retired
folders `oms-concepts/`, `oms-framework/`, `oms-methodolgy/`. Excluded: archived and in-flight spec
tickets, OpenWiki, the knowledge base archive, dated assessments, the review register, the log, the
conventions, applied Liquibase changelogs and this tool's own README and tests. Test sources are checked for the
retired folders only, since their fixtures name paths in temporary workspaces; `aliases:` lines are
skipped.

## Tests

- `test/okf-check.test.mjs` — each rule against variants of `test/fixtures/valid/`, the CLI, and
  the real bundle.
- `test/kb-coverage.test.mjs` — the structured content against the code and contracts: every
  command schema in exactly one capability (and not `implemented` unless dispatched), every OpenAPI
  path, controller base path, Avro schema and Kafka topic in exactly one `Interface`, every entity
  and state symbol documented, every document reachable from the root index, every specification
  in a product folder (domain, framework, ui) linked from a capability, every requirement
  found by the developer cockpit's scan, the agreed root layout, and the November 2026 review
  register covering every document that existed before SPEC-0061.
- `test/check-kb-refs.test.mjs` — the reference check against throw-away repositories.

The SPEC-0009 metadata baseline test was removed in SPEC-0061: it compared the legacy bold headers,
which that ticket removed, keyed by paths that no longer exist.
