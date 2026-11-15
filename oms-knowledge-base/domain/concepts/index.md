# Domain Concepts

Specifications and concept papers of business behaviour: order lifecycle, execution reporting, quantities, replace, grouping, allocation, booking, trading capacity, post-trade analytics. Each states whether it is built; see the linked capability for maturity.

Part of [Domain](../index.md). Back to the [knowledge base index](../../index.md).

## Documents

- [Block Orders, Allocation and Average Pricing — Concept Paper](block-order-allocation.md) — Block orders for multi-account institutional clients, allocation of fills to accounts and average pricing.
- [Booking Integration — Draft Specification](booking-integration.md) — Booking adapter that turns OMS event streams into calls to the synchronous downstream booking system.
- [Execution Reporting Specification](execution-reporting.md) — Workflows for processing execution reports from venues and brokers: fills, corrections, busts and their effect on order state.
- [Order Grouping Specification](order-grouping.md) — Grouping client orders for the same security and price into one market order, and allocating fills back to the members.
- [Order Lifecycle Management Specification](order-lifecycle.md) — Order states and transitions across the full lifecycle, combining state machine rules, business workflows and FIX semantics.
- [Order Model, Trading Capacity and Booking Legs — Concept Paper](order-model-trading-capacity.md) — Whether one order is enough or client and market legs are needed, depending on trading capacity and booking.
- [Order Quantity Calculations Specification](order-quantity-calculations.md) — Quantity field semantics (orderQty, placeQty, cumQty, leavesQty) across parent and child orders in an order tree.
- [Order Lifecycle Management: Replace, Cancel, and Reject Operations](order-replace.md) — Replace, cancel and reject workflows for client and market orders, with their state handling.
- [Post-Trade Analytics Platform — Concept Paper](post-trade-analytics.md) — Analytics platform fed by OMS events for post-trade reporting, TCA and operational insight.
