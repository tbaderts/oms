# Tools

Developer and AI tooling around the OMS: the knowledge server (MCP), the KB explorer, the developer cockpit and mission control.

Back to the [knowledge base index](../index.md).

## Documents

- [Developer Cockpit](developer-cockpit.md) — Generic Electron workbench for the spec workflow, knowledge base, storyboards and service monitoring; the OMS configures it with cockpit.yaml.
- [KB Explorer](kb-explorer.md) — Vite/React web UI for browsing and searching the knowledge base through the MCP server.
- [Knowledge Server (MCP)](knowledge-server.md) — kb-server, from the knowledge-server repository: a general-purpose MCP server that serves this knowledge base to AI assistants with search, read and overview tools.
- [Mission Control](mission-control.md) — Local load-test tool that creates orders over REST at a set rate, follows them on Kafka, charts their latency figures and lets an AI agent investigate a run.
