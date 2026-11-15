---
type: Concept Paper
title: "Knowledge Graph"
description: "The knowledge base as a graph: typed concepts as nodes, links and front-matter references as edges, repo: sources as edges into the code; what exists today (link index, backlinks, coverage checks) and where it could go (graph export, impact queries, a graph view)."
tags: [knowledge-graph, semantic-layer, okf, links, agents]
status: draft
updated: "2026-11-14T12:00:00Z"
sources:
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/docs/ConceptLinks.java"
  - resource: "repo:oms-kb-explorer/src/okf/links.ts"
  - resource: "repo:tools/okf-check/okf-check.mjs"
---
# Knowledge Graph

The knowledge base is already a graph; it is just stored as markdown. This page names its parts so
tools and agents can rely on them, and records what a fuller semantic layer could add.

## The graph today

**Nodes** are concepts, typed by their front matter `type` (the vocabulary in the
[conventions](../okf-conventions.md)): Capability, Use Case, Actor, Requirement, Domain Concept,
Interface, Specification, Pattern, Decision, Component, …

**Edges:**

| Edge | Stored as | Example |
|---|---|---|
| links to | a markdown link in the body | a capability → its specifications |
| belongs to capability | `capability:` on a requirement or use case | FR-001 → Order Capture |
| performed by | `actors:` on a use case | UC-001 → Trader |
| exercises | a requirement link in a use case | UC-001 → FR-001 |
| replaced by | `superseded_by:` on a deprecated concept | archived state-query store → Query Engine |
| was | `aliases:` | Exchange Simulator ← `architecture/exchange-simulator` |
| implemented in / tested by | `sources:` with `repo:` paths | FR-013 → `ExecutionCommandProcessor`, its test |
| documents | `covers:` on an interface, `entity:` on a domain concept | Message API → `kafka:oms_orders` |

**Who uses it:**
- `okf-check` validates edge targets (links resolve, `capability` points to a Capability, every
  requirement is exercised by a use case, `repo:` paths exist) and the coverage tests compare the
  graph with the code ([Schema and Constraints](schema-and-constraints.md)).
- The [knowledge server](../tools/knowledge-server.md) builds a link index (`ConceptLinks`) and
  shows each document's outgoing links and "cited by" backlinks; old ids resolve through `aliases`.
- The [KB explorer](../tools/kb-explorer.md) shows links and backlinks per document; the
  [developer cockpit](../tools/developer-cockpit.md) walks capability → use case → requirement.

## Where it could go

Not built; candidates for later tickets:
- **Export** the graph (nodes, typed edges, code sources) as one JSON document per build, so tools
  stop re-parsing markdown.
- **Impact queries** for agents: "which requirements and capabilities cite this file?" (reverse
  `sources`), "what breaks if this interface changes?" (reverse `covers` and links), as MCP tools.
- **Graph view** in the KB explorer or the cockpit (the explorer has a links panel, no
  visualisation).
- **Richer edge types** only where a tool needs them (for example `depends_on` between
  capabilities); every new key goes into the conventions and the checker first.
