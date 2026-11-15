# Use Cases

How actors use a capability, one per document (UC-nnn): preconditions, main and alternative flows, postconditions and the requirements exercised.

Part of [the parent section](../index.md). Back to the [knowledge base index](../../index.md).

## Documents

- [UC-001 Submit a new order](UC-001-submit-order.md) — A trader or client system hands a new order to the OMS, which validates it, gives it an id and sends it towards the market.
- [UC-002 Acknowledge an order at the venue](UC-002-acknowledge-order.md) — The venue confirms it has the order, and the OMS marks it as working.
- [UC-003 Cancel a working order](UC-003-cancel-order.md) — The client asks to cancel a working order; the venue confirms or refuses, and the OMS records each step.
- [UC-004 Reject an order at the venue](UC-004-reject-order.md) — The venue refuses an order; the OMS records the refusal and why, so the trader can see it.
- [UC-005 Report a fill](UC-005-report-fill.md) — The venue reports an execution; the OMS applies it to the order and publishes it with the order as of the fill.
- [UC-006 Correct an execution (planned)](UC-006-correct-execution.md) — An execution is busted or manually cancelled (whacked), and the order is put back as if it had not happened. The event log supports it; the commands have no handler yet (SPEC-0030).
- [UC-007 Search and inspect orders](UC-007-inspect-orders.md) — A user finds orders by any field and looks at an order's history and fills.
- [UC-008 Audit and replay an order's history](UC-008-audit-order-history.md) — Someone needs to know exactly what happened to an order, who caused it, and what the order looked like at any point.
- [UC-009 Receive order and execution events downstream](UC-009-consume-events.md) — A downstream system receives every order and execution change, in order per order, exactly as committed.
- [UC-010 Watch orders live on the blotter](UC-010-watch-blotter.md) — A trader sees orders and fills update live, filtered to what they care about.
- [UC-011 Work orders in the admin UI](UC-011-work-in-admin-ui.md) — A user views and manages orders and executions in the web UI.
- [UC-012 Run the order lifecycle against a simulated venue](UC-012-simulate-venue.md) — A developer runs orders end to end without a real market: the simulator plays the venue.
- [UC-013 Monitor order latency and processing](UC-013-monitor-latency.md) — Operations watches how fast and how healthily orders are processed.
- [UC-014 Expire and close orders at end of day](UC-014-end-of-day.md) — At the end of the trading day, orders whose time in force ran out expire and finished orders are closed.
- [UC-015 Ask an AI assistant about the OMS](UC-015-ask-ai-assistant.md) — A developer asks an AI assistant a question; the assistant answers from the knowledge base and live order data through MCP.
- [UC-016 Browse the knowledge base and capability catalogue](UC-016-browse-knowledge.md) — A person reads the knowledge base and the capability catalogue in a UI rather than through an assistant.
- [UC-017 Replace a working order (planned)](UC-017-replace-order.md) — The client amends a working order's quantity or price (FIX OrderCancelReplaceRequest). Not built.
- [UC-018 Request and provide quotes (planned)](UC-018-quote.md) — A client asks for a price and the desk answers with a quote. Only the Avro schemas exist.
- [UC-019 Group client orders into a market order (planned)](UC-019-group-orders.md) — Many small client orders are combined into one market order and its fills are allocated back. Not built; needs order trees.
- [UC-020 Allocate a block execution to accounts (planned)](UC-020-allocate-block.md) — A block order for an institutional client is executed and allocated to its accounts at an average price. Not built.
- [UC-021 Book executions downstream (planned)](UC-021-book-executions.md) — Fills are booked in the downstream booking system from the OMS events. Not built.
- [UC-022 Analyse post-trade data (planned)](UC-022-analyse-post-trade.md) — An analytics platform outside the OMS is fed with its events for post-trade analysis. Not built.
