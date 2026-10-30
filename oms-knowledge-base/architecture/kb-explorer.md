---
type: Component
title: "KB Explorer"
description: "Vite/React web UI for browsing and searching the knowledge base through the MCP server."
tags: [component, react, knowledge-base]
status: draft
component: "oms-kb-explorer"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-kb-explorer/src/App.tsx"
  - resource: "repo:oms-kb-explorer/package.json"
---
# KB Explorer

Run locally with `npm run dev`; not part of docker-compose. Reads `/api/kb` of the MCP server
(`VITE_KB_API_URL`, default `http://localhost:8091/api/kb`; the controller is active in the
server's `local` profile). Since SPEC-0012 it is OKF-aware: *Types* and *Folders* sidebar views with
status and trust filters, a metadata header per document, a links/"cited by" panel
(`/api/kb/documents/links`) and in-app navigation of bundle links. Its logic lives in plain
TypeScript models under `src/okf/` with `node --test` unit tests. Capability:
[Knowledge Services](../capabilities/knowledge-services.md).

Context: [System Context](system-context.md).
