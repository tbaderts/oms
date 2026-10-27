---
id: SPEC-0011
title: Serve OKF concepts from MCP server
type: feature
status: proposal
awaiting:
autopilot: false
modules: [oms-mcp-server]
approvals: []
owner: Toni Badertscher
beads:
created: 2026-10-27
blocked_from:
blocked_reason:
---

# SPEC-0011 — Serve OKF concepts from MCP server

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

create a new spec ticket for converting knowledge base and mcp server and kb explorer to support use OKF https://github.com/GoogleCloudPlatform/open-knowledge-format. we also need to beef up the content and make sure we have a structured documentation, requiremnets, capabilities etc. if needed, create multiple tickets. (This ticket: make oms-mcp-server read the OKF bundle and expose concept type, tags, status, staleness, trust tier and links through its knowledge tools.)

## Log

- 2026-10-27 created
