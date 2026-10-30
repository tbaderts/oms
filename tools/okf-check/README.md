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

Output is one `ERROR <file> [<rule>]: <message>` line per finding and a summary. Exit code `0`
when the bundle conforms, `1` when there are errors, `2` on a usage error (directory missing).

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
| `OMS-CAP` | project (SPEC-0010) | a `Capability` has `maturity` (implemented, partial, planned), a `commands` list (may be `[]`) and links at least one `Requirement` |
| `OMS-REQ` | project (SPEC-0010) | a `Requirement` has a unique `id` (`FR-nnn` in `functional-requirements/`, `NFR-nnn` in `non-functional-requirements/`), a MoSCoW `priority`, an `implementation` (implemented, partial, not-implemented) and a `capability` pointing to a `Capability` |
| `OMS-SRC` | project (SPEC-0010) | every `repo:<path>` source exists under the repository root; an implemented or partial requirement cites a main source (a file under a `src/` tree) and a test (`src/test/…`, `*.test.*` or `*Test.java`) |
| `OMS-PROV` | project (SPEC-0010) | concepts of the structured types (Capability, Requirement, Domain Concept, Glossary, Interface, Architecture, Component, Decision) carry `generated` by a tool actor and non-empty `sources` |

`repo:` paths resolve against the repository root, by default the bundle's parent directory;
override with `--repo <dir>` (the tests pass the fixture directory).

YAML is parsed with the JSON schema, so timestamps and versions stay strings and must be quoted.

## Tests

- `test/okf-check.test.mjs` — each rule against variants of `test/fixtures/valid/`, the CLI, and
  the real bundle.
- `test/kb-coverage.test.mjs` — the structured content against the code and contracts: every
  command schema in exactly one capability (and not `implemented` unless dispatched), every OpenAPI
  path, controller base path, Avro schema and Kafka topic in exactly one `Interface`, every entity
  and state symbol documented, every document reachable from the root index, every specification
  linked from a capability, and every requirement found by the developer cockpit's scan.
- `test/mcp-metadata.test.mjs` — the metadata oms-mcp-server extracts
  (`test/mcp-metadata.mjs`, a port of `MarkdownParser#extractMetadata`) still matches
  `test/baseline-metadata.json`, captured from the bundle before the conversion; and front matter
  `status` follows the old header. `test/capture-baseline.mjs` produced the baseline.
