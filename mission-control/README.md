# Mission Control

Load runs against OMS, with live latency charts and AI-assisted investigation (SPEC-0055).

A run creates orders through oms-core's REST command API at a fixed rate. It follows each order on
Kafka (`oms_orders`, `oms_order_executions`) until it is filled, rejected or cancelled. It reports
how long each step took, measured from the moment the order was due to be sent:

| Figure | Until |
|---|---|
| Time to OMS ack | the REST create answers 201 |
| Time to market | the first `OrderMessage` (UNACK) is seen |
| Time to order live (market ack) | the `OrderMessage` with state LIVE is seen |
| Time to first fill | the first `OrderExecution` is seen |
| Time to filled | the `OrderMessage` with state FILLED is seen |

Next to these it records the OMS's own checkpoint deltas from the `OrderMessage` SLA fields.

**Further reading:** concepts and definitions are in
[oms-knowledge-base/oms-concepts/mission-control.md](../oms-knowledge-base/oms-concepts/mission-control.md).

## Run it

Prerequisites:
- Node 22+;
- the root compose stack with oms-core, the exchange simulator, the broker and the Schema Registry
  (`docker compose up -d` from the repository root).

```bash
npm install
npm run dev        # server on http://127.0.0.1:8097, UI on http://localhost:5181
```

Production-like:

```bash
npm run build && npm start      # UI and API on http://127.0.0.1:8097
```

To start a run:
1. Open the UI.
2. Set the rate (≤ 200 orders/s), the duration (≤ 600 s) and the order template.
3. Press **Start run**.

The run is checked before any order is sent: the target host must be allowlisted, and oms-core,
Kafka and the Schema Registry must answer. Finished runs are kept in `data/` and listed under
**Runs**.

**Run against an otherwise idle stack.** Everything else on the stack shows up in the numbers.

## AI investigation

Set a provider key, then ask questions on a run's page. The agent has these tools:
- the run summary;
- the slowest orders;
- an order's event history from oms-core's query API;
- Mimir (PromQL) and Loki (LogQL) queries limited to the run's window.

It stops after at most 20 steps.

```bash
export ANTHROPIC_API_KEY=…            # or MC_AI_PROVIDER=openai + OPENAI_API_KEY
```

## Configuration (environment)

| Variable | Default |
|---|---|
| `MC_PORT` | `8097` |
| `MC_ALLOWED_HOSTS` | `localhost,127.0.0.1` (hosts a run may target) |
| `MC_KAFKA_BROKERS` | `localhost:9092` |
| `MC_SCHEMA_REGISTRY_URL` | `http://localhost:8081` |
| `MC_ORDER_TOPIC` / `MC_ORDER_EXECUTION_TOPIC` | `oms_orders` / `oms_order_executions` |
| `MC_MIMIR_URL` | `http://localhost:9009/prometheus` |
| `MC_LOKI_URL` | `http://localhost:3100` |
| `MC_DATA_DIR` | `./data` |
| `MC_AI_PROVIDER` | `anthropic` (`openai`, `local`, `none`) |
| `MC_AI_MODEL` | provider default |
| `MC_AI_BASE_URL` | OpenAI-compatible endpoint for `local` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | (unset: AI investigation is off, everything else works) |

The server listens on 127.0.0.1 only. It accepts POSTs only with `Content-Type: application/json` and, when the request has an `Origin`, only from its own UI (port 8097 or the dev server on 5181), so a web page open in your browser cannot start a run. API clients such as `npm run e2e` send no Origin.

## Checks

```bash
npm run typecheck
npm test                                              # unit, server and component tests
npm run e2e -- --rate 20 --duration 60 --out run.json # against the live stack, server running
```

`e2e` exits 0 only if every order was filled, every figure has one sample per order, nothing failed
or stayed open, and the generator kept the rate.

## Reading the numbers

**Generator-limited runs.** A run is flagged generator-limited when it achieved under 95 % of the
target rate, or when the p99 lateness of its sends exceeded 50 ms. Its figures then describe
Mission Control, not OMS.

**Sources of error.** Percentiles are exact, computed over all samples. The figures include
Kafka delivery to Mission Control and the time to decode each record.
