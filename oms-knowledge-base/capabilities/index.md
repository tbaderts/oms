# Capabilities

What the OMS can do, built or planned. Each capability links its requirements, interfaces, domain concepts and detailed specifications.

Back to the [knowledge base index](../index.md).

## Implemented

- [Admin UI](admin-ui.md) — The React admin tool and trade blotter for viewing and managing orders, executions, quotes and quote requests.
- [Event Publication](event-publication.md) — Getting order and execution changes onto Kafka reliably through the transactional outbox.
- [Event Sourcing and Replay](event-sourcing-and-replay.md) — The append-only order event log and the ability to rebuild any order from it.
- [Exchange Simulation](exchange-simulation.md) — A simulated venue that acknowledges, fills, rejects and cancels OMS orders so the lifecycle runs end to end.
- [Knowledge Services](knowledge-services.md) — Making the knowledge base and OMS data available to AI assistants (MCP) and to people (KB explorer).
- [Order Acceptance](order-acceptance.md) — Moving an order to LIVE when the market acknowledges it.
- [Order Cancellation](order-cancellation.md) — Client cancel requests and the market's cancel confirmations and refusals.
- [Order Capture](order-capture.md) — Taking a new client order into the OMS: validation, identity, initial state, persistence and the first event.
- [Order Query](order-query.md) — Reading orders, executions, event logs and entity metadata.
- [Order Rejection](order-rejection.md) — The market refusing an order, and what the OMS records about the refusal.
- [Order SLA Monitoring](order-sla-monitoring.md) — Timestamping order checkpoints and exposing latency metrics for service-level monitoring.
- [Real-time Streaming](real-time-streaming.md) — Pushing live orders and executions to the trade blotter over RSocket, after an initial snapshot.

## Partially implemented

- [Execution Processing](execution-processing.md) — Applying venue fills to orders; busts and manual cancels of executions are specified but not built.

## Planned

- [Block Allocation and Average Pricing](block-allocation.md) — Block orders for multi-account institutional clients, allocation to accounts and average pricing.
- [Booking Integration](booking-integration.md) — Turning OMS events into bookings in the synchronous downstream booking system.
- [Order Grouping](order-grouping.md) — Combining many small client orders into one market order and allocating the fills back.
- [Order Replace](order-replace.md) — Amending a working order's quantity or price (FIX OrderCancelReplaceRequest); specified, not built.
- [Post-Trade Analytics](post-trade-analytics.md) — An analytics platform fed by OMS events, kept out of the OMS itself.
- [Quotes](quotes.md) — Requesting and providing quotes (RFQ); schemas exist, nothing else.
