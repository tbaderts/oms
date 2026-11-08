# Proposal — SPEC-0024: Build replay harness and load suite

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The architecture review (oms-core/docs/architecture-review-2026-10-30.md, finding 13) notes that
"nothing re-executes stored commands", so reproducing behaviour — the second stated goal of the
architecture — is currently a claim, not a test. When a defect report arrives or a regression is
suspected, the only way to study an order's history is to read `order_events` by hand; there is no
automated way to re-run the same commands and check that today's code produces the same states.
Because SPEC-0020 (projections) and SPEC-0022 (order trees) will rework exactly the command paths
and event append logic, the change they introduce cannot be shown safe without a replay check, and
the performance of the fill path cannot be judged without a measured before/after baseline — the
review states that no load test was run and every throughput statement is derived from code, not
measured (finding 7 assumes ~500 messages/s per outbox instance without evidence). Finally,
finding 8: the command and snapshot JSON stored in `order_events` carries no schema version and
`Order` ignores unknown properties, so a renamed or removed field is lost silently on read; old
events may stop replaying after an unrelated model change, which would also break the replay
harness this ticket builds. Doing nothing leaves regressions undetectable until a booking or
settlement failure acts on wrong state, and gives the next two phases no baseline to compare
against.

## What Changes

- A replay runner that reads the stored commands from `order_events.transaction` in event `id`
  order and re-executes them against a fresh database, then diffs the replayed order snapshots
  (event by event, `order_snapshot` of the same orderId and version) against the recorded ones.
  Run as an automated integration test; a production database's history can be replayed from a
  dump.
- A load suite built on the exchange simulator and the OMS command path that runs a scripted,
  repeatable order flow and records throughput (commands per second) and the command-path SLA
  percentiles (p50/p95/p99) into a committed baseline report.
- A `schema_version` column on `order_events`: new events record the current schema version;
  reading an event's JSON without one applies the documented upcasting rule.
- Golden-file fixtures of legacy events (JSON without `schema_version`) committed to the oms-core
  test suite, exercised by an automated test.
- The upcasting rule (how old event JSON versions are transformed on read) is documented in the
  knowledge base.
- **BREAKING** — none. All changes are additive (a new nullable column, new code on the test and
  docs side, new docs).

## Scope

### In scope

- A replay runner (reusable harness class plus an integration test) that replays stored commands
  into a fresh database and diffs snapshots against the source; a reusable snapshot-diff component
  with unit tests.
- A load-suite harness driving the OMS and the exchange simulator over Kafka, producing a baseline
  report with measured throughput and SLA percentiles, plus the committed baseline document.
- `schema_version` on `order_events` written by `OrderEventAppender` on append; its value for new
  events is `1`, and the rule is that a missing `schema_version` means version 1.
- Golden-file fixtures under oms-core test resources and the tests that read them.
- Knowledge-base updates: the upcasting rule, the replay harness and the load suite usage.

### Out of scope

- Projection and order-tree changes themselves (SPEC-0020, SPEC-0022) — this ticket only measures
  before them and equips their verification.
- A production API endpoint for running a replay or reading a report; the harness stays on the
  test side.
- Re-player across different code versions: replay runs the current build's code against old
  events; replaying with an older binary is not supported.
- A live production-data pipeline: replay runs from a database dump or fixture, not from a
  streaming connection to the live store.
- The event-log archiving and republishing of SPEC-0052.

## Acceptance Criteria

- **AC-1** — Given a database whose `order_events` rows all carry a stored command
  (`transaction` not null), when the replay runner re-executes the commands in event `id` order
  into a fresh database, then every replayed event's `order_snapshot` equals the corresponding
  source snapshot for the same orderId and version, and the replay summary reports zero
  differences and exits successfully.
- **AC-2** — Given two order-snapshot histories that differ in at least one version's quantity or
  resulting state, when the snapshot diff compares them, then it reports each differing
  (orderId, version) pair with the changed field, and the replay harness reports the replay as
  failed so a regression surfaces as a test failure.
- **AC-3** — Given source `order_events` rows whose JSON has no `schema_version` (legacy shape
  seeded in the test database before this change), when the replay runner reads them, then it
  replays them without error under the upcasting rule and logs a warning naming the orders whose
  events were treated as legacy.
- **AC-4** — Given the golden-file fixtures of legacy event JSON committed under oms-core test
  resources, when the schema-version test reads each fixture, then it decodes to the current model
  with `schema_version` treated as `1` and the decoded command's type and orderId equal the
  fixture's.
- **AC-5** — Given a running OMS connected to the exchange simulator, when the load suite submits
  its scripted order flow, then it writes a report file containing measured commands-per-second
  throughput and command-latency percentiles p50, p95 and p99 from the SLA timestamps.
- **AC-6** — Given the load suite has been run, when the baseline document is committed under
  oms-core docs, then it records the run configuration (order count, fill slices, concurrency) and
  the measured throughput and p50/p95/p99 latency, as the baseline for before SPEC-0020/0022.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-core (replay harness, schema_version, golden fixtures), oms-exchange-simulator (load-suite scenario), oms-knowledge-base (docs) |
| Contracts (OpenAPI / Avro) | none — no OpenAPI path or Avro schema changes |
| Data (tables, migrations) | new Liquibase changelog adding nullable `schema_version` to `order_events`; no backfill (null = legacy, upcast on read); rollback drops the column |
| Events / Kafka topics | none — no new topics; outbox messages unchanged |
| Consumers (oms-ui, oms-mcp-server, downstream) | none — the new column and the harness are not exposed through any API |
| Knowledge base | `oms-framework/oms-state-store.md` (schema versioning + upcasting rule), `oms-framework/testing-patterns.md` (golden fixtures, replay harness), `oms-concepts/exchange-simulator.md` (load suite) |

## Open Questions

- [resolved] Where does the replay runner live — production code or test code? → assumption: test
  scope in oms-core (a reusable harness class under `src/test` plus one integration test); it is a
  verification tool and must never run inside the command path. Reversible by promotion later.
- [resolved] Which schema version starts the scheme? → assumption: `1`, the value this change
  starts writing; every stored event without the column is version 1 by the upcasting rule.
- [resolved] Does the load suite run in CI? → assumption: no — it needs the full docker-compose
  stack and produces machine-dependent timings; it runs locally or on a perf host, while CI runs
  the replay, diff and fixture tests.
- [resolved] Must replay reproduce Kafka publication as well? → assumption: no — replay verifies
  the command-to-state path into a fresh database; outbox rows it produces are ignored, and
  publication correctness is covered by SPEC-0018's tests.
