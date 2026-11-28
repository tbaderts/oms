---
aliases: [functional-requirements/FR-045-okf-aware-knowledge-tools]
type: Requirement
title: "Serve OKF metadata and links to AI agents"
description: "The knowledge tools expose each concept's type, status, tags, trust tier and staleness, filter search by them, and list a concept's links and backlinks."
tags: [functional, knowledge-services]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "FR-045"
priority: "should"
implementation: "implemented"
capability: "/capabilities/knowledge-services.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/main/java/io/kbserver/docs/FrontMatter.java"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/main/java/io/kbserver/docs/OkfMetadata.java"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/main/java/io/kbserver/docs/ConceptLinks.java"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/main/java/io/kbserver/kb/KnowledgeBaseTools.java"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/main/java/io/kbserver/index/KnowledgeIndexService.java"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/test/java/io/kbserver/docs/OkfMetadataTest.java"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/test/java/io/kbserver/kb/KnowledgeBaseToolsTest.java"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/test/java/io/kbserver/index/KnowledgeIndexServiceTest.java"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/test/java/io/kbserver/docs/ConceptLinksTest.java"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/test/java/io/kbserver/api/KnowledgeApiControllerTest.java"
---
# Serve OKF metadata and links to AI agents

Built in SPEC-0011:
- front matter is parsed (SnakeYAML, safe constructor) and never indexed as text; title, description and tags are searchable;
- `searchKnowledgeBase` filters by `type`, `tag` and `status` (legacy Active/Complete/Draft mapped) and shows type, status and trust tier per hit;
- `readKnowledgeBase` starts with a metadata summary and ends with outgoing links (broken ones marked) and "cited by";
- `getKnowledgeBaseOverview` lists concepts only (no `index.md`/`log.md`), with type, status, trust and staleness;
- `GET /api/kb/documents` returns the metadata as an `okf` object for the KB explorer.

Capability: [knowledge-services](../knowledge-services.md).
