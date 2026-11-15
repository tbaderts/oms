---
type: Reference
title: "Knowledge Base Conventions (OKF)"
description: "How the OMS knowledge base follows the Open Knowledge Format: document types, required metadata, lifecycle and how to add a document."
tags: [knowledge-base, okf, conventions]
status: stable
updated: "2026-11-14T12:00:00Z"
reviewed_since: "2026-11-14T00:00:00Z"
retired_terms: [ReadySet, logical replication, Spring Boot 3, oms-methodolgy, oms-concepts/, oms-framework/]
type_vocabulary: [Concept Paper, Specification, Diagram, Methodology, Assessment, Strategy, Reference, Capability, Requirement, Domain Concept, Glossary, Interface, Architecture, Component, Decision, Use Case, Actor, Pattern]
---
# Knowledge Base Conventions (OKF)

The OMS knowledge base is an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format)
bundle, version 0.2 ([SPEC.md](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md)).
The whole `oms-knowledge-base/` folder is the bundle, except `storyboards/` (see below). Every
markdown file except `index.md` and `log.md` is a *concept*, and its id is its path without `.md`,
for example `oms-concepts/order-lifecycle`.

**Exception: `storyboards/` is not part of the bundle.** Storyboards (SPEC-0014) are process
journeys in their own file format: `story.md`, one file per step, sketches and an optional evidence
card. The Developer Cockpit creates and reorders them, so they cannot carry concept front matter or
folder indexes. The checker skips `storyboards/` at the bundle root, and storyboards have their own
check, `npm run check:storyboards` in `developer-cockpit`; see
[`storyboards/README.md`](storyboards/README.md). Link to a storyboard's folder from a concept as
plain text, not as a markdown link.

## Document types

The `type_vocabulary` in this page's front matter is the list of allowed `type` values. The
checker rejects any other value, so add a type here (with a definition below) before using it.

| Type | Use it for |
|---|---|
| Concept Paper | A proposal or exploration of a domain topic that is still open for discussion |
| Specification | The agreed behaviour, model or design of a capability, framework or component |
| Diagram | A document whose main content is diagrams illustrating another concept |
| Methodology | How the team works: values, roles, processes, architecture method |
| Assessment | An evaluation or review of the system, the knowledge base or an option |
| Strategy | A plan for how something should evolve |
| Reference | Lookup material such as these conventions |
| Capability | Something the OMS can do for its users, built or planned (folder `capabilities/`) |
| Use Case | How an actor uses a capability: preconditions, main and alternative flows, postconditions, requirements exercised (folder `capabilities/use-cases/`) |
| Actor | A person or system that interacts with the OMS (folder `capabilities/actors/`) |
| Requirement | One functional (`FR-nnn`) or non-functional (`NFR-nnn`) requirement (folders `capabilities/functional-requirements/`, `capabilities/non-functional-requirements/`) |
| Domain Concept | A business object or value set of the domain, such as an entity or the order states (folder `domain/model/`) |
| Glossary | Definitions of domain terms (folder `domain/model/`) |
| Interface | An API, topic set or message catalogue other systems use (folder `domain/interfaces/`) |
| Architecture | An overview of how the system or its platform is put together (folders `architecture/`, `infrastructure/`) |
| Component | One deployable module or library (folders `architecture/context/`, `tools/`) |
| Decision | An architecture decision record, `ADR-nnn`: context, decision, consequences (folder `architecture/decisions/`) |
| Pattern | How a recurring technical problem is solved in this codebase, to follow when writing code (folder `architecture/patterns/`) |

### Keys of the structured types

These are project keys on top of the common front matter; the checker enforces them.

| Type | Key | Meaning |
|---|---|---|
| Capability | `maturity` | `implemented`, `partial` (some behaviour missing) or `planned` |
| Capability | `commands` | The command schemas (`*Cmd` in `oms-contracts`) this capability handles; `[]` for none. Each command belongs to exactly one capability |
| Requirement | `id` | `FR-nnn` or `NFR-nnn`, unique; FR files live in `capabilities/functional-requirements/`, NFR files in `capabilities/non-functional-requirements/` |
| Requirement | `priority` | MoSCoW: `must`, `should`, `could`, `wont`. The priorities set in SPEC-0010 are an initial proposal by the authoring agent, not a team decision; review them |
| Requirement | `implementation` | `implemented` (built and covered by the cited tests), `partial` (built only in part, or only partly covered by tests; the document says which) or `not-implemented` |
| Requirement | `capability` | Bundle path of the capability it belongs to, e.g. `/capabilities/order-capture.md` |
| Requirement (NFR) | `category`, `metric`, `target` | Quality attribute, how it is measured, and the target value |
| Domain Concept | `entity` | The JPA entity class it describes, when it describes one |
| Interface | `covers` | What it documents: `openapi:<path>`, `http:<base path>`, `avro:<Schema>`, `kafka:<topic>`. Every such item of the system appears in exactly one interface |
| Component | `component` | The module or compose service name |
| Use Case | `id` | `UC-nnn`, unique; the file name starts with it |
| Use Case | `actors` | Non-empty list of bundle paths to Actor concepts |
| Use Case | `capability` | Bundle path of the capability it belongs to |
| Actor | `kind` | `human`, `system` or `external` |
| Decision | `id` | `ADR-nnn`, unique; the file name starts with it |

Every Capability and Requirement links to the other (a capability lists its requirements; a
requirement names its capability), and the file names of requirements start with their id. A
Capability also links at least one Use Case, and every Requirement is linked from at least one Use
Case body (under `## Requirements`), so each requirement has a reason. Use cases have the sections
`## Preconditions`, `## Main Flow`, `## Alternative Flows`, `## Postconditions` and `## Requirements`,
which the developer cockpit reads.

### Sources and provenance of the structured types

Documents of the eight structured types above must carry `generated` (who produced them) and a
non-empty `sources` list. Code and contracts are cited with the `repo:` scheme, a path relative to
the repository root:

```yaml
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:00:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OutboxRelay.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/OutboxRelayTest.java"
```

The checker verifies that every `repo:` path exists. A requirement that is `implemented` or
`partial` must cite at least one main source (a file under a `src/` tree) and one test (a
`src/test/` file, a `*.test.*` file or a `*Test.java`). Behaviour without a test is not written up
as an implemented requirement; it is listed under the capability's *Known gaps*.

## Front matter

Every concept starts with a YAML front matter block:

```yaml
---
type: Specification
title: "Order Lifecycle Management Specification"
description: "One sentence saying what the document covers."
tags: [order-lifecycle, state-machine]
status: stable
version: "1.0"
updated: "2026-02-14T00:00:00Z"
---
```

| Key | Required | Meaning |
|---|---|---|
| `type` | yes (OKF) | One of the document types above |
| `title` | yes (project) | Human-readable title, normally the H1 |
| `description` | yes (project) | One sentence; shown in indexes and search results |
| `tags` | yes (project) | Non-empty list of short lowercase keywords |
| `status` | yes (project) | `draft`, `stable` or `deprecated` (OKF lifecycle) |
| `version` | no | Document version, quoted (`"1.0"`) |
| `updated` | no | Last substantive change, ISO 8601 instant with offset |
| `stale_after` | no | Instant after which the content should be re-checked |
| `sources` | no | Where the content comes from (OKF provenance), e.g. code paths or tickets |
| `generated` | no | `{ by, at }`: who produced the content (`human:<id>`, `process:<id>` or `<tool>/<version>`) |
| `verified` | no | List of `{ by, at }` review events; a `human:` reviewer makes the document *human-reviewed* |
| `aliases` | no | Former ids of a moved document (bundle path without `.md`); the MCP server resolves them. Unique across the bundle |
| `superseded_by` | for `deprecated` | Bundle path of the document that replaced it, or `none` |
| `point_in_time` | no | `true` for a dated record (assessment, review) that describes the system of its day; it is exempt from the retired-terms rule |

Timestamps are always ISO 8601 with an explicit offset (`2026-02-14T00:00:00Z`) and quoted.
Unknown keys are allowed and must be preserved by tools.

The older bold header (`**Version:**`, `**Status:**`, `**Last Updated:**`) was removed in SPEC-0061;
the front matter is the only metadata. Do not add it back.

### Status mapping from the old headers

| Old header | `status` |
|---|---|
| Active, Complete, Implementation Complete | `stable` |
| Draft, Draft for discussion | `draft` |
| (none) | `draft` |

### Trust

The OKF trust tier comes from `verified`: no entry means *unverified*, only tool actors means
*machine-confirmed*, any `human:` actor means *human-reviewed*. The conversion to OKF
(SPEC-0009) added no `verified` entries; add one when you have reviewed a document against the
code.

## Layout, review and archive

The sections of the bundle and what belongs in each are described in the
[Knowledge Base Strategy](semantic-layer/knowledge-base-strategy.md). Three settings in this page's
front matter keep the content honest:

- `reviewed_since`: every document outside `archive/` must have `updated` on or after it. A full
  review moves it forward; the last one is recorded in
  [the November 2026 review](semantic-layer/kb-review-2026-11.md).
- `retired_terms`: words that describe things the OMS does not have or no longer uses. They may not
  appear in prose (code spans are fine) outside `archive/` and point-in-time records.
- `archive/`: superseded documents, each `status: deprecated` with `superseded_by`. Search leaves
  them out by default. Do not link to them from current documents except to explain history.

Every rule the checker applies is listed in
[Schema and Constraints](semantic-layer/schema-and-constraints.md).

## Indexes and log

- [`index.md`](index.md) at the root declares `okf_version: "0.2"` and links every root document
  and every folder index. Each folder that contains documents has its own `index.md`, without
  front matter, with a bulleted link and a one-line description per document and sub-folder.
- [`log.md`](log.md) records notable changes to the knowledge base under `## YYYY-MM-DD`
  headings, newest first.

## Links

Use ordinary markdown links. Relative links (`../framework/validation-engine.md`) and
bundle-relative links starting with `/` (`/framework/validation-engine.md`) both work. Every
internal link must point to an existing file.

## Adding or changing a document

1. Create the file in the folder that fits, with front matter as above and `updated` set to today.
   To move a document, `git mv` it, add its old id to `aliases`, and fix the links to it.
2. Add a bullet to that folder's `index.md` (create the index if the folder is new, and link it
   from the parent index).
3. For a notable change, add a line under today's date in `log.md`.
4. Run the checker from the repository root and fix every error:

   ```bash
   npm --prefix tools/okf-check install            # first time only
   node tools/okf-check/okf-check.mjs oms-knowledge-base
   ```
