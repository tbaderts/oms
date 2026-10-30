---
name: spec-new
description: Create a new OMS spec ticket (proposal, design, tasks, verification documents from the templates in specs/templates). Use when the user wants to start a feature, fix, refactor or spike through the spec-driven workflow, says "new spec", "new ticket", "spec this", or describes work they want done the structured way.
argument-hint: "<what you want done, in your own words>"
---

# Create a spec ticket

`spec` below means `node specs/tools/spec.mjs`, run from the repository root.
The process is described in `specs/README.md`.

Request: $ARGUMENTS

## Steps

1. **Capture the goal verbatim.** The Goal is the reference point the verify stage judges against,
   so it has to be the requester's words, not your interpretation. If the request is missing or is
   too thin to state a goal (no observable outcome at all), ask one short question; otherwise
   proceed.
2. **Pick the metadata:**
   - title: imperative, at most 8 words ("Reject zero-quantity orders").
   - type: `feature` | `fix` | `refactor` | `spike` | `chore`.
   - modules: your best guess from `specs/config.json` → `modules`. It can be corrected later.
3. **Create it:**
   ```bash
   node specs/tools/spec.mjs new "<title>" --type <type> --modules <a,b> --goal "<goal, verbatim>"
   ```
   If the goal contains double quotes or several paragraphs, create the ticket without `--goal` and
   ask the user to paste the goal into `ticket.md` → `## Goal` (agents cannot edit ticket.md).
4. **Report** the ticket id and folder, and offer the two ways forward:
   - `/spec-propose <id>`: work stage by stage with the user reviewing each document, or
   - `/spec-run <id>`: autopilot, which drafts the proposal and stops only at human gates
     (by default the proposal approval; see `approvals` in `specs/config.json`).

Do not start filling the proposal in this skill unless the user asked for that in the same request.
