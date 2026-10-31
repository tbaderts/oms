# Proposal — SPEC-0010: Structure KB into requirements and capabilities

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The goal asks to "beef up the content and make sure we have a structured documentation,
requirements, capabilities etc." This ticket does that on top of the OKF bundle from SPEC-0009.

Today the knowledge base is 32 long documents (up to 1,400 lines) grouped by authoring history
(`oms-concepts/`, `oms-framework/`, …), not by what the system does. There is:

- **No capability map.** Nothing lists what the OMS can do, so a reader cannot see that order
  capture, acceptance, cancel/reject and execution processing exist while replace, grouping,
  allocation, booking and quotes do not.
- **No requirements.** There are no identifiable, traceable requirements (no ids, priorities or
  status). The developer cockpit has a Requirements view (`RequirementsService` reads
  `functional-requirements/`, `non-functional-requirements/`, …) that is empty because the
  knowledge base has none.
- **Specified and implemented look the same.** `oms-concepts/order-replace.md` is `stable`
  (old header "Active") and 1,429 lines long, but there is no replace command in
  `oms-contracts/src/main/avro/` or `oms-core`. `ExecutionBustCmd`/`ExecutionWhackCmd` exist as Avro
  schemas but no command handler processes them. `QuoteCreateCmd`/`QuoteRequestCreateCmd` exist with
  no entity or processor. Agents reading the MCP server cannot tell which behaviour is real.
- **No interface or domain inventory.** The command API (`POST /execute`), the query API
  (`/search`), six REST controllers, 31 Avro schemas and the three Kafka topics are described piecemeal
  or not at all; entities (`Order`, `Execution`, `OrderEvent`, `OutboxMessage`) are described only
  inside the long specs.
- **No architecture overview** of the deployable modules (oms-core, streaming service, UI, MCP
  server, exchange simulator, KB explorer) and how they connect.
- **No provenance.** SPEC-0009 left every concept without `sources`, so nothing links a document to
  the code it describes.

Cost of doing nothing: agents and new team members keep reading aspirational specs as current
behaviour, the cockpit's Requirements view stays empty, and SPEC-0011/0012 have no typed content
(capabilities, requirements, interfaces) to filter and navigate.

## What Changes

- New typed concepts in the bundle, each with OKF front matter and `sources` pointing at the code
  or contract it describes:
  - **Capabilities**: one concept per business capability of the OMS, implemented or planned, with
    a `maturity` (`implemented` | `partial` | `planned`), the commands it handles, and links to
    its requirements, interfaces, domain concepts and the existing detailed specifications.
  - **Requirements**: functional and non-functional requirements with stable ids (`FR-nnn`,
    `NFR-nnn`), priority (MoSCoW), implementation status, the capability they belong to, and the
    code and tests that implement them. Placed so the cockpit's existing Requirements view finds them.
  - **Domain concepts**: one concept per persisted entity and per core value set (order state,
    cancel state, quantities), plus a glossary.
  - **Interfaces**: command API, query and REST APIs, Kafka topics and the Avro message catalogue.
  - **Architecture**: system context, one concept per deployable component, and the key
    architecture decisions (event sourcing, outbox, shared-table CQRS, contracts module).
- The type vocabulary in `okf-conventions.md` is extended with these types and their keys.
- Every existing document is linked from at least one new concept, so the bundle is navigable by
  capability; existing specs that describe unimplemented behaviour are linked from a `planned` or
  `partial` capability that says so.
- The root `index.md` is reorganised into sections: capabilities, requirements, domain,
  interfaces, architecture, then the existing folders.
- `tools/okf-check` gains project rules and coverage tests that keep this structure honest against
  the code (listed in the ACs).
- No existing document is moved, renamed or rewritten (concept ids stay stable); bodies change only
  to add links.

No **BREAKING** changes.

## Scope

### In scope

- Capability, requirement, domain, interface and architecture concepts for the system as built
  today (oms-core, oms-contracts, oms-streaming-service, oms-ui, oms-mcp-server,
  oms-exchange-simulator, oms-kb-explorer), plus `planned` capabilities for the concepts already
  described in the knowledge base (replace, grouping, block allocation, booking, post-trade
  analytics, quotes).
- Requirements derived from the code and contracts (as-built) and, for planned capabilities, from
  the existing concept papers.
- Provenance (`sources`, `generated`) on every new concept.
- Checker rules and coverage tests in `tools/okf-check`.
- Link additions in existing documents ("Related" links back to capabilities) where needed for
  reachability.

### Out of scope

- Rewriting, splitting or correcting the existing long specifications (only links are added).
  Contradictions found between a spec and the code are recorded as findings on the capability,
  not fixed in the spec.
- Moving or renaming folders or files, including `oms-methodolgy/` (changes concept ids and
  external references; separate chore if wanted).
- Changing behaviour of any service, the MCP server (SPEC-0011), the KB explorer (SPEC-0012) or
  the developer cockpit.
- Use cases and actors as separate cockpit-style documents (actors are named inside
  capabilities); can follow once the cockpit reads OKF.
- Recording human review (`verified`); all new content is machine-generated and stays
  "unverified" until a person reviews it.
- Detailed design for planned capabilities beyond what the concept papers already say.

## Acceptance Criteria

- **AC-1** — Given the bundle, when the checker runs, then every `Capability` concept has a
  `maturity` in {`implemented`, `partial`, `planned`}, a non-empty `commands` list or an explicit
  empty list, and at least one link to a `Requirement` concept; a fixture capability with a
  missing or invalid `maturity` or no requirement link makes the checker exit non-zero naming the
  file and rule.
- **AC-2** — Given `oms-contracts/src/main/avro/*Cmd.avsc`, when the coverage test runs, then every
  command schema name is listed in the `commands` of exactly one capability, and a capability
  listing a command that no oms-core dispatcher handles (`CommandController`, `CommandListener`)
  is not `implemented`.
- **AC-3** — Given the bundle, when the checker runs, then every `Requirement` concept has an `id`
  matching `FR-\d{3}` or `NFR-\d{3}` that is unique in the bundle, a `priority` in
  {`must`, `should`, `could`, `wont`}, an `implementation` in {`implemented`, `partial`,
  `not-implemented`} and a `capability` that links to an existing `Capability` concept; fixtures
  with a duplicate id, a bad priority, a bad implementation value or a dangling capability make the
  checker exit non-zero.
- **AC-4** — Given every `Requirement` whose `implementation` is `implemented` or `partial`, when
  the checker runs with the repository root, then it has at least one `sources` entry pointing to an
  existing main source file and at least one pointing to an existing test file; every repository
  path in any concept's `sources` exists. A fixture citing a missing path, or an implemented
  requirement without a test source, makes the checker exit non-zero.
- **AC-5** — Given the contracts and oms-core, when the coverage test runs, then every OpenAPI path,
  every `@RequestMapping` base path of an oms-core controller, every Avro schema and every Kafka
  topic name configured in oms-core's `application.yml` is named in the coverage key of exactly one
  `Interface` concept; an undocumented item fails the test naming it.
- **AC-6** — Given oms-core, when the coverage test runs, then every `@Entity` class has a
  `Domain Concept` with that entity name, and every symbol of `State.avsc` and `CancelState.avsc`
  is documented in the order-state domain concept.
- **AC-7** — Given the bundle, when the reachability test runs, then every concept is reachable by
  following markdown links from the root `index.md`, and every pre-existing `Specification` and
  `Concept Paper` is linked from at least one `Capability`.
- **AC-8** — Given every concept created by this ticket, when the checker runs, then it has a
  `generated` entry whose actor is a tool actor (`<producer>/<version>`) with an ISO timestamp, a
  non-empty `sources` list, and no `verified` entry.
- **AC-9** — Given the requirement concepts, when the developer cockpit's requirement scan rules are
  applied (folder names and front matter keys read by `RequirementsService`), then every functional
  and non-functional requirement is found with its `id`, `title` and `priority`.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-knowledge-base (content), plus `tools/okf-check` (rules and coverage tests, not a gated module). No service code changes. |
| Contracts (OpenAPI / Avro) | none (read by coverage tests only) |
| Data (tables, migrations) | none |
| Events / Kafka topics | none (documented only) |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-mcp-server and KB explorer index and show the new documents (more documents, new folders); search results change. developer-cockpit Requirements view starts listing requirements (AC-9). SPEC-0011/0012 can filter by the new types. |
| Knowledge base | new folders for capabilities, requirements, domain, interfaces and architecture with their indexes; `okf-conventions.md` (vocabulary and keys); root `index.md` reorganised; `log.md` entry; "Related" links added to existing documents where needed. |

## Open Questions

- [resolved] Move existing specs into the new structure? → assumption: no. New concepts link to
  them; ids stay stable and no external reference breaks. Reviewer: say so if you want the long
  specs relocated under capabilities (a larger, id-changing change).
- [resolved] Where do requirements come from? → assumption: as-built requirements are derived from
  the code, contracts and tests; requirements of planned capabilities from the existing concept
  papers. Priorities are an initial proposal by the author (agent), marked unverified, for the team
  to review; they do not change any behaviour.
- [resolved] Who is the `generated` actor? → assumption: `claude-code/claude-opus-5-5` with the
  generation time; trust tier stays "unverified" until a human adds `verified`.
- [resolved] Fix specs that contradict the code (e.g. replace documented as active)? → assumption:
  not in this ticket; the capability states the real maturity and lists the contradiction under
  "Known gaps", and the existing spec keeps its content. Changing a spec's `status` is allowed
  only where the front matter is plainly wrong about implementation; none is changed without a
  note in `log.md`.
- [deferred] Renaming `oms-methodolgy/` → id-changing chore, independent of this content work.
- [deferred] Wiring `tools/okf-check` into the gate (`specs/config.json`) → agents may not edit the
  gate config; verify runs it as explicit evidence (see SPEC-0009 follow-up).
