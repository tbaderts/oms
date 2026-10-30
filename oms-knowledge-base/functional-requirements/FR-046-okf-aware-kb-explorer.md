---
type: Requirement
title: "Browse the knowledge base by OKF type, metadata and links"
description: "The KB explorer groups concepts by type and folder, shows each document's type, status, trust tier, staleness, keys and sources, and navigates links and backlinks in the app."
tags: [functional, knowledge-services]
status: draft
id: "FR-046"
priority: "should"
implementation: "implemented"
capability: "/capabilities/knowledge-services.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-kb-explorer/src/okf/sidebar.ts"
  - resource: "repo:oms-kb-explorer/src/okf/header.ts"
  - resource: "repo:oms-kb-explorer/src/okf/links.ts"
  - resource: "repo:oms-kb-explorer/src/okf/search.ts"
  - resource: "repo:oms-kb-explorer/src/components/TreeView.tsx"
  - resource: "repo:oms-kb-explorer/src/okf/sidebar.test.ts"
  - resource: "repo:oms-kb-explorer/src/okf/header.test.ts"
  - resource: "repo:oms-kb-explorer/src/okf/links.test.ts"
  - resource: "repo:oms-kb-explorer/src/okf/search.test.ts"
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/kbexplorer/KbExplorerController.java"
  - resource: "repo:oms-mcp-server/src/test/java/org/example/mcp/kbexplorer/KbExplorerControllerTest.java"
---
# Browse the knowledge base by OKF type, metadata and links

Built in SPEC-0012:
- sidebar *Types* view (by OKF type; capabilities by maturity, requirements FR/NFR by id) and *Folders* view (the bundle hierarchy, `index.md` as the folder entry), with status and trust filters;
- a header above each document: type, status, trust tier, stale warning, version, updated, tags, description, maturity/id/priority/implementation, the capability as a link, and the sources (bundle documents as links, `repo:` paths as text, URLs external);
- a links panel with outgoing links (broken ones struck through) and "cited by", from `GET /api/kb/documents/links`;
- links inside documents open in the explorer, external links in a new tab;
- search results with title, type, status and trust, and type/tag filters.

Capability: [knowledge-services](../capabilities/knowledge-services.md).
