---
name: spec-plan
description: Stage 3 of the OMS spec workflow. Turn an approved design into tasks.md, an ordered, test-first task list where every task traces to acceptance criteria and has its own verify check, and pass the plan gate. Use when a ticket is at the plan stage.
argument-hint: "<ticket id>"
---

# Stage 3: Plan (tasks)

`spec` means `node specs/tools/spec.mjs`. Ticket: $ARGUMENTS.

The plan is what the implement stage executes **without further thinking about structure**. A
good plan makes implementation mechanical; a vague one makes it improvise.

## Write `tasks.md` → `## Tasks`

Format (parsed by the gate):

```markdown
- [ ] **T-1** Add `minQty` validation to NewOrderCmd schema and regenerate (AC-1)
  - files: oms-contracts/src/main/openapi/schema.yml
  - verify: `cd oms-contracts && ./gradlew build` passes and `NewOrderCmd` exposes the constraint
```

Rules:

1. **Order** (skip phases that do not apply):
   contracts + regeneration → Liquibase changelog → behaviour slices → wiring (API, messaging,
   config) → observability → knowledge base → final `spec verify`.
2. **Test-first per behaviour slice.** Each behaviour task says: write the failing test named in the
   design's Test Strategy, implement, make it green. Its `verify:` runs exactly that test, e.g.
   ``verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.api.CommandControllerWebMvcTest'` passes``.
3. **Small.** One focused change per task, about one red→green cycle. Split anything that touches
   more than one layer *and* more than a handful of files.
4. **Traceable.** List the ACs each task serves in parentheses. Every AC needs at least one task;
   tasks with no AC (setup, docs) are allowed but should be rare.
5. **Checkable.** Every task has a `verify:` line with a command or an objective observation.
   "Code looks right" is not a check.
6. **Last task:** `Run spec verify` with verify `node specs/tools/spec.mjs verify <id>` exits 0.

## Gate

```bash
node specs/tools/spec.mjs advance <id>
```

Exit 1: fix and re-run. Exit 3: approval configured for plan; summarise and stop. Exit 0: the
ticket is at implement. If `git.branchPerTicket` is true in `specs/config.json` and you are on
`main`, create the branch now: `git switch -c spec/<id-lowercase>-<slug>`. Then continue with
`spec-implement`.
