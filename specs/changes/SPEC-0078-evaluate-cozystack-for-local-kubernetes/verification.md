# Verification — SPEC-0078: Evaluate Cozystack for local Kubernetes deployment

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests are in `spike/adr-check.test.mjs`. The last run is captured in `spike/adr-check.out`
(2026-11-26T13:26:38Z, 9/9 pass), and was re-run independently by the spec-reviewer.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | okf-check exits 0; ADR-006 exists, is indexed, and states one decision | `#AC-1 adr exists, indexed, one decision`; `okf-check` 0 errors, exit 0 (adr-check.out); `decision: coexist` | PASS |
| AC-2 | Options table: ≥ 4 options × 6 filled columns | `#AC-2 options table`; the reviewer checked the values against the raw files | PASS |
| AC-3 | Cozystack minimum with URL, host specs, a fits/does not fit verdict per option with arithmetic | `#AC-3 evidence hardware` (asserts "Option 2/3/4 fits / does not fit" and 3 × 24 GB = 72 GB) | PASS |
| AC-4 | Compose total + per-service memory with date; k3d operators+instances total; labels | `#AC-4 memory figures`; raw: `spike/compose-stats.txt` (15 and 17 services), `spike/k3d-stats.txt` | PASS |
| AC-5 | Parity for Schema Registry, LGTM, archive replica, Kafka; gaps → follow-up/accepted | `#AC-5 parity` | PASS |
| AC-6 | Every compose host port listed; switch commands both ways | `#AC-6 coexistence ports` (parses all 21 ports from `docker-compose.yml`); the switch commands were run in the spike (`timings.md`) | PASS |
| AC-7 | Compose loop time measured; k8s loop steps and time; scaling command | `#AC-7 inner loop`; raw: `spike/timings.md` (3 runs each, medians 30.8 s / 56.2 s); the entry point `order-generator.ipynb` exists | PASS |
| AC-8 | Follow-ups with title/type/modules; cozystack.md links ADR-006 and reflects the decision | `#AC-8 follow-ups and cozystack page` | PASS |
| AC-9 | Changes only in `oms-knowledge-base/` and the ticket folder | `#AC-9 change scope` (compose unchanged, marker class absent, no k8s content outside the ticket's paths); the reviewer also checked by hand | PASS |

## Goal Assessment

The Goal asked to find out whether Cozystack makes sense locally or is overkill, whether Docker
and Cozystack can coexist, to get Kubernetes with Postgres, Kafka, Grafana and Redis operators to
test scaling, and to look at streamlining build/deploy/test. ADR-006 answers each part with
measurements:

- **Overkill?** Full Cozystack, yes. Its minimum is 3 × 24 GB = 72 GB against a 31.2 GB laptop,
  plus a dedicated Linux host for the single-node variant. Kubernetes itself is not overkill: k3d
  with the same upstream operators ran on 4.0 GiB, and on 7.4 GiB with 3 × oms-core.
- **Coexistence:** yes, one at a time. They don't clash on ports (k3d uses only 6550). Memory
  (about 14 GiB of 15.2 GiB together) and disk rule out running both at once. The switch commands
  were exercised, and the spike found that a Docker restart revives both sides.
- **Operators and scaling:**
  - CloudNativePG, Strimzi, the Redis operator and grafana-operator were installed and measured.
  - oms-core ran unchanged on them, scaled to 3 replicas across 3 nodes in 19 s, and processed
    an order.
- **Build/deploy/test:**
  - Both loops were measured (compose 30.8 s, k3d 56.2 s), and the bottleneck was identified
    (image import, 25 s).
  - Improvements are proposed: a layered image and a registry (F-2); for compose, host-native
    `bootRun`.
  - The scaling test has a named entry point.

Deliberate gaps:
- **Cozystack was not installed.** The proposal approval accepted that. The verdict rests on its
  documented requirements, not a run.
- **The faster loops are estimates, labelled as such.** Measuring them is F-2.
- **The LGTM stack and the archive replica were not run on k3d** (F-3, F-4).

The spike also produced findings the requester should know about:
- The host disk filled up and Docker Desktop crashed. Disk headroom is now a stated precondition.
- Strimzi's Kafka recovers slowly after a cluster restart.
- oms-core's readiness does not cover Kafka (consistent with ADR-005).

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contract changes by this ticket |
| P-02 | Specification before code, generated models only | N/A | No production code |
| P-03 | Never edit generated code | N/A | No code |
| P-04 | Contracts evolve compatibly | N/A | No contract changes |
| P-05 | Every state change is recorded in the event log | N/A | No domain behaviour changes |
| P-06 | Kafka only through the transactional outbox | N/A | No messaging changes |
| P-07 | Schema changes through new Liquibase changesets | N/A | No schema changes; the prototype used the existing changelog |
| P-08 | Concurrency and idempotency are explicit | N/A | No code; the 3-replica run relied on the existing SPEC-0048 behaviour |
| P-09 | Commands and queries stay separate | N/A | No API changes |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No state changes |
| P-11 | Layering and conventions | PASS | ADR-006 follows the ADR format (`type: Decision`, `id`, file name, index entry); okf-check 0 errors |
| P-12 | Jackson 3 only | N/A | No Java code |
| P-13 | Errors and validation follow the framework specs | N/A | No API changes |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | `adr-check.test.mjs` was written first (T-1, red on 9/9) and has one test per AC; the reviewer's round-1 finding that the AC-9 test could never fail is fixed. Caveat: oms-knowledge-base has `verify: []`, so `evidence/last-run.json` has no commands; the test evidence is `spike/adr-check.out` |
| P-15 | Observability | N/A | No runtime code |
| P-16 | Security | PASS | `operators.ps1` generates the DB password at run time; no secrets committed |
| P-17 | Simplicity and dependencies | PASS | No repository dependencies. Machine tools (k3d via winget; Helm was already there) and alternatives are recorded in design.md. The R10 warning on `oms-streaming-service/build.gradle` comes from another session's uncommitted work, not this ticket |
| P-18 | Modules build standalone | N/A | No module build changes |
| P-19 | Documentation follows behaviour | PASS | ADR-006 added and indexed; `cozystack.md` and `local-docker-stack.md` updated |

## Independent Review

The spec-reviewer ran two rounds.

**Round 1: NOT MET**, with 3 major and 6 minor findings. All were fixed, after reopening implement:
1. The compose footprint omitted Control Center and pgAdmin. Fixed: both measured (5.83 GiB for
   all 17), with ~6.6 GiB at steady state as a labelled estimate.
2. The CPU column was misread (`docker stats` % with 100 % = 1 core). Fixed: recomputed in CPUs
   from the raw files.
3. The AC-9 test was tautological. Fixed: it now asserts compose is unchanged, the marker class
   is absent, and there is no k8s content outside the ticket's paths.
4. False "Skaffold already installed". Fixed: the claim is removed.
5. The switch path contradicted the evidence. Fixed: recreating the cluster is documented, with
   the scripts named.
6. The option-3 arithmetic used an undocumented figure. Fixed: labelled an assumption.
7. cozystack.md implied a Schema Registry. Fixed: the row is corrected.
8. "Four options" were followed by three bullets. Fixed.
9. The `kubectl top` lists were incomplete. Fixed: a caveat in the ADR and in `k3d-stats.txt`.

The round-1 goal gap was that the build/deploy/test streamlining was thin. Fixed: the ADR now
proposes compose-loop improvements and names a scaling-test entry point.

**Round 2: MET.** Seven findings were resolved and two partly resolved. The reviewer raised three
new minor issues:
- the table was broken by the caveat;
- the coexistence sum was stale at 12.8 GiB;
- the CPU sample didn't match the RAM sample.

These were fixed afterwards, together with the leftovers of round-1 findings 1 and 9 (the
"likely cause" wording) and porcelain renames in the AC-9 test. Verify and the checks were then
re-run (13:26Z, 9/9 pass).

## Automated Evidence

- **`spec verify`:** `evidence/last-run.json`, run at 2026-11-26T13:26:38Z, result `pass`.
  - Modules: `oms-knowledge-base`, which has no verify commands (`commands: []`).
  - Policy check PASS: 0 errors, 1 warning (R10, another session's file).
- **ADR checks:** `spike/adr-check.out` at 2026-11-26T13:26:38Z, run after the last edit.
  - `node --test spike/adr-check.test.mjs`: 9 tests, 9 pass, 0 fail.
  - `okf-check`: 208 concepts, 0 errors, exit 0; none of its warnings concern the changed pages.
- **Raw spike data:** `spike/timings.md`, `spike/compose-stats.txt`, `spike/k3d-stats.txt`.
- **Cleanup confirmed:**
  - `k3d cluster list` is empty, and the k3d and k3s images are removed.
  - Compose is restored, with Control Center and pgAdmin stopped as before.

## Follow-ups

These are from ADR-006 and are candidates for new tickets:
- **F-1:** k3d manifests and scripts for OMS scaling tests.
- **F-2:** a layered oms-core image and a registry-based k3d loop.
- **F-3:** LGTM on k3d.
- **F-4:** the archive replica on CloudNativePG.
- **F-5:** Cozystack for a shared environment.

Also worth considering:
- Add a `verify` command for oms-knowledge-base (for example okf-check) in `specs/config.json`, so
  that KB-only tickets get automated evidence. That is the user's config, and was not changed here.
- Reclaim Docker's build cache: 21 GB reclaimable on this machine.
- Decide whether oms-core should expose a Kafka-aware readiness group for Kubernetes.

## Verdict

Verdict: GOAL MET
