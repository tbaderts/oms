# Software Delivery

How the OMS is built and shipped: spec-driven development, testing, CI/CD, release and deploy, the team manifesto, skill profiles and AI-augmented development.

Back to the [knowledge base index](../index.md).

## Documents

- [AI-Augmented Development with MCP, Agents & Skills](ai-augmented-development.md) — Using MCP servers, Copilot agents and chat modes, and external AI agents in OMS development.
- [Continuous Integration and Delivery](ci-cd.md) — What runs automatically when the OMS changes: the spec-gates and OpenWiki GitHub workflows, the per-module verify commands the spec gates run, and what does not exist yet (build and test CI, image publishing, deployment).
- [OMS Development Team Manifesto: Core Values & Principles](manifesto.md) — Core values and principles of the OMS development team.
- [Release and Deploy](release-and-deploy.md) — How the OMS is built and run today (locally, with the root docker-compose.yml, images built from each module's Dockerfile), how versions are handled, and what a release process would add; Kubernetes via Cozystack is planned.
- [OMS Team Skill Profiles](skill-profiles.md) — Skill profiles and general traits for building a well-rounded OMS team across the architecture pillars.
- [OMS Layered Architecture Framework](software-architecture-methodology.md) — Layered architecture framework with four pillars: execution, application, development and operations architecture.
- [Spec-Driven Development](spec-driven-development.md) — How a change goes from intent to verified result in the OMS: spec tickets with proposal, design, plan, implement and verify stages, gates run by specs/tools/spec.mjs, human approvals, autopilot, and where the developer cockpit fits.
- [Testing Patterns Specification](testing.md) — Testing conventions for the OMS: unit, integration and end-to-end tiers, fixtures and Testcontainers.
