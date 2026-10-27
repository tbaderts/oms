---
name: spec-archive
description: Close out a finished OMS spec ticket. Confirm the knowledge base reflects the change, archive the ticket folder, close linked beads issues and prepare the commit or PR summary. Use when a ticket is done.
argument-hint: "<ticket id>"
---

# Archive a done ticket

`spec` means `node specs/tools/spec.mjs`. Ticket: $ARGUMENTS.

1. `spec status <id>` must show `done`. If not, finish verification first.
2. **Living documentation.** For each entry in design.md → Knowledge Base Updates, confirm the
   `oms-knowledge-base/` page was updated (and update it now if it was missed; verify should have
   caught this). Don't hand-edit generated OpenWiki pages.
3. **Follow-ups.** For each item under verification.md → Follow-ups, offer to create a new ticket
   (`/spec-new`) or a beads issue.
4. `spec archive <id>` moves the folder to `specs/archive/`, keeping the documents and
   `evidence/last-run.json` and dropping the bulky logs.
5. If `beads` is set on the ticket: `bd close <beads-id>`.
6. **Hand-off.** Draft a commit message or PR description: the goal, the ACs with their evidence, the
   policy exceptions (if any), and a link to `specs/archive/<dir>/`. Commit or push only if the user
   asks. CLAUDE.md requires reviewing changes before committing.
