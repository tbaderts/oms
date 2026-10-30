# Verification — SPEC-0020: Add projection framework to the write path

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
| P-01 | Contracts live only in oms-contracts | <!-- FILL --> | |
| P-02 | Specification before code, generated models only | <!-- FILL --> | |
| P-03 | Never edit generated code | <!-- FILL --> | |
| P-04 | Contracts evolve compatibly | <!-- FILL --> | |
| P-05 | Every state change is recorded in the event log | <!-- FILL --> | |
| P-06 | Kafka only through the transactional outbox | <!-- FILL --> | |
| P-07 | Schema changes through new Liquibase changesets | <!-- FILL --> | |
| P-08 | Concurrency and idempotency are explicit | <!-- FILL --> | |
| P-09 | Commands and queries stay separate | <!-- FILL --> | |
| P-10 | State transitions go through the state machine and task pipeline | <!-- FILL --> | |
| P-11 | Layering and conventions | <!-- FILL --> | |
| P-12 | Jackson 3 only | <!-- FILL --> | |
| P-13 | Errors and validation follow the framework specs | <!-- FILL --> | |
| P-14 | Test first, every acceptance criterion is proven by an automated test | <!-- FILL --> | |
| P-15 | Observability | <!-- FILL --> | |
| P-16 | Security | <!-- FILL --> | |
| P-17 | Simplicity and dependencies | <!-- FILL --> | |
| P-18 | Modules build standalone | <!-- FILL --> | |
| P-19 | Documentation follows behaviour | <!-- FILL --> | |

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
