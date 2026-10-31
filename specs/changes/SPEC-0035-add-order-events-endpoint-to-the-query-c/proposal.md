# Proposal — SPEC-0035: Add order-events endpoint to the query contract

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

An order's event log is only readable through `GET /api/order-events/orderId/{orderId}`
(`OrderEventController`). The endpoint is hand-written, marked `@Hidden`, and returns the JPA
entity `OrderEvent` serialised as is. It is not in `oms-query-api.yml`, so:

- its response shape is whatever the entity happens to be. Renaming or adding an entity field
  (SPEC-0018 added `commandId`) silently changes the API, and the database id leaks out;
- it breaks the project rule that APIs are specification-first (CLAUDE.md, "Specification-Driven
  Development") and is listed as a known gap in
  `oms-knowledge-base/interfaces/rest-read-api.md` and `capabilities/order-query.md`
  ("not in the OpenAPI contracts", "no automated tests");
- its one known consumer, the developer-cockpit API Explorer order follow-up (SPEC-0007), had to
  hard-code the path and defensively parse the entity JSON. SPEC-0007's proposal accepted this as a
  temporary risk and named this ticket as the follow-up: "add an events operation to
  `oms-query-api.yml`".

Doing nothing keeps an untested, uncontracted read path to the event log, the one source of truth
in an event-sourced OMS, and keeps the cockpit exposed to unannounced shape changes.

## What Changes

- `oms-query-api.yml` gains a read operation for one order's event log, served by oms-core under the
  query API prefix at `GET /api/query/orders/{orderId}/events`, with a contracted response schema
  for an event-log entry: `orderId`, `version`, `event`, `commandId`, `resultingState`,
  `timeStamp`, `transaction` (the command that caused the change) and `orderSnapshot` (the order
  after the change). The internal database id is not exposed.
- The event kinds (`NEW_ORDER`, `ACK`, `PARTIAL_FILL`, `FILL`, `CXL`, `REJ`, `CXL_REQUEST`,
  `CXL_REJ`) become a contracted enum.
- oms-core implements the operation from the generated query API interface and the operation
  appears in the served OpenAPI document (`/v3/api-docs`).
- **BREAKING** (internal, uncontracted): `GET /api/order-events/orderId/{orderId}` is removed.
  Its only consumer in the repository, developer-cockpit (API Explorer order follow-up), moves to
  the new path in this ticket. oms-ui, oms-mcp-server and oms-streaming-service do not call it.
- developer-cockpit derives the events path from the query API prefix instead of an "internal
  endpoint" constant.

## Scope

### In scope

- The operation and its schemas in `oms-contracts` (additive to the query contract).
- The oms-core implementation, mapping from the `OrderEvent` entity to the contracted model, and
  removal of the old endpoint.
- The developer-cockpit path change and its tests.
- Automated tests for every AC, and the knowledge-base pages that describe the endpoint.

### Out of scope

- Paging, filtering or sorting of the event log (an order's log is small; it is returned whole, in
  version order).
- Point-in-time replay over HTTP (`OrderReplayService` stays internal).
- Contracting the other hand-written read endpoints (`/api/orders`, `/api/executions`,
  `/api/v1/metamodel`); separate tickets.
- Adding a `servers` entry to the contracts.
- Any change to the `order_events` table, the event log write path or Kafka messages.

## Acceptance Criteria

- **AC-1** — Given `oms-contracts/src/main/openapi/oms-query-api.yml`, when it is parsed, then it
  declares `GET /orders/{orderId}/events` with a required string path parameter `orderId` and a
  `200` response whose body is an array of an event-log entry schema with the properties `orderId`,
  `version`, `event`, `commandId`, `resultingState`, `timeStamp`, `transaction` and
  `orderSnapshot`, where `event` is an enum of exactly the eight values of oms-core's `Event`;
  `searchOrders` and its schemas are unchanged, and `./gradlew check` passes in oms-contracts.
- **AC-2** — Given an order that was created and then acknowledged (two rows in `order_events`),
  when a client calls `GET /api/query/orders/{orderId}/events`, then the response is `200` with an
  array of two elements in ascending `version` (1, 2) whose `event`, `resultingState`,
  `commandId`, `timeStamp`, `transaction.type` and `orderSnapshot.orderId` equal the stored rows.
- **AC-3** — Given the response from AC-2, when each element is checked against the contract,
  then it has no property outside the contracted entry schema (in particular no database `id`).
- **AC-4** — Given an `orderId` with no rows in `order_events`, when a client calls
  `GET /api/query/orders/{orderId}/events`, then the response is `200` with an empty array.
- **AC-5** — Given a running oms-core, when `/v3/api-docs` is fetched, then it contains the path
  `/api/query/orders/{orderId}/events`; and `GET /api/order-events/orderId/{orderId}` returns `404`.
- **AC-6** — Given the developer-cockpit API Explorer, when the order follow-up loads an order,
  then it requests `/api/query/orders/<url-encoded orderId>/events` and renders the timeline from
  that response as before (version order, event, resulting state, time); an order id containing a
  space is URL-encoded in the path; `npm test` passes in developer-cockpit.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-contracts, oms-core, developer-cockpit |
| Contracts (OpenAPI / Avro) | `oms-query-api.yml`: one new operation and new schemas (additive); the event enum possibly in `schema.yml`. Avro: none. |
| Data (tables, migrations) | none |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | developer-cockpit moves to the new path (in this ticket). oms-ui, oms-mcp-server: none (they do not call the endpoint). Anyone calling the old hidden path by hand gets `404`. |
| Knowledge base | `interfaces/rest-read-api.md`, `interfaces/query-api.md`, `capabilities/order-query.md`, `capabilities/event-sourcing-and-replay.md`; developer-cockpit `spec/04-backend-services.md` |

## Open Questions

- [resolved] Path of the new operation? → assumption: `/orders/{orderId}/events` in the query
  contract, served at `/api/query/orders/{orderId}/events`. The query API is mounted under
  `/api/query`, so the old path cannot be contracted as is without a second prefix; a nested
  resource path reads naturally and leaves room for other per-order reads. Cheap to rename before
  release.
- [resolved] Keep the old `/api/order-events/orderId/{orderId}` as a deprecated alias? →
  assumption: no, remove it. It was `@Hidden` and never contracted, and its only consumer is
  migrated in this ticket. **Reviewer: say if you want a deprecation period instead.**
- [resolved] Unknown order: `404` or empty list? → assumption: `200` with `[]`, as today. The event
  log cannot tell "unknown order" from "no events", order existence is answered by `searchOrders`,
  and the cockpit already handles an empty list.
- [resolved] How precisely to type `transaction` and `orderSnapshot` in the contract (reuse the
  command API's polymorphic `Command` and an order schema, or a documented free-form object)? →
  deferred to design; the ACs only require the fields named above to be present and correct.
