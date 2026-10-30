# Functional Requirements

What the OMS must do, one requirement per document (`FR-nnn`), grouped by capability. `implementation` says whether it is built and tested. All documents are machine-generated drafts; priorities are an initial proposal, not a team decision.

Back to the [knowledge base index](../index.md).

## Order Capture

- [FR-001 Accept new orders](FR-001-accept-new-orders.md) — An OrderCreateCmd received over REST or Kafka creates an order with an OMS orderId in state UNACK with its whole quantity open. *(must, implemented)*
- [FR-002 Validate new orders](FR-002-validate-new-orders.md) — A new order missing a required field, with a non-positive quantity, a limit order without price or a stop order without stop price is refused. *(must, partial)*
- [FR-003 Record order creation as an event](FR-003-record-order-creation.md) — Creating an order appends a NEW_ORDER event (version 1) and stages the order for publication in the same transaction. *(must, implemented)*
- [FR-004 Reject duplicate client order ids](FR-004-reject-duplicate-client-order-id.md) — A second order with the same clOrdId in the same session is refused and the first order is unchanged. *(must, implemented)*

## Order Acceptance

- [FR-005 Move acknowledged orders to LIVE](FR-005-acknowledge-orders.md) — An OrderAcceptCmd for an UNACK order moves it to LIVE, records an ACK event, stamps the market-ack time and stages the order for publication. *(must, implemented)*
- [FR-006 Refuse invalid acknowledgements](FR-006-refuse-invalid-acceptance.md) — An OrderAcceptCmd for an unknown order or an order that cannot move to LIVE is refused and records no event. *(must, implemented)*

## Order Cancellation

- [FR-007 Accept cancel requests](FR-007-request-cancel.md) — An OrderCancelRequestCmd on a LIVE order with open quantity and no pending cancel sets cancelState PCXL, keeps the state and clears an earlier reject reason. *(must, implemented)*
- [FR-008 Apply market cancels](FR-008-confirm-cancel.md) — An OrderCancelCmd moves a LIVE order to CXL with cancelState CXL, sets leavesQty to 0 and keeps cumQty. *(must, implemented)*
- [FR-009 Apply cancel rejects](FR-009-reject-cancel-request.md) — An OrderCancelRejectCmd on an order with a pending cancel sets cancelState REJ, stores the reason and keeps the order LIVE. *(must, implemented)*
- [FR-010 Ignore redelivered lifecycle commands](FR-010-deduplicate-lifecycle-commands.md) — A lifecycle command whose commandId the order has already applied is refused without writing anything. *(must, implemented)*

## Order Rejection

- [FR-011 Apply market rejects](FR-011-reject-orders.md) — An OrderRejectCmd on an UNACK or LIVE order moves it to REJ, closes the open quantity and stores the reason truncated to the column width. *(must, implemented)*
- [FR-012 Expose the reject reason](FR-012-expose-reject-reason.md) — The reject reason is published on oms_orders and returned by the query API and the metamodel. *(should, implemented)*

## Execution Processing

- [FR-013 Apply fills to LIVE orders](FR-013-apply-fills.md) — An ExecutionCreateCmd for a LIVE order adds lastQty to cumQty, recomputes leavesQty, keeps the order LIVE or moves it to FILLED, and records PARTIAL_FILL or FILL. *(must, implemented)*
- [FR-014 Publish fills with the resulting position](FR-014-publish-fills.md) — Each applied fill stages the execution and the updated order for publication, carrying the fill and the resulting cumQty and leavesQty. *(must, implemented)*
- [FR-015 Bust executions](FR-015-bust-executions.md) — An ExecutionBustCmd reverses a previously applied execution and restores the order quantities and state. *(should, not-implemented)*
- [FR-016 Manually cancel (whack) executions](FR-016-whack-executions.md) — An ExecutionWhackCmd lets an operator cancel an execution manually. *(could, not-implemented)*
- [FR-017 Reject duplicate executions](FR-017-reject-duplicate-execution.md) — An execution with an execID already applied to the order is refused and changes nothing. *(must, implemented)*

## Order Query

- [FR-018 Search orders with dynamic filters](FR-018-search-orders.md) — The query API returns orders matching field filters (equality, like, ranges) with paging; invalid filter values are ignored rather than failing. *(must, partial)*
- [FR-019 Describe entities for the UI](FR-019-describe-entities.md) — The metamodel endpoint lists each entity's fields, types and available operations so clients can build columns and filters. *(should, implemented)*

## Event Sourcing and Replay

- [FR-020 Record every order change as a versioned event](FR-020-append-event-per-change.md) — Every state change of an order appends exactly one event with the next contiguous per-order version, in the same transaction. *(must, implemented)*
- [FR-021 Reconstruct orders from their events](FR-021-replay-orders.md) — Replaying an order's events reproduces the order at any version and matches the live row. *(must, implemented)*
- [FR-022 Leave no partial writes on failure](FR-022-atomic-command-processing.md) — If any step of a command fails, no order, execution, event or outbox row of that command remains. *(must, implemented)*

## Event Publication

- [FR-023 Publish staged messages in commit order](FR-023-relay-outbox-in-order.md) — The outbox relay publishes staged messages to Kafka in primary-key order and removes each one once sent. *(must, implemented)*
- [FR-024 Retry failed publication](FR-024-retry-failed-publication.md) — A message that fails to publish stays in the outbox with its attempt count; the batch stops at the first failure; after max attempts it is no longer retried. *(must, implemented)*

## Real-time Streaming

- [FR-025 Filter streamed orders and executions](FR-025-filter-streams.md) — Streams can be filtered by field conditions (eq, like, gt, gte, lt, lte, between) combined with AND or OR. *(must, implemented)*
- [FR-026 Map OMS messages to blotter records](FR-026-map-blotter-records.md) — Order messages from oms_orders are mapped to blotter rows with all fields the UI shows. *(must, implemented)*

## Exchange Simulation

- [FR-027 Decide the venue outcome of an order](FR-027-decide-venue-outcome.md) — The simulator rejects unknown symbols and limit prices outside the price band, fills marketable quantity at the reference price and rests the rest. *(must, implemented)*
- [FR-028 Split executions into several fills](FR-028-slice-fills.md) — A marketable quantity is split into positive slices that sum to the quantity. *(should, implemented)*
- [FR-029 Drive the OMS lifecycle over Kafka](FR-029-drive-oms-lifecycle.md) — For each new UNACK order on oms_orders the simulator sends ack, fills, reject or cancel commands to the commands topic. *(must, implemented)*

## Order SLA Monitoring

- [FR-030 Measure order latency at SLA checkpoints](FR-030-measure-order-latency.md) — The OMS stamps received, ack, market-send and market-ack checkpoints on each order once and records time-to-ack, processing, market round-trip and time-to-market timers. *(should, implemented)*

## Admin UI

- [FR-031 Show a live blotter](FR-031-live-blotter.md) — The UI subscribes to the streaming service over RSocket and keeps the blotter rows in step with incoming orders and executions. *(must, implemented)*
- [FR-032 Build columns and filters from the metamodel](FR-032-metamodel-driven-grid.md) — Grid columns and filter editors are derived from the oms-core metamodel rather than hard-coded. *(should, implemented)*

## Knowledge Services

- [FR-033 Serve the knowledge base to AI agents](FR-033-serve-knowledge-base.md) — The MCP server offers knowledge base search, section reads by anchor and an overview with metadata. *(should, implemented)*
- [FR-034 Let AI agents search orders](FR-034-search-orders-for-agents.md) — The MCP server offers a searchOrders tool that maps typed filters and paging onto the OMS query API. *(could, implemented)*
- [FR-035 Browse the knowledge base in a web UI](FR-035-browse-knowledge-base.md) — The KB explorer lists, searches and renders knowledge base documents without showing their front matter. *(could, implemented)*
- [FR-045 Serve OKF metadata and links to AI agents](FR-045-okf-aware-knowledge-tools.md) — The knowledge tools expose each concept's type, status, tags, trust tier and staleness, filter search by them, and list a concept's links and backlinks. *(should, implemented)*
- [FR-046 Browse the knowledge base by OKF type, metadata and links](FR-046-okf-aware-kb-explorer.md) — The KB explorer groups concepts by type and folder, shows each document's type, status, trust tier, staleness, keys and sources, and navigates links and backlinks in the app. *(should, implemented)*

## Order Replace

- [FR-036 Replace (amend) orders](FR-036-replace-orders.md) — A client can change the quantity or price of a working order; the change is confirmed or refused by the market. *(should, not-implemented)*

## Quotes

- [FR-037 Request quotes](FR-037-request-quotes.md) — A client can create a quote request for a quantity of an instrument in a currency. *(could, not-implemented)*
- [FR-038 Provide quotes](FR-038-provide-quotes.md) — A dealer can answer a quote request with a price. *(could, not-implemented)*

## Order Grouping

- [FR-039 Group client orders for the market](FR-039-group-client-orders.md) — The execution desk can combine client orders for the same security and price into one grouped market order. *(should, not-implemented)*
- [FR-040 Allocate grouped fills back to client orders](FR-040-allocate-group-fills.md) — Fills of a grouped order are allocated to its member client orders. *(should, not-implemented)*

## Block Allocation and Average Pricing

- [FR-041 Allocate block executions to accounts](FR-041-allocate-block-executions.md) — Executions of a block order are allocated to the underlying accounts by a fair allocation method. *(should, not-implemented)*
- [FR-042 Average-price allocations](FR-042-average-price.md) — Accounts in a block receive the same average price across its executions. *(should, not-implemented)*

## Booking Integration

- [FR-043 Book executions downstream](FR-043-book-executions.md) — Executions are booked in the downstream booking system through a booking adapter, with retries and reconciliation. *(should, not-implemented)*

## Post-Trade Analytics

- [FR-044 Feed post-trade analytics](FR-044-post-trade-data-feed.md) — OMS events feed an analytics platform for reporting, transaction cost analysis and operational insight, outside the OMS. *(could, not-implemented)*
