# Proposal — SPEC-0039: Unify decimal precision across database, Avro and OpenAPI

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

Prices and quantities have a different precision in every layer that carries them
([ticket Goal](./ticket.md)):

| Layer | Today |
|---|---|
| Database (`orders`, `executions`, `order_execution_view`) | unconstrained `NUMERIC` |
| Avro command payload `Order.avsc` (`orderQty`, `cashOrderQty`, `price`, `stopPx`, `strikePrice`) | `double` (architecture review finding 9) |
| Avro `OrderMessage` | `decimal(18,2)` for `orderQty`, `cashOrderQty`, `price`, `stopPx`, `strikePrice`; `decimal(18,4)` for `cumQty`, `leavesQty` |
| Avro `Execution`, `OrderExecution` | `decimal(18,4)` |
| Avro `Quote.price`, `QuoteRequest.quantity` | `double` (schema-only, no processor) |
| OpenAPI command and query contracts | `number`, no limit |

The consequences:
- A command sent over Kafka loses precision on the way in (`double`).
- A REST order or fill can carry more decimals than the messages can publish. Since SPEC-0020,
  such a fill is refused deep in the pipeline by an Avro encoding error inside the fill
  transaction. Before that, it was recorded and then stuck in the outbox.
- An order message shows a limit price of 172.3456 as 172.35, or fails to encode it.

Nothing tells a client up front what precision the OMS accepts.

US equity venues define the upper bound. NYSE Pillar formats every price field with 8 decimal
places. Nasdaq midpoint executions are sub-penny (e.g. $10.015), and sub-dollar stocks quote in
$0.0001 steps. The requester decided (2026-11-01, SPEC-0020 review) on one precision for every
price and quantity: `decimal(18,8)`. That is 8 decimal places and 10 integer digits, enough for
any listed share price and any share count. More precise values are rejected at the boundary.

## What Changes

- **One precision, `decimal(18,8)`, for every price and quantity field** in:
  - the database: every price and quantity column of `orders`, `executions` and
    `order_execution_view`;
  - every Avro record that carries prices or quantities: `Order`, `OrderMessage`, `Execution`,
    `OrderExecution`, `Quote`, `QuoteRequest`;
  - the OpenAPI command and query contracts: `Order`, `Execution`, `OrderDto`, `ExecutionViewDto`.
- **BREAKING (Avro):** `Order.avsc`, `Quote.avsc` and `QuoteRequest.avsc` change from `double` to
  decimal bytes, and the other decimals change scale (2 or 4 to 8). An old reader would misread a
  new message, so it is not compatible on the wire. Consumers that must change together: oms-core,
  oms-streaming-service, oms-exchange-simulator (producer of commands, consumer of `oms_orders`),
  and oms-mcp-server (rebuild only). The schemas get a new major version, and the deployment
  drains the topics first (see Open Questions).
- **OpenAPI:** these fields declare at most 10 integer digits and 8 decimal places. A request that
  exceeds them is refused with `400` validation-failed naming the field. The command API version
  goes from `2.0.0` to `3.0.0`. Clients that sent more precise values (none known) now get a 400.
- **Kafka boundary:** the Avro schema itself caps scale and precision. A producer cannot serialise
  a more precise value, and oms-core never receives one.
- **Database:** a new changeset alters the columns to `NUMERIC(18,8)`. It first checks that no
  stored value exceeds that precision, and fails without changing anything if one does. No value is
  rounded.
- **The SPEC-0020 limitation closes:** a REST fill with 5 to 8 decimal places is applied and
  published. More than 8 is refused with a validation error at the API.

## Scope

### In scope

- The contracts, schemas, migration and validation above, and fixing what they break in oms-core,
  oms-streaming-service and oms-exchange-simulator (mappers, tests, the simulator's command
  building).
- New compatibility baselines for the changed Avro records (the old ones describe the previous
  major version).
- The knowledge base pages that state field types (`interfaces/avro-messages.md`,
  `oms-framework/openapi-contracts.md`, the domain pages for order and execution) and a precision
  rule page or section.

### Out of scope

- Fields that are not prices or quantities (ids, timestamps, enums).
- Computing `avgPx` (still null), and any rounding rule for computed values. Today every stored
  quantity is a sum or difference of inputs at scale 8 or less, so no rounding is needed.
- oms-ui display formatting.
- Venue-specific tick-size validation (e.g. rejecting $0.001 on a $10 stock). This ticket bounds
  precision; it does not enforce tick sizes.

## Acceptance Criteria

- **AC-1** — Given the oms-contracts build, when every Avro record and every OpenAPI schema is
  inspected, then each price and quantity field listed under Why is `decimal` with precision 18 and
  scale 8 (Avro), or declares at most 10 integer and 8 fraction digits (OpenAPI), and no `double`
  remains for a price or quantity.
- **AC-2** — Given an existing database with orders and executions whose values have at most 8
  decimals, when the migration runs, then every price and quantity column of `orders`,
  `executions` and `order_execution_view` is `NUMERIC(18,8)`, and every stored value is unchanged.
- **AC-3** — Given a database holding a price or quantity with more than 8 decimals (or more than 10
  integer digits), when the migration runs, then it fails naming the table and column, and no column
  type is changed.
- **AC-4** — Given the command API, when an `OrderCreateCmd` has a `price` with 9 decimal places,
  or an `ExecutionCreateCmd` has a `lastPx` with 9 decimal places or a `lastQty` with 11 integer
  digits, then the response is `400` validation-failed naming that field, and nothing is persisted.
- **AC-5** — Given an accepted order with `price` 170.12345678 and `orderQty` 100.12345678 created
  over REST, when a fill with `lastPx` 170.12345678 and `lastQty` 0.12345678 is applied (over REST,
  and separately over Kafka), then it is applied (`201` over REST). The exact values appear,
  unrounded, in `orders`, `executions`, `order_execution_view`, `GET /api/query/search`, and the
  records on `oms_orders`, `oms_executions` and `oms_order_executions`.
- **AC-6** — Given an `OrderCreateCmd` sent over Kafka with `price` 170.12345678, when oms-core
  applies it, then the stored and published price is exactly 170.12345678 (no `double` rounding).
  A command whose value has 9 decimal places cannot be serialised by the Avro producer.
- **AC-7** — Given the new contracts, when the exchange simulator and the streaming service are
  built and their tests run, then they pass, and the exchange workflow integration tests in
  oms-core pass end to end.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-contracts, oms-core, oms-streaming-service, oms-exchange-simulator, oms-knowledge-base (set on the ticket); oms-mcp-server rebuilds |
| Contracts (OpenAPI / Avro) | **BREAKING**. Avro: `Order`, `Quote`, `QuoteRequest` move from double to decimal; `OrderMessage`, `Execution`, `OrderExecution` change scale to 8. OpenAPI: precision bounds on price and quantity fields; command API `3.0.0`, query API version bumped |
| Data (tables, migrations) | New changeset: `NUMERIC(18,8)` for the price and quantity columns of `orders`, `executions`, `order_execution_view`, with a precondition that refuses to round |
| Events / Kafka topics | Same topics, new schema versions on `commands`, `oms_orders`, `oms_executions`, `oms_order_executions`; records encoded with the old schema are not readable as the new one |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-streaming-service and oms-exchange-simulator change with oms-core (one deployment). oms-ui: none (JSON numbers). oms-mcp-server: rebuild. Developer cockpit: its contract check reads the new bounds from the OpenAPI file |
| Knowledge base | `interfaces/avro-messages.md`, `oms-framework/openapi-contracts.md`, domain pages for order and execution, a precision rule (new section or page) |

## Open Questions

- [resolved] Which precision? → `decimal(18,8)` for every price and quantity, decided by the
  requester on 2026-11-01. 18 total digits leave 10 integer digits (up to 9,999,999,999), above any
  listed share price or share count.
- [resolved] How is the BREAKING Avro change deployed? → assumption: one coordinated deployment of
  oms-core, oms-streaming-service and oms-exchange-simulator. Before it, the topics are drained:
  no command pending, and the outbox empty. The Schema Registry subjects for the four topics are
  registered at the new major version with their compatibility check set to `NONE` for that one
  registration. Old records on the topics are not re-read (consumers resume at their committed
  offsets). **Please confirm at approval.** The alternative is new topic names (`*_v2`), which is
  safer for unknown consumers but changes every configuration.
- [resolved] Include `Quote` and `QuoteRequest`, which have no processor? → assumption: yes, so no
  `double` price or quantity remains in the contracts. They have no producer or consumer, so this
  breaks nothing.
- [resolved] How is the OpenAPI bound expressed? → left to the design (e.g. a `Digits(10, 8)`
  constraint on the generated models). The observable rule is AC-4.
- [resolved] What happens to stored values with more precision? → the migration refuses (AC-3)
  rather than rounding. Today's data comes from tests and the simulator at scale 4 or less, so no
  refusal is expected.
