# Tasks — SPEC-0010: Structure KB into requirements and capabilities

> **Stage 3 of 3 — the executable plan.** The implement stage works top to bottom and ticks each
> box only when its `verify:` check passes. Keep tasks small (one focused change, about one
> red→green cycle) and in dependency order:
>
> 1. Contracts (oms-contracts) and regeneration
> 2. Migration (new Liquibase changelog)
> 3. Behaviour, one task per AC or slice: write the failing test, implement, make it green
> 4. Wiring: API, messaging, configuration
> 5. Observability (logs, metrics)
> 6. Knowledge base and docs
> 7. Full verification (`spec verify`)
>
> Format, which the gate parses:
>
> ```
> - [ ] **T-1** Imperative summary (AC-1, AC-2)
>   - files: path/one.java, path/two.yaml
>   - verify: `./gradlew test --tests 'org.example.oms…SomeTest'` passes
> ```
>
> Every AC must be covered by at least one task, and every task needs a `verify:` line. Tasks may
> be added during implementation; record why under Notes.

## Tasks

- [x] **T-1** Test-first: `repo` option on `checkBundle`/CLI (`--repo`), rules `OMS-SRC` and `OMS-PROV`; extend the `valid/` fixture (vocabulary, one Capability, one FR, `src/main/Foo.java`, `src/test/FooTest.java`) (AC-4, AC-8)
  - files: tools/okf-check/okf-check.mjs, tools/okf-check/test/okf-check.test.mjs, tools/okf-check/test/fixtures/valid/**, tools/okf-check/test/fixtures/empty-type/**
  - verify: `cd tools/okf-check && node --test --test-name-pattern="repository sources|provenance|valid fixture" "test/okf-check.test.mjs"` passes
- [x] **T-2** Test-first: rule `OMS-CAP` (AC-1)
  - files: tools/okf-check/okf-check.mjs, tools/okf-check/test/okf-check.test.mjs
  - verify: `cd tools/okf-check && node --test --test-name-pattern="capability rules" "test/okf-check.test.mjs"` passes
- [x] **T-3** Test-first: rule `OMS-REQ` (unique ids, priority, implementation, capability link, folder) (AC-3)
  - files: tools/okf-check/okf-check.mjs, tools/okf-check/test/okf-check.test.mjs
  - verify: `cd tools/okf-check && node --test --test-name-pattern="requirement rules" "test/okf-check.test.mjs"` passes
- [x] **T-4** Write `kb-coverage.test.mjs` (commands, interfaces, domain, reachability, cockpit scan) with extractor sanity assertions; all content assertions red (AC-2, AC-5, AC-6, AC-7, AC-9)
  - files: tools/okf-check/test/kb-coverage.test.mjs
  - verify: extractor sanity assertions pass (known members found); the five coverage tests fail on missing content
- [x] **T-5** Extend `okf-conventions.md`: seven types with definitions, extra keys per type, `repo:` sources scheme, provenance rule (AC-1, AC-3, AC-8)
  - files: oms-knowledge-base/okf-conventions.md
  - verify: checker reports no `OMS-VOCAB` errors for the new types once used; conventions page itself passes
- [x] **T-6** Domain concepts: order, execution, order-event, outbox-message, order-state, order-quantities, quote-and-quote-request, glossary, plus `domain/index.md` (AC-6, AC-8)
  - files: oms-knowledge-base/domain/*.md
  - verify: kb-coverage "every entity and state symbol is documented" passes; checker clean for `domain/`
- [x] **T-7** Interfaces: command-api, query-api, rest-read-api, kafka-topics, avro-messages, plus `interfaces/index.md` (AC-5, AC-8)
  - files: oms-knowledge-base/interfaces/*.md
  - verify: kb-coverage "every interface item is documented exactly once" passes; checker clean for `interfaces/`
- [x] **T-8** Capabilities and FRs for order-capture, order-acceptance, order-cancellation, order-rejection (AC-1, AC-2, AC-3, AC-4, AC-8)
  - files: oms-knowledge-base/capabilities/*.md, oms-knowledge-base/functional-requirements/*.md
  - verify: checker reports no `OMS-CAP`/`OMS-REQ`/`OMS-SRC`/`OMS-PROV` errors for these files
- [x] **T-9** Capabilities and FRs for execution-processing, order-query, event-sourcing-and-replay, event-publication (AC-1, AC-2, AC-3, AC-4, AC-8)
  - files: oms-knowledge-base/capabilities/*.md, oms-knowledge-base/functional-requirements/*.md
  - verify: same as T-8 for these files
- [x] **T-10** Capabilities and FRs for real-time-streaming, exchange-simulation, order-sla-monitoring, admin-ui, knowledge-services (AC-1, AC-3, AC-4, AC-8)
  - files: oms-knowledge-base/capabilities/*.md, oms-knowledge-base/functional-requirements/*.md
  - verify: same as T-8 for these files
- [x] **T-11** Planned capabilities and FRs: order-replace, quotes, order-grouping, block-allocation, booking-integration, post-trade-analytics (AC-1, AC-2, AC-3, AC-7, AC-8)
  - files: oms-knowledge-base/capabilities/*.md, oms-knowledge-base/functional-requirements/*.md
  - verify: same as T-8; kb-coverage "every command schema belongs to exactly one capability" passes
- [x] **T-12** Non-functional requirements (~8) with category, metric, target (AC-3, AC-4, AC-8, AC-9)
  - files: oms-knowledge-base/non-functional-requirements/*.md
  - verify: checker clean for `non-functional-requirements/`; kb-coverage "cockpit requirement scan" passes
- [x] **T-13** Architecture: system-context, eight components, five decisions, `architecture/index.md` (AC-7, AC-8)
  - files: oms-knowledge-base/architecture/*.md
  - verify: checker clean for `architecture/`
- [x] **T-14** Indexes for capabilities and requirement folders (generated from front matter), root `index.md` reorganised, `log.md` entry, link additions in existing documents if reachability needs them (AC-7)
  - files: oms-knowledge-base/index.md, oms-knowledge-base/*/index.md, oms-knowledge-base/log.md
  - verify: kb-coverage "every concept is reachable…" passes
- [x] **T-15** Full suite green (AC-1 – AC-9)
  - files: (fixes only)
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` exits 0 and `cd tools/okf-check && npm test` passes
- [x] **T-16** Run spec verify
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0010` exits 0
- [x] **T-17** Apply the independent review findings: order-lifecycle.md contradictions in Known gaps and order-state.md; FR-002, FR-018, NFR-005 to `partial`; content corrections (Avro vs entity, REST fill command, error shapes, stop-price rule, lifecycle pipeline); priority caveat; extractor hardening; README (AC-1, AC-3, AC-4, AC-5, AC-7)
  - files: oms-knowledge-base/**, tools/okf-check/test/kb-coverage.test.mjs, tools/okf-check/README.md, tools/okf-check/okf-check.mjs
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` exits 0, `cd tools/okf-check && npm test` passes, and `node specs/tools/spec.mjs verify SPEC-0010` exits 0

## Notes

- T-17 added at verify (implement reopened): the spec-reviewer found two major and ten minor
  findings; see verification.md → Independent Review.

- Content tasks (T-6 – T-13) read the cited source files before writing; a requirement is only
  `implemented` when its main and test sources show the behaviour.
