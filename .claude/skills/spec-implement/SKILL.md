---
name: spec-implement
description: Implementation stage of the OMS spec workflow. Execute tasks.md top to bottom, test-first, ticking each task only when its verify check passes, while staying inside the design and the architecture policies. Use when a ticket is at the implement stage.
argument-hint: "<ticket id>"
---

# Implement

`spec` means `node specs/tools/spec.mjs`. Ticket: $ARGUMENTS.

## Before the first task

- Re-read `proposal.md` (ACs), `design.md` and `tasks.md`. The design is the plan of record.
- `spec check` should pass before you start, so that any later failure is yours.

## Loop: for the first unchecked task

1. **Red.** Write or extend the test named for this task. Run it and see it fail for the right
   reason (an assertion, not a compile error in unrelated code).
2. **Green.** Write the simplest code that passes, following the existing pattern the design names.
   - Contract change: edit only `oms-contracts/src/main/...`, then regenerate
     (`cd oms-contracts && ./gradlew build`, and for API interfaces
     `cd oms-core && ./gradlew openApiGenerateCmd openApiGenerateQuery`). Never touch `build/generated`.
   - Schema change: a new numbered changelog included from `db.changelog-master.yaml`.
   - State changes go through the state machine and task pipeline, appending via
     `OrderEventAppender`; Kafka only through the outbox.
3. **Verify.** Run the task's `verify:` command. Only when it passes, tick it: `- [ ]` → `- [x]`
   in `tasks.md`.
4. **Refactor** if needed, re-run the task's verify, then move on.
5. If `git.commitPerTask` is true in `specs/config.json`, commit with the message
   `<id> T-n: <summary>`. Otherwise leave committing to the user.

Every few tasks, and always after touching contracts, migrations or messaging, run `spec check`.

## When reality diverges from the plan

- **Small and local** (an extra helper, a renamed method): just do it.
- **Changes the approach**, a contract, the schema, or a policy ruling: update `design.md`
  (append to Alternatives & Decisions: "Changed during implementation: … because …") and the
  affected tasks *before* coding it. If it invalidates an AC or needs a new policy exception, go
  back: `spec reopen <id> design "<why>"` (or `proposal`).
- **New work discovered**: if it is needed for an AC, add a task (`T-n`, with ACs and `verify:`)
  and note why under Notes. If it is not, record it under Follow-ups in `verification.md` later;
  do not do it now.
- **Stuck** (the same failure after 3 genuinely different attempts, missing infrastructure such as
  Docker for Testcontainers, an ambiguity only a human can settle):
  `spec block <id> "<what, what you tried, what you need>"` and stop.

Do not touch modules outside the ticket's `modules`. If you must, `spec set <id> modules …` first,
so that verification covers them.

## Finish

When every task is ticked:

```bash
node specs/tools/spec.mjs advance <id>
```

This gate re-runs the policy check on your whole diff. Fix any `ERROR`; treat `WARN`s as review
items for the verify stage. Then continue with `spec-verify`.
