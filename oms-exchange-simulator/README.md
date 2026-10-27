# oms-exchange-simulator

A simulated stock exchange for development and testing. It reads OMS orders from Kafka and
answers the way a venue would, using FIX semantics: it acknowledges the order, then fills it in
one or more executions, or rejects it, or cancels it.

It talks to oms-core only through Kafka and the shared contracts in `oms-contracts`:

| FIX message from the venue | Command sent to oms-core on `commands` |
|---|---|
| ExecutionReport ExecType=0 (New) | `OrderAcceptCmd` |
| ExecutionReport ExecType=F (Trade) | `ExecutionCreateCmd` (`execType = F`) |
| ExecutionReport ExecType=8 (Rejected) | `OrderRejectCmd` |
| ExecutionReport ExecType=4 (Canceled) | `OrderCancelCmd` |
| OrderCancelReject (35=9) | `OrderCancelRejectCmd` |

How orders are evaluated, and every configuration option, are described in
[oms-knowledge-base/oms-concepts/exchange-simulator.md](../oms-knowledge-base/oms-concepts/exchange-simulator.md).

## Run

```bash
# Standalone, against Kafka and Schema Registry on localhost
./gradlew bootRun

# With the rest of the stack
./gradlew bootJar
cd .. && docker compose up -d --build exchange-simulator
```

oms-core must run with `KAFKA_ENABLED=true` so that it publishes orders and consumes commands.

## Configuration

| Property | Env var | Default |
|---|---|---|
| `simulator.reference-prices.<SYMBOL>` | — | AAPL 170.00, MSFT 420.00, IBM 250.00, NVDA 120.00, INTC 86.96 |
| `simulator.price-band-percent` | `SIMULATOR_PRICE_BAND_PERCENT` | 10 |
| `simulator.fill-slices` | `SIMULATOR_FILL_SLICES` | 1 |
| `simulator.fill-delay` | `SIMULATOR_FILL_DELAY` | 0ms |
| `simulator.last-mkt` | `SIMULATOR_LAST_MKT` | XSIM |
| `simulator.order-topic` | `ORDER_TOPIC` | oms_orders |
| `simulator.command-topic` | `COMMAND_TOPIC` | commands |
| `simulator.max-tracked-orders` | — | 100000 (oldest orders are forgotten beyond this) |
| `spring.kafka.consumer.auto-offset-reset` | `SIMULATOR_OFFSET_RESET` | latest (a new group does not replay order history) |

Metrics are exposed at `http://localhost:8094/actuator/prometheus` (`simulator_*_total`).

## Test

```bash
./gradlew check   # unit tests plus Kafka integration tests (needs Docker)
```
