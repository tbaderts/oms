# Functional Requirements

One requirement per document (FR-nnn), with priority, implementation status, its capability and the code and tests it is traced to.

Part of [the parent section](../index.md). Back to the [knowledge base index](../../index.md).

## Documents

- [FR-001 Accept new orders](FR-001-accept-new-orders.md) — An OrderCreateCmd received over REST or Kafka creates an order with an OMS orderId in state UNACK with its whole quantity open. *(implemented)*
- [FR-002 Validate new orders](FR-002-validate-new-orders.md) — A new order missing a required field, with a non-positive quantity, a limit order without price or a stop order without stop price is refused. *(partial)*
- [FR-003 Record order creation as an event](FR-003-record-order-creation.md) — Creating an order appends a NEW_ORDER event (version 1) and stages the order for publication in the same transaction. *(implemented)*
- [FR-004 Reject duplicate client order ids](FR-004-reject-duplicate-client-order-id.md) — A second order with the same clOrdId in the same session is refused and the first order is unchanged. *(implemented)*
- [FR-005 Move acknowledged orders to LIVE](FR-005-acknowledge-orders.md) — An OrderAcceptCmd for an UNACK order moves it to LIVE, records an ACK event, stamps the market-ack time and stages the order for publication. *(implemented)*
- [FR-006 Refuse invalid acknowledgements](FR-006-refuse-invalid-acceptance.md) — An OrderAcceptCmd for an unknown order or an order that cannot move to LIVE is refused and records no event. *(implemented)*
- [FR-007 Accept cancel requests](FR-007-request-cancel.md) — An OrderCancelRequestCmd on a LIVE order with open quantity and no pending cancel sets cancelState PCXL, keeps the state and clears an earlier reject reason. *(implemented)*
- [FR-008 Apply market cancels](FR-008-confirm-cancel.md) — An OrderCancelCmd moves a LIVE order to CXL with cancelState CXL, sets leavesQty to 0 and keeps cumQty. *(implemented)*
- [FR-009 Apply cancel rejects](FR-009-reject-cancel-request.md) — An OrderCancelRejectCmd on an order with a pending cancel sets cancelState REJ, stores the reason and keeps the order LIVE. *(implemented)*
- [FR-010 Ignore redelivered commands](FR-010-deduplicate-lifecycle-commands.md) — A command whose commandId the order has already applied is refused without writing anything, on every path, with one typed answer. *(implemented)*
- [FR-011 Apply market rejects](FR-011-reject-orders.md) — An OrderRejectCmd on an UNACK or LIVE order moves it to REJ, closes the open quantity and stores the reason truncated to the column width. *(implemented)*
- [FR-012 Expose the reject reason](FR-012-expose-reject-reason.md) — The reject reason is published on oms_orders and returned by the query API and the metamodel. *(implemented)*
- [FR-013 Apply fills to LIVE orders](FR-013-apply-fills.md) — An ExecutionCreateCmd for a LIVE order adds lastQty to cumQty, recomputes leavesQty, keeps the order LIVE or moves it to FILLED, and records PARTIAL_FILL or FILL. *(implemented)*
- [FR-014 Publish fills with the resulting position](FR-014-publish-fills.md) — Each applied fill stages the execution and the updated order for publication, carrying the fill and the resulting cumQty and leavesQty. *(implemented)*
- [FR-015 Bust executions](FR-015-bust-executions.md) — An ExecutionBustCmd reverses a previously applied execution and restores the order quantities and state. *(not-implemented)*
- [FR-016 Manually cancel (whack) executions](FR-016-whack-executions.md) — An ExecutionWhackCmd lets an operator cancel an execution manually. *(not-implemented)*
- [FR-017 Reject duplicate executions](FR-017-reject-duplicate-execution.md) — An execution with an execID already applied to the order is refused and changes nothing. *(implemented)*
- [FR-018 Search orders with dynamic filters](FR-018-search-orders.md) — The query API returns orders matching field filters (equality, like, ranges) with paging; invalid filter values are ignored rather than failing. *(partial)*
- [FR-019 Describe entities for the UI](FR-019-describe-entities.md) — The metamodel endpoint lists each entity's fields, types and available operations so clients can build columns and filters. *(implemented)*
- [FR-020 Record every order change as a versioned event](FR-020-append-event-per-change.md) — Every state change of an order appends exactly one event with the next contiguous per-order version, in the same transaction. *(implemented)*
- [FR-021 Reconstruct orders from their events](FR-021-replay-orders.md) — Replaying an order's events reproduces the order at any version and matches the live row. *(implemented)*
- [FR-022 Leave no partial writes on failure](FR-022-atomic-command-processing.md) — If any step of a command fails, no order, execution, event or outbox row of that command remains. *(implemented)*
- [FR-023 Publish staged messages in commit order](FR-023-relay-outbox-in-order.md) — The outbox relay publishes each aggregate's staged messages to Kafka in primary-key order, one after another, and removes each one once acknowledged. *(implemented)*
- [FR-024 Retry failed publication](FR-024-retry-failed-publication.md) — A message that fails to publish stays in the outbox with its attempt count and holds back only its own aggregate; after max attempts it is no longer retried and holds its aggregate until an operator acts. *(implemented)*
- [FR-025 Filter streamed orders and executions](FR-025-filter-streams.md) — Streams can be filtered by field conditions (eq, like, gt, gte, lt, lte, between) combined with AND or OR. *(implemented)*
- [FR-026 Map OMS messages to blotter records](FR-026-map-blotter-records.md) — Order messages from oms_orders are mapped to blotter rows with all fields the UI shows. *(implemented)*
- [FR-027 Decide the venue outcome of an order](FR-027-decide-venue-outcome.md) — The simulator prices each symbol from Alpha Vantage or its static prices, rejects unknown symbols, sub-penny limits and limits through the price collar, fills marketable quantity at the reference price and rests the rest. *(implemented)*
- [FR-028 Split executions into several fills](FR-028-slice-fills.md) — A marketable quantity is split into positive slices that sum to the quantity. *(implemented)*
- [FR-029 Drive the OMS lifecycle over Kafka](FR-029-drive-oms-lifecycle.md) — For each new UNACK order on oms_orders the simulator sends ack, fills, reject or cancel commands to the commands topic. *(implemented)*
- [FR-030 Measure order latency at SLA checkpoints](FR-030-measure-order-latency.md) — The OMS stamps received, ack, market-send and market-ack checkpoints on each order once and records time-to-ack, processing, market round-trip and time-to-market timers. *(implemented)*
- [FR-031 Show a live blotter](FR-031-live-blotter.md) — The UI subscribes to the streaming service over RSocket and keeps the blotter rows in step with incoming orders and executions. *(implemented)*
- [FR-032 Build columns and filters from the metamodel](FR-032-metamodel-driven-grid.md) — Grid columns and filter editors are derived from the oms-core metamodel rather than hard-coded. *(implemented)*
- [FR-033 Serve the knowledge base to AI agents](FR-033-serve-knowledge-base.md) — The MCP server offers knowledge base search, section reads by anchor and an overview with metadata. *(implemented)*
- [FR-034 Let AI agents search orders](FR-034-search-orders-for-agents.md) — The MCP server offers a searchOrders tool that maps typed filters and paging onto the OMS query API. *(implemented)*
- [FR-035 Browse the knowledge base in a web UI](FR-035-browse-knowledge-base.md) — The KB explorer lists, searches and renders knowledge base documents without showing their front matter. *(implemented)*
- [FR-036 Replace (amend) orders](FR-036-replace-orders.md) — A client can change the quantity or price of a working order; the change is confirmed or refused by the market. *(not-implemented)*
- [FR-037 Request quotes](FR-037-request-quotes.md) — A client can create a quote request for a quantity of an instrument in a currency. *(not-implemented)*
- [FR-038 Provide quotes](FR-038-provide-quotes.md) — A dealer can answer a quote request with a price. *(not-implemented)*
- [FR-039 Group client orders for the market](FR-039-group-client-orders.md) — The execution desk can combine client orders for the same security and price into one grouped market order. *(not-implemented)*
- [FR-040 Allocate grouped fills back to client orders](FR-040-allocate-group-fills.md) — Fills of a grouped order are allocated to its member client orders. *(not-implemented)*
- [FR-041 Allocate block executions to accounts](FR-041-allocate-block-executions.md) — Executions of a block order are allocated to the underlying accounts by a fair allocation method. *(not-implemented)*
- [FR-042 Average-price allocations](FR-042-average-price.md) — Accounts in a block receive the same average price across its executions. *(not-implemented)*
- [FR-043 Book executions downstream](FR-043-book-executions.md) — Executions are booked in the downstream booking system through a booking adapter, with retries and reconciliation. *(not-implemented)*
- [FR-044 Feed post-trade analytics](FR-044-post-trade-data-feed.md) — OMS events feed an analytics platform for reporting, transaction cost analysis and operational insight, outside the OMS. *(not-implemented)*
- [FR-045 Serve OKF metadata and links to AI agents](FR-045-okf-aware-knowledge-tools.md) — The knowledge tools expose each concept's type, status, tags, trust tier and staleness, filter search by them, and list a concept's links and backlinks. *(implemented)*
- [FR-046 Browse the knowledge base by OKF type, metadata and links](FR-046-okf-aware-kb-explorer.md) — The KB explorer groups concepts by type and folder, shows each document's type, status, trust tier, staleness, keys and sources, and navigates links and backlinks in the app. *(implemented)*
- [FR-047 Resolve moved knowledge documents](FR-047-resolve-moved-knowledge-documents.md) — A knowledge base document that moved can still be read under its former path; the answer names the current path. *(implemented)*
- [FR-048 Browse the capability catalogue](FR-048-browse-capability-catalogue.md) — People can browse capabilities with their maturity, use cases, actors and requirements, and see the implementation status of each requirement, in the developer cockpit. *(implemented)*
- [FR-049 Log every command and its outcome](FR-049-log-every-command.md) — Every command received over REST, Kafka or from the scheduler is recorded with its source and whether it was applied, refused or failed, and the log of one order can be read back. *(implemented)*
- [FR-050 Refuse commands sent against a stale version](FR-050-refuse-stale-version-commands.md) — A command that carries the order version its sender acted on is refused, not applied, when the order has moved on. *(implemented)*
- [FR-051 Record who, where and what changed on every event](FR-051-record-event-metadata.md) — Every order event records the correlation and causation ids of the causing command, the principal and source, and a field-by-field diff of the change. *(implemented)*
- [FR-052 Reconcile orders with their event log](FR-052-reconcile-event-log.md) — A scheduled job compares a sample of orders with the latest snapshot in their event log, checks the log has no gaps, and reports any order whose state the log does not explain. *(implemented)*
- [FR-053 Read the event log of an order](FR-053-read-order-history.md) — Clients can read every event of one order, oldest first, with its version, command, resulting state, metadata and changes, optionally for one execution. *(implemented)*
- [FR-054 Serve fills with the order as of each fill](FR-054-serve-fills-with-order.md) — Clients can list fills, each with the order as it was after that fill, filtered and paged, from the order-execution projection. *(implemented)*
- [FR-055 Expire orders when their time in force runs out](FR-055-expire-orders.md) — A working order whose time in force has run out (DAY at end of day, GTD at its expire time, or an explicit expire command) moves to EXP and its open quantity is closed. *(implemented)*
- [FR-056 Close finished orders at end of day](FR-056-close-finished-orders.md) — At end of day every order that can do nothing more (filled, cancelled, rejected, expired) is closed, so only working orders remain open. *(implemented)*
