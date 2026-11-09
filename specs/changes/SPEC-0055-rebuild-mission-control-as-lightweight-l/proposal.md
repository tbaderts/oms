# Proposal — SPEC-0055: Rebuild mission-control as lightweight load-test tool

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The OMS has no general-purpose way to load-test the order flow and see the result.

**What exists today:**
- **SPEC-0024's load suite** (`LoadSuiteRunnerTest`) is a bespoke JUnit test. It is gated by an
  environment variable and has a fixed shape: a burst of N MARKET orders at a fixed concurrency.
  - It measures from server-side SLA histograms only.
  - Its output is one Markdown file per run
    ([exchange-simulator.md §8](../../../oms-knowledge-base/oms-concepts/exchange-simulator.md)).
  - It has no configurable arrival rate, no live view, no charts and no way to dig into a slow run.
- **`mission-control/`** is meant to be that tool, but it is something else: a Mastra-based
  incident-investigation prototype (Docker, Kubernetes, Postgres and Prometheus agents), dormant
  since 2026-04-07 ([README](../../../mission-control/README.md)).
  - Its load-testing redesign (`docs/architecture/mission-control-v2.md`,
    `implementation-guide.md`, 2026-08-20) was never started.
  - That design's view of OMS is out of date: it assumes no venue exists, and the exchange
    simulator now does. It also assumes the LGTM stack is missing, and it now exists.

**Why it matters.** Timing the REST response measures almost nothing in this system. The order
reaches the venue, is acknowledged and is filled through Kafka, via the outbox and the exchange
simulator. The latencies that matter can only be seen by following the order and execution
messages:
- time until the order is released to the market;
- time until it is live (market ack);
- time until it is filled.

SPEC-0024's baseline showed the market round trip dominating at about 9 s median under a burst.
Whether that comes from the outbox relay, the simulator or the consumer remained unresolved, and
investigating it needs exactly this kind of tool.

**Who is affected.** Developers and operators changing the command path. Recent examples are
SPEC-0047 (fill write set), SPEC-0048 (several instances) and SPEC-0049 (event metadata); each
needs a before/after performance comparison.

**Cost of doing nothing.** Each such change keeps relying on a hard-coded JUnit run and hand-read
Markdown. The mission-control folder keeps carrying a dead Mastra stack.

The requester's goal: create orders from a REST client at a configurable rate, subscribe to the
order and execution messages to track state and latency, chart the key figures, and investigate
results via an AI agent built on a lightweight framework like developer-cockpit's rather than
Mastra, starting over and discarding most of what exists.

## What Changes

- **The current prototype goes.** `mission-control/` is replaced by a new, single TypeScript
  application:
  - a Node server and a browser UI, run with `npm`;
  - all of `packages/server`, `packages/ui`, the Mastra, LibSQL, pnpm and Turborepo setup, the
    playbooks and the investigation agents are removed.
  - The old design documents are removed from the tree too; git history keeps them.
- **Load generation.** A run creates orders through oms-core's
  `POST /api/command/execute` (`OrderCreateCmd`):
  - at a configured rate (orders per second), for a configured duration or order count;
  - from a configured order template: symbol, side, order type, quantity, price, time in force;
  - on an open-loop schedule, so a slow response does not slow the next send.
- **Tracking.** The tool subscribes to `oms_orders` (`OrderMessage`) and `oms_order_executions`
  (`OrderExecution`). It decodes them with Avro schemas from the Schema Registry, and builds each
  order's state timeline and latency figures for the orders it created.
- **Key figures.** All are measured on the tool's clock from each order's scheduled send time:

  | Figure | Measured until |
  |---|---|
  | time to OMS ack | the REST 201 |
  | time to market | the first `OrderMessage` (UNACK) is seen |
  | time to order live / market ack | the `OrderMessage` with state LIVE is seen |
  | time to first fill | the first `OrderExecution` |
  | time to filled | `OrderMessage` state FILLED |

  The server-side checkpoint deltas carried on `OrderMessage` (`orderReceivedTime`, `ackTime`,
  `marketSendTime`, `marketAckTime`) are recorded alongside, as a breakdown of where the time went.
- **UI.** A browser UI to configure and start or stop a run, with:
  - live charts (submitted and completed throughput, p50/p95/p99 per figure over time, orders by
    state);
  - a result view (latency histogram per figure, error and incomplete-order lists);
  - a list of past runs to reopen.
- **Persistence.** Each run's configuration, summary and per-order samples are saved to local disk
  and survive a restart.
- **AI investigation.** An "Investigate" chat on a run, built on the Vercel AI SDK the way
  developer-cockpit's `AiService` uses it: a bounded, multi-step tool-calling loop with a
  configurable Anthropic or OpenAI provider. Its tools read:
  - the run's summary and per-order timelines (for example the slowest orders);
  - an order's event history from oms-core's query API;
  - Mimir metrics and Loki logs for the run's time window.
- **Safety.** A run targets only hosts in an allowlist (default `localhost`).
- **Process.** `mission-control` is registered as a spec module with its own verify commands.
- **No breaking changes.** No OMS module, contract, table or topic changes. The tool is a new
  client of existing interfaces.

## Scope

### In scope

- Removing the existing mission-control prototype and its docs, and a new README.
- A single npm package in `mission-control/`:
  - a server holding the load engine, the Kafka consumer, the run store, the AI service and an API
    with a live stream to the UI;
  - a React UI with charts.
- An open-loop load generator with achieved-rate reporting.
- Avro decoding of `OrderMessage` and `OrderExecution` through the Schema Registry, read-only (no
  schema registration).
- Per-order correlation by the `orderId` returned by the create call; deduplication of redelivered
  messages.
- The latency figures above, with p50/p95/p99 and histograms, live and final.
- Run persistence on local disk, a run list and reopening a run.
- AI investigation with the tools listed above. With no provider configured, everything else still
  works.
- Pre-run checks: oms-core, Kafka and Schema Registry are reachable, and the target is in the
  allowlist.
- Unit and component tests runnable with `npm test`, and a typecheck. The `mission-control` module
  entry in `specs/config.json`.
- A knowledge-base page describing the tool and how to use it, plus a link from the load suite's
  section.

### Out of scope

- Any change to oms-core, oms-contracts, the exchange simulator or the topics.
  - Timestamps, trace ids or a correlation header that the OMS does not already provide are
    follow-ups.
- Lifecycle commands other than create: cancel, replace and amend scenarios.
  - The tool only observes what the simulator does (accept, fill, reject, IOC cancel).
- A scenario DSL, AI-assisted scenario authoring, scheduled or continuous runs, regression alerts,
  and run-to-run comparison views. These were in the v2 design and are deferred.
- Kubernetes or Docker control, the old incident playbooks, and any action that changes the
  system under test beyond creating orders.
- Multi-user operation, authentication and deployment as a container. It runs locally beside the
  compose stack.
- Replacing SPEC-0024's load suite or baseline. Both stay as they are.
- Exporting the tool's own telemetry to Grafana.

## Acceptance Criteria

- **AC-1** — Given a run configured with a rate of R orders/s (1 ≤ R ≤ 200) and a duration of
  D seconds, when the run is started against a stub oms-core that answers 201 with an order id,
  then the tool sends R × D (±1) `OrderCreateCmd` requests to `POST /api/command/execute`, each
  built from the configured template with a unique `clOrdId`.
  - The send times follow the schedule: each request starts within 50 ms of its scheduled time,
    even when the stub delays every response by 1 s.
  - The run summary reports the target and achieved rate.
  - When the achieved rate is below 95 % of the target, the run is flagged `generator-limited`.
- **AC-2** — Given an order created by a run, when the tool receives, in order:
  - the create's 201;
  - an `OrderMessage` with state UNACK, then one with state LIVE;
  - an `OrderExecution`;
  - an `OrderMessage` with state FILLED,

  then that order's sample holds:
  - its state timeline (UNACK → LIVE → FILLED);
  - time to OMS ack, time to market, time to order live, time to first fill and time to filled,
    each equal to (time the event was seen − scheduled send time), checked with an injected clock;
  - the checkpoint deltas `ackTime − orderReceivedTime`, `marketSendTime − orderReceivedTime` and
    `marketAckTime − marketSendTime`, taken from the `OrderMessage` fields.

  Messages for orders the run did not create are ignored.
- **AC-3** — Given an order whose messages have already been recorded, when Kafka redelivers the
  same `OrderMessage` (same `orderId` and `eventId`) or `OrderExecution` (same `orderId`, `execId`
  and `orderVersion`), then the order's timeline, latency figures and the run's counts and
  percentiles are unchanged.
- **AC-4** — Given a running run, when the UI is open on it, then:
  - the server pushes a snapshot to the UI at least once per second;
  - the UI shows submitted and completed orders per second, p50/p95/p99 over time for each figure
    of AC-2, and the count of orders by state.

  Given a finished run, the result view shows, per figure, its count, p50/p95/p99/max and a
  histogram, plus the error and incomplete lists of AC-5.

  The percentiles agree with a reference computation on the same samples, to within the
  histogram's stated precision. This is verified by component tests over fixed data and a server
  test of the snapshot stream.
- **AC-5** — Given a run, when any of the outcomes below occurs, then it is counted and listed in
  the run summary, and the run continues:
  - **Rejected create:** oms-core answers 4xx or 5xx, or the request times out. The HTTP status or
    timeout and the response body are recorded, and the order is not tracked.
  - **Order rejected by the venue:** it reaches state REJ, with its `rejectReason`.
  - **Incomplete order:** it has not reached a terminal state (FILLED, CXL, REJ, CLOSED, EXP)
    within the configured completion timeout after the last send. Its last seen state is recorded.

  None of these orders contributes to a latency figure it never reached.
- **AC-6** — Given oms-core, Kafka or the Schema Registry is unreachable, or the target URL's host
  is not in the allowlist (default `localhost`, `127.0.0.1`), when a run is started, then it is
  refused before any order is sent. The response names the failed check, and no create request
  reaches oms-core.
- **AC-7** — Given a finished run, when the server is restarted, then the run appears in the run
  list and reopens with the same configuration, summary, percentiles and per-order samples as
  before the restart.
- **AC-8** — Given a finished run and a configured AI provider, when the user asks a question in
  the Investigate view, then:
  - the agent runs a bounded tool-calling loop (step cap, as in developer-cockpit's `AiService`);
  - its tools return the run's summary, the slowest N orders' timelines, an order's event history
    from oms-core's query API, a Mimir (PromQL) query and a Loki (LogQL) query, each limited to
    the run's time window;
  - the tool calls and the streamed answer appear in the UI.

  This is verified with a scripted model that calls each tool and receives its result.

  Given no provider is configured, the view says so, and every other feature still works.
- **AC-9** — Given the rebuilt tool, when the `mission-control` module's verify commands run, then:
  - `mission-control/` contains none of `packages/`, `pnpm-workspace.yaml`, `turbo.json` or any
    `@mastra/*` dependency;
  - `specs/config.json` registers `mission-control` with verify commands that pass: typecheck and
    `npm test`.
- **AC-10** — Given the compose stack is running with the exchange simulator, when a 60-second run
  at 20 orders/s of MARKET BUY AAPL is started, then:
  - all 1200 orders reach FILLED;
  - every figure of AC-2 has 1200 samples;
  - no create errors or incomplete orders are reported;
  - the run is not flagged `generator-limited`.

  This is a manual end-to-end check recorded in verification with the saved run summary.

## Impact

| Area | Impact |
|---|---|
| Modules | `mission-control` (new spec module; the existing prototype is replaced), `oms-knowledge-base` |
| Contracts (OpenAPI / Avro) | None changed. Read-only consumer: `oms-cmd-api` create, `oms-query-api` order events, `OrderMessage.avsc`, `OrderExecution.avsc` via the Schema Registry |
| Data (tables, migrations) | None in the OMS. The tool keeps its run data in local files of its own |
| Events / Kafka topics | None changed. New consumer group on `oms_orders` and `oms_order_executions`, starting at latest |
| Consumers (oms-ui, oms-mcp-server, downstream) | None. Load the tool generates is visible to every consumer of those topics, as with the load suite |
| Knowledge base | New page for Mission Control (purpose, figures and their definitions, how to run); link from `oms-concepts/exchange-simulator.md` §8; `specs/config.json` modules |

## Open Questions

- [resolved] Which "execution messages" to follow, `oms_executions` or `oms_order_executions`? →
  assumption: `oms_order_executions`. Each record is self-contained, and the topic reference says
  a consumer that needs the order with the fill should read it
  ([kafka-topics.md](../../../oms-knowledge-base/interfaces/kafka-topics.md)).
- [resolved] "Time to order live" and "time to market ack": are they different events? →
  assumption: today they are the same. The venue's accept moves the order to LIVE, so both names
  mean "LIVE seen". The "time to market" figure (UNACK seen) and the OMS-side checkpoint deltas
  cover the earlier steps. Splitting them later is additive.
- [resolved] Lightweight agent framework: what exactly does developer-cockpit use? → the Vercel AI
  SDK (`ai` with `@ai-sdk/anthropic`, `@ai-sdk/openai`), a `streamText` loop with a step cap, no
  agent framework. Mission Control follows the same pattern. The design decides whether to share
  code or copy it.
- [resolved] What to keep from the existing mission-control? → assumption: nothing, per the goal.
  The Prometheus query logic is small enough to rewrite against Mimir. The old docs are deleted;
  git history keeps them.
- [resolved] Desktop app (Electron like developer-cockpit) or web app? → assumption: a local Node
  server plus a browser UI. The load engine and Kafka consumer must run in a long-lived process
  apart from the UI, and nothing here needs desktop integration. Reversible.
- [resolved] Where is the run data kept? → assumption: JSON and NDJSON files in a local data
  directory (configurable, default `mission-control/data/`, git-ignored). No database to install.
- [deferred] Measuring at rates above 200 orders/s and correcting for the tool's own limits (HDR
  histograms, calibration runs) → safe to defer. AC-1's `generator-limited` flag makes a run that
  could not keep its rate visible rather than misleading.
- [deferred] Adding `mission-control` to `specs/config.json` → `specs/config.json` is gate
  configuration that agents may not edit. The plan will ask the maintainer to add the entry (cwd
  `mission-control`, verify `npm run typecheck`, `npm test`) before implementation starts. Until
  then the ticket's module list stays `oms-knowledge-base`.
