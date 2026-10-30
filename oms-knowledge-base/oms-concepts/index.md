# OMS Concepts

Domain capabilities of the OMS and concept papers for capabilities still under discussion.

Back to the [knowledge base index](../index.md).

## Specifications

- [Exchange Simulator](exchange-simulator.md) — FIX exchange simulator that acknowledges, fills, rejects and cancels OMS market orders so the lifecycle can run end to end.
- [Execution Reporting Specification](execution-reporting.md) — Workflows for processing execution reports from venues and brokers: fills, corrections, busts and their effect on order state.
- [Order Grouping Specification](order-grouping.md) — Grouping client orders for the same security and price into one market order, and allocating fills back to the members. *(draft)*
- [Order Lifecycle Management Specification](order-lifecycle.md) — Order states and transitions across the full lifecycle, combining state machine rules, business workflows and FIX semantics.
- [Order Lifecycle Management: Replace, Cancel, and Reject Operations](order-replace.md) — Replace, cancel and reject workflows for client and market orders, with their state handling.
- [Order Quantity Calculations Specification](order-quantity-calculations.md) — Quantity field semantics (orderQty, placeQty, cumQty, leavesQty) across parent and child orders in an order tree. *(draft)*
- [Trade Blotter Backend Component Specification](streaming-architecture.md) — Backend component that streams orders, executions and quotes in real time to the Trade Blotter UI. *(draft)*

## Concept Papers

- [Block Orders, Allocation and Average Pricing — Concept Paper](block-order-allocation.md) — Block orders for multi-account institutional clients, allocation of fills to accounts and average pricing. *(draft)*
- [Booking Integration — Draft Specification](booking-integration.md) — Booking adapter that turns OMS event streams into calls to the synchronous downstream booking system. *(draft)*
- [Order Model, Trading Capacity and Booking Legs — Concept Paper](order-model-trading-capacity.md) — Whether one order is enough or client and market legs are needed, depending on trading capacity and booking. *(draft)*
- [Post-Trade Analytics Platform — Concept Paper](post-trade-analytics.md) — Analytics platform fed by OMS events for post-trade reporting, TCA and operational insight. *(draft)*
