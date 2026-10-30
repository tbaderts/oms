---
type: Component
title: "MCP Server"
description: "Spring AI MCP server exposing knowledge base and order search tools to AI assistants."
tags: [component, mcp, spring-ai]
status: draft
component: "mcp-server"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/SpringAiApplication.java"
  - resource: "repo:oms-mcp-server/src/main/resources/application.yml"
---
# MCP Server

Indexes the knowledge base (keyword + semantic embeddings in Qdrant) and serves MCP tools plus a
REST API (`/api/kb`) for the KB explorer. Since SPEC-0011 it reads the OKF bundle: front matter
(`FrontMatter`, `OkfMetadata`: type, status, tags, trust tier, staleness, project keys), the link
graph (`ConceptLinks`: outgoing links and backlinks), and it treats `index.md`/`log.md` as
navigation, not concepts. Capability: [Knowledge Services](../capabilities/knowledge-services.md).

Context: [System Context](system-context.md).
