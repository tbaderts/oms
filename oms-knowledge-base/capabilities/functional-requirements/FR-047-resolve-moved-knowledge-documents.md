---
type: Requirement
title: "Resolve moved knowledge documents"
description: "A knowledge base document that moved can still be read under its former path; the answer names the current path."
tags: [functional]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "FR-047"
priority: "should"
implementation: "implemented"
capability: "/capabilities/knowledge-services.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-14T12:00:00Z" }
sources:
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/docs/DocumentRepository.java"
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/kb/KnowledgeBaseTools.java"
  - resource: "repo:oms-mcp-server/src/test/java/org/example/mcp/docs/DocumentRepositoryTest.java"
  - resource: "repo:oms-mcp-server/src/test/java/org/example/mcp/kb/KnowledgeBaseToolsTest.java"
---
# FR-047 Resolve moved knowledge documents

A knowledge base document that moved can still be read under its former path; the answer names the current path.

When an agent asks `readKnowledgeBase` for a path that no longer exists, the knowledge server looks the path up in the `aliases` of every document. On a match it answers with the moved document under its current path, starting with `> Moved: <old> is now <new>`. An unknown path still fails with guidance (SPEC-0061). Search also leaves out deprecated (archived) documents unless asked for them.

Capability: [knowledge-services](../knowledge-services.md).
