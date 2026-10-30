---
id: SPEC-0025
title: Remodel the commands topic in Avro
type: refactor
status: proposal
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, oms-exchange-simulator, oms-knowledge-base]
approvals: []
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
