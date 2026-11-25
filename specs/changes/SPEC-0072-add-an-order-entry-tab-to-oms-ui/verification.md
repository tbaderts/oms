# Verification — SPEC-0072: Add an order entry tab to oms-ui

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

From the final `spec verify` (2026-11-24, second run, after the review fixes): oms-ui jest 286/286
(evidence/oms-ui-1.log; `OrderEntry.test.tsx` 16, `orderTicket.test.ts` 24, `MarketDataService.test.ts`,
`OMSApiService.test.ts`, `App.orderEntry.test.tsx`); oms-ui backend `oms-ui/build/test-results/test`:
`AlphaVantageProviderTest` 8/8, `MarketDataControllerTest` 8/8, `MarketDataServiceTest` 8/8,
`TtlCacheTest` 3/3, `ConfigControllerTest` 2/2, no failures or skips (evidence/oms-ui-2.log).

**End-to-end on the local stack (T-12, 2026-11-24 ~15:50 local).** oms-core and the exchange
simulator from 15:19 images (with SPEC-0069/0070), oms-ui from this ticket's image. In a browser,
on the Order Entry tab:
- typing "aap" listed "AAPL Apple Inc. USD" with the notice "Market data provider not configured";
- choosing it filled AAPL, "Apple Inc." and USD, and showed the quote (Last 170, simulator reference
  price, bid/ask n/a);
- "Use last price" filled 170; quantity 100 and account ACC-SPEC0072 were typed; the summary read
  "BUY 100 AAPL LIMIT 170 DAY for ACC-SPEC0072"; Submit showed
  "Order ORD-1000482a-c216-4405-a856-3a9d09cc0098 created".

`GET /api/query/search?orderId=ORD-1000482a-c216-4405-a856-3a9d09cc0098` returned clOrdId
`UI-4d180247-6041-43a8-b42e-25fc085a4cc6`, sessionId `OMS-UI`, AAPL BUY LIMIT 100 @ 170,
account ACC-SPEC0072, securityDesc "Apple Inc.", settlCurrency USD, state FILLED (the simulator filled
it; `/api/query/executions/search` listed `…-F1 AAPL 100@170`). "View in Orders" switched to the live
Orders blotter, where the order was the newest row. The review fixes after this run changed the
retry, duplicate, quote-race, digit-limit and market-data-robustness paths, not this one; the fixed
image was redeployed and its endpoints re-probed (a `{…}` query → 200 fallback, a blank query → empty).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Valid LIMIT order sent once with clOrdId and sessionId; order id shown; order searchable and in the blotter | `OrderEntry.test.tsx` › "submits a limit order and shows the new order id"; `orderTicket.test.ts` › "maps a limit ticket to the command…"; `App.orderEntry.test.tsx`; end-to-end run above (order ORD-1000482a… found by `/api/query/search`, shown in the Orders blotter) | PASS |
| AC-2 | Incomplete or inconsistent input marked, nothing sent | `orderTicket.test.ts` › validateTicket cases (incl. 15-digit limit); `OrderEntry.test.tsx` › "marks invalid fields and sends nothing" | PASS |
| AC-3 | oms-core's refusal shown per field, input kept, resubmittable | `OrderEntry.test.tsx` › "shows oms-core field errors and keeps the input", "shows a refusal message"; `orderTicket.test.ts` › readRefusal | PASS |
| AC-4 | One order per ticket across double click and retries; new clOrdId after success or reset | `OrderEntry.test.tsx` › "a retry keeps the clOrdId, a new order gets a new one", "sends once on a double click", "resolves its own duplicate refusal" (oms-core's real wording), "after a network error, finds the order the first attempt created instead of sending again", "does not guess when the earlier attempt cannot be confirmed", "a reset gives a new clOrdId"; `orderTicket.test.ts` › isOwnDuplicate (real wording, near-misses) | PASS |
| AC-5 | Lookup lists matching instruments; choosing fills symbol and currency | `MarketDataControllerTest#searchReturnsProviderInstruments`; `AlphaVantageProviderTest#mapsSymbolSearch`, `#encodesTheQuery`; `OrderEntry.test.tsx` › "lookup fills symbol and currency"; end-to-end lookup above | PASS |
| AC-6 | Quote shown, bid/ask "not available" when absent, "use last price" | `MarketDataControllerTest#quoteReturnsProviderQuote`; `AlphaVantageProviderTest#mapsGlobalQuote`; `OrderEntry.test.tsx` › "shows the quote and uses the last price", "ignores a late quote for a symbol no longer on the form" | PASS |
| AC-7 | No key / rate limit / unreachable → built-in with notice, manual entry, submit works; key in no response | `MarketDataControllerTest#fallsBackToBuiltInWithoutKey`, `#fallsBackWhenRateLimited`, `#fallsBackWhenUnreachable`, `#keyIsInNoResponse`; `ConfigControllerTest#configHasNoMarketDataKey`; `AlphaVantageProviderTest` (key never logged or passed on; `Error Message`/unknown answers unavailable); `OrderEntry.test.tsx` › "works when market data is unavailable"; end-to-end run without a key | PASS |
| AC-8 | Repeated request within TTL answered from cache | `MarketDataServiceTest#answersRepeatedRequestsFromTheCache`, `#expiresAfterTtl`, `#doesNotCacheFallbacks`, `#aBlankQueryIsNotSentToTheProvider`; `TtlCacheTest` | PASS |

## Goal Assessment

The Goal: an order entry tab to enter new orders with all the necessary information (economics,
account …) and submit them to oms-core; securities information (names/symbols, bid/ask) from an
open API such as Alpha Vantage.

- **Delivered:** the tab with instrument, economics, account and routing, checked like oms-core
  checks them, submitted as `OrderCreateCmd`, idempotent per ticket, with oms-core's answers shown.
  Instrument names and symbols come from Alpha Vantage (when a key is set) or the simulator's
  instruments; proven end to end on the local stack.
- **Gap, declared and accepted at proposal approval:** bid/ask. Alpha Vantage's free tier does not
  provide them; the form shows the last price and day range and marks bid/ask "n/a". Real bid/ask
  needs a paid or different provider, which the provider interface allows without UI changes.
- **To try Alpha Vantage:** set `ALPHAVANTAGE_API_KEY` (root `.env`) and recreate oms-ui; the
  end-to-end run used the built-in fallback, since no key is configured here.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | `oms-marketdata-api.yml` in oms-contracts only; `verifyContracts` now guards oms-ui |
| P-02 | Specification before code, generated models only | PASS | Spec first (T-1); models generated in oms-contracts, `MarketDataApi` generated in oms-ui; orders use the existing command contract |
| P-03 | Never edit generated code | PASS | Generated only |
| P-04 | Contracts evolve compatibly | PASS | New additive spec; existing specs untouched |
| P-05 | Every state change is recorded in the event log | N/A | oms-ui changes no state; oms-core records the orders it creates |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka in oms-ui |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database |
| P-08 | Concurrency and idempotency are explicit | PASS | One clOrdId per ticket; one request in flight; oms-core's duplicate refusal (real wording) and an unknown outcome after a network error both resolved by looking the clOrdId up before any resend (AC-4 tests) |
| P-09 | Commands and queries stay separate | PASS | Writes via `/api/command/execute`, lookups via `/api/query/search`; market data read-only |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No transitions in oms-ui |
| P-11 | Layering and conventions | PASS | Controller → service → provider; configuration class; constructor injection; pure ticket module + component |
| P-12 | Jackson 3 only | PASS | `tools.jackson` in the provider and tests |
| P-13 | Errors and validation follow the framework specs | PASS | 400 Problem+JSON for invalid parameters (`MarketDataExceptionHandler`); provider failures never 500 (fallback); oms-core's answers shown as given |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC above; red runs per task; AC-1's server half also observed end to end |
| P-15 | Observability | PASS | `oms.ui.marketdata.requests{kind,source,outcome}`; provider calls logged with duration, without the key |
| P-16 | Security | PASS | Key from the environment, server-side only, never logged/returned (tested), masked in `toString`; query encoded as data; length-limited parameters |
| P-17 | Simplicity and dependencies | PASS | No new library; `spring-boot-starter-validation` and the generator plugin as in the other services; build and Docker changes recorded in design.md |
| P-18 | Modules build standalone | PASS | `spec verify`: all modules and contract consumers exit 0; oms-ui image built with its named context |
| P-19 | Documentation follows behaviour | PASS | `ui/order-entry.md`, `domain/interfaces/market-data-api.md`, indexes, command-api, local-docker-stack, admin-ui, log; oms-ui README; okf-check 0 errors |

## Independent Review

spec-reviewer ran during the first verify. Findings and resolution:

1. **[blocking] Own-duplicate check never matched oms-core's real message** ("Order creation failed: …").
   **Fixed, test first:** matched on the message's end; fixtures use oms-core's exact wording.
2. **[major] End-to-end evidence not recorded.** **Fixed:** recorded above.
3. **[major] Edits after a network error went out under the old clOrdId.** **Fixed:** the next
   submit looks the clOrdId up first and shows an order found instead of sending; a failed lookup
   shows "could not confirm" and sends nothing.
4. **[minor] Late quote for an earlier symbol.** **Fixed** (sequence guard, test).
5. **[minor] 18-digit decimals lose precision as JS numbers.** **Fixed:** 15 significant digits max.
6. **[minor] Unhandled lookup failure / empty order id.** **Fixed** (covered by 3).
7. **[minor] `{…}` in a query → 500.** **Fixed:** values passed as encoded URI variables (test).
8. **[minor] Blank query spent quota; `Error Message` cached as empty.** **Fixed** (tests).
9. **[minor] JVM crash dumps `oms-ui/hs_err_pid36920.log`, `replay_pid36920.log` untracked in the
   tree.** Not created by this ticket (present before it); left for the maintainer to delete before
   committing.
10. **[minor] No Reset test; no jest evidence yet.** **Fixed:** Reset test; jest 286/286 in evidence.

## Automated Evidence

`evidence/last-run.json`: result `pass`; policy check PASS (warnings: build changes, recorded in
design.md). Commands, all exit 0: oms-contracts, oms-core, oms-streaming-service, oms-mcp-server,
oms-exchange-simulator `gradlew check`; oms-ui `npm test` (286/286) and `gradlew check`. The first run
also passed, before the review fixes. Docker: `docker buildx build --build-context
oms-contracts=./oms-contracts -t oms-ui:latest --load oms-ui` succeeded (twice; the second with the
fixes, deployed).

## Follow-ups

- Real bid/ask needs another market data provider (paid tier or a different API).
- Order amend/cancel from oms-ui (out of scope here).
- Delete the two JVM crash dumps in `oms-ui/` before committing.

## Verdict

Verdict: GOAL MET
