# Mission Control — Architecture & Implementation Guide

**Audience:** the development agent building this system.
**Version:** 1.0
**Date:** 2026-08-20
**Companion:** `mission-control-v2.md` (design rationale — read it for *why*; this document is *what* and *how*)

---

## How to use this document

This is a build specification, not a discussion. Sections 1–9 define the system. Section 10 is the task sequence — work it in order, each task has acceptance criteria. Section 11 contains rules that override your defaults.

**You are building from scratch.** An earlier prototype exists at `mission-control/packages/` (Mastra + Hono + React, dormant since 2026-04-07). Section 12 lists exactly what to salvage from it and what to discard. Do not attempt to migrate it incrementally — the deployment target and the transport both changed.

When you encounter something this document does not specify, **do not invent behaviour**. Append the question to `docs/OPEN-QUESTIONS.md` with your proposed default, implement the default behind a clearly named constant, and continue.

---

## 1. What is being built

A client/server tool for **performance testing**, **lifecycle correctness verification**, and **operational investigation** of OMS — a Java/Spring event-sourced order management system.

The defining constraint is asynchrony. A REST command to OMS starts a workflow; the order is then created, routed, acknowledged and filled across a sequence of events emitted through a transactional outbox onto Kafka. A tool that measures OMS by timing the HTTP response measures almost nothing.

Mission Control must:

1. **Inject** order commands at a controlled arrival rate
2. **Observe** every resulting state change from the Kafka event stream
3. **Correlate** async events back to the originating command
4. **Verify** lifecycle completeness and correctness
5. **Measure** latency — time-to-market, time-to-order-accept, time-to-fill — with stated error bounds
6. **Investigate** anomalies across logs, traces, metrics and domain state
7. Do all of it **conversationally**, so users need not know the syntax of anything

---

## 2. Deployment context — read this before designing anything

The development and target environments run on **Kubernetes**, accessed through vscode-server / devpod. The UI runs in a browser and talks to the backend over a **socket**. This drives six constraints that are easy to miss and expensive to retrofit.

### 2.1 Single port, single origin

Port forwarding in vscode-server/devpod is per-port and awkward. A two-port setup (Vite dev server plus a separate API) means two forwards, cross-origin requests, and WebSocket origin problems.

> **Requirement.** In every mode except local Vite development, one process listens on **one port** and serves: the built UI as static assets, the REST API under `/api`, and the WebSocket at `/ws`. In Vite dev mode, Vite proxies `/api` and `/ws` to the server so the browser still sees one origin.

### 2.2 Derive the socket URL from the page, never from config

Forwarded URLs may be served under a path prefix and are always on a host the server cannot predict.

```ts
// packages/ui/src/net/url.ts
export function wsUrl(): string {
  const l = window.location
  const proto = l.protocol === 'https:' ? 'wss:' : 'ws:'
  // import.meta.env.BASE_URL respects Vite's `base`, which must be './'
  const base = document.querySelector('base')?.getAttribute('href') ?? import.meta.env.BASE_URL
  return `${proto}//${l.host}${base.replace(/\/$/, '')}/ws`
}
```

Build the UI with `base: './'` in `vite.config.ts`. Never hardcode a host, port or scheme anywhere in the UI.

### 2.3 The WebSocket upgrade may fail — ship a fallback

Some forwarding proxies do not pass the `Upgrade` header cleanly, and some inject auth cookies and rewrite `Origin`.

> **Requirement.** Do **not** strictly validate `Origin` on the upgrade. Implement a transport abstraction with two implementations: `WebSocketTransport` (primary) and `HttpStreamTransport` (fallback — SSE downstream, `POST /api/rpc` upstream). The client attempts WebSocket, and falls back automatically after two failed upgrades. Both implementations satisfy the same interface and carry the same protocol messages; nothing above the transport layer knows which is in use.

### 2.4 Worker count must come from the cgroup limit, not the host

`os.cpus().length` and `os.availableParallelism()` both report the **node's** CPU count, not the pod's limit. A pod limited to 2 cores on a 64-core node will spawn 64 workers and thrash.

```ts
// packages/engine/src/runtime/parallelism.ts
export function workerCount(): number {
  const explicit = Number(process.env.MC_ENGINE_WORKERS)
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit)
  // cgroup v2: "<quota> <period>", quota "max" means unlimited
  try {
    const raw = readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim().split(' ')
    if (raw[0] !== 'max') {
      return Math.max(1, Math.floor(Number(raw[0]) / Number(raw[1])))
    }
  } catch { /* not cgroup v2, or not containerised */ }
  return Math.max(1, Math.min(4, os.availableParallelism?.() ?? os.cpus().length))
}
```

Set `MC_ENGINE_WORKERS` explicitly in the Deployment and keep it ≤ the CPU limit.

### 2.5 Health probes must survive a saturated engine

If load generation runs on the main thread and saturates the event loop, the liveness probe times out and **Kubernetes kills the pod mid-run**.

> **Requirement.** All engine work runs in `worker_threads`. The main thread serves HTTP, the socket hub, and the agents only. `/healthz` must be a constant-time handler touching no I/O. Set `livenessProbe.timeoutSeconds: 5`, `failureThreshold: 6`, and `periodSeconds: 10`.

### 2.6 The pod filesystem is ephemeral

Run artifacts — per-order samples and serialised histograms — must go to a **PersistentVolumeClaim** mounted at `MC_DATA_DIR` (default `/var/lib/mission-control`). Run metadata goes to Postgres. Nothing may be written to `$HOME` or assumed to survive a restart unless it is on the PVC or in the database.

---

## 3. The target OMS is more capable than the local one

This is the most important functional difference from the local development repository, and the architecture must absorb it without a fork.

| | Local repo (this workspace) | Target environment |
|---|---|---|
| Market adapter | **Absent** | **Present** |
| Exchange simulator | **Absent** | **Present** |
| Orders advance past `UNACK` | Only if something sends `OrderAcceptCmd` | **Autonomously** |
| Fills produced | Only if something sends `ExecutionCreateCmd` | **Autonomously** |
| Reachable states | `NEW → UNACK → LIVE → FILLED` only | Likely also `CXL`, `REJ`, `EXP`, `CLOSED` |
| Cancel / replace | Not implemented | Possibly implemented |

### 3.1 Two operating modes

```
OBSERVER MODE  (target environment — default)
  Mission Control injects orders and watches.
  The exchange simulator inside OMS drives acks and fills.
  Expectations are STATISTICAL and scenario-declared.

CLOSED-LOOP MODE  (local repo — opt-in)
  Mission Control also plays the venue: consumes oms_orders,
  emits OrderAcceptCmd and ExecutionCreateCmd back over Kafka.
  Expectations are EXACT, because Mission Control knows what it injected.
```

Mode is a property of the **target**, not a build flag. `TargetConfig.mode: 'observer' | 'closed-loop'`. The Venue Simulator worker is started only in closed-loop mode.

> **Why closed-loop still matters even though the target does not need it:** it is the only way to develop and test Mission Control against the local repo, and it is the only configuration in which the oracle is provably exact. Use it as the reference environment for the oracle's own tests (§10, M3).

### 3.2 Capability discovery — the mechanism that makes one codebase serve both

**Never hardcode OMS endpoints, command types, topic names, states or transitions.** Probe the target at registration time and store the result. Everything downstream — DSL validation, the oracle, the UI — reads from that record.

```ts
// packages/contracts/src/capabilities.ts
export const TargetCapabilities = z.object({
  probedAt: z.string().datetime(),
  omsBaseUrl: z.string().url(),

  // from the OpenAPI document: the Command discriminator mapping
  commandTypes: z.array(z.string()),          // e.g. ["OrderCreateCmd","OrderAcceptCmd",...]
  endpoints: z.object({
    execute:    z.string(),                    // POST path
    search:     z.string(),
    orderEvents: z.string().nullable(),        // /api/order-events/orderId/{id} if present
    executions: z.string().nullable(),
    metamodel:  z.string().nullable(),
    prometheus: z.string().nullable(),
  }),

  // from GET /api/v1/metamodel
  entities: z.record(z.string(), z.array(z.object({
    name: z.string(), type: z.string(), nullable: z.boolean(),
  }))),

  // from the shared enum schema
  states: z.array(z.string()),
  transitions: z.array(z.tuple([z.string(), z.string()])),
  terminalStates: z.array(z.string()),

  // from Kafka + Schema Registry
  topics: z.object({
    orders: z.string(), executions: z.string(),
    commands: z.string(), dlt: z.string().nullable(),
  }),
  schemaSubjects: z.array(z.string()),

  // capability flags derived from the above
  supportsCancel: z.boolean(),
  supportsReplace: z.boolean(),
  fillsViaRest: z.boolean(),        // false where the Execution mapper drops fields
  hasExchangeSimulator: z.boolean(),

  degraded: z.array(z.object({ probe: z.string(), reason: z.string() })),
})
```

Probes, in order, each independently failable:

| Probe | Source | On failure |
|---|---|---|
| OpenAPI | `GET /v3/api-docs` (springdoc) | Fall back to a pinned minimal command set; record in `degraded` |
| Metamodel | `GET /api/v1/metamodel` | Field validation degrades to "pass through"; record |
| State model | enum schema in the OpenAPI components | Fall back to `NEW,UNACK,LIVE,FILLED,CXL,REJ,CLOSED,EXP`; record |
| Topics | Kafka `listTopics` + Schema Registry `GET /subjects` | Fatal — cannot run without the event stream |
| Exchange simulator | Probe order: submit one order, wait `SIMULATOR_PROBE_TIMEOUT` (default 10s), observe whether it leaves `UNACK` unaided | Assume absent → require closed-loop mode |

The exchange-simulator probe is how the tool decides its own operating mode without being told. **A degraded probe must never be silently ignored** — surface `degraded[]` in the UI target list and stamp it onto every `RunRecord` produced against that target.

### 3.3 The transition model becomes data

The oracle validates observed state sequences against `TargetCapabilities.transitions`, not against a hardcoded table.

Two known exceptions must be encoded as explicit allowances rather than gaps in the model:

- **`LIVE → LIVE` on partial fill.** OMS deliberately bypasses its own state machine for this self-transition. Without an explicit allowance, every partial fill reports a false violation.
- **A fill may arrive before the acknowledgement.** OMS documents this race and permits `NEW/UNACK → LIVE` or `→ FILLED` directly, skipping states.

---

## 4. System architecture

```
mission-control/
├─ packages/
│  ├─ contracts/     Zod schemas, wire protocol, shared types. No I/O. No deps beyond zod.
│  ├─ oms-client/    REST + Kafka/Avro + capability discovery. Used by engine AND server.
│  ├─ engine/        Data plane. worker_threads only. No LLM, no HTTP server, no DB.
│  ├─ server/        Hono + socket hub + orchestrator + persistence + Mastra agents.
│  └─ ui/            React 19 + Vite. Talks only to server.
├─ deploy/k8s/       Deployment, Service, ConfigMap, Secret, PVC, RBAC, optional Ingress.
├─ migrations/       Numbered .sql, applied at boot.
└─ docs/
```

Dependency rule, enforced in CI: `contracts` depends on nothing; `oms-client` depends on `contracts`; `engine` depends on `contracts` + `oms-client`; `server` depends on all three; `ui` depends on `contracts` only (types, via `import type`).

### 4.1 Three planes

> **The rule that governs every other decision: no LLM call, no workflow engine, and no durable write ever sits in the hot path.**

| Plane | Volume | Latency-sensitive | Runtime |
|---|---|---|---|
| **Control** — runs, investigations, chat, agents, approvals | Low | No | Main thread: Hono + socket hub + Mastra |
| **Data** — injection, ingestion, correlation, (venue sim) | ≤ 1k/s | **Yes** | `worker_threads`, plain TypeScript |
| **Analysis** — histograms, invariants, LGTM queries, AI reasoning | Post-hoc | No | Main thread, after the run |

### 4.2 Technology — use exactly these

| Concern | Choice | Note |
|---|---|---|
| Runtime | Node 22 LTS | ESM only, `"type": "module"` |
| Language | TypeScript 5.8+, `strict: true` | `noUncheckedIndexedAccess: true`. No `any`. |
| Monorepo | pnpm workspaces + Turborepo | |
| HTTP server | Hono + `@hono/node-server` | |
| WebSocket | `ws` | Attached to the same HTTP server for the upgrade |
| Validation | Zod | The single source of truth for every shape |
| Agent framework | **Mastra** (`@mastra/core`) | See `mission-control-v2.md` §D1 for the comparison against opencode / Strands / AI SDK |
| Model provider | `createOpenAICompatible` from `@ai-sdk/openai-compatible-v5` | Points at the in-house gateway |
| HTTP load client | `undici` | `Pool` with explicit `connections`; **not** `fetch` |
| Kafka | `@confluentinc/kafka-javascript` | librdkafka-backed; materially faster than KafkaJS |
| Avro | `@confluentinc/schemaregistry` | Resolve schemas at runtime, never generate at build |
| Histograms | `hdr-histogram-js` | Never percentile-from-sorted-array |
| Database | Postgres via `pg` | Plain numbered SQL migrations, applied at boot |
| UI | React 19 + Vite 6 + Tailwind 4 + Zustand + Recharts | |
| Tests | Vitest; Testcontainers for integration | Mirrors the Java side's approach |

---

## 5. Contracts

Everything crossing a boundary is a Zod schema in `packages/contracts`. Types are inferred, never hand-written.

### 5.1 Core records

```ts
export const OrderSample = z.object({
  runId: z.string(),
  clOrdId: z.string(),
  orderId: z.string().nullable(),        // null if the command was rejected outright

  // client clock, monotonic-derived, milliseconds since run start
  tIntended: z.number(),                 // when the arrival was SCHEDULED — see §6.2
  tSent: z.number(),
  tResponse: z.number().nullable(),
  tFirstEvent: z.number().nullable(),    // P2, first oms_orders record
  tLive: z.number().nullable(),
  tTerminal: z.number().nullable(),

  httpStatus: z.number().nullable(),
  terminalState: z.string().nullable(),
  eventCount: z.number(),
  executionCount: z.number(),
  orderQty: z.string(),                  // decimal as string — never number
  cumQty: z.string(),
  leavesQty: z.string(),

  violations: z.array(z.string()),       // invariant ids
  deadlineExpired: z.boolean(),
  skewSensitive: z.boolean(),
})

export const RunRecord = z.object({
  id: z.string(),
  scenarioId: z.string(),
  targetId: z.string(),
  targetCapabilities: TargetCapabilities,   // snapshotted, not referenced
  mode: z.enum(['observer', 'closed-loop']),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  status: z.enum(['starting','running','completed','aborted','failed','invalid']),
  invalidReason: z.string().nullable(),
  noiseFloor: z.record(z.string(), z.number()).nullable(),   // calibration, §6.7
  totals: z.object({
    submitted: z.number(), observed: z.number(), terminal: z.number(),
    httpErrors: z.number(), violations: z.number(), stuck: z.number(),
  }),
  sloResults: z.array(z.object({
    metric: z.string(), threshold: z.number(), actual: z.number(), passed: z.boolean(),
  })),
  artifacts: z.object({ samplesPath: z.string(), histogramsPath: z.string() }),
})
```

**Decimals are strings, everywhere.** OMS uses `BigDecimal` with scale 2 on price/quantity and scale 4 on `cumQty`/`leavesQty`/`lastQty`. Parsing those into IEEE-754 doubles will silently break `qty-conservation`. Use a decimal library or string arithmetic in the oracle.

### 5.2 Wire protocol

Version it from day one: every message carries `p: 1`.

```ts
export const ClientMsg = z.discriminatedUnion('t', [
  z.object({ t: z.literal('sub'),   p: z.literal(1), ch: z.array(z.string()) }),
  z.object({ t: z.literal('unsub'), p: z.literal(1), ch: z.array(z.string()) }),
  z.object({ t: z.literal('run.start'), p: z.literal(1), scenarioId: z.string(),
             targetId: z.string(), idempotencyKey: z.string() }),
  z.object({ t: z.literal('run.abort'), p: z.literal(1), runId: z.string() }),
  z.object({ t: z.literal('chat.send'), p: z.literal(1), sessionId: z.string(), text: z.string() }),
  z.object({ t: z.literal('approval.respond'), p: z.literal(1), approvalId: z.string(),
             decision: z.enum(['approve','decline']), note: z.string().optional() }),
  z.object({ t: z.literal('resume'), p: z.literal(1), token: z.string(), lastSeq: z.number() }),
  z.object({ t: z.literal('ping'), p: z.literal(1), ts: z.number() }),
])

export const RunFrame = z.object({
  windowStart: z.number(), windowEnd: z.number(),
  submitted: z.number(), completed: z.number(), inflight: z.number(),
  targetRate: z.number(), achievedRate: z.number(),
  latency: z.record(z.string(), z.object({           // metric name -> percentiles
    p50: z.number(), p95: z.number(), p99: z.number(), max: z.number(), count: z.number(),
  })),
  states: z.record(z.string(), z.number()),          // state -> count
  violations: z.number(),
  health: z.object({
    eventLoopDelayP99: z.number(), consumerLagMax: z.number(),
    rateDriftPct: z.number(), gcSharePct: z.number(), status: z.enum(['ok','warn','saturated']),
  }),
})
```

> **Hard rule: the socket never carries per-order data.** The correlator produces samples at up to 1000/s; a browser cannot absorb that and does not need to. The server aggregates into **250 ms frames** and sends those. Sample-level data is fetched over REST with pagination, on demand. Violating this will appear to work at 10 orders/s and collapse at 500.

Discrete events (`run.started`, `run.invariant-violation`, `run.completed`, `run.invalid`, `approval.request`) are sent individually, but violations are **rate-limited to 20/s with a dropped-count**; a systematically broken target produces one violation per order.

### 5.3 Resume

The hub keeps a ring buffer of the last 240 frames per active run (one minute at 250 ms). On reconnect the client sends `{ t: 'resume', token, lastSeq }`; the server replays from `lastSeq + 1` if still buffered, otherwise responds `{ t: 'resync' }` and the client refetches state over REST. Do not attempt gapless replay beyond the buffer.

---

## 6. The measurement model

This is the core intellectual property of the tool. Implement it exactly.

### 6.1 Observation points

| | Where | Clock |
|---|---|---|
| **P1** | Injector schedules · sends · receives HTTP response | Client |
| **P2** | Ingestor receives an orders/executions record | Client |
| **P3** | `order_events.timeStamp` via the event-log endpoint | Server |
| **P4** | Venue Simulator emits ack/fill (closed-loop only) | Client |

### 6.2 Coordinated omission — get this right or every number is wrong

Record `tIntended` when the arrival is **scheduled by the arrival process**, not when the request is dispatched. If the injector falls behind, the queueing delay it introduced must appear in the measurement rather than being hidden.

```ts
// correct
const tIntended = schedule.nextArrivalTime()      // computed from the arrival process
await sleepUntil(tIntended)
const tSent = now()                                // may be >> tIntended under load
const res = await pool.request(...)
record({ tIntended, tSent, tResponse: now() })
// latency is measured from tIntended. (tSent - tIntended) is the generator's own debt
// and is reported separately as `injector_debt`.
```

### 6.3 Headline SLIs — single-clock, skew-immune

Computed from client-clock timestamps **only**, so they are exact regardless of pod topology and need no clock synchronisation.

| Metric | Definition |
|---|---|
| `submit_rtt` | `tResponse − tSent` |
| `time_to_market` | `tFirstEvent − tIntended` |
| `time_to_order_accept` | `tLive − tIntended` |
| `time_to_fill` | `tTerminal − tIntended` (terminal = `FILLED`) |
| `injector_debt` | `tSent − tIntended` — the generator's own contribution |
| `venue_round_trip` | closed-loop only: P2 ack observation − P4 ack emission |

Use `performance.now()` for all client timestamps, anchored once per run to a wall-clock instant. `Date.now()` is subject to NTP steps mid-run.

### 6.4 Decomposition — server-clock, skew-flagged

Used to **attribute** latency, never quoted as a headline. Every value computed across two clocks sets `skewSensitive: true` on the sample.

| Segment | Definition | Clocks |
|---|---|---|
| `oms_internal_accept` | `ACK` event ts − `NEW_ORDER` event ts | server/server — clean |
| `oms_internal_fill` | fill event ts − `NEW_ORDER` event ts | server/server — clean |
| `outbox_publish_lag` | Kafka record ts − `order_events.timeStamp` | mixed — flagged |
| `event_visibility_lag` | P2 receive − Kafka record ts | mixed — flagged |

### 6.5 `outbox_publish_lag` gets its own line in every report

OMS drains its outbox on a fixed-delay scheduler (`kafka.outbox.poll-interval-ms`, default 200). **Roughly half that is baked into every Kafka-observed latency before OMS does any work.** Read the configured value from the target during discovery where possible; otherwise report the measured distribution and state that the floor is a scheduler constant, not application latency.

A report that folds this into `time_to_market` and shows 150 ms will send someone on a multi-day investigation into a `fixedDelay` value.

Also surface the two gauges OMS already exposes — `oms_outbox_pending` and `oms_outbox_stuck`. Rising `pending` during a run means the relay is falling behind the command rate, which is a real finding about OMS throughput.

### 6.6 Sampling

At 1k orders/s, fetching the event log per order adds 1000 REST calls/s — the tool would generate a third of its own load against the API it is measuring.

| Source | Coverage |
|---|---|
| Kafka event stream | **100%** — push-based, no added load |
| Deep event-log fetch (P3) | **1%** random, plus 100% of failures, violations, and outliers beyond p99.9 |
| Postgres direct read | On demand, investigation only |

Make the sample rate a scenario field with a hard cap of 5%.

### 6.7 Calibration — mandatory

Before the measured phase of every run, the injector runs a short calibration burst against a trivial in-process echo endpoint at the same target rate, producing `RunRecord.noiseFloor`. Every latency figure in every report is quoted against it.

> A tool that cannot state its own measurement error is not a measurement tool. An OMS p99 of 12 ms means something quite different when the floor is 0.4 ms than when it is 9 ms.

In-cluster there is also a real pod-to-pod network hop. Add a second calibration leg against the target's cheapest endpoint (`/actuator/health`) to separate network RTT from OMS processing.

### 6.8 Self-monitoring and run invalidation

| Signal | Source | Trips at |
|---|---|---|
| Event-loop delay (per worker) | `monitorEventLoopDelay` | p99 > 50 ms |
| Rate drift | injector | achieved < 95% of target, sustained 10 s |
| Injector debt | `tSent − tIntended` | p99 > 20 ms |
| Kafka consumer lag | librdkafka stats | monotonically rising for 30 s |
| In-flight map size | correlator | monotonically rising for 30 s |
| GC share | PerformanceObserver | > 10% of wall time |

**Any trip marks the run `invalid`, sets `invalidReason`, and withholds latency figures from the report.** The run still completes and its samples are retained for diagnosis. This is the difference between a measurement tool and one that produces plausible-looking numbers.

---

## 7. The correctness oracle

Invariants are **declarative data** evaluated by a generic engine — not hand-written `if` statements. This lets the AI author and explain them, and makes violations carry structured evidence.

```ts
export interface Invariant {
  id: string
  description: string
  scope: 'order' | 'run'
  requires?: (c: TargetCapabilities) => boolean   // skip when unsupported
  evaluate(ctx: OrderContext | RunContext): Violation[]
}
```

### 7.1 Order-scoped — hold in both modes

| Id | Assertion |
|---|---|
| `qty-conservation` | `cumQty == Σ execution.lastQty` and `leavesQty == orderQty − cumQty` |
| `filled-iff-complete` | `cumQty == orderQty` **iff** terminal state is `FILLED` |
| `cumqty-monotonic` | `cumQty` never decreases across the event sequence |
| `legal-transitions` | Sequence legal under `TargetCapabilities.transitions`, plus the `LIVE→LIVE` and skip-ahead allowances (§3.3) |
| `no-event-gaps` | `eventId` strictly increasing from 1, no gaps |
| `exactly-once-executions` | No duplicate `execID` within an order |
| `no-orphan-executions` | Every execution record has a matching order record |
| `fill-within-leaves` | Each `lastQty ≤ leavesQty` immediately prior to that fill |
| `terminal-within-deadline` | Reaches a terminal state before the scenario deadline |

### 7.2 Mode-specific

**Closed-loop** — exact, because Mission Control injected the truth:

| Id | Assertion |
|---|---|
| `terminal-matches-injected` | Terminal state equals what the venue model produced |
| `fills-match-injected` | Every injected fill observed exactly once, with matching `lastQty`/`lastPx` |

**Observer** — statistical, because the exchange simulator owns the outcome:

| Id | Assertion |
|---|---|
| `terminal-distribution` | Observed terminal-state distribution within the scenario's declared tolerance |
| `terminal-in-allowed-set` | Every terminal state ∈ `expect.terminal` |

> This is the real cost of the target's exchange simulator: **the oracle weakens from exact to statistical.** Say so plainly in the run report. Do not present observer-mode results with the confidence of closed-loop results.

### 7.3 Run-scoped

- `submitted == observed == terminal` (accounting for declared reject rates)
- No orphan events — no `orderId` this run did not submit
- No stuck orders past deadline
- Sampled P3 fetches agree with the P2-derived view
- `oms_outbox_stuck` remained zero throughout

### 7.4 Every invariant ships with a test that makes it fail

An oracle that has never fired has never been verified. For each invariant, write a test that constructs an event sequence violating exactly that invariant and asserts it trips **that one and no others**. This is the acceptance gate for M3.

---

## 8. Scenario DSL

> **The model never emits executable code. It emits data, validated against a Zod schema before it can run.** This is what makes AI-authored configuration safe: a generated scenario cannot do anything a hand-written one could not.

```yaml
scenario: equity-limit-ramp
target: dev                     # a NAME from the registry — never a URL

load:
  arrival: { type: ramp, from: 50, to: 800, over: 2m }
  duration: 10m
  deepSampleRate: 0.01

orders:
  symbol:      { pick: [AAPL.OQ, MSFT.OQ, INTC.OQ, JPM.N] }
  side:        { weighted: { BUY: 0.5, SELL: 0.5 } }
  ordType:     LIMIT
  orderQty:    { choice: [100, 500, 1000, 5000] }
  price:       { relativeTo: symbol, jitterPct: 2 }
  timeInForce: DAY

actions:                        # requires capabilities.supportsCancel
  - { after: 3s, probability: 0.1, do: cancel }

venue:                          # ignored in observer mode
  ackDelay:   { dist: lognormal, median: 5ms, sigma: 0.4 }
  fill:       { type: sliced, slices: 3, interval: 200ms }
  rejectRate: 0.01

expect:
  terminal: [FILLED, CXL]
  distribution: { FILLED: { min: 0.85 }, CXL: { max: 0.15 } }
  within: 5s
  invariants: [qty-conservation, legal-transitions, exactly-once-executions, no-event-gaps]

slo:
  time_to_order_accept_p99: 250ms
  time_to_fill_p99: 2s
  error_rate_max: 0.001
```

### 8.1 Validation is capability-aware

`validateScenario(scenario, capabilities)` returns structured errors. A scenario using `actions: cancel` against a target whose `supportsCancel` is false fails validation **with that reason**, not with a wall of HTTP errors three minutes into the run.

Encode the **server's** validation rules, which are stricter than its OpenAPI contract: `sessionId` is required though the spec does not mark it so; `price` is required for `LIMIT`; `stopPx` for `STOP` variants.

### 8.2 Authoring loop

```
natural language
  → scenario-author agent (Mastra structured output, schema-constrained)
  → validateScenario(draft, capabilities)
  → invalid?  → error fed back to the AGENT, never to the user → retry (max 3)
  → valid?    → rendered diff + plain-English summary → user confirms → persist
```

The user sees a diff and a summary. They never see a schema error.

---

## 9. Correlation

OMS carries no `correlationId`, `causationId` or `traceId`, and does not propagate trace context through Kafka. Correlate on domain keys.

```
sessionId = "MC-<runId>"
clOrdId   = "<runId>-<workerId>-<seq>"

  (sessionId, clOrdId) ──▶ orderId ──▶ eventId
   client intent          server id    ordering & dedup
```

The pair is already OMS's idempotency key (`uq_orders_session_cl_ord_id`), so this doubles as duplicate-submission protection. The command response returns the generated `orderId`. `eventId` is the **per-order** version — not global — used for ordering and gap detection.

**A single fill produces two Kafka records** by design: OMS stages both an order row and an execution row so that consumers tracking fills and consumers tracking state need not infer one from the other. The correlator must expect and reconcile both, keyed on `orderId` and `execId` respectively.

Handle the ordering race explicitly: the correlator may receive an event for an `orderId` **before** the injector's HTTP response has bound `clOrdId → orderId`. Buffer unbound events by `orderId` for up to 5 seconds and reconcile on binding. Do not treat them as orphans immediately.

---

## 10. Build sequence

Each task lists acceptance criteria. Do not proceed past a milestone until its criteria pass.

### M0 — Scaffold

**T1 · Monorepo.** pnpm workspaces + Turborepo, five packages per §4. TypeScript strict, ESM, Vitest, ESLint. A CI-enforced dependency-direction check.
*Accept:* `pnpm build && pnpm test && pnpm lint` clean; an import from `engine` into `server` fails the dependency check.

**T2 · Contracts.** All schemas from §5 plus `Scenario`, `TargetConfig`, `Invariant`.
*Accept:* round-trip tests parse and reject known-bad fixtures for every schema.

**T3 · Config.** Env-var loading validated by Zod, fail-fast with a readable message naming every missing variable at once. Variables per §13.
*Accept:* the server refuses to start on a missing required var and prints all of them.

### M1 — OMS client and discovery

**T4 · REST client.** `undici.Pool`, typed methods for command execute, query search, event log, executions, metamodel. Retry only on connect errors, never on 4xx/5xx.
**T5 · Filter DSL.** The `field__op` builder (`__like`, `__gt`, `__gte`, `__lt`, `__lte`, `__between`). Note the server silently ignores unknown fields and matches-everything on unparseable values — **validate client-side against the metamodel** so a typo cannot silently return the unfiltered set.
**T6 · Kafka consumer.** librdkafka + Schema Registry Avro. Client-clock stamp applied before decode.
**T7 · Kafka producer.** Avro command envelope. Read-only schema resolution — never auto-register.
**T8 · Capability discovery.** All probes from §3.2, each independently failable, populating `degraded[]`.

*Accept:* `pnpm mc probe --target <name>` prints a `TargetCapabilities` document; killing the metamodel endpoint yields a `degraded` entry rather than a crash; the exchange-simulator probe correctly reports `false` against the local repo and `true` against a target with one.

### M2 — Persistence

**T9 · Migrations and repositories.** Numbered SQL applied at boot inside an advisory lock. Tables: `targets`, `scenarios`, `runs`, `run_slo_results`, `violations`, `approvals`.
**T10 · Artifact store.** NDJSON sample writer with backpressure-aware streaming; serialised HDR histograms. Rooted at `MC_DATA_DIR`. Paths recorded on `RunRecord`.

*Accept:* two concurrent boots do not double-apply migrations; a 100k-sample write sustains without unbounded memory growth.

### M3 — Engine

**T11 · Arrival processes.** Constant, Poisson, ramp, step, burst.
*Accept:* χ² test confirms the Poisson generator's inter-arrival distribution; ramp reaches its endpoint within 1%.

**T12 · Injector worker.** Open-model, `tIntended` per §6.2, undici pool, payload generation from the scenario, correlation keys per §9.
**T13 · Ingestor worker.** Both topics, dedup on `(orderId, eventId)`, batch-forwards to the correlator every 10 ms or 64 items.
**T14 · Correlator.** Open-addressed in-flight map, timing wheel for deadlines, unbound-event buffer per §9.
**T15 · Histograms.** Per-worker HDR recording, lossless merge at run end.
**T16 · Invariant engine.** Generic evaluator per §7, all invariants registered as data.
**T17 · Self-monitoring.** All signals from §6.8, frame-level health, run invalidation.
**T18 · Venue simulator.** Closed-loop mode only. Ack delay distributions, fill schedules, reject rate, fault injection. Must observe `LIVE` before emitting a fill — OMS rejects fills against `UNACK` orders.

*Accept:*
- Component test against a stub OMS: injected fills produce exactly the expected samples.
- **Fault-injection suite:** each seeded fault — dropped event, duplicate `execID`, illegal transition, `eventId` gap, quantity mismatch, late terminal — trips exactly its own invariant and no other.
- A deliberately throttled stub causes the run to be marked `invalid` with the correct `invalidReason`.

### M4 — Server

**T19 · HTTP app.** Hono on one port. Static UI, `/api/*`, `/healthz`, `/readyz`. Constant-time health handler.
**T20 · Socket hub.** `ws` upgrade on `/ws`, protocol per §5.2, 250 ms frame aggregation, violation rate-limiting, ring-buffer resume, and the `HttpStreamTransport` fallback per §2.3.
*Accept:* a run at 1000 orders/s produces ≤ 4 frames/s to each client regardless of order rate; a client disconnected for 10 s resumes without gaps; with WebSocket upgrade blocked at the proxy, the UI still functions via the fallback.

**T21 · RunOrchestrator.** Start/abort/resume, guardrail enforcement (§11.4), worker lifecycle, idempotent start via `idempotencyKey`.
**T22 · REST API.** Scenario CRUD + `/validate`, target registry + `/probe`, runs, paginated samples, run comparison.

### M5 — UI

**T23 · Shell and transport.** Socket client with automatic reconnect, exponential backoff, transport fallback, and a visible connection state.
**T24 · Run launcher.** Scenario + target selection, resolved-plan preview (arrival curve, expected order count, mode, capability warnings), confirm.
**T25 · Live run.** Target vs achieved rate, in-flight, running percentiles, state distribution, violations feed, and a **generator health panel that turns amber before the run is invalidated**.
**T26 · Report and comparison.** Latency decomposition, HDR percentile curves, SLO pass/fail, outlier drill-down, noise floor quoted alongside every figure, and an explicit mode banner (`observer — statistical` vs `closed-loop — exact`).
**T27 · Chat.** Streaming, skills, inline approval prompts.

### M6 — Agents

**T28 · Mastra setup.** In-house provider via `createOpenAICompatible`. Storage for memory and workflow state.
**T29 · Tools.** `oms-query`, `order-event-log`, `kafka-inspect` (lag, partitions, DLT contents), `run-compare`, `k8s-*`, `query-loki`, `query-prometheus`, `query-tempo`. Mount `oms-mcp-server` over MCP rather than reimplementing domain knowledge.
**T30 · scenario-author.** Structured output + the validate/retry loop of §8.2.
**T31 · perf-analyst, lifecycle-detective.**
**T32 · Skills.** Markdown + YAML front-matter, discovered by a search tool.
**T33 · MCP server surface.** Expose `startRun`, `getRunReport`, `compareRuns`, `investigateOrder`, `listScenarios` so opencode and other harnesses can drive Mission Control.

### M7 — Deploy

**T34 · Dockerfile.** Multi-stage, non-root, `NODE_OPTIONS=--max-old-space-size` sized to the memory limit.
**T35 · Manifests.** Deployment, Service, ConfigMap, Secret, PVC, RBAC (read-only for pods/logs/events/deployments), optional Ingress. `MC_ENGINE_WORKERS` ≤ CPU limit. Probe timings per §2.5.
**T36 · Docs.** README with local dev, in-cluster deploy, and a runbook.

---

## 11. Rules that override your defaults

These exist because each one is a mistake that is cheap to make and expensive to find.

1. **Nothing blocking, LLM-driven, or durable in the engine hot path.** No `await db.insert()` per order. No agent call per order. Batch and stream.
2. **Never hardcode OMS endpoints, topic names, command types, states or transitions.** Read them from `TargetCapabilities`. If you find yourself typing `"oms_orders"` outside the discovery module, stop.
3. **Never send per-order data over the socket.** Frames only. See §5.2.
4. **Never derive worker count from `os.cpus()`.** See §2.4.
5. **Decimals are strings.** Never parse OMS quantities or prices into `number` before comparing them.
6. **Latency is measured from `tIntended`.** See §6.2.
7. **A degraded probe is recorded, never assumed away.** Stamp `degraded[]` onto every affected run.
8. **Every invariant ships with a test that makes it fail.**
9. **Never auto-register an Avro schema.** Resolve read-only from the registry.
10. **Guardrails live in the engine, not the DSL and not the prompt.** Rate, duration and total-order caps are enforced where they cannot be talked around. `prod` is not a valid environment class; adding one is a reviewed code change.
11. **When something is unspecified, write it down.** `docs/OPEN-QUESTIONS.md`, proposed default, named constant, keep going. Do not guess silently.

---

## 12. What to salvage from the existing prototype

Read `mission-control/packages/server/src/` before starting. It is a useful reference for Mastra tool and agent shape.

**Port these:**

| From | Why |
|---|---|
| `tools/shared/correlate-timeline.ts` | Cross-source timeline merge — works as-is |
| `tools/shared/search-playbooks.ts`, `services/playbooks.ts` | The markdown + front-matter skill system |
| `tools/prometheus/*` | Query patterns are correct |
| `tools/postgres/*` | Read-only SQL guard is worth keeping |
| `tools/kubernetes/*` | **Now primary** — the target runs on Kubernetes |
| `agents/investigation-supervisor.ts` | The supervisor/sub-agent pattern |
| `packages/ui` Zustand store shape and Tailwind setup | Sound starting point |

**Discard:**

| What | Why |
|---|---|
| `tools/docker/*` | There is no Docker socket in a Kubernetes pod |
| SSE-only streaming in `api/routes.ts` | Replaced by the socket protocol of §5.2 |
| `~/.mission-control/config.json` | Replaced by env + ConfigMap; the pod filesystem is ephemeral |
| Port 3100 | Collides with Loki. Use **3200**. |
| The React Flow workflow builder | Out of scope for v1; revisit after the perf spine ships |

> Note the inversion: the earlier design deprioritised Kubernetes tooling because the local environment is docker-compose only. In the target environment that is exactly backwards — the Kubernetes tools become primary and the Docker tools become dead code.

---

## 13. Configuration

All configuration is environment variables, validated by Zod at boot.

```bash
# server
MC_PORT=3200
MC_DATA_DIR=/var/lib/mission-control          # PVC mount
MC_DB_URL=postgres://mc:***@postgres:5432/missioncontrol
MC_LOG_LEVEL=info

# engine
MC_ENGINE_WORKERS=4                            # <= CPU limit; see §2.4
MC_MAX_RATE_LOCAL=2000
MC_MAX_RATE_DEV=1000
MC_MAX_RATE_UAT=200
MC_MAX_RUN_DURATION_SEC=3600

# AI provider (in-house, OpenAI-compatible)
MC_AI_BASE_URL=https://ai-gateway.internal/v1
MC_AI_API_KEY=***
MC_AI_MODEL=<model-id>

# bootstrap target (optional — targets are otherwise registered at runtime)
MC_BOOTSTRAP_TARGET_NAME=dev
MC_BOOTSTRAP_TARGET_CLASS=dev                  # local | dev | uat
MC_BOOTSTRAP_OMS_URL=http://oms-core.oms.svc.cluster.local:8090
MC_BOOTSTRAP_KAFKA_BROKERS=kafka.oms.svc.cluster.local:9092
MC_BOOTSTRAP_SCHEMA_REGISTRY=http://schema-registry.oms.svc.cluster.local:8081

# observability (optional; features degrade explicitly if absent)
MC_PROMETHEUS_URL=http://prometheus.observability.svc.cluster.local:9090
MC_LOKI_URL=http://loki.observability.svc.cluster.local:3100
MC_TEMPO_URL=http://tempo.observability.svc.cluster.local:3200
```

---

## 14. Verification

**Unit.** Arrival distributions by χ². Invariant engine against hand-built sequences including corrupt ones. HDR merge correctness. Decimal arithmetic against `BigDecimal` fixtures taken from real OMS responses.

**Component.** Engine against a stub OMS implementing the command API and emitting Avro to a Testcontainers Kafka. The fault-injection suite of §10/M3 is the gate.

**Integration.** Testcontainers Postgres + Kafka + Schema Registry. Full run lifecycle: start → inject → correlate → report.

**End-to-end, local repo (closed-loop).** 60 s at 100 orders/s: expect 6000 orders, all `FILLED`, zero violations, and a measured `outbox_publish_lag` near half the configured poll interval — this validates the measurement model against a known constant.

**End-to-end, target (observer).** A short run confirming the exchange simulator drives orders to terminal states unaided, that `terminal-distribution` evaluates, and that the report is banner-marked *statistical*.

**Scale.** Ramp to 1k orders/s in-cluster. Confirm event-loop delay stays within budget, achieved rate tracks target, and the pod is not OOM-killed or liveness-killed. If the ceiling is Mission Control's own, the report must say so rather than attributing it to OMS.

**Transport.** Verify the UI works through vscode-server port forwarding, including a run with the WebSocket upgrade deliberately blocked so the fallback path is exercised.

---

## 15. Open questions to resolve with the team

1. **Is the target's exchange simulator configurable?** If its ack latency and fill behaviour can be driven, a substantial part of the closed-loop mode's control returns in observer mode. Find its API and record it in `TargetCapabilities`.
2. **Does the target implement cancel and replace?** Discovery answers this, but the scenario `actions` grammar needs the real command shapes.
3. **Where does Mission Control run relative to OMS?** Same cluster and namespace preserves cheap single-clock precision. Cross-cluster makes the network leg dominant and the calibration of §6.7 essential.
4. **Schema Registry compatibility.** Mission Control produces to the commands topic in closed-loop mode. Confirm read-only resolution is acceptable and that no subject-compatibility change is required.
5. **Authentication.** The local OMS has none. Assume the target does. Establish the mechanism early — it affects the REST client, the Kafka client, and the k8s RBAC.
