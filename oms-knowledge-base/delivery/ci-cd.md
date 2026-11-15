---
type: Methodology
title: "Continuous Integration and Delivery"
description: "What runs automatically when the OMS changes: the spec-gates and OpenWiki GitHub workflows, the per-module verify commands the spec gates run, and what does not exist yet (build and test CI, image publishing, deployment)."
tags: [ci, cd, github-actions, quality-gates]
status: draft
updated: "2026-11-14T12:00:00Z"
sources:
  - resource: "repo:.github/workflows/spec-gates.yml"
  - resource: "repo:.github/workflows/openwiki-update.yml"
  - resource: "repo:specs/config.json"
---
# Continuous Integration and Delivery

## What runs today

| Workflow | Trigger | Does |
|---|---|---|
| `spec-gates` | pull request | `node specs/tools/spec.mjs ci`: the policy rules on the PR diff, and every gate that active tickets have already passed |
| `openwiki-update` | daily 08:00 UTC, manual | Regenerates the OpenWiki pages and opens a PR with them |

The real quality gate is local: each module's `verify` commands in `specs/config.json`, which the
spec workflow runs before a ticket can be verified:

| Module | Verify |
|---|---|
| oms-contracts, oms-core, oms-streaming-service, oms-mcp-server, oms-exchange-simulator | `./gradlew check` |
| oms-ui | `npm test`, plus the Gradle check |
| developer-cockpit, mission-control | `npm run typecheck`, `npm test` |
| oms-kb-explorer | `npm run build` |
| knowledge base | none configured: `oms-knowledge-base` has `verify: []` in `specs/config.json`, so `spec verify` runs no knowledge base check. Run `node tools/okf-check/okf-check.mjs oms-knowledge-base`, `cd tools/okf-check && npm test` and `node tools/okf-check/check-kb-refs.mjs` by hand (TD-14) |

## What does not exist yet

- **No build-and-test CI.** Nothing compiles or tests the modules on a server.
- **`spec-gates` rarely runs.** Work goes straight to `main` without pull requests while the
  project has one maintainer, so a pull-request trigger does not fire.
- **No image publishing or deployment pipeline.** Images are built locally by docker-compose
  ([Release and Deploy](release-and-deploy.md)).

These are recorded in the [technical debt register](../architecture/technical-debt/technical-debt-register.md).
A first CI ticket would run every module's verify on push to `main`.
