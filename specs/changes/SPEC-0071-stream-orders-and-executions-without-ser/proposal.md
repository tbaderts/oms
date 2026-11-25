# Proposal — SPEC-0071: Stream orders and executions without service caches

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The requester ([ticket Goal](./ticket.md)):

> the order_execution_projection was designed for booking and other downstream applications. the
> oms-ui should use only order and executions streams, not the projection. also, not sure why there
> is a cache inside streaming-service. maybe that's a letfover from the past. do we really need
> this?

**Observed on 2026-11-24.** Executions deleted from the database stayed in oms-ui's live blotter,
even after restarting the streaming service. The live execution snapshot is served from an
in-memory cache in oms-streaming-service (`KafkaEventStreamProvider.executionCache`), which is:
- warmed at startup from `GET /api/query/executions` — the `order_execution_projection`, meant for
  booking and downstream systems, which still held the 18 deleted fills (SPEC-0067);
- fed by the `oms_order_executions` topic (fills with their order, SPEC-0019), not by the
  execution stream `oms_executions`.

**What the caches do today, and whether that is still needed:**

| Cache use | Still needed? |
|---|---|
| The executions snapshot (its only source) | No: SPEC-0070 added a specified search over stored fills (`/api/query/executions/search`) with a matching count, as the order snapshot already uses `/api/query/search` |
| Order snapshot fallback when oms-core is down | No: it serves stale orders as if current; an error the UI already shows (reconnect) is more honest |
| Kafka redelivery check for fills | No: oms-ui's row store upserts by key, so a redelivered fill updates its row; the per-subscription check that drops live events the snapshot already covers (SPEC-0057) does not use the cache |
| `orders.snapshot`, `executions.snapshot` routes; cache sizes on the status endpoint | No: oms-ui calls neither route; the cache sizes describe the cache |
| `blotter.stream` (orders + executions as order events) | No: oms-ui never subscribes (`subscribeToBlotter` has no caller), and it exists to dress fills as orders |

The cache, the startup warm-up, the eviction and their settings are the leftover the requester
suspected; they add a way to show data the database no longer has.

## What Changes

- **Execution snapshot from stored fills.** An `executions.stream` subscription with a snapshot
  gets the newest stored fills matching its filter from `GET /api/query/executions/search`
  (SPEC-0070), at most its snapshot limit, then the `SNAPSHOT_END` marker with the matching count —
  read from the database at subscription time, as the order snapshot is.
- **Live executions from `oms_executions`.** The streaming service consumes the `Execution` record
  (the fill as the venue reported it, with its instrument, SPEC-0069) instead of
  `oms_order_executions`. A first start of the consumer reads new fills only: history comes from
  the snapshot.
- **No caches.** The order and execution caches, the startup warm-up (SPEC-0067), the eviction,
  the order snapshot's cache fallback and their settings (`streaming.buffer.max-size`,
  `streaming.executions.warm-up-size`) are removed. If oms-core cannot answer, a subscription that
  asks for a snapshot ends with an error; live-only subscriptions are unaffected.
- **Unused routes removed.** **BREAKING** for any external RSocket client of `orders.snapshot`,
  `executions.snapshot` or `blotter.stream`; oms-ui uses none of them (its unused
  `subscribeToBlotter` goes too). The dev-profile REST `/api/test/orders/snapshot` and the cache
  sizes on the status endpoint go with the cache.
- **Execution rows carry execution fields only.** Live execution events no longer carry the order
  as of the fill (`ExecutionDto.order` stays null); the execution blotter offers execution fields
  only since SPEC-0068, and the instrument comes with the fill since SPEC-0069.
- **Unchanged:** `orders.stream` (snapshot from `/api/query/search`, live from `oms_orders`),
  `executions.stream`'s request and event shapes, `oms_order_executions` and the projection (for
  booking).
- **Knowledge base:** the streaming service, real-time streaming, the query API's note about the
  streaming service, and the SPEC-0067 description of the warm-up.

## Scope

### In scope

- `oms-streaming-service`: snapshot client for the execution search; consumer of `oms_executions`
  with a mapper from `Execution`; removal of caches, warm-up, eviction, fallback, routes, cache
  sizes, settings; tests.
- `oms-ui`: remove `subscribeToBlotter` and its types; tests that the live execution blotter works
  from bare executions.
- `oms-knowledge-base`: the pages above, `log.md`.

### Out of scope

- oms-core: no change (SPEC-0069 publishes the instrument; SPEC-0070 provides the search).
- Changing `oms_order_executions`, the projection or `/api/query/executions` (booking keeps them).
- Joining executions with their orders in the UI.
- The order stream's behaviour beyond removing its cache and fallback.
- Persisting anything in the streaming service.

## Acceptance Criteria

- **AC-1** — Given stored fills and a freshly started streaming service, when a client subscribes
  to `executions.stream` with a snapshot and a filter, then the snapshot holds the newest matching
  fills from `GET /api/query/executions/search` (at most the limit, newest first), each with the
  stored execution fields including `symbol`, and the `SNAPSHOT_END` marker carries the search's
  `totalElements`.
- **AC-2** — Given a fill that was shown in a snapshot and was then deleted from `executions`,
  when a client subscribes again to `executions.stream` with a snapshot (no restart), then the
  deleted fill is not in the snapshot.
- **AC-3** — Given a subscription, when an `Execution` is published on `oms_executions`, then the
  subscriber receives it as a live event with its execution fields (including `symbol`); and when
  a record is published only on `oms_order_executions`, the subscriber receives nothing.
- **AC-4** — Given a subscription whose snapshot contained a fill at order version v, when that
  fill arrives live at version ≤ v (replayed or redelivered), then it is not emitted; at a higher
  version it is.
- **AC-5** — Given oms-core is not reachable, when a client subscribes to `orders.stream` or
  `executions.stream` with a snapshot, then the subscription ends with an error rather than
  serving cached rows; a subscription without a snapshot still receives live events.
- **AC-6** — Given the streaming service running, when a client requests `orders.snapshot`,
  `executions.snapshot` or `blotter.stream`, then no handler answers (error); the status endpoint
  has no cache sizes; and at startup the service makes no call to oms-core.
- **AC-7** — Given oms-ui's live execution blotter and an execution event without an order, when
  the event arrives, then its row shows the execution's fields (including `symbol`) and oms-ui no
  longer offers `subscribeToBlotter`.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-streaming-service, oms-ui, oms-knowledge-base |
| Contracts (OpenAPI / Avro) | None. Consumes the existing `Execution` record and SPEC-0070's search |
| Data (tables, migrations) | None |
| Events / Kafka topics | The streaming service subscribes to `oms_executions` instead of `oms_order_executions` (same consumer group; new topic starts at latest) |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-ui: unused method removed; live execution rows have no nested order. **BREAKING** for external RSocket clients of the three removed routes. Booking consumers of `oms_order_executions` unaffected |
| Knowledge base | `architecture/context/streaming-service.md`, `capabilities/real-time-streaming.md`, `domain/interfaces/query-api.md`, `log.md` (and any page describing the warm-up or cache) |

## Open Questions

- [resolved] Should the order snapshot fall back to a cache when oms-core is down? → assumption:
  no. The fallback served whatever the cache held as current; an error is visible and honest, and
  oms-ui already reconnects. Cheap to revisit.
- [resolved] Where should a first start of the `oms_executions` consumer begin? → assumption:
  latest. History comes from the database snapshot; reading the topic from the beginning would
  replay every past fill as a live event.
- [resolved] Remove `orders.snapshot`, `executions.snapshot` and `blotter.stream`? → assumption:
  yes; unused by oms-ui and built on the cache. Flagged BREAKING for unknown external clients.
- [resolved] Keep the nested order on execution events? → assumption: no. It came from the
  projection-shaped topic; executions show execution fields only (SPEC-0068, SPEC-0069).
