---
id: SPEC-0062
title: Add knowledge base chat to developer cockpit
type: feature
status: done
awaiting:
autopilot: false
modules: [developer-cockpit, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-15
blocked_from:
blocked_reason:
---

# SPEC-0062 — Add knowledge base chat to developer cockpit

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

for developer-cockpit knowledge base feature, I would like to have a chat feature that lets me chat with the knowledge base to find content or give me a summary. we can use the built in AI capabilities and use mcp to connect to the knowledge server.

## Log

- 2026-11-15 created
- 2026-11-15 11:33 — autopilot on
- 2026-11-15 11:34 — set modules = developer-cockpit, oms-knowledge-base
- 2026-11-15 11:34 — proposal gate passed; awaiting human approval
- 2026-11-15 11:36 — proposal approved by Toni Badertscher
- 2026-11-15 11:36 — proposal → design
- 2026-11-15 11:39 — design → plan
- 2026-11-15 11:40 — plan → implement
- 2026-11-15 11:53 — verify run: pass
- 2026-11-15 11:53 — implement → verify
- 2026-11-15 11:55 — reopened at implement: verify review: chat state lost when panel unmounts mid-run; Stop lost while tools build; add model-driven tool-call tests (AC-2/AC-3) and an AiService error-part test
- 2026-11-15 12:02 — verify run: pass
- 2026-11-15 12:02 — implement → verify
- 2026-11-15 12:03 — reopened at implement: delta review: bound server-side reads (default limit = MAX_READ_CHARS, limit<=0 treated as unset)
- 2026-11-15 12:06 — verify run: pass
- 2026-11-15 12:06 — implement → verify
- 2026-11-15 12:06 — verify → done
- 2026-11-15 12:06 — autopilot off
