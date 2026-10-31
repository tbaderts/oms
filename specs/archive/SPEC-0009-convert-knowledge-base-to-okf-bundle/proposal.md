# Proposal — SPEC-0009: Convert knowledge base to OKF bundle

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The goal asks for the knowledge base, the MCP server and the KB explorer to use the Open Knowledge
Format (OKF, v0.2: <https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md>).
This ticket is the foundation the other three tickets build on (SPEC-0010 content, SPEC-0011 MCP
server, SPEC-0012 KB explorer): they need a bundle that already conforms.

Today `oms-knowledge-base/` holds 32 markdown documents with no machine-readable metadata. Each
document carries an ad-hoc bold header (`**Version:**`, `**Status:**`, `**Last Updated:**`) whose
spelling and values vary (`Active`, `Complete`, `Draft`, `Draft for discussion`; dates as
`2026-02-14` or `October 8, 2025`), and some documents (`streaming-architecture.md`,
`state-machine-framework_spec.md`) have none. There are no folder indexes, no change log, no
document type, no provenance, and at least one known broken link
(`oms-framework/error-handling.md` → `streaming-architecture.md`, which lives in `oms-concepts/`).
The `KNOWLEDGE-BASE-REVIEW-REPORT.md` and `oms-knowledge-base-strategy.md` already call out these
gaps for AI consumers.

Consumers that would benefit: AI agents using the `oms` MCP server, the KB explorer UI, the
developer cockpit (which already parses YAML front matter but finds none), and humans navigating
the folders. Without a conformant bundle, the MCP server and explorer cannot filter by type, show
lifecycle or trust, or walk links, and every later content ticket would invent its own metadata.

## What Changes

- Every non-reserved `.md` file in `oms-knowledge-base/` starts with a YAML front matter block that
  has a non-empty `type` plus `title`, `description`, `tags` and `status`
  (`draft` | `stable` | `deprecated`), mapped from the existing bold header.
- The existing bold metadata header is kept below the H1 so current consumers (oms-mcp-server
  `listDomainDocs`, the KB explorer status badges) keep showing version and status unchanged.
- A root `index.md` declares `okf_version: "0.2"`; every folder that contains concepts gets an
  `index.md` listing its concepts and sub-folders with one-line descriptions.
- A root `log.md` records the conversion, in the OKF log format.
- A small, documented vocabulary of `type` values used by this bundle.
- Broken bundle-internal links are fixed.
- A conformance checker (Node script, no new dependencies outside the repo's toolchain) validates
  the bundle against OKF §11 plus the project rules above and exits non-zero on violations.
- The KB explorer stops rendering a document's YAML front matter as body text; it shows the
  markdown body only (full OKF-aware display stays in SPEC-0012).
- No file is moved or renamed, so concept ids (= paths) and every existing reference
  (CLAUDE.md, READMEs, MCP clients) stay valid.

No **BREAKING** changes.

## Scope

### In scope

- Front matter, `index.md`, `log.md` and the `type` vocabulary for all 32 existing documents.
- Mapping existing status/version/date headers into front matter.
- Fixing broken links between documents of the bundle.
- The conformance checker, its fixtures and its tests.
- A short "how to add a document" note so new documents stay conformant.
- A minimal front matter strip in oms-kb-explorer's document viewer, with a unit test run by
  Node's built-in test runner (no new dependency).

### Out of scope

- Restructuring, rewriting or adding content (capabilities, requirements, …): **SPEC-0010**.
- Reading OKF metadata in oms-mcp-server: **SPEC-0011**.
- OKF-aware browsing in oms-kb-explorer: **SPEC-0012**.
- Renaming or moving folders/files (e.g. the `oms-methodolgy` typo); that changes concept ids and
  belongs with the restructuring in SPEC-0010.
- Recording human verification (`verified`) on behalf of reviewers; the conversion does not claim
  any review happened.
- Attested Computations (OKF §10) and the OKF reference agent / visualizer.
- Cleaning up non-markdown artefacts (`animations/`, rendered videos, `.pyc`, the PDF).

## Acceptance Criteria

- **AC-1** — Given the converted `oms-knowledge-base/`, when the conformance checker runs on it,
  then it exits 0 and reports every non-reserved `.md` file as having parseable YAML front matter
  with a non-empty `type` (OKF §11 rules 1–2).
- **AC-2** — Given a fixture bundle containing a concept with no front matter, one with unparseable
  YAML and one with an empty `type`, when the checker runs on it, then it exits non-zero and names
  each offending file with the rule it breaks.
- **AC-3** — Given the converted bundle, when the checker runs, then every concept has `title`,
  `description`, a non-empty `tags` list and a `status` in {`draft`, `stable`, `deprecated`}, and the
  `type` is one of the documented vocabulary; a fixture concept missing any of these or using an
  undocumented `type` makes the checker exit non-zero naming the file and key.
- **AC-4** — Given the converted bundle, when the checker runs, then the root `index.md` has
  front matter containing only `okf_version: "0.2"`, every other `index.md` has no front matter,
  every folder containing concepts has an `index.md` that links every concept and sub-folder index
  in it, and `log.md` uses `## YYYY-MM-DD` headings newest first (OKF §8, §9, §12); a fixture
  violating each of these rules makes the checker exit non-zero.
- **AC-5** — Given the converted bundle, when the checker runs, then every timestamp-valued key
  present is ISO 8601 with an explicit UTC offset, every `generated.by` / `verified[].by` actor
  matches `human:<id>`, `process:<id>` or `<producer>/<version>`, and no concept carries a
  `verified` entry (the derived trust tier of every concept is "unverified"); a fixture with a
  timestamp lacking an offset or a malformed actor makes the checker exit non-zero.
- **AC-6** — Given the converted bundle, when the checker runs, then it reports zero broken
  bundle-internal markdown links (relative or `/`-prefixed, targets resolved to existing files;
  external URLs and `#anchors` excluded); a fixture with a broken internal link is reported.
- **AC-7** — Given each document that had a bold `**Version:**` or `**Status:**` header before the
  conversion, when its metadata is extracted with oms-mcp-server's rules
  (`MarkdownParser.extractMetadata`: bold lines within the first 20 lines), then the same version
  and status values are returned as before the conversion.
- **AC-8** — Given every concept with a pre-existing status header, when the checker runs, then its
  front matter `status` follows the mapping `Active`/`Complete`/`Implementation Complete` →
  `stable`, `Draft`/`Draft for discussion` → `draft`, and documents without a status header are
  `draft`.
- **AC-9** — Given document content that starts with a YAML front matter block, when the KB
  explorer prepares it for rendering, then the markdown passed to the renderer starts at the first
  line after the closing `---` (no YAML key appears in the rendered body); content without front
  matter, and content whose only `---` lines are thematic breaks later in the body, is passed
  through unchanged.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-knowledge-base (content + checker), oms-kb-explorer (front matter strip in the document viewer). |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | none |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-mcp-server: metadata unchanged (AC-7); `readDomainDoc` returns the raw file, so agents now also see the front matter; the new `index.md`/`log.md` files appear in `listDomainDocs` as extra documents. oms-kb-explorer: version/status badges unchanged (AC-7); its `DocumentViewer` passed raw content to `ReactMarkdown`, which would render the YAML block as body text (the closing `---` makes it a setext heading), so this ticket strips the front matter before rendering (AC-9). developer-cockpit: `KbService` starts showing front matter titles; `type` values are chosen not to collide with its requirement scanner keys (`use-cases`, `functional-requirements`, `non-functional-requirements`, `actors`). |
| Knowledge base | all 32 documents (front matter), new `index.md` files, new `log.md`, new conventions note; links fixed in documents with broken references. |

## Open Questions

- [resolved] Bundle root: the whole `oms-knowledge-base/` folder or a sub-folder? → assumption:
  the whole folder, so concept ids equal today's relative paths and nothing moves.
- [resolved] Keep or drop the bold metadata header? → assumption: keep it (below the front matter)
  until SPEC-0011 reads front matter; removing it would regress the MCP server and explorer now.
  Front matter is the source of truth; the bold header is a compatibility copy.
- [resolved] Should the conversion mark documents as verified by the team? → assumption: no. No
  `verified` key is added; a human adds one after reviewing a document. Optionally `generated` is
  set only where the author is known. Cheap to change later.
- [resolved] Where does the checker live and how is it run? → assumption: a Node script under the
  repository `tools/` folder, run as `node tools/okf-check.mjs oms-knowledge-base`; the exact
  location is a design decision.
- [deferred] Wiring the checker into the gate (`modules.oms-knowledge-base.verify` in
  `specs/config.json` is currently empty) → agents may not edit the gate config; the verify stage
  runs the checker as explicit evidence. A human can add it to the module's `verify` list when
  approving this proposal.
- [resolved] The KB explorer would show the front matter as raw text at the top of each document.
  Accept until SPEC-0012, or fix here? → requester (2026-10-27): fix it here if it is a quick
  win. It is: a strip before rendering plus a unit test on Node's built-in runner (AC-9).
- [deferred] The `oms-kb-explorer` module's gate `verify` list in `specs/config.json` only runs
  `npm run build` → agents may not edit the gate config; the verify stage runs the new `npm test`
  as explicit evidence. A human can add `npm test` to that list.
- [deferred] Renaming `oms-methodolgy/` and other folder restructuring → changes concept ids;
  handled in SPEC-0010 together with the content restructure.
