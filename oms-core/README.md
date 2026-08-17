# OMS Core

The command and query service of the OMS. Accepts commands over REST and Kafka, applies them through
task pipelines, records every state change in an event log, and publishes the results to Kafka via a
transactional outbox.

Runs on port **8090**.

## Features

- Order creation, acceptance, and execution (fill) processing
- Event log with a per-order sequence, replayable via `OrderReplayService`
- Transactional outbox with a polling relay for guaranteed publication to Kafka
- Dynamic query API with filter, sort, and pagination support
- Avro serialization against a Confluent Schema Registry
- Liquibase-managed schema
- Prometheus metrics and OpenTelemetry tracing

## Prerequisites

- **Java 25** (provisioned automatically via the Gradle toolchain)
- Docker, for the local infrastructure stack and for integration tests (Testcontainers)

## Build and run

```bash
./gradlew build            # full build including tests
./gradlew build -x test    # skip tests
./gradlew bootRun          # run against the infrastructure started below
```

Infrastructure (Postgres, Kafka, Schema Registry, observability) is defined in the **repository
root** `docker-compose.yml`, not in this directory:

```bash
cd ..
docker compose up -d
```

To run oms-core itself in a container, build the whole stack from the root compose file — it builds
this module's `Dockerfile` for you:

```bash
cd .. && docker compose up -d --build oms-core
```

## Configuration

Settings live in `src/main/resources/application.yml` and are overridable by environment variable.
The ones worth knowing:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SERVER_PORT` | `8090` | HTTP port |
| `DB_URL` | `jdbc:postgresql://localhost:5432/postgres` | Database |
| `KAFKA_ENABLED` | `false` | Enables the command listener and the outbox relay |
| `KAFKA_BROKERS` | `localhost:9092` | Bootstrap servers |
| `REGISTRY_URL` | `http://localhost:8081` | Schema Registry |
| `ORDER_TOPIC` | `oms_orders` | Order state changes are published here |
| `EXECUTION_TOPIC` | `oms_executions` | Fills are published here |
| `COMMAND_TOPIC` | `commands` | Inbound commands; failures go to `commands.DLT` |
| `OUTBOX_POLL_INTERVAL_MS` | `200` | Relay poll interval, i.e. added publish latency |
| `TRACING_ENABLED` | `false` | OTLP export |

With `KAFKA_ENABLED=false` the service still records events and stages outbox rows; they simply stay
staged until a relay runs.

## Architecture

See [docs/architecture-specification.md](docs/architecture-specification.md) for the full picture.
The short version of the write path:

```text
command (REST or Kafka)
  -> CommandProcessor            @Transactional
       -> TaskOrchestrator       validate, assign, persist, record
            -> orders            current state
            -> order_events      append-only log, sequenced per order
            -> outbox            staged for Kafka, same transaction
  -> OutboxRelay                 polls, publishes, deletes
       -> oms_orders / oms_executions
```

Three properties this arrangement is built to hold, each of which has a test:

- **A rejected command leaves no trace.** The orchestrator reports task failures as results rather
  than exceptions, so the processors mark the transaction rollback-only when a pipeline fails.
- **A published event is never lost.** The outbox row commits with the state change; the relay
  retries until the broker accepts it, and surfaces exhausted messages via `oms.outbox.stuck`.
- **An order's events are ordered and complete.** `(order_id, version)` is unique, the relay drains
  in id order, and `OrderReplayService.replay` must agree with the live row.

## Database

Schema is managed by Liquibase (`src/main/resources/db/changelog/`); Hibernate runs with
`ddl-auto: validate` and will refuse to start against a schema that does not match the entities.

Add changes as a new changelog file and include it from `db.changelog-master.yaml`. Never edit an
applied changeset.

## Testing

```bash
./gradlew test
```

Integration tests use Testcontainers and require a running Docker daemon. They cover the Liquibase
migrations, the order lifecycle, the event-sourcing invariants above, and Kafka command consumption.

## Code generation

Contracts live in **[oms-contracts](../oms-contracts/)**, not here. That module owns the OpenAPI
specs and the Avro schemas, and publishes the generated models
(`org.example.common.model.{cmd,query,msg}`) as a jar this module depends on.

What is still generated locally is only the two API interfaces this module implements —
`ExecuteApi` and `SearchApi` — because they are servlet-flavoured and specific to oms-core:

```bash
./gradlew openApiGenerateCmd openApiGenerateQuery
```

Both run as part of `compileJava` and land in `build/generated/`. Nothing is checked in.

To change a request or response shape, edit the spec in `oms-contracts/src/main/openapi/` and
rebuild; the models update everywhere at once. Do not hand-write models that a spec already covers.

## Endpoints

| Path | Purpose |
| --- | --- |
| `POST /api/command/execute` | Submit a command |
| `GET /api/query/search` | Query orders with dynamic filters |
| `GET /api/v1/metamodel` | Field metadata for UI filter builders |
| `GET /swagger-ui.html` | API documentation |
| `GET /actuator/health` | Health check |
| `GET /actuator/prometheus` | Metrics |

`rest.http` holds runnable examples for each.
