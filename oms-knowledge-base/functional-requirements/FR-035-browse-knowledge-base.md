---
type: Requirement
title: "Browse the knowledge base in a web UI"
description: "The KB explorer lists, searches and renders knowledge base documents without showing their front matter."
tags: [functional, knowledge-services]
status: draft
id: "FR-035"
priority: "could"
implementation: "implemented"
capability: "/capabilities/knowledge-services.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-kb-explorer/src/components/DocumentViewer.tsx"
  - resource: "repo:oms-kb-explorer/src/utils/frontMatter.ts"
  - resource: "repo:oms-kb-explorer/src/utils/frontMatter.test.ts"
---
# Browse the knowledge base in a web UI

Reads documents through the MCP server's REST API (`/api/kb`). OKF-aware browsing: [FR-046](FR-046-okf-aware-kb-explorer.md).

Capability: [knowledge-services](../capabilities/knowledge-services.md).
