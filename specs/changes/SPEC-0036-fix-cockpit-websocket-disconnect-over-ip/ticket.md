---
id: SPEC-0036
title: Fix cockpit WebSocket disconnect over IPv4
type: fix
status: proposal
awaiting:
autopilot: false
modules: [developer-cockpit]
approvals: []
owner: Toni Badertscher
created: 2026-10-31
blocked_from:
blocked_reason:
---

# SPEC-0036 — Fix cockpit WebSocket disconnect over IPv4

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

The cockpit status bar shows Disconnected: the renderer connects to ws://localhost:9321, which goes to IPv4, while the WebSocket server only listens on IPv6 (SPEC-0013 follow-up). The cockpit must connect and show Connected.

## Log

- 2026-10-31 created
