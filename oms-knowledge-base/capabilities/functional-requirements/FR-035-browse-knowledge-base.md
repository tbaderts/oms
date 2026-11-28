---
aliases: [functional-requirements/FR-035-browse-knowledge-base]
type: Requirement
title: "Browse the knowledge base in a web UI"
description: "The KB explorer lists, searches and renders knowledge base documents without showing their front matter."
tags: [functional, knowledge-services]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "FR-035"
priority: "could"
implementation: "implemented"
capability: "/capabilities/knowledge-services.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-explorer/src/components/DocumentViewer.tsx"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-explorer/src/utils/frontMatter.ts"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-explorer/src/utils/frontMatter.test.ts"
---
# Browse the knowledge base in a web UI

Reads documents through kb-server's REST API (`/api/kb`). OKF-aware browsing: [FR-046](FR-046-okf-aware-kb-explorer.md).

Capability: [knowledge-services](../knowledge-services.md).
