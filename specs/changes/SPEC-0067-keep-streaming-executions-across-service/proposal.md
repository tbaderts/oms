# Proposal — SPEC-0067: Keep streaming executions across service restarts

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

After the components are restarted, oms-ui's streaming execution blotter starts almost empty. The
earlier fills are still stored, but the blotter no longer shows them.

- **Observed on 2026-11-16:**
  - the database holds 9,425 executions, and the REST execution blotter shows them;
  - a subscription to the streaming service's `executions.stream` with a snapshot returned
    `snapshotTotal: 1`: only the fill that arrived after the restart.
- **Cause.** The execution snapshot is served only from the streaming service's in-memory cache
  (`KafkaEventStreamProvider.getExecutionEventStream`). That cache is filled by the Kafka consumer
  of `oms_order_executions` while the service runs. After a restart the consumer group resumes
  from its committed offset, so earlier fills are never read again and the cache starts empty.
- **Orders do not have this problem.** Their snapshot comes from the oms-core query API, which
  reads the database. `architecture/context/streaming-service.md` already says the snapshot comes
  from the query API; for executions that is not true today.
- **Who is affected.** Traders and operators using the streaming blotter lose the day's fills from
  view after every deployment or restart of the streaming service, and may think fills were lost.

The data for a fix exists. oms-core's query API has `GET /api/query/executions`, which returns the
order-execution projection (each fill with its order as of that fill), the same shape as the
`oms_order_executions` records. It only returns the oldest fills first, at most 5,000.

## What Changes

- **Streaming service.** At startup it loads the newest stored fills from the oms-core query API
  into its execution cache, then streams live fills from Kafka as before. So an executions
  snapshot after a restart contains the earlier fills, with the same fields as live ones,
  including the order's symbol, side, quantity and price.
- **Query API, additive.** `GET /api/query/executions` gains an optional `order` parameter:
  - `oldest`, the default and today's behaviour;
  - `newest`: newest fills first, so the most recent ones are within the limit.
- **Resilience.** If oms-core is not reachable at startup, the streaming service still starts and
  streams live fills. It retries loading in the background and logs a warning until it succeeds.
- **Knowledge base:** the streaming service page and the query API documentation describe the
  execution snapshot and the new parameter.

No **BREAKING** change: without `order`, the endpoint behaves as today.

## Scope

### In scope

- `oms-contracts`: the `order` parameter on `getExecutions` in `oms-query-api.yml`.
- `oms-core`: newest-first ordering in `OrderExecutionProjectionQueryService` and the controller;
  an integration test.
- `oms-streaming-service`:
  - a query client call for fills;
  - the mapping of the query API's fill to the streaming `ExecutionDto` (with its order);
  - loading the cache at startup, with retry;
  - no duplicate rows when a loaded fill also arrives from Kafka;
  - tests.
- `oms-knowledge-base`: `architecture/context/streaming-service.md`, the query API's documentation
  page, and `log.md`.

### Out of scope

- The **order** stream: its snapshot already comes from the query API.
- The empty execution columns the requester also reported (for example Day Order Qty, Last
  Capacity). oms-core never fills those fields; whether to hide them or add order fields to
  execution rows is a separate question.
- Changing Kafka offsets, consumer groups or topic retention.
- Persisting the streaming service's cache, or loading more fills than the cache holds.
- The REST execution blotter, which already reads the database.

## Acceptance Criteria

- **AC-1** — Given fills stored in oms-core and a streaming service that has just started with an
  empty cache, when a client subscribes to `executions.stream` with a snapshot, then:
  - the snapshot contains the newest stored fills, newest first, up to the client's snapshot limit
    and the warm-up size (AC-5);
  - each row has the execution fields (`execId`, `orderId`, `lastQty`, `lastPx`, `cumQty`,
    `leavesQty`, `avgPx`, `execType`, `lastMkt`, `transactTime`, `orderVersion`);
  - each row has its order as of that fill (`symbol`, `side`, `orderQty`, `price`, `account`,
    `state`);
  - `snapshotTotal` counts the matching rows.
- **AC-2** — Given a fill that was loaded at startup, when the same fill (the same `orderId`,
  `execId` and `orderVersion`) is then delivered by Kafka, then it is not emitted as a new live
  event, and a subscriber sees it once.
- **AC-3** — Given oms-core is unreachable when the streaming service starts, then:
  - the service starts and streams live fills from Kafka;
  - it logs a warning and retries loading with backoff;
  - once oms-core answers, the cache is loaded, and a later snapshot contains the stored fills.
- **AC-4** — Given the query API, when `GET /api/query/executions` is called:
  - with `order=newest`, the fills come newest first: by `transactTime`, or the projection time
    for fills without one, then by storage order descending;
  - without `order` or with `order=oldest`, the result is exactly as today;
  - with an invalid `order` value, the answer is HTTP 400.
- **AC-5** — Given a configured warm-up size (default 5,000, the query API's maximum per request)
  and a cache size, when the streaming service loads fills at startup, then it requests at most
  the smaller of the two, with `order=newest`.
- **AC-6** — Given execution filters on the subscription (for example `account` or `symbol`, as
  supported today), when the snapshot is served after a restart, then it contains only the loaded
  fills that match, the same way as for fills received live.
- **AC-7** — Given the whole change, when the checks run, then all of these pass:
  - `oms-contracts` build;
  - `oms-core` `./gradlew check`;
  - `oms-streaming-service` `./gradlew check`;
  - `okf-check oms-knowledge-base`, with 0 errors.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-contracts, oms-core, oms-streaming-service, oms-knowledge-base |
| Contracts (OpenAPI / Avro) | `oms-query-api.yml`: an optional `order` query parameter (`oldest` \| `newest`, default `oldest`) on `GET /executions`. The change is additive, and generated `ExecutionsApi` gains a parameter |
| Data (tables, migrations) | none. Reads the existing order-execution projection; may need an index if newest-first is slow (decided in the design) |
| Events / Kafka topics | none. Offsets, groups and topics are unchanged |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-ui's streaming execution blotter shows earlier fills after a restart. Other clients of `/api/query/executions` see no change unless they pass `order` |
| Knowledge base | `architecture/context/streaming-service.md`, the query API page, `log.md` |

## Open Questions

- [resolved] Rebuild the cache from Kafka (re-read the topic) or from the query API? → assumption:
  the query API.
  - The database is the record, as for orders.
  - Kafka retention would silently drop older fills.
  - The projection already has the exact shape of the stream's records.
- [resolved] Load at startup, or per subscription like orders? → assumption: at startup, into the
  existing cache. The snapshot logic, filters and duplicate handling stay as they are; only the
  cache's starting contents change.
- [resolved] How many fills to load? → assumption: 5,000 by default, the query API's per-request
  maximum, and configurable. Never more than the cache size (10,000 by default).
- [resolved] An additive parameter rather than a new endpoint? → assumption: a parameter. It is the
  smallest compatible change, and the default keeps current callers unchanged.
