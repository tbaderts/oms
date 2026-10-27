---
name: spec-verify
description: Verification stage of the OMS spec workflow. Prove with evidence that a spec ticket really meets its goal, every acceptance criterion and every architecture policy. Runs the automated gates, traces each AC to a passing test, gets an independent review from the spec-reviewer agent, and writes verification.md with a verdict. Use when a ticket is at the verify stage or the user asks "are we done / did we meet the goal".
argument-hint: "<ticket id>"
---

# Verify: is the goal really met?

`spec` means `node specs/tools/spec.mjs`. Ticket: $ARGUMENTS.

Your job here is to **try to prove the ticket is not done**, and to conclude GOAL MET only when that
fails. Self-assessment is biased toward "done", which is why this stage combines machine evidence,
traceability and an independent reviewer.

## 1. Automated evidence

```bash
node specs/tools/spec.mjs verify <id>
```

This runs the policy check and `verify` commands for every affected module plus its consumers
(e.g. a contracts change also builds oms-core, oms-streaming-service and oms-mcp-server). It can
take several minutes (Testcontainers), so use a long timeout or run it in the background.
It writes `evidence/last-run.json` and one log per command.

On failure: read the log tail, `spec reopen <id> implement "<failure>"`, fix it test-first, and
come back. After `autopilot.maxVerifyAttempts` failed rounds on the same problem, block the ticket.

## 2. Trace every acceptance criterion

For each AC in `proposal.md`:

- Find the test(s) that prove it (start from design → Test Strategy).
- Confirm they **ran and passed in this verify run**: check
  `<module>/build/test-results/test/TEST-*.xml` for the class and method, with no `<failure>` or
  `<skipped>`.
- **Read the test.** Does its assertion really check the AC's *then* clause, for the AC's *given*
  context? A test that exercises the code but asserts something weaker does not count.
- If there is no adequate test, the result is FAIL: go back to implement.

## 3. Policy review against the actual diff

`git diff $(git merge-base main HEAD)` plus untracked files. For each policy, answer its Check
questions against the code as written, not the design. `spec verify` already covers the `auto`
rules; the `review` ones are yours. `EXCEPTION` is only valid where design.md declared it and it
was approved.

## 4. Independent review

Launch the **spec-reviewer** agent (Agent tool, `subagent_type: "spec-reviewer"`) with a prompt like:

> Review spec ticket <id> in specs/changes/<dir>. Determine whether the implementation meets the
> ticket Goal, every acceptance criterion in proposal.md and every policy in
> specs/policies/architecture-policies.md. Base branch: main. Report findings as instructed.

It starts with fresh context and a skeptical brief. For each finding:
- **blocking / major and confirmed**: fix it (reopen implement), then repeat from step 1;
- **disagree**: record why it is not a problem, with evidence;
- **minor**: fix it if cheap, otherwise add it under Follow-ups.

## 5. Write `verification.md`

- **Acceptance Criteria Results**: one row per AC: evidence (test class#method + log file),
  result `PASS` / `FAIL` / `PARTIAL`.
- **Goal Assessment**: re-read the Goal in `ticket.md`. Would the requester agree it is done, in
  spirit and not only by the letter of the ACs? Name any gap honestly. A gap between goal and ACs
  is a finding, not something to hide.
- **Policy Review**: every row `PASS` / `N/A` / `EXCEPTION` with notes for anything except PASS.
- **Independent Review**: the reviewer's findings and how each was resolved.
- **Automated Evidence**: summary of `evidence/last-run.json`.
- **Verdict**: `Verdict: GOAL MET` only if every AC passes, no blocking finding is open and the goal
  assessment has no material gap. Otherwise `Verdict: GOAL NOT MET` with the reason, then reopen
  the right stage.

Changing any code after step 1 makes the evidence stale; the gate checks a content fingerprint.
Re-run `spec verify` after the last code change.

## 6. Gate

```bash
node specs/tools/spec.mjs advance <id>
```

Exit 0 → `done`. Exit 3 → sign-off configured; present the verdict summary and stop. Then give the
user the outcome: the ACs with their evidence, follow-ups, and the suggested next step
(`/spec-archive <id>`, commit or PR).
