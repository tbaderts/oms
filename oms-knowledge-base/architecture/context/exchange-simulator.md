---
aliases: [architecture/exchange-simulator, oms-concepts/exchange-simulator]
type: Component
title: "Exchange Simulator"
description: "FIX exchange simulator that acknowledges, fills, rejects and cancels OMS market orders so the lifecycle can run end to end."
tags: [component, exchange-simulator, fix, kafka, testing]
status: stable
version: "1.0"
updated: "2026-11-26T15:00:00Z"
component: "exchange-simulator"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-25T12:00:00Z" }
sources:
  - resource: "repo:oms-exchange-simulator/src/main/java/org/example/simulator/ExchangeSimulatorApplication.java"
  - resource: "repo:oms-exchange-simulator/src/main/resources/application.yml"
  - resource: "repo:oms-exchange-simulator/src/main/java/org/example/simulator/engine/LimitPriceRules.java"
  - resource: "repo:oms-exchange-simulator/src/main/java/org/example/simulator/marketdata/ReferencePriceService.java"
  - resource: "repo:oms-exchange-simulator/src/main/java/org/example/simulator/marketdata/PriceServiceQuoteClient.java"
  - resource: "repo:oms-exchange-simulator/src/main/java/org/example/simulator/kafka/errors/KafkaErrorHandlingConfig.java"
  - resource: "repo:oms-exchange-simulator/src/main/java/org/example/simulator/kafka/CommandGateway.java"
---
# Exchange Simulator

The venue simulator: a separate service that plays the market for oms-core (SPEC-0001). Capability:
[Exchange Simulation](../../capabilities/exchange-simulation.md). Context: [System Context](system-context.md).

## 1. Purpose

The OMS has no market connectivity. Without something on the other side, an order would stay in
UNACK forever, and acks, fills, rejects and cancels could only be tested by sending each command by
hand. `oms-exchange-simulator` plays the venue. It reads the OMS's order stream and answers each
order the way an exchange does, with FIX semantics, so the whole order lifecycle can run end to
end.

It is a separate, independently deployable service. It talks to oms-core only through Kafka and the
shared contracts in `oms-contracts`, exactly as a real venue adapter would. To test against a real
venue, switch it off.

## 2. Message Flow

```mermaid
sequenceDiagram
    participant OMS as oms-core
    participant K as Kafka
    participant SIM as exchange simulator
    OMS->>K: OrderMessage(state=UNACK) on oms_orders   [NewOrderSingle 35=D]
    K->>SIM: evaluate economics
    alt rejected
        SIM->>K: OrderRejectCmd on commands           [ExecType=8]
    else accepted
        SIM->>K: OrderAcceptCmd                       [ExecType=0]
        SIM->>K: ExecutionCreateCmd × n (marketable)  [ExecType=F]
        SIM->>K: OrderCancelCmd (IOC not marketable)  [ExecType=4]
    end
    OMS->>K: OrderMessage(cancelState=PCXL)           [OrderCancelRequest 35=F]
    alt open quantity
        SIM->>K: OrderCancelCmd                       [ExecType=4]
    else unknown order or nothing open
        SIM->>K: OrderCancelRejectCmd                 [OrderCancelReject 35=9]
    end
```

| FIX message from the venue | Command sent to oms-core |
|---|---|
| ExecutionReport ExecType=0 (New) | `OrderAcceptCmd` |
| ExecutionReport ExecType=F (Trade) | `ExecutionCreateCmd`, execType `F`, execId `<orderId>-F<n>` |
| ExecutionReport ExecType=8 (Rejected) | `OrderRejectCmd`; its `text` reason lands in the order's `rejectReason` |
| ExecutionReport ExecType=4 (Canceled) | `OrderCancelCmd` |
| OrderCancelReject (35=9) | `OrderCancelRejectCmd`; its `text` reason lands in the order's `rejectReason` |

All commands are keyed by orderId, so one order's commands share a partition and oms-core applies
them in the order sent: the ack is always processed before the fills.

## 3. Triggers

The simulator sees every update the OMS publishes, including the OMS's own echoes of the
simulator's answers. It reacts to exactly two triggers:

1. **New order:** the first message for an orderId with `state = UNACK`.
2. **Cancel request:** a change of `cancelState` into `PCXL` compared with the last message seen for
   that order.

Every reject, cancel and cancel reject also carries a `commandId` derived from the OMS event it
answers: `<orderId>-REJ-<eventId>`, `<orderId>-CXL-<eventId>` or `<orderId>-CXLREJ-<eventId>`.
If Kafka replays a cancel request after its reject has been applied, the state precondition
holds again, but the answer carries an id oms-core has already applied, so it is refused.
This survives simulator restarts, because the id comes from the OMS event, not from a counter.

In oms-core's event log, a cancel request appears as `CXL_REQUEST`, followed by `CXL` when the
simulator confirms it or `CXL_REJ` when it refuses it.

Everything else is ignored. This makes the simulator idempotent: a redelivered order or a repeated
PCXL message triggers nothing. oms-core is idempotent on its side as well, because every command's
precondition stops holding once the command has been applied (see
[Order Lifecycle §4.9.1](../../domain/concepts/order-lifecycle.md)).

## 4. Order Economics

Each symbol has one **reference price**: the price marketable quantity fills at and limit prices
are checked against. There is no order book, bid or ask.

### 4.1 Reference prices (SPEC-0073, SPEC-0079)

`ReferencePriceService` answers from, in order:

1. **Its cache**: the price service's answers, including "no price", kept for `quote-ttl` (default
   5 min).
2. **The [Price Service](price-service.md)**, `GET /api/market-data/quotes/{symbol}`: the quote's
   `last`, the same price [order entry](../../ui/order-entry.md) shows the trader. That is a live
   Alpha Vantage price within the price service's budget, else its last end-of-day close. Used when
   `SIMULATOR_PRICE_SERVICE_URL` is set. Timeouts: connect 2 s, read 3 s.
3. **The static `simulator.reference-prices`**, when no URL is set, the price service cannot be
   reached or answers an error, or it has no price for the symbol (404). Fallbacks are not cached.

A symbol priced by none of them is rejected (`Unknown symbol <s>`). The price service's price wins
over the static one, so AAPL trades at the market price, or at its last known close. After an
outage, the price service is left alone for `provider-backoff` (default 60 s). Lookups run on the
engine's single thread, so this bounds how long a dead price service can hold up the venue to one
read timeout per back-off period.

The simulator has no market data provider and no key of its own (SPEC-0079). Before that, it asked
Alpha Vantage directly, through its own client and cache, on the same key as oms-ui.

A cancel request for an order with open quantity cancels it. If a fill sequence is still running,
the remaining slices are dropped. A cancel request for a filled, cancelled, rejected or unknown
order is refused (`Too late to cancel` / `Unknown order`).

## 5. Configuration

| Property | Env var | Default |
|---|---|---|
| `simulator.price-service.url` | `SIMULATOR_PRICE_SERVICE_URL` | none: static prices only (compose: http://price-service:8098) |
| `simulator.quote-ttl` | `SIMULATOR_QUOTE_TTL` | 5m |
| `simulator.provider-backoff` | `SIMULATOR_PROVIDER_BACKOFF` | 60s |
| `simulator.reference-prices.<SYMBOL>` | — | the fallback: AAPL 170.00, MSFT 420.00, IBM 250.00, NVDA 120.00, INTC 86.96 |
| `simulator.price-collar.tiers` / `.default-percent` | — | `{max-reference: 25.00, percent: 10}`, `{max-reference: 50.00, percent: 5}`; 3 |
| `simulator.fill-slices` | `SIMULATOR_FILL_SLICES` | 1 |
| `simulator.fill-delay` | `SIMULATOR_FILL_DELAY` | 0ms |
| `simulator.last-mkt` | `SIMULATOR_LAST_MKT` | XSIM |
| `simulator.order-topic` | `ORDER_TOPIC` | oms_orders |
| `simulator.command-topic` | `COMMAND_TOPIC` | commands |
| `simulator.max-tracked-orders` | — | 100000 (oldest orders are forgotten beyond this) |
| `spring.kafka.consumer.auto-offset-reset` | `SIMULATOR_OFFSET_RESET` | latest (a new group does not replay order history) |
| `kafka.error-policy.retry-for` | `KAFKA_RETRY_FOR` | PT2M (SPEC-0077) |
| `kafka.error-policy.initial-interval` / `.max-interval` | `KAFKA_RETRY_INITIAL` / `KAFKA_RETRY_MAX` | PT0.5S / PT30S |
| `kafka.topics.replication-factor` | `KAFKA_TOPIC_REPLICATION_FACTOR` | 1 (for the dead-letter topics it creates) |

**Kafka failures (SPEC-0077).** The simulator follows the
[Kafka error policy](../patterns/kafka-messaging.md#error-policy-every-consumer-and-producer):
- **Order consumer.** It reads `oms_orders` as bytes and decodes them in `OrderMessageDecoder`.
  `orderErrorHandler` retries a retryable failure for `retry-for`, then sends the record to
  `oms_orders.oms-exchange-simulator.DLT`. A record that cannot be decoded, or a failure that
  cannot succeed, goes there at once.
- **Command producer.** `CommandGateway` sends asynchronously; the Kafka client retries for
  `retry-for`. A command that still fails is written to `commands.oms-exchange-simulator.DLT`
  (Avro, or JSON if it cannot be serialized) by `CommandDeadLetterPublisher`. The engine never
  waits on a send.
- Both dead-letter topics are created at startup with the partition count of their source topic.

## 6. Running It

```bash
cd oms-exchange-simulator && ./gradlew bootJar
cd .. && docker compose up -d --build oms-core price-service exchange-simulator
```

oms-core must run with `KAFKA_ENABLED=true`. Then create an order (see `oms-core/rest.http`):

- symbol AAPL, MARKET: ends FILLED, at the price service's price for it: its live price with a key, else its last end-of-day close (170.00 from the seed);
- any other symbol the price service prices (e.g. GOOGL with a key), MARKET: ends FILLED;
- symbol ZZZZ: ends REJ;
- LIMIT BUY 165 on AAPL at 170.00 (no key): rests LIVE. Send `OrderCancelRequestCmd` for it and it ends CXL;
- LIMIT BUY 175.11 on AAPL at 170.00: ends REJ (collar); 170.005 ends REJ (tick).

To use live prices, put `ALPHAVANTAGE_API_KEY=<key>` in the root `.env`; compose passes it to the
price service only (SPEC-0079).

## 7. Observability

- Counters at `http://localhost:8094/actuator/prometheus`: `simulator_orders_received_total`,
  `simulator_acks_total`, `simulator_executions_total`, `simulator_rejects_total`,
  `simulator_cancels_total`, `simulator_cancel_rejects_total`.
- `simulator_reference_price_lookups_total{source, outcome}` (SPEC-0073), one per reference price
  lookup. `source` says where the price came from: `CACHE`, `PRICE_SERVICE`, `STATIC`, or `NONE`
  (rejected as unknown). `outcome` is `FOUND` when the price service's price was used, otherwise why
  it was not: `NOT_FOUND`, `NOT_CONFIGURED` or `UNREACHABLE`. A rising
  `source="STATIC",outcome="UNREACHABLE"` means the price service is down. The provider's own quota is
  watched on the price service (`oms_price_provider_budget_remaining`).
- Every log line about an order carries `orderId` in the MDC.
- Kafka observation is enabled on the template and the listener, so trace context crosses the
  simulator.
- `kafka_dead_letters_total{service="oms-exchange-simulator"}` counts dead letters by topic, side
  and exception; `kafka_dead_letters_failed_total` counts dead letters that could not be written.

## 8. Load Suite

The load suite is from SPEC-0024. It drives a scripted, repeatable order flow through oms-core
while the simulator acks and fills, and it records the result. The simulator takes part unchanged.

For runs at a configurable rate, with live latency charts and AI investigation, use
[Mission Control](../../tools/mission-control.md) (SPEC-0055). This JUnit suite stays the fixed-shape baseline.

**Where and when it runs.**
- The suite is `LoadSuiteRunnerTest` in oms-core test scope, package `org.example.oms.load`.
- It is gated by `OMS_LOAD_SUITE=true`, so CI and `./gradlew check` skip it.
- It needs the running compose stack: oms-core on 8090 with `KAFKA_ENABLED=true`, plus the
  exchange simulator.

**What it does.**
1. It reads `/actuator/prometheus` once before the run.
2. It submits `OMS_LOAD_ORDERS` MARKET orders through `POST /api/command/execute`, with
   `OMS_LOAD_CONCURRENCY` in flight.
3. It waits until every order is terminal (FILLED, CXL, REJ or CLOSED).
4. It reads the metrics again.

**What it measures.**
- **Throughput:** commands applied per second of wall time, from the first submit until the last
  order is terminal. The count is the REST creates plus the delta of
  `oms_commands_consumed_total{outcome="applied"}`, which covers the accepts and fills the
  simulator sent.
- **Latency:** p50, p95 and p99 of each order SLA timer (`oms_order_time_to_ack`,
  `oms_order_oms_processing_time`, `oms_order_market_round_trip`, `oms_order_time_to_market`).
  They are interpolated from the `_seconds_bucket` deltas of this run the way PromQL
  `histogram_quantile` does, so earlier traffic does not count. Their precision is the bucket
  bounds.

**The report.**
- `LoadReportWriter` writes a Markdown report to `OMS_LOAD_REPORT_DIR`, by default
  `build/load-reports/`, named `load-baseline-<timestamp>.md`.
- The report records the run configuration (order count, concurrency, fill slices, base URL)
  beside the numbers.
- It also records the run's **write volume**: the PostgreSQL WAL bytes written between the start
  and the end of the run (`pg_current_wal_lsn()` read through `OMS_LOAD_DB_URL`), in total and
  per order (SPEC-0047). It says `n/a` when the database cannot be reached. The figure covers
  everything the database wrote meanwhile, so run on an otherwise idle stack.
- The baseline committed before SPEC-0020 and SPEC-0022 is
  [Load Baseline (2026-11-08)](../assessments/load-baseline-2026-11-08.md): 79 commands/s, with OMS processing p99 about
  24 ms.

| Env var | Default | Meaning |
|---|---|---|
| `OMS_LOAD_SUITE` | (unset) | `true` runs the suite |
| `OMS_LOAD_BASE_URL` | `http://localhost:8090` | oms-core under test |
| `OMS_LOAD_ORDERS` | 500 | orders submitted |
| `OMS_LOAD_CONCURRENCY` | 8 | creates in flight |
| `OMS_LOAD_FILL_SLICES` | 1 | the simulator's `SIMULATOR_FILL_SLICES`, recorded in the report; set both together |
| `OMS_LOAD_REPORT_DIR` | `build/load-reports` | where the report is written |
| `OMS_LOAD_TIMEOUT_SECONDS` | 600 | how long to wait for every order to be terminal |
| `OMS_LOAD_DB_URL` | `jdbc:postgresql://localhost:5432/postgres` | the database whose WAL position is read (the compose database) |
| `OMS_LOAD_DB_USER` / `OMS_LOAD_DB_PASSWORD` | `postgres` / `changeme` | its credentials (the compose defaults) |

```bash
docker compose up -d --build oms-core exchange-simulator
cd oms-core && OMS_LOAD_SUITE=true ./gradlew test --tests 'org.example.oms.load.LoadSuiteRunnerTest'
```

**Comparing runs.** The numbers depend on the machine. Compare a run only with a baseline of the
same shape (orders, concurrency, fill slices) taken on the same host, with the stack freshly
started.

## 9. Limitations

- **No order book or matching.** Orders never trade against each other, and resting orders never
  fill later.
- **In-memory state.** After a restart, or once more than `max-tracked-orders` newer orders have
  been seen, resting orders are forgotten, and cancel requests for them are refused as
  `Unknown order`.
- **No FIX session layer.** Only FIX semantics are modelled; there is no tag=value encoding,
  sequence numbers or session.
- **Not covered:** replace (35=G), busts and corrections, DAY/GTD expiry, and FOK. Other TIFs behave
  like DAY.

## 10. Related Documents

- [Order Lifecycle](../../domain/concepts/order-lifecycle.md): states, the cancel request flow (§4.9.1) and event types
  (§10.1)
- [Execution Reporting](../../domain/concepts/execution-reporting.md): ExecType → OMS command mapping (§2.2)
- `oms-exchange-simulator/README.md`: build and run
