---
type: Requirement
title: "Let AI agents search orders"
description: "The MCP server offers a searchOrders tool that maps typed filters and paging onto the OMS query API."
tags: [functional, knowledge-services]
status: draft
id: "FR-034"
priority: "could"
implementation: "implemented"
capability: "/capabilities/knowledge-services.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/oms/OrderSearchMcpTools.java"
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/oms/OrderQueryClient.java"
  - resource: "repo:oms-mcp-server/src/test/java/org/example/mcp/oms/OrderSearchMcpToolsTest.java"
---
# Let AI agents search orders

Negative pages and excessive page sizes are clamped.

Capability: [knowledge-services](../capabilities/knowledge-services.md).
