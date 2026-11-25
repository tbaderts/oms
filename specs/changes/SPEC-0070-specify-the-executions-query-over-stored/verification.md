# Verification — SPEC-0070: Specify the executions query over stored fills

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

From the final `spec verify` (2026-11-24, second run, after the review fixes): oms-core reports in
`oms-core/build/test-results/test` — `ExecutionSearchIntegrationTest` 6/6,
`ExecutionBlotterIntegrationTest` 5/5, `ExecutionSpecificationsTest` 4/4, no failures or skips;
oms-ui jest 235/235 (evidence/oms-ui-1.log).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Filter by orderId; totalElements = count | `ExecutionSearchIntegrationTest#filtersByOrderId` (exact list of A's 2 fills, newest first; `totalElements` 2) | PASS |
| AC-2 | `symbol__like`, `lastQty__gte`, `transactTime__between`, `status`, alone and combined | `ExecutionSearchIntegrationTest#filtersBySymbolLikeQuantityTimeAndStatus` (exact lists per filter and combined; unknown status matches nothing); `ExecutionSpecificationsTest#readsFieldOperatorAndKind`, `#ignoresUnknownFieldsAndBlankValues` | PASS |
| AC-3 | Newest first, paging totals, page 2, sort by lastPx | `ExecutionSearchIntegrationTest#pagesNewestFirstAndSorts` (P6,P5,P4; totals 7/3; page 2 = P0; ascending prices); `ExecutionSpecificationsTest#userSortEndsWithIdAsTieBreaker` | PASS |
| AC-4 | 400 on size 501 and unknown sort field; unknown filter ignored | `ExecutionSearchIntegrationTest#rejectsOversizedPageAndUnknownSort` (400, 400 naming `price`, 200 ignoring `notAField`) | PASS |
| AC-5 | Entry carries the execution's fields, none of the order's | `ExecutionSearchIntegrationTest#entryCarriesExecutionFieldsOnly` (16 fields against stored values; `side`, `price`, `orderQty`, `account`, `state` absent); `ExecutionBlotterIntegrationTest` (every metamodel field filled, via the new query) | PASS |
| AC-6 | REST execution blotter calls the search with its filters and shows the content | `OMSApiService.test.ts` › "calls the execution search with the filters, paging and sort" (path, `symbol__like`, `lastQty__gte`, page, size, sort; `{content,page}` returned); `Blotter.test.tsx` › "sends its filters to the execution search and shows the content" (saved filter reaches `getExecutions`; rows rendered) | PASS |
| AC-7 | `/api/executions` and `/api/executions/{id}` → 404 | `ExecutionSearchIntegrationTest#retiredEndpointIsGone`; `ExecutionController`, `ExecutionReadService` deleted | PASS |

## Goal Assessment

The Goal asks that oms-ui use only order and execution data, not the booking projection, and that
tickets be created to clean up the cache and the execution query support. This ticket delivers the
execution query support: a contracted search over the `executions` table, which the REST execution
blotter now uses (its filters, previously ignored, now apply), and the retirement of the
uncontracted `/api/executions`.

Not met by this ticket on purpose, and owned by SPEC-0071: oms-ui's **live** execution blotter
still gets its snapshot from the projection, because the streaming service's `OmsQueryClient`
calls `/api/query/executions`. SPEC-0071 moves that snapshot onto this search and removes the
cache. The knowledge base says so (`domain/interfaces/query-api.md`). The REST blotter never read
the projection; it read `executions` before and still does, now through a contract.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | Only `oms-query-api.yml` changed |
| P-02 | Specification before code, generated models only | PASS | Contract first (T-1); `ExecutionDto`/`PagedExecutionDto`/`ExecutionStatus` generated; the hand-written endpoint removed |
| P-03 | Never edit generated code | PASS | Regenerated only |
| P-04 | Contracts evolve compatibly | PASS | Additive path and schemas, version 2.6.0; `/api/executions` removal declared BREAKING in the approved proposal |
| P-05 | Every state change is recorded in the event log | N/A | Read-only query |
| P-06 | Kafka only through the transactional outbox | N/A | No messaging |
| P-07 | Schema changes through new Liquibase changesets | N/A | No schema change |
| P-08 | Concurrency and idempotency are explicit | N/A | No writes |
| P-09 | Commands and queries stay separate | PASS | Under `/api/query`, `@Transactional(readOnly = true)`, own query DTO |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No state change |
| P-11 | Layering and conventions | PASS | Controller → `ExecutionQueryService` → repository with `ExecutionSpecifications`; MapStruct mapper with `unmappedTargetPolicy = ERROR` |
| P-12 | Jackson 3 only | PASS | Tests use `tools.jackson`; policy check auto rule passed |
| P-13 | Errors and validation follow the framework specs | PASS | Bad sort → 400 Problem (`IllegalArgumentException`); bad size → 400 (method validation) |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC above; red runs recorded for each task |
| P-15 | Observability | PASS | Search parameters logged at INFO, as the order search does |
| P-16 | Security | PASS | Filters only on allow-listed fields through parameterised criteria; sort allow-listed; size bounded |
| P-17 | Simplicity and dependencies | PASS | No dependency or build change |
| P-18 | Modules build standalone | PASS | `spec verify`: every module and contract consumer exit 0 |
| P-19 | Documentation follows behaviour | PASS | query-api (incl. the streaming service still on the projection), rest-read-api (+ descriptions), query-engine, order-query, TD-3, admin-ui, log.md; oms-ui README and ARCHITECTURE; okf-check 0 errors |

## Independent Review

spec-reviewer ran during the first verify; it found the code sound and every AC backed by a real
test. Its NOT MET was for one documentation error and evidence not yet produced. Findings:

1. **[major] query-api.md said the streaming service reads the execution search.** It still reads
   the projection. **Fixed:** the page now says so, until SPEC-0071.
2. **[minor] oms-ui ARCHITECTURE.md still described raw-`Page` handling.** **Fixed.**
3. **[minor] REST Read API descriptions (page and interfaces index) still named executions.**
   **Fixed.**
4. **[minor] no `id` tie-breaker on a user sort; unparsable direction → ASC.** **Fixed** the
   tie-breaker (test first). The direction fallback is kept, as in the order search.
5. **[minor] AC-6 proven only by composition.** **Fixed:** a Blotter test sets a filter and checks
   it reaches `getExecutions` and the rows render.
6. **[minor] no final evidence yet.** **Resolved** by the final run (all exit 0, `last-run.json`
   pass).

Confirmed by the reviewer: no code, script or tool in the repository still calls `/api/executions`.

## Automated Evidence

`evidence/last-run.json`: result `pass`; policy check PASS. Commands, all exit 0: oms-contracts
check (2s, up to date), oms-core check (460s), oms-streaming-service check (3s, up to date),
oms-mcp-server check (21s), oms-exchange-simulator check (2s, up to date), oms-ui `npm test`
(235/235) and `gradlew check`. The first verify run also passed (before the review fixes).

## Follow-ups

- SPEC-0071: the streaming service's executions snapshot moves from the projection to this search,
  and its caches go (the live half of the Goal).
- The `/api/orders` half of TD-3 (hand-written, uncontracted order reads): no ticket yet.
- Execution search in oms-mcp-server: no ticket yet.

## Verdict

Verdict: GOAL MET
