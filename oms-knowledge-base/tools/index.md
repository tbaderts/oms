# Tools

Developer and AI tooling around the OMS: the knowledge server (MCP), the KB explorer, the developer cockpit and mission control.

Back to the [knowledge base index](../index.md).

## Documents

- [Developer Cockpit](developer-cockpit.md) — Electron desktop tool for the spec workflow, the knowledge base, requirements and storyboards.
- [KB Explorer](kb-explorer.md) — Vite/React web UI for browsing and searching the knowledge base through the MCP server.
- [Knowledge Server (MCP)](knowledge-server.md) — oms-mcp-server: a Spring AI MCP server that indexes this knowledge base and gives AI assistants search, read and overview tools for it, plus order search against oms-core.
- [Mission Control](mission-control.md) — Local load-test tool that creates orders over REST at a set rate, follows them on Kafka, charts their latency figures and lets an AI agent investigate a run.
