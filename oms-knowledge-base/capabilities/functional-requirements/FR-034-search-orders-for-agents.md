---
aliases: [functional-requirements/FR-034-search-orders-for-agents]
type: Requirement
title: "Let AI agents search orders"
description: "Withdrawn: the knowledge server no longer offers a searchOrders tool; agents use the oms-core query API."
tags: [functional, knowledge-services]
status: deprecated
superseded_by: none
updated: "2026-11-28T12:00:00Z"
id: "FR-034"
priority: "could"
implementation: "not-implemented"
capability: "/capabilities/knowledge-services.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "/domain/interfaces/query-api.md"
---
# Let AI agents search orders

> **Withdrawn (SPEC-0080, 2026-11-28).** The MCP server moved out of this repository into the
> general-purpose [knowledge-server](https://github.com/tbaderts/knowledge-server) (`kb-server`),
> which knows nothing about orders. Its `searchOrders` tool, which mapped typed filters and paging
> onto the [Query API](../../domain/interfaces/query-api.md), was removed with the move. Agents that
> need live order data call the Query API directly. Offering order tools over MCP again, from
> oms-core, would be a ticket of its own.

Capability: [knowledge-services](../knowledge-services.md).
