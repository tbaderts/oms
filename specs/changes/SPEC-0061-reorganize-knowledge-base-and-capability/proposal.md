# Proposal — SPEC-0061: Reorganize knowledge base and capability catalogue

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The knowledge base (`oms-knowledge-base/`, 90 concepts) has grown in three layers that were never
merged. The first is the original folders (`oms-concepts/`, `oms-framework/`, `oms-methodolgy/`
(misspelled), `illustrations/`, `ui/`). SPEC-0009 added OKF front matter on top of them. SPEC-0010
then added a parallel structured layer (`capabilities/`, `functional-requirements/`,
`non-functional-requirements/`, `domain/`, `interfaces/`, `architecture/`). The same topic now
lives in two places with different levels of truth. For example, `oms-concepts/order-replace.md`
(1,438 lines, `status: stable`) reads as current behaviour, while `capabilities/order-replace.md`
says replace is not built. Six of the old folders' documents still claim `stable` with an `updated`
date from February 2026 or earlier. Since then, SPEC-0018 to SPEC-0060 changed the outbox, command
log, projections, partitioning and UI.

The KB also contains content that is demonstrably outdated:

- `state-query-store_spec.md` describes a ReadySet / logical-replication read store that does not
  exist (CLAUDE.md: "there is no separate materialized read store").
- `openapi-contracts.md` and `oms-admin-ui_spec.md` reference Spring Boot 3.
- `KNOWLEDGE-BASE-REVIEW-REPORT.md` (February 2026) reviews 20 documents that have since been
  rewritten.
- Architecture material lives outside the KB entirely: `oms-core/docs/target-architecture.md`, two
  architecture reviews, and a load baseline.

There is also no home for the areas the requester lists: implementation patterns (Kafka, transaction
handling, trace propagation, service template), technical debt, infrastructure (local Docker stack,
Cozystack/Kubernetes, LGTM observability), tools (MCP server, KB explorer, developer cockpit, mission
control), delivery lifecycle (CI/CD, release, testing) and the semantic layer (OKF, knowledge
graph).

The capability catalogue is incomplete for the [developer cockpit](../../../oms-knowledge-base/architecture/developer-cockpit.md),
the tool meant for interacting with it:

- The cockpit's Requirements view has *Use Cases* and *Actors* tabs. The KB has no use cases or
  actors, so both tabs are always empty (`RequirementsService` scans `use-cases/` and `actors/`).
- The view does not show capabilities at all.
- It reports an FR's OKF `status` (always `draft`) where it should report the FR's
  `implementation`.
- The cockpit's KB categories are hard-coded to the three legacy folders.

Agents are affected as much as people. The MCP server ranks by section text, so duplicated and stale
pages compete with the correct ones in search results, and an agent cannot tell which one is
current. Two files list old paths as the place to look: `.github/copilot-instructions.md` (which
calls a 92-line document "713 lines - complete") and CLAUDE.md.

If we do nothing, every new spec ticket adds a fourth layer, and agents keep grounding designs on
superseded documents.

Ticket goal: reorganize into a logical, user-friendly structure; review documents so none are
misleading or outdated; review how capabilities (use cases, requirements) are organised and make
them complete and current, with the developer cockpit as the way to interact with them; keep it
working well for agents retrieving knowledge through MCP.

## What Changes

- **A new top-level structure** for `oms-knowledge-base/`. It follows the requester's outline, with
  the deviations noted in Open Questions:
  - `architecture/`
    - `context/`: system context and components, including the planned market adapter
    - `concepts/`: event sourcing, CQRS, outbox, projections, streaming, target architecture
    - `patterns/`: Kafka consumer/producer, transaction handling, logging and trace-id
      propagation, microservice template
    - `decisions/`: ADRs, numbered `ADR-nnn`
    - `technical-debt/`
    - `illustrations/`
  - `framework/`: the core OMS framework (state machine, validation engine, task orchestrator, query
    engine, exception handling, state store)
  - `domain/`
    - `model/`: aggregates, entities and glossary
    - `concepts/`: lifecycle, quantities, replace, grouping, allocation, booking, trading capacity
    - `interfaces/`: command API, query API, message API (Avro and topics), REST read API
  - `capabilities/`, holding the capability documents plus `use-cases/`, `actors/`,
    `functional-requirements/` and `non-functional-requirements/`
  - `tools/`: knowledge server (MCP), KB explorer, developer cockpit, mission control
  - `delivery/`: spec-driven development, testing and test automation, CI/CD, release and deploy,
    manifesto, team skills, AI-augmented development
  - `infrastructure/`: local Docker stack, Cozystack/Kubernetes with its operators, LGTM
    observability (logs, traces, metrics)
  - `ui/`: UI specifications and the design system
  - `semantic-layer/`: OKF conventions, knowledge graph, schema and constraints
  - `archive/`: superseded documents kept for history, all `status: deprecated`
- **Every existing document is reviewed and given one disposition**: *keep*, *update* (corrected
  against the code), *merge* (folded into another document), *archive* or *delete*. The result is
  recorded in a review register (`semantic-layer/kb-review-2026-11.md`) that maps each old path to
  its new path.
- **Stale content is corrected or retired.** This covers ReadySet, Spring Boot 3,
  documents describing unbuilt behaviour as current, the February review report and the legacy bold
  headers that contradict the front matter.
- **New documents fill the gaps listed in Why.** Each one is either written from the code, citing
  `repo:` sources, or is an explicit `planned` / `Concept Paper` stub that says what is not built.
  This applies to Cozystack, the market adapter, the knowledge graph and CI/CD where it does not
  exist yet.
- **`oms-core/docs/`** architecture documents (target architecture, architecture reviews) move into
  `architecture/`. Their open findings seed `architecture/technical-debt/`.
- **The capability model gains use cases (`UC-nnn`) and actors.**
  - Every capability links at least one use case.
  - Every use case names its actors and links the FRs it exercises.
  - Capability maturity and FR `implementation` values are re-checked against the code after
    SPEC-0018 to SPEC-0060.
- **Developer cockpit**
  - The Requirements view reads the new locations.
  - It gains a Capabilities tab (maturity, linked use cases and requirements).
  - It shows FR `implementation` instead of OKF `status`.
  - Its KB categories come from the bundle's top-level folders, not from a hard-coded list.
- **MCP server**
  - Documents carry an `aliases` list of their former ids, so `read_document` with an old path
    (e.g. `oms-concepts/order-lifecycle`) returns the moved document and names its new id.
  - The retrieval evaluation set is updated to the new paths and extended to the new sections.
- **Checker and tooling**
  - `okf-check` and its coverage tests follow the new paths.
  - New rules:
    - every non-archived concept carries an `updated` on or after the review date;
    - a list of retired terms may not appear outside `archive/`;
    - `UC`/actor keys are validated.
  - KB-explorer fixtures follow the new paths.
- **References to KB paths are updated** in CLAUDE.md, `.github/copilot-instructions.md`,
  `.github/chatmodes/`, the `spec-*` skills, Javadoc `@see` links and READMEs.

No **BREAKING** change to OMS contracts or runtime behaviour. KB paths are a de-facto interface for
agents and tools; old paths stay resolvable through `aliases` (MCP) and the review register
(people).

## Scope

### In scope

- Restructuring and migrating every document under `oms-knowledge-base/` except `storyboards/`.
  Storyboards stay at the bundle root, owned by the cockpit, but their `kb_links` are updated.
- The `oms-core/docs/*.md` architecture documents named above.
- A content review of every document against the current code, with corrections, merges and
  retirements.
- New documents for the target-structure areas. These are factual where the thing exists, and
  clearly marked planned stubs where it does not.
- Use cases and actors for every capability, plus a re-check of maturity and implementation values.
- Developer cockpit Requirements view (new paths, Capabilities tab, implementation status) and
  config.
- MCP server alias resolution and retrieval eval update.
- `okf-check`, KB explorer fixtures, and every in-repo reference to moved paths.

### Out of scope

- Building any of the planned infrastructure: Cozystack, operators, CI/CD pipelines, market
  adapter.
- A knowledge-graph database or new MCP graph tools. The semantic-layer folder documents the
  existing link and front-matter graph and the intended direction only.
- Human review sign-off (`verified` entries). Agents cannot claim a human review, and
  `OMS-UNVERIFIED` stays.
- Changing OpenWiki generated pages (regenerated by their workflow) and archived spec tickets under
  `specs/archive/` (historical record).
- Rewriting the KB explorer's or cockpit's UI beyond the Requirements view changes above.
- Re-prioritising requirements (MoSCoW), which remains a team decision.

## Acceptance Criteria

- **AC-1** — Given the reorganised bundle, when `node tools/okf-check/okf-check.mjs oms-knowledge-base`
  and `cd tools/okf-check && npm test` run, then both exit 0. In addition:
  - the bundle root contains only `index.md`, `log.md`, `okf-conventions.md` and the folders
    `architecture`, `framework`, `domain`, `capabilities`, `tools`, `delivery`, `infrastructure`,
    `ui`, `semantic-layer`, `archive`, `storyboards` and, unless the design moves it, `animations` (plus untracked render
    output);
  - no folder named `oms-concepts`, `oms-framework` or `oms-methodolgy` exists.
- **AC-2** — Given the pre-reorganisation list of tracked `.md` files under `oms-knowledge-base/`
  (git `HEAD` at ticket start), when the review register `semantic-layer/kb-review-2026-11.md` is
  parsed, then every one of those files appears exactly once, with one disposition (`keep`,
  `update`, `merge`, `archive`, `delete`) and, unless deleted, its new path. A test asserts each new
  path exists.
- **AC-3** — Given the bundle, when `okf-check` runs, then it fails if either of the following
  holds, and the real bundle passes:
  - a concept outside `archive/` has no `updated`, or one before 2026-11-14;
  - a concept outside `archive/` contains a retired term (at least `ReadySet`,
    `logical replication`, `Spring Boot 3`, `oms-methodolgy`) in prose. Fenced code is exempt.

  A fixture test proves each failure path.
- **AC-4** — Given every document under `archive/`, when `okf-check` runs, then each has
  `status: deprecated` and a `superseded_by` link that resolves, or the explicit value
  `superseded_by: none`. A fixture with a deprecated document outside `archive/` lacking it fails.
- **AC-5** — Given the capability catalogue, when the okf-check coverage tests run, then all of the
  following hold, and a fixture violating each rule fails:
  - every `Capability` links at least one `Use Case`;
  - every `Use Case` has a unique `UC-nnn` id, at least one actor that resolves to an `Actor`
    concept, and at least one linked `Requirement`;
  - every `Requirement` is linked from at least one use case;
  - every command schema is still in exactly one capability.
- **AC-6** — Given each capability marked `implemented` or `partial`, and each FR marked
  `implemented` or `partial`, when the coverage tests run, then every cited `repo:` test file exists.
  In addition, the capability/command dispatch check (existing rule: not `implemented` unless
  dispatched) passes against the current `CommandDispatcher`.
- **AC-7** — Given the developer cockpit pointed at the reorganised KB, when its test suite runs,
  then:
  - `RequirementsService` returns at least one use case, one actor and one capability, and every
    FR and NFR in the bundle (count equal to the files found by okf-check);
  - each FR exposes its `implementation` value;
  - the Requirements view renders a Capabilities tab listing each capability with its maturity;
  - the default KB categories equal the bundle's top-level folders. No hard-coded `oms-concepts`
    remains in `src/`.

  `npm run typecheck` and `npm test` pass.
- **AC-8** — Given the MCP server indexing the reorganised KB, when `read_document` (or the
  equivalent `/api/kb` call) is invoked with a former id from the register (e.g.
  `oms-concepts/order-lifecycle`), then it returns the moved document and its current id. An
  unknown id still returns not-found. Covered by an oms-mcp-server test; `./gradlew check` passes.
- **AC-9** — Given the updated retrieval evaluation set, when `RetrievalEvalTest` runs, then
  recall@5 is ≥ 0.90 (NFR-009). The set contains at least one golden query per new top-level
  folder, and no expected path points to a removed location.
- **AC-10** — Given the repository outside `specs/archive/`, `specs/changes/` (other tickets),
  `openwiki/` and `oms-knowledge-base/archive/`, when searched for links or path references to a KB
  path that no longer exists, then there are none. A script added to `tools/okf-check` performs the
  check and exits 0. KB explorer `npm run build` and the storyboard check pass.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-knowledge-base, developer-cockpit, oms-mcp-server, oms-kb-explorer (fixtures/build), plus `tools/okf-check`; Javadoc `@see` comments in oms-core (comments only) |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | none |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | MCP clients (Claude Code, Copilot, cockpit AI) see new ids, with old ids resolving through aliases; developer cockpit Requirements view and KB categories; KB explorer folder view; storyboards' `kb_links` |
| Knowledge base | every page: moved, reviewed, and updated, merged or archived; new pages for patterns, technical debt, tools, delivery, infrastructure, UI design system, semantic layer, use cases and actors; root and folder indexes, log, conventions (new types `Use Case`, `Actor`, `Pattern`, and a `superseded_by` key) |

## Open Questions

- [resolved] One ticket or several? → assumption: one ticket. Its tasks are ordered so the move,
  the content review, the capability model and the tool changes each land as a separately
  verifiable block. If the reviewer prefers, the design can split off the cockpit and MCP changes
  into a follow-up ticket before planning.
- [resolved] The outline's top-level `specs/` folder collides with the repository's `specs/`
  (spec tickets), which the `spec-*` skills and agents already search. → assumption: rename it.
  - The framework part becomes `framework/`.
  - The APIs, contracts, aggregates and entities part becomes `domain/` (model, concepts,
    interfaces).

  This is reversible during design.
- [resolved] Where do the domain concept papers go (order replace, grouping, allocation, booking,
  trading capacity, post-trade analytics)? They are not in the outline. → assumption:
  `domain/concepts/`. Capabilities link to them, so they stay one hop away.
- [resolved] Where do the SDLC topics go? → assumption: a `delivery/` folder, holding the
  manifesto, skills and methodology from `oms-methodolgy/`. The name is reversible.
- [resolved] Should `okf-conventions.md` move into `semantic-layer/`? → assumption: no. The checker
  and OKF tools read the type vocabulary at the bundle root. `semantic-layer/index.md` links to it.
- [resolved] Should outdated documents be archived or deleted? → assumption: archive when the
  document holds design reasoning still worth reading (e.g. the ReadySet query-store idea, the
  February review). Delete only pure duplicates whose content is merged elsewhere. The register
  records which.
- [resolved] How is "reviewed" shown when no human has reviewed it? → assumption: `updated` is set
  to the review date, and `generated` names the agent. Human `verified` entries remain for the
  team, and the register lists the documents that most need a human eye.
- [resolved] Planned topics with nothing built (Cozystack, market adapter, knowledge graph, CI/CD):
  write content or leave them out? → assumption: a short `Concept Paper` / `planned` stub stating
  intent and what does not exist yet, so the structure is complete without inventing behaviour.
- [deferred] Moving `animations/` (Manim scenes) into `architecture/illustrations/`. → Safe to
  defer: these are scripts, not concepts, and the checker ignores them. The design decides whether
  to move them or leave them at the root.
