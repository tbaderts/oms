---
id: SPEC-0065
title: Show chat source details and run trace
type: feature
status: done
awaiting:
autopilot: false
modules: [developer-cockpit, oms-mcp-server, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-16
blocked_from:
blocked_reason:
---

# SPEC-0065 — Show chat source details and run trace

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

now I also would like to see more detail on the sources used (returned by the chat). like more detail that comes from the citations, matching score/rank etc. and having the chat also show more about the agents reasoning, tool calls, tokens used etc. maybe both of these can be collapsable to not use too much screen real estate. lets focus on the quick wins here, not changing the existing stuff too much.

## Log

- 2026-11-16 created
- 2026-11-16 10:43 — autopilot on
- 2026-11-16 10:46 — set modules = developer-cockpit, oms-mcp-server, oms-knowledge-base
- 2026-11-16 10:46 — proposal gate passed; awaiting human approval
- 2026-11-16 10:47 — proposal approved by Toni Badertscher
- 2026-11-16 10:47 — proposal → design
- 2026-11-16 10:49 — design → plan
- 2026-11-16 10:50 — plan → implement
- 2026-11-16 11:02 — verify run: pass
- 2026-11-16 11:02 — implement → verify
- 2026-11-16 11:08 — verify run: pass
- 2026-11-16 11:09 — autopilot off
- 2026-11-16 11:10 — verify run: pass
- 2026-11-16 11:11 — verify → done
- 2026-11-16 11:33 — reopened at proposal: User testing: the knowledge server returns its tool text JSON-encoded (quoted, escaped newlines), so Source details never appear and Run details results are unreadable; and the user wants the details inline in the sources list instead of a separate section.
- 2026-11-16 11:33 — autopilot on
- 2026-11-16 11:34 — proposal gate passed; awaiting human approval
- 2026-11-16 11:41 — proposal approved by Toni Badertscher
- 2026-11-16 11:41 — proposal → design
- 2026-11-16 11:42 — design → plan
- 2026-11-16 11:42 — plan → implement
- 2026-11-16 11:48 — verify run: pass
- 2026-11-16 11:48 — implement → verify
- 2026-11-16 16:32 — verify run: pass
- 2026-11-16 16:34 — verify → done
- 2026-11-16 16:34 — autopilot off
