---
type: Requirement
title: "Browse the capability catalogue"
description: "People can browse capabilities with their maturity, use cases, actors and requirements, and see the implementation status of each requirement, in the developer cockpit."
tags: [functional]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "FR-048"
priority: "should"
implementation: "implemented"
capability: "/capabilities/knowledge-services.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-14T12:00:00Z" }
sources:
  - resource: "repo:developer-cockpit/src/main/services/RequirementsService.ts"
  - resource: "repo:developer-cockpit/src/renderer/views/requirements/CapabilitiesTab.tsx"
  - resource: "repo:developer-cockpit/test/main/RequirementsService.test.ts"
  - resource: "repo:developer-cockpit/test/renderer/RequirementsView.test.tsx"
---
# FR-048 Browse the capability catalogue

People can browse capabilities with their maturity, use cases, actors and requirements, and see the implementation status of each requirement, in the developer cockpit.

The Requirements view of the [developer cockpit](../../tools/developer-cockpit.md) opens on a Capabilities tab (maturity, number of use cases and requirements, details on selection) and has tabs for use cases, functional and non-functional requirements (with implementation) and actors, all read from the folders `okf-check` enforces (SPEC-0061).

Capability: [knowledge-services](../knowledge-services.md).
