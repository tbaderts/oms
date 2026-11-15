# Actors

People and systems that interact with the OMS.

Part of [the parent section](../index.md). Back to the [knowledge base index](../../index.md).

## Documents

- [AI Agent](ai-agent.md) — An AI assistant (Claude Code, Copilot, the cockpit assistant) that reads the knowledge base and order data through MCP.
- [Client System](client-system.md) — An upstream system (in-house trading, online banking, asset or portfolio management, another bank) that sends orders to the OMS.
- [Developer](developer.md) — A person building the OMS who reads its specifications, runs it locally and tests it against the simulator.
- [Downstream System](downstream-system.md) — A system that consumes what the OMS publishes: the streaming service, booking, analytics.
- [Operations User](operations-user.md) — A middle-office or support person who monitors the order flow, investigates problems and corrects data.
- [Scheduler](scheduler.md) — The OMS's own scheduled jobs (expiry, end of day, reconciliation), run on one leader instance.
- [Trader](trader.md) — A person on the trading desk who enters, watches and manages client orders.
- [Venue](venue.md) — The market an order is sent to; today the exchange simulator plays it, later a market adapter will connect real venues.
