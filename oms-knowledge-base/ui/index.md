# User Interface

Specifications of the OMS user interfaces and the design system.

Back to the [knowledge base index](../index.md).

## Documents

- [User Interface Specification: OMS Admin Tool](admin-ui.md) — React and AG Grid admin tool for viewing and managing orders, executions, quotes and quote requests.
- [Order Entry](order-entry.md) — The Order Entry tab of the OMS UI: a new order's instrument, economics and account, checked before it is sent to oms-core as an OrderCreateCmd, with instrument lookup and quotes from a market data provider.
- [Design System](design-system.md) — The visual language of the OMS UI: design tokens in theme/_tokens.scss (surfaces, text, brand accent, status tones, borders, spacing, shape, type), their TypeScript mirror for AG Grid, and the tests that enforce token use and contrast.
- [Order State Indicator Specification](order-state-indicator.md) — Four-bar visual indicator showing leg types, placement and execution progress of an order in the web UI.
