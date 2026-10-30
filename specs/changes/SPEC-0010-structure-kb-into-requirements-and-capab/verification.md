# Verification — SPEC-0010: Structure KB into requirements and capabilities

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

Runs on 2026-10-27 at 18:33 (+01:00), after the last change (review fixes):
`node tools/okf-check/okf-check.mjs oms-knowledge-base` → `133 concepts, 0 error(s)`, exit 0;
`cd tools/okf-check && npm test` → 21 tests, 21 pass, 0 fail (6 in `kb-coverage.test.mjs`, 15 in
`okf-check.test.mjs` and `mcp-metadata.test.mjs`). `oms-knowledge-base` has no gate verify command,
so these runs are recorded here (see Automated Evidence).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Capability has valid `maturity`, `commands` list, ≥ 1 requirement link | `okf-check.test.mjs#"capability rules"` (missing/invalid maturity, non-list and missing `commands`, no requirement link → `OMS-CAP`; `[]` accepted); `#"real bundle conforms"`: 19 capabilities clean | PASS |
| AC-2 | Every `*Cmd` record in exactly one capability; undispatched ⇒ not implemented | `kb-coverage.test.mjs#"every command schema belongs to exactly one capability"`: 13 command records (Avro JSON, `type: record`), dispatch from `CommandController`, `OrderLifecycleCommandProcessor#supports`, `CommandListener`; `execution-processing` (bust, whack undispatched) is `partial`, `quotes` is `planned` | PASS |
| AC-3 | Requirement id/priority/implementation/capability rules | `okf-check.test.mjs#"requirement rules"` (duplicate id, bad id, missing id, bad priority, bad implementation, dangling capability, non-Capability target, NFR in FR folder → `OMS-REQ`; distinct second FR accepted); real bundle: 44 FR + 10 NFR clean | PASS |
| AC-4 | `repo:` sources exist; implemented/partial requirements cite main + test | `okf-check.test.mjs#"repository sources exist and implemented requirements cite code and tests"` (missing path, no test, no main, test-as-main → `OMS-SRC`; front-end layout and not-implemented with bundle-only sources accepted; default repo root) ; real bundle: every `repo:` path exists | PASS |
| AC-5 | Every OpenAPI path, controller base path, Avro schema, Kafka topic in exactly one Interface | `kb-coverage.test.mjs#"every interface item is documented exactly once"`: expected = covered in both directions (2 OpenAPI paths, 6 controllers, 31 schemas, 3 topics), no duplicates; extractor sanity test passes; extractors hardened after review (recursive controller scan, fail on controllers without class mapping, literal topics) | PASS |
| AC-6 | Every `@Entity` has a Domain Concept; all State/CancelState symbols in order-state | `kb-coverage.test.mjs#"every entity and state symbol is documented"`: Order, Execution, OrderEvent, OutboxMessage; NEW…EXP and CXL, PCXL, PMOD, REJ | PASS |
| AC-7 | Everything reachable from root index; every Specification/Concept Paper linked from a capability | `kb-coverage.test.mjs#"every concept is reachable and every spec is linked from a capability"` (BFS over 151 markdown files) | PASS |
| AC-8 | New concepts carry tool-actor `generated`, non-empty `sources`, no `verified` | `okf-check.test.mjs#"new concept types carry provenance"` (missing `generated`, `human:` actor, missing `at`, empty `sources` → `OMS-PROV`); `OMS-UNVERIFIED` applies to all; real bundle: all 100 new documents `generated.by: claude-code/claude-opus-5-5`, `status: draft`, no `verified` (also confirmed by the reviewer) | PASS |
| AC-9 | Cockpit requirement scan finds every requirement with id/title/priority | `kb-coverage.test.mjs#"cockpit requirement scan finds every requirement"` (port of `RequirementsService#scanDocuments`, non-recursive per folder) | PASS |

## Goal Assessment

The goal asks to "beef up the content and make sure we have a structured documentation,
requirements, capabilities etc."; this ticket's scope note adds "typed OKF concepts — capabilities,
requirements, domain concepts, architecture, APIs and events — linked to each other and to the code".

Delivered: 19 capabilities (12 implemented, 1 partial, 6 planned), 44 functional and 10
non-functional requirements, 8 domain documents (entities, states, quantities, glossary), 5
interface documents covering every API path, controller, topic and Avro schema of oms-core, and 14
architecture documents (context, 8 components, 5 decisions). Every one cites the code, contracts
and tests it describes, and the coverage tests keep the structure in step with the code. The
developer cockpit's Requirements view now has content. Retrieval quality of the MCP server is
unchanged in recall with three times as many documents (see below).

The main purpose — telling specified from implemented behaviour — is met after the review fixes:
capability maturity and requirement `implementation` say what is built and tested; contradictions
between the stable `order-lifecycle.md` and the code are listed (capability Known gaps and
`domain/order-state.md`); `order-replace.md`, bust/whack and quotes are flagged as not built.

Gaps left on purpose or found, none blocking:
- The content is machine-generated and unreviewed (`draft`, trust tier "unverified"); priorities
  are an initial proposal, stated as such. A team review is the natural next step.
- Interfaces of the other services (streaming RSocket routes, MCP tools, `/api/kb`) are described
  in capability and component documents but have no `Interface` concepts; the ACs scoped interface
  coverage to oms-core.
- Existing specs are not corrected (out of scope by the approved proposal).

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | contracts only read |
| P-02 | Specification before code, generated models only | N/A | no API or message change |
| P-03 | Never edit generated code | PASS | nothing under `build/generated*` touched |
| P-04 | Contracts evolve compatibly | N/A | no contract change |
| P-05 | Every state change is recorded in the event log | N/A | documentation only |
| P-06 | Kafka only through the transactional outbox | N/A | documentation only |
| P-07 | Schema changes through new Liquibase changesets | N/A | no database |
| P-08 | Concurrency and idempotency are explicit | N/A | no commands added (documented as NFR-001/002) |
| P-09 | Commands and queries stay separate | N/A | no API change |
| P-10 | State transitions go through the state machine and task pipeline | N/A | no state change |
| P-11 | Layering and conventions | PASS | new rules follow `checkConcept` style in `checkStructure`; tests follow the SPEC-0009 fixture-variant pattern |
| P-12 | Jackson 3 only | N/A | no Java |
| P-13 | Errors and validation follow the framework specs | N/A | no API errors; checker reports every finding |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | every AC has a test; rule tests and coverage tests were red before the rules and content existed (T-1 – T-4) |
| P-15 | Observability | N/A | no runtime change |
| P-16 | Security | PASS | no secrets; tests read repository files only; `repo:` paths must stay under the repository root |
| P-17 | Simplicity and dependencies | PASS | no new dependency |
| P-18 | Modules build standalone | N/A | no module code changed; spec verify ran the policy check (no module verify commands) |
| P-19 | Documentation follows behaviour | PASS | this ticket is documentation; conventions, log and checker README updated |

## Independent Review

The spec-reviewer agent (fresh context) checked all ACs (all PROVEN by its own run: checker 0 errors,
21/21 tests) and sampled about 35 of the 100 new documents against the cited code. Verdict: MET with
two major findings to fix or reject. Implement was reopened and the findings resolved:

| # | Finding (severity) | Resolution |
|---|---|---|
| 1 | Known gaps omit contradictions between stable `order-lifecycle.md` and the code (§4.2, §4.3, §4.6, §9.3, §9.4) (major) | Fixed: listed under Known gaps of order-capture, order-acceptance and execution-processing, and as a table in `domain/order-state.md` |
| 2 | FR-002 and NFR-005 `implemented` though their tests cover little (major) | Fixed: both `partial` with the reason; same applied to FR-018 (finding 7); `okf-conventions.md` now defines `implemented` as built and covered by the cited tests |
| 3 | `order.md`: Order.avsc does not carry the same fields as the entity (minor) | Fixed: states which fields are entity-only |
| 4 | `order-event.md`: REST fills record no command; no SLA ingress time (minor) | Fixed in `order-event.md` and execution-processing Known gaps |
| 5 | Cockpit shows `index.md` of the requirement folders as a phantom requirement (minor) | Accepted as follow-up: the fix belongs in developer-cockpit (out of scope); recorded below |
| 6 | `command-api.md` error shapes (ProblemDetail vs CommandResult; 409 for constraint violations) (minor) | Fixed after checking `GlobalExceptionHandler` (400/409/500 mappings, 501 for unhandled commands) |
| 7 | FR-002 missing stop-price rule; cancellation pipeline missing `PublishOrderEventTask`; FR-018 over-claims tests (minor) | Fixed |
| 8 | Coverage extractors could silently miss controllers in sub-packages, method-only mappings, literal topics (minor) | Fixed: recursive scan, fail-loud on missing class-level mapping, literal topic form; `commands.DLT` is derived, documented in kafka-topics, not a configured topic |
| 9 | Checker README and header do not document the new rules and `--repo` (minor) | Fixed |
| 10 | Five existing documents not linked from a new concept (minor; not an AC) | Fixed: linked from system-context (methodology, team) and knowledge-services (review report, conventions) |
| 11 | Priority caveat not stated in the bundle (minor) | Fixed in `okf-conventions.md` and both requirement indexes |
| 12 | No recorded okf-check run and no RetrievalEvalTest spot-check (minor) | Fixed: runs recorded in this document |

## Automated Evidence

- `evidence/last-run.json`: `spec verify` at 2026-10-27T17:33Z (after the review fixes), result
  `pass`; policy check PASS (no errors, no warnings); modules `oms-knowledge-base` (no verify
  commands configured).
- Checker and test suites: see Acceptance Criteria Results (18:33 +01:00).
- oms-mcp-server `RetrievalEvalTest`, forced with `--rerun` at 2026-10-27T17:33Z against the
  restructured bundle: pass; 151 documents indexed (1,255 chunks); recall@5 0.960 (baseline 0.90;
  0.960 before this ticket with 45 documents); MRR 0.828 (0.847 before). A plain run reported a stale
  cached result, because the knowledge base is not a declared Gradle input of that test.

## Follow-ups

- developer-cockpit: exclude `index.md` (and other reserved OKF files) from the requirement scan, and
  read `implementation` rather than `status` for build state.
- Team review of the 100 new documents: priorities, targets, and adding `verified` entries.
- Correct or annotate `oms-concepts/order-lifecycle.md` and `order-replace.md` where they contradict
  the code (listed in Known gaps), or split their designs from their as-built content.
- Add tests for the untested behaviour listed in Known gaps (validation rules, DLT routing, query
  paging, RSocket routes, over-fill guard, REST read endpoints).
- `Interface` concepts for the streaming service RSocket routes, the MCP tools and `/api/kb`.
- oms-mcp-server: declare the knowledge base as an input of `RetrievalEvalTest` (or of the `test`
  task) so Gradle does not report a stale result.
- Wire `node tools/okf-check/okf-check.mjs oms-knowledge-base` and `npm --prefix tools/okf-check test`
  into the `oms-knowledge-base` verify list in `specs/config.json` (human edit).

## Verdict

Verdict: GOAL MET
