# Verification — {{ID}}: {{TITLE}}

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

<!-- FILL: one row per AC from the proposal. Evidence = test class#method that ran and passed in
     the latest `spec verify` (check build/test-results), plus anything else observed. Result is
     PASS, FAIL or PARTIAL; anything other than PASS sends the ticket back to implement.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | … | `OrderLifecycleIntegrationTest#…` (evidence/oms-core-1.log) | PASS |
-->

## Goal Assessment

<!-- FILL: Re-read the Goal in ticket.md. Would the requester agree it is met, in spirit and not
     only by the letter of the ACs? Name any gap between the goal and what the ACs captured, and
     what is left out on purpose. -->

## Policy Review

<!-- For each policy: PASS, N/A (with reason) or EXCEPTION (only if the design declared it).
     Answer the policy's review questions against the actual diff
     (`git diff $(git merge-base main HEAD)`), not against the design. -->

| Policy | Title | Result | Notes |
|---|---|---|---|
{{POLICY_REVIEW_ROWS}}

## Independent Review

<!-- FILL: Summary of the spec-reviewer agent's findings. For each one: fixed (how), or rejected
     (why it is not a real problem). Unresolved blocking findings mean GOAL NOT MET. -->

## Automated Evidence

<!-- FILL: Summary of evidence/last-run.json: when it ran, modules, each command with exit code,
     and policy-check result. -->

## Follow-ups

<!-- Optional: work discovered but out of scope, filed as new tickets. -->

## Verdict

Verdict: <!-- FILL: GOAL MET | GOAL NOT MET -->
