---
aliases: [interfaces/query-api]
type: Interface
title: "Query API"
description: "The contract-first search endpoint for orders with dynamic filters, sorting and pagination."
tags: [api, query, search]
status: draft
updated: "2026-11-25T20:00:00Z"
covers: ["openapi:/search", "openapi:/orders/{orderId}/commands", "openapi:/orders/{orderId}/events", "openapi:/executions", "openapi:/executions/search", "http:/api/query"]
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-contracts/src/main/openapi/oms-query-api.yml"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/QueryController.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/OrderEventController.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/ExecutionViewController.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/ExecutionViewQueryIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/OrderEventQueryIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/OrderCommandQueryIntegrationTest.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderQueryService.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderSpecifications.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/OrderSpecificationsIntegrationTest.java"
---
# Query API

Defined in `oms-query-api.yml` as `/search`; implemented by `QueryController` (generated
`SearchApi`) under `/api/query`. Filters are translated into JPA Specifications by
`OrderSpecifications` (equality, `like`, ranges); invalid numeric filter values are ignored rather
than failing the query. Results are paginated.

Each `OrderDto` carries `eventVersion`: the order's latest event-log version, the same number its
newest `oms_orders` message carries as `eventId` (absent when the order has no events).
Read-your-writes (query API 2.5.0, SPEC-0050): a client that needs to see its own change waits until
search returns the order with `eventVersion` at least the `eventVersion` of the `CommandResult` its
command got. The same number is what a later command sends as `expectedVersion`
([Command API](command-api.md)). Since
SPEC-0027 it is the order row's own version, read with the order, so it always belongs to the state
on the page; `txNr` reports the same number (it was a separate counter, one lower, before). The
trade blotter uses it to drop live events the snapshot already contains.

## Order command log

`GET /api/query/orders/{orderId}/commands` (`getOrderCommands`, generated `OrdersApi`, implemented by
`OrderEventController`, since query API 2.3.0, SPEC-0046) returns every command received for one
order and what became of it, oldest first (`receivedAt`, then the order they were logged).
- **Shape.** Each `CommandLogEntryDto` carries `commandId`, `type`, `orderId`, `receivedAt`,
  `source` (`REST`, `KAFKA`, `SCHEDULER`), `principal`, `outcome` (`APPLIED`, `REFUSED`, `FAILED`),
  `reason` and `eventVersion`.
- **Attempts.** A Kafka command that failed and was retried appears once per attempt.
- **No entries.** An order id with nothing logged gives `200 []`.

See [Command Log](../model/command-log.md).

## Order event log

`GET /api/query/orders/{orderId}/events` (`getOrderEvents`, generated `OrdersApi`, implemented by
`OrderEventController`, SPEC-0035) returns every entry of one order's event log, oldest first. Each
`OrderEventDto` carries `orderId`, `version`, `event` (`OrderEventType`: `NEW_ORDER`, `ACK`,
`PARTIAL_FILL`, `FILL`, `CXL`, `REJ`, `CXL_REQUEST`, `CXL_REJ`, since query API 2.1.0 `EXP`, `CLOSE`, and since 2.2.0 `EXEC_BUST`, `EXEC_CORRECT`, `EXEC_WHACK`), `commandId`, `resultingState`,
`timeStamp`, `transaction` (the causing command as JSON, with its `type`) and `orderSnapshot` (the
order after the change, as an `OrderDto`). Since 2.4.0 (SPEC-0049) each entry also carries
`correlationId`, `causationId`, `principal`, `source` (`REST`, `KAFKA`, `SCHEDULER`) and `changes`
(the fields the event changed, as `{"<field>": {"from": old, "to": new}}`, decimals exact), all null
on events recorded before SPEC-0049; see [Order Event](../model/order-event.md). The database id is not exposed. An order id without
events gives `200 []`; whether the order exists is answered by `/search`. It replaces the former hidden,
uncontracted event-log endpoint outside `/api/query`, which no longer exists. The developer cockpit's
API Explorer follow-up reads it. Since 2.2.0 (SPEC-0044), the optional query parameter `execId`
narrows the result to the entries about one execution: its fill and any bust, correction or whack
of it, matched on `order_events.exec_id`. An execId the order does not have gives `200 []`.

## Fills with their order

`GET /api/query/executions` (`getExecutions`, generated `ExecutionsApi`, implemented by
`ExecutionViewController`, SPEC-0020) returns fills from the `order_execution_projection` table
(named `order_execution_view` before SPEC-0045) of the
[order-execution projection](../../architecture/concepts/projections.md). The response contract did not change
with the rename. Each `ExecutionViewDto` has the fill (`execId`,
`lastQty`, `lastPx`, `execType`, `lastCapacity`, `lastMkt`, `transactTime`), the order as of that
fill (identity, account, side, instrument, price, quantities, state), `orderVersion` and
`tradeDate`. Filters `orderId`, `rootOrderId` (an order without a root is its own root), `account`,
`transactTimeFrom` (inclusive) and `transactTimeTo` (exclusive) combine with AND. Results are
oldest first, or newest first with `order=newest` (SPEC-0067; `order=oldest` is the default and an
unknown value gives 400), at most `limit` (default 1000, max 5000), so with `newest` the limit
keeps the most recent fills. No match gives `200 []`. This read model is for booking and
downstream systems. oms-ui's REST execution blotter and the streaming service (since SPEC-0071)
read stored fills through the execution search below.

Used by the trade blotter's initial snapshot ([Real-time Streaming](../../capabilities/real-time-streaming.md)),
the admin UI and AI agents that need live order data (the knowledge server has no order tool since SPEC-0080). Capability: [Order Query](../../capabilities/order-query.md).

## Execution search

`GET /api/query/executions/search` (`searchExecutions`, in `ExecutionsApi`, implemented by
`ExecutionViewController` → `ExecutionQueryService`, since 2.6.0, SPEC-0070) searches stored fills,
the `executions` table, the way `/search` searches orders:
- **Filters:** every parameter except `page`, `size` and `sort`: `field` (equals), `field__like`
  (case-insensitive substring; `%` in the value is ignored), `field__gt|gte|lt|lte`,
  `field__between=a,b` (either side may be empty). Strings: `execId`, `orderId`, `rootOrderId`,
  `symbol`, `securityId`, `execType`, `lastMkt`, `lastCapacity`; numbers: `lastQty`, `lastPx`,
  `cumQty`, `leavesQty`, `avgPx`, `orderVersion`; time: `transactTime`; enums (equals only):
  `status` (`APPLIED`, `BUSTED`, `CORRECTED`), `securityIdSource`. Unknown fields and malformed
  values are ignored; an enum value that does not exist matches nothing.
- **Paging and sorting:** `page` (default 0), `size` (1–500, default 50), `sort=field[,ASC|DESC];…`
  over the fields above or `id`. Default `id,DESC`: the most recently stored fill first. A size
  outside 1–500 or a sort field an execution does not have gives 400 Problem+JSON.
- **Response:** `PagedExecutionDto` = `content` (`ExecutionDto`: `id`, the fields above,
  `transactTime`, `status`, `orderVersion`; no order fields) and `page` (`size`, `totalElements`,
  `totalPages`, `number`).

It replaced the hidden, uncontracted `GET /api/executions`, which no longer exists. oms-ui's REST
execution blotter reads it, so its filters apply (they were ignored before).

## Operations: outbox and dead letters

Since query API 2.7.0 (SPEC-0075), tag `Admin`: generated `AdminApi`, implemented by
`AdminController`. These are read-only operator views, behind oms-ui's Outbox and Dead letters tabs.
Errors are Problem+JSON.

**The outbox,** read by `OutboxInspector`:
- `GET /api/query/admin/outbox/summary`: the messages waiting, counted by state, and
  `maxAttempts`, plus `oldestWaitingCreatedAt` and `oldestWaitingAgeSeconds`. Those two cover pending
  or held messages, as the `oms.outbox.oldest.age` gauge does.
  - **PENDING:** being sent or retried, including a message waiting out its back-off. Unlike the `oms.outbox.pending` gauge, which counts every row, it
    excludes stuck and held messages.
  - **STUCK:** parked (SPEC-0077): dead-lettered to `<topic>.oms-core.DLT`, or refused by that topic,
    and no longer sent. That happens at once for a failure that cannot succeed, or once a retryable
    one outlasts `kafka.error-policy.retry-for` or `kafka.outbox.max-attempts` (the backstop,
    reported as `maxAttempts`). The count equals `oms.outbox.stuck`.
  - **HELD:** waits behind a stuck message of the same topic and key, so it isn't published out of
    order.
- `GET /api/query/admin/outbox/messages?state&page&size`: the messages oldest first, optionally of
  one state, with `size` from 1 to 200 (default 50). `PagedOutboxMessageDto` carries, per message:
  - id, state, type, topic and key (the Kafka key, the outbox's aggregate id);
  - order, execution and version;
  - payload type, created time, attempts, max attempts and last error.
- `GET /api/query/admin/outbox/messages/{id}`: one message with its payload decoded to JSON (projection
  and legacy messages). A pointer message has no payload; its order, execution and version say what
  the record will be built from. A message published meanwhile gives 404.

**Dead letters,** read by `DeadLetterReader`:
- `GET /api/query/admin/dead-letters`: every topic ending in `.DLT`, with its partitions and record
  count.
- `GET /api/query/admin/dead-letters/{topic}/records?limit`: the latest `limit` records (1 to 500,
  default 50), newest first. Each has:
  - its partition, offset, time and key;
  - the original topic, partition, offset and time, and the exception class, message and cause, all
    from Spring Kafka's `kafka_dlt-*` headers;
  - the value decoded: `AVRO` (through the schema registry) as `payload`, else `TEXT` or `BINARY`
    (hex) as `payloadText`;
  - every header.

  A topic not ending in `.DLT` gives 400; an unknown one, 404.
- **No side effects.** Records are read by a short-lived consumer with no consumer group: nothing is
  consumed away and no offset is committed.
- **Topics.** Each service writes its own `<source topic>.<service>.DLT` (SPEC-0077), e.g.
  `commands.oms-core.DLT`, and adds the headers `dlt-source` (`consumer` or `producer`) and
  `dlt-service`, shown among the record's headers.
- **Bounded.** Every Kafka call is bounded, so an unreachable or disabled Kafka gives 503 within
  10 s.
