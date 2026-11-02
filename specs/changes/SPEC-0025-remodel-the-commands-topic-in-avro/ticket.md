---
id: SPEC-0025
title: Remodel the commands topic in Avro
type: refactor
status: done
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, oms-exchange-simulator, oms-knowledge-base, developer-cockpit]
approvals: [proposal, design]
owner: Toni Badertscher
created: 2026-10-30
blocked_from:
blocked_reason:
---

# SPEC-0025 — Remodel the commands topic in Avro

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Roadmap ticket H of the architecture review (oms-core/docs/architecture-review-2026-10-30.md, section 7.1): replace the CommandMessage union envelope with one Avro subject per command record on the commands topic using TopicRecordNameStrategy; add a CommandHeader record (commandId, correlationId, causationId, sentAt, producer, version) referenced as the first field of every command record and remove the repeated type and version fields; delete the unused Command.avsc and Cmd.avsc; add the header fields to the OpenAPI Command base schema; register schemas from oms-contracts in CI and set auto.register.schemas to false in the services; let CommandListener consume bare records and map the header into the command model; give the dead-letter recoverer a byte-array template; cut over consumers first after draining the topic.

## Log

- 2026-10-30 created
- 2026-11-01 18:29 — autopilot on
- 2026-11-01 18:30 — proposal gate passed; awaiting human approval
- 2026-11-01 18:31 — proposal approved by Toni Badertscher
- 2026-11-01 18:31 — proposal → design
- 2026-11-01 18:39 — design gate passed; awaiting human approval (policy exceptions: P-04)
- 2026-11-01 18:40 — design approved by Toni Badertscher
- 2026-11-01 18:40 — design → plan
- 2026-11-01 18:41 — plan → implement
- 2026-11-01 18:41 — set modules = oms-contracts, oms-core, oms-exchange-simulator, oms-knowledge-base, developer-cockpit
- 2026-11-01 19:18 — verify run: fail
- 2026-11-01 19:22 — verify run: pass
- 2026-11-01 19:22 — implement → verify
- 2026-11-01 19:31 — reopened at implement: Review: host-native runs (oms-core/.env, simulator bootRun) default to auto.register.schemas=false and stall on a fresh registry; plus minor review fixes
- 2026-11-01 19:36 — verify run: pass
- 2026-11-01 19:36 — implement → verify
- 2026-11-01 19:37 — verify → done
- 2026-11-01 19:37 — autopilot off
