---
id: SPEC-0063
title: Store AI provider keys encrypted per provider
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

# SPEC-0063 — Store AI provider keys encrypted per provider

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

I was looking for a key setting without relying on env variable, as env is easily compromised when agent reads it. A key per provider is a good idea.

## Log

- 2026-11-15 created
- 2026-11-15 17:07 — autopilot on
- 2026-11-15 17:08 — proposal gate passed; awaiting human approval
- 2026-11-15 17:11 — proposal approved by Toni Badertscher
- 2026-11-15 17:11 — proposal → design
- 2026-11-15 17:12 — reopened at proposal: AC-7 would store ai.apiKey as the configured provider's key, but Settings only ever offered that field for 'local' (since 98cc43d); the user's config would get its vLLM key migrated as the Anthropic key
- 2026-11-15 17:12 — proposal gate passed; awaiting human approval
- 2026-11-15 17:15 — proposal approved by Toni Badertscher
- 2026-11-15 17:15 — proposal → design
- 2026-11-15 17:17 — design → plan
- 2026-11-15 17:18 — plan → implement
- 2026-11-15 17:29 — verify run: pass
- 2026-11-15 17:29 — implement → verify
- 2026-11-15 17:33 — reopened at implement: verify review: cross-provider env fallback, unguarded key-file writes and failed sets dropping keys, pasted key leaking via apiKeyEnvVar, unreadable key file treated as empty, collision check on undecryptable keys, renderer rejections, AC-2 provider hand-off untested
- 2026-11-15 17:39 — verify run: pass
- 2026-11-15 17:39 — implement → verify
- 2026-11-15 17:41 — reopened at implement: delta review: redacted apiKeyEnvVar comes back as '' on any settings save and overwrites a pasted key the migration deliberately kept (AC-8); misleading reason when the named variable belongs to another provider
- 2026-11-15 17:43 — verify run: pass
- 2026-11-15 17:43 — implement → verify
- 2026-11-15 17:43 — verify → done
- 2026-11-15 17:43 — autopilot off
