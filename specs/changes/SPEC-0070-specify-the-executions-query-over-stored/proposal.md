# Proposal — SPEC-0070: Specify the executions query over stored fills

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The requester ([ticket Goal](./ticket.md)):

> the order_execution_projection was designed for booking and other downstream applications. the
> oms-ui should use only order and executions streams, not the projection. as for the other stuff,
> cache and execution query support, create tickets as needed so we get things cleaned up

**Today there is no specified query over the `executions` table.**

- **`GET /api/query/executions`** is in `oms-query-api.yml`, but it reads
  `order_execution_projection` — each fill with its order as of that fill — which exists for booking
  and downstream systems. It takes a few fixed filters (`orderId`, `rootOrderId`, `account`, a time
  range) and a `limit`, with no paging, no sorting beyond oldest/newest, and no matching count.
- **`GET /api/executions`** reads `executions`, but it is hand-written, `@Hidden`, missing from the
  contract, and returns a raw Spring Data `Page` of the JPA entity. It accepts only `page`, `size`
  and `sort`. The REST execution blotter sends its filters as `field`, `field__like`, `__between`,
  … (the order search's filter language), and `ExecutionReadService.findAll(pageable)` **ignores
  them**: filtering the REST execution blotter silently does nothing.
- The technical-debt register lists this as **TD-3** ("hand-written, not in the OpenAPI contracts,
  no automated tests … contract it in `oms-query-api.yml` or retire it").
- The streaming service needs an executions snapshot from stored fills (SPEC-0071). The only
  stored source it can reach today is the projection, which is how a database delete left stale
  rows in the live blotter on 2026-11-24.

**Cost of doing nothing.** The REST execution blotter's filters stay broken, the UI and the
streaming service stay coupled to a booking projection, and SPEC-0071 has no query to build its
snapshot on.

## What Changes

- **New query, specified first.** `GET /api/query/executions/search` in `oms-query-api.yml`, over
  the `executions` table:
  - the same filter language, paging and sorting as the order search (`/api/query/search`):
    `field` (equals), `field__like`, `__gt`, `__gte`, `__lt`, `__lte`, `__between`; `page`, `size`
    (default 50, max 500); `sort=field[,ASC|DESC];…`;
  - newest first by default (most recently stored fill first);
  - a paged response, `PagedExecutionDto` (`content` + `page` with `totalElements`), so a caller
    gets the newest N fills and how many matched;
  - each entry is an `ExecutionDto` with the execution's own fields (ids, instrument, quantities,
    prices, ExecType, market, capacity, time, status, order version) and no order fields.
- **REST execution blotter.** oms-ui's REST execution blotter reads the new query, so its filters,
  paging and sorting work.
- **BREAKING (undocumented endpoint): `GET /api/executions` and `GET /api/executions/{id}` are
  removed.** They are `@Hidden` and not in any contract. In-repo callers: oms-ui only, moved in this
  ticket. Any external caller of the hidden endpoint breaks.
- **Unchanged:** `GET /api/query/executions` (the projection, for booking and downstream),
  `order_execution_projection`, and the order endpoints.
- **Knowledge base:** query API, REST read API, query engine, order-query capability and the
  technical-debt register (TD-3 resolved for executions).

## Scope

### In scope

- `oms-contracts`: the new path and its schemas in `oms-query-api.yml`.
- `oms-core`: the query service and filter specification over `executions`; the controller
  implementing the generated interface; removing `ExecutionController` and `ExecutionReadService`;
  tests.
- `oms-ui`: `OMSApiService.getExecutions` and its paged-response handling; tests.
- `oms-knowledge-base`: the pages above and `log.md`.

### Out of scope

- The streaming service's executions snapshot and cache: SPEC-0071 (which uses this query).
- `GET /api/orders` (the other half of TD-3) and the metamodel endpoints.
- Changing `GET /api/query/executions` or the projection.
- New indexes beyond what the tests show is needed; query performance at production volume.
- Execution query support in oms-mcp-server.

## Acceptance Criteria

- **AC-1** — Given applied fills on two orders, when a client calls
  `GET /api/query/executions/search?orderId=<A>`, then the response is 200 with only order A's
  fills in `content`, and `page.totalElements` equals their number.
- **AC-2** — Given fills with different symbols, quantities, times and statuses, when a client
  filters with `symbol__like`, `lastQty__gte`, `transactTime__between` and `status` (one at a time
  and combined), then each response contains exactly the fills matching every filter given.
- **AC-3** — Given 7 matching fills, when a client calls the query without `sort` and with
  `size=3`, then `content` holds the 3 most recently stored fills, newest first, and
  `page.totalElements` is 7, `page.totalPages` 3; with `page=2` it holds the oldest one; with
  `sort=lastPx,ASC` the order follows `lastPx`.
- **AC-4** — Given the query, when a client asks for `size=501`, or sorts by a field the execution
  does not have, then the response is 400 and nothing is returned. A filter on an unknown field is
  ignored, as in the order search.
- **AC-5** — Given a fill applied with an instrument (SPEC-0069), when it is returned by the query,
  then the entry carries `execId`, `orderId`, `rootOrderId`, `symbol`, `securityId`,
  `securityIdSource`, `execType`, `lastQty`, `lastPx`, `lastMkt`, `cumQty`, `leavesQty`, `avgPx`,
  `transactTime`, `status` and `orderVersion` with the stored values, and none of the order's
  fields (`side`, `price`, `orderQty`, `account`, `state`).
- **AC-6** — Given oms-ui's REST execution blotter with a filter set, when it loads, then it calls
  `GET /api/query/executions/search` with the filter in the order-search filter language and shows
  the `content` of the paged response.
- **AC-7** — Given oms-core running, when a client calls `GET /api/executions` or
  `GET /api/executions/{id}`, then the response is 404.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-contracts, oms-core, oms-ui, oms-knowledge-base |
| Contracts (OpenAPI / Avro) | `oms-query-api.yml`: a new path and new schemas (`ExecutionDto`, `PagedExecutionDto`, an execution status enum); additive. No Avro change. |
| Data (tables, migrations) | None expected; an index only if a test shows the query needs one |
| Events / Kafka topics | None |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-ui moves to the new query. **BREAKING** for any external caller of the hidden `/api/executions`. oms-streaming-service uses it in SPEC-0071. oms-mcp-server unaffected. |
| Knowledge base | `domain/interfaces/query-api.md`, `domain/interfaces/rest-read-api.md`, `framework/query-engine.md`, `capabilities/order-query.md`, `architecture/technical-debt/technical-debt-register.md`, `log.md` |

## Open Questions

- [resolved] Retire `/api/executions` or keep it next to the new query? → assumption: retire it.
  It is hidden, uncontracted and only oms-ui uses it; keeping two queries over one table is the
  duplication TD-3 asks to remove. Flagged BREAKING for external callers at proposal approval.
- [resolved] Path of the new query? → assumption: `/api/query/executions/search`, beside
  `/api/query/search` for orders, so the existing `/api/query/executions` (projection) keeps its
  meaning.
- [resolved] Default order? → assumption: newest stored first (`id` descending), as the order
  search and today's blotter do; `transactTime` is optional on a fill, so it cannot be the default.
- [resolved] Which fields are filterable? → assumption: every field the entry carries (strings by
  equals/like, numbers and `transactTime` by comparisons and ranges, `status` by equals).
- [deferred] The same treatment for `/api/orders` (the rest of TD-3) → safe to defer: the order
  search already exists and the UI does not use `/api/orders`.
