---
aliases: [oms-knowledge-base-strategy]
type: Strategy
title: "Knowledge Base Strategy"
description: "How the OMS knowledge base is organised, kept truthful and served to people and AI agents: the section layout, the two access channels, authoring rules for retrieval, and how freshness is checked."
tags: [knowledge-base, strategy, okf, mcp, agents]
status: stable
updated: "2026-11-15T19:00:00Z"
---
# Knowledge Base Strategy

The knowledge base is the single source of truth for what the OMS does, why it is built the way it
is, and how the team works. Code and contracts are the truth for *how* it behaves; the knowledge
base says so and links to them. This page explains the organisation chosen in SPEC-0061 and the
rules that keep it useful for people and for agents.

## Organisation

The bundle is split by the question a reader brings:

| Question | Section |
|---|---|
| What can the OMS do, for whom, and is it built? | [Capabilities](../capabilities/index.md): capabilities, use cases, actors, FR and NFR requirements |
| What is an order, what are its states and quantities, how do other systems talk to us? | [Domain](../domain/index.md): model, concepts, interfaces |
| Which framework does every flow use? | [Core OMS Framework](../framework/index.md) |
| How is the system put together and why? How do I write code that fits? | [Architecture](../architecture/index.md): context, concepts, decisions, patterns, technical debt, assessments |
| Where does it run and how do I observe it? | [Infrastructure](../infrastructure/index.md) |
| What do users see? | [User Interface](../ui/index.md) |
| Which tools help me? | [Tools](../tools/index.md) |
| How do we build and ship? | [Software Delivery](../delivery/index.md) |
| How is this knowledge base organised and checked? | this section |
| What used to be true? | [Archive](../archive/index.md) |

Rules that follow from it:
- **One topic, one place.** A topic that two documents describe is merged, or one of them is
  archived. Capabilities link to the detailed specifications instead of repeating them.
- **Built versus planned is always visible.** Capabilities carry `maturity`, requirements carry
  `implementation`, and a specification that describes more than is built starts with an
  *Implementation status* banner naming what exists.
- **Point-in-time records stay as written.** Assessments and reviews are dated and marked
  `point_in_time: true`; they are not rewritten when the system changes.
- **Superseded documents go to the archive**, with `status: deprecated` and `superseded_by`. They
  keep their reasoning but are left out of search by default.

## Two access channels

The same files serve two channels (this reasoning is carried over from the
[February strategy](../archive/knowledge-base-strategy-2026-02.md)):

| Channel | Best for |
|---|---|
| **Filesystem** (an agent or IDE reading `oms-knowledge-base/` directly, CLAUDE.md pointers) | Quick lookups next to the code, code completion, a known path |
| **MCP** ([Knowledge Server](../tools/knowledge-server.md): overview, search, read) | Questions in natural language, section-level reads with citations, filtering by type, section or status, any MCP client |

People use the [KB Explorer](../tools/kb-explorer.md) for reading and the
[Developer Cockpit](../tools/developer-cockpit.md) for the capability catalogue and storyboards.

## Writing for retrieval

- **Front matter first.** `type`, `title`, a one-sentence `description` (shown in search hits and
  indexes), `tags`, `status`, `updated` and, for documents written from code, `sources`. See the
  [conventions](../okf-conventions.md).
- **Headings that name the thing.** Search returns sections, cited as `path#anchor`; "Order state
  transitions" retrieves, "Details" does not.
- **First sentence of a section says what it covers**, and names the classes, tables and topics it
  is about: keyword search relies on them.
- **Link, do not repeat.** Links feed the knowledge graph ("cited by", backlinks) and keep one
  source per fact.
- **Moving a document** keeps its old id in `aliases`, so links held by agents and people still
  resolve.

## Keeping it true

- `okf-check` (see [Schema and Constraints](schema-and-constraints.md)) validates the bundle on
  every change: metadata, links, the capability model, `repo:` sources, the review date and the
  retired terms. Its freshness warnings point at pages to review: not updated within
  `review_after_days`, past `stale_after`, deprecated outside the archive, or with source code
  committed after the page. It can also add missing index entries (`--fix-indexes`). The Developer
  Cockpit's Knowledge Base **Health** panel shows the same report with statistics (SPEC-0064).
- Its coverage tests compare the bundle with the code: every command, endpoint, topic, Avro schema,
  entity and state is documented exactly once.
- `check-kb-refs` finds references to knowledge base paths that no longer exist anywhere in the
  repository.
- `RetrievalEvalTest` keeps search quality at recall@5 ≥ 0.90 with at least one golden query per
  section.
- Every spec ticket updates the pages its change affects (policy P-19). A full review sets
  `reviewed_since` in the conventions; the last one is the
  [November 2026 review](kb-review-2026-11.md).

## Related

- [Knowledge Graph](knowledge-graph.md) — the links and metadata as a graph, and where it goes next
- [Knowledge Base Conventions](../okf-conventions.md) — the OKF rules this bundle follows
