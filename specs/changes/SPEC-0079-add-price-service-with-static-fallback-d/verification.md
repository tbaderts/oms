# Verification — SPEC-0079: Add price service with static fallback data

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests below ran and passed in the `spec verify` of 2026-11-26T15:00:38Z (fingerprint
`f8ad9d94b29c43e7`).

**Test totals**, from `build/test-results/test/*.xml` and the evidence logs:

| Module | Tests | Log |
|---|---|---|
| oms-price-service | 70, 0 failures, 11 classes | `evidence/oms-price-service-1.log` |
| oms-exchange-simulator | 139, 0 failures | `evidence/oms-exchange-simulator-1.log` |
| oms-ui backend | 13, 0 failures | `evidence/oms-ui-2.log` |
| oms-ui frontend | 376 passed | `evidence/oms-ui-1.log` |
| oms-core | 788, 1 skipped (load suite, opt-in), 0 failures | `evidence/oms-core-1.log` |

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Search from the instrument list, no provider request | `PriceServiceApiTest#searchAnswersFromReferenceDataWithoutProviderRequests` (HTTP: MSFT for "micro", `REFERENCE_DATA`, 0 stub requests); `PriceServiceTest#searchAnswersFromTheInstrumentListOnly`; `InstrumentCatalogTest#searchRanksSymbolThenNameCaseInsensitive` | PASS |
| AC-2 | One `LISTING_STATUS` per interval; the list stays on failure | `ReferenceDataRefresherTest#refreshesOnceWhenListIsOlderThanInterval`, `#skipsWhenListIsFresh`, `#keepsListWhenProviderFailsOrIsRateLimited`, `#aListThatCannotBeWrittenIsKeptAndCounted`; `AlphaVantageProviderTest#mapsListingStatus` | PASS |
| AC-3 | Two asks within the TTL buy one `GLOBAL_QUOTE` | `PriceServiceApiTest#secondQuoteWithinTtlIsServedFromCache` (HTTP, identical bodies, 1 request); `PriceServiceTest#aLiveQuoteIsBoughtOnceAndCachedForItsTimeToLive`, `#concurrentAsksForOneSymbolBuyOneRequest` | PASS |
| AC-4 | Spent budget: `END_OF_DAY` with close, previousClose, asOf, notice; no request; per-minute too | `PriceServiceTest#aSpentBudgetAnswersTheEndOfDayCloseWithoutAProviderRequest` (last, previousClose, change, changePercent, asOf, currency, notice); `PriceServiceApiTest#spentBudgetAnswersEndOfDayWithoutProviderRequest` (HTTP); `RequestBudgetTest#dailyLimitThenResetAtMidnightUtc`, `#perMinuteLimitSlides` | PASS |
| AC-5 | Rate-limit answer: end-of-day, no further request until the reset | `PriceServiceTest#aRateLimitAnswerFallsBackAndStopsAskingUntilTheBudgetResets` (1 request, then calls resume after 00:00 UTC); `PriceServiceApiTest#rateLimitedAnswerFallsBackAndStopsCallingUntilReset`; `RequestBudgetTest#exhaustSpendsTheDayUntilItsReset`, `#aRestartKeepsTheDaysUseAndARateLimit` (it survives a restart) | PASS |
| AC-6 | Operator CSV: used, malformed rows skipped and logged, most recent date wins | `EndOfDayStoreTest#loadsOperatorFileSkippingMalformedRows` (line numbers, counts), `#aFileWithoutTheHeaderIsSkippedWhole`, `#mostRecentDateWinsBetweenFileAndLearned`, `#reloadsWhenFilesChange`, `#createsTheOperatorFolder`. **Note:** the seed never wins over a file or learned close (`#seedNeverWinsOverOtherOrigins`); see Goal Assessment | PASS |
| AC-7 | A live close is written back and used after an outage or restart | `PriceServiceTest#aLiveQuoteIsWrittenBackAndUsedWhenTheProviderIsUnavailable` (unreachable); `PriceServiceApiTest#liveQuoteIsWrittenBackAndUsedWhenProviderUnavailable` (budget spent, file content checked); `EndOfDayStoreTest#learnedCloseSurvivesRestart` | PASS |
| AC-8 | Unknown symbol 404 Problem; invalid query 400 | `PriceServiceApiTest#unknownSymbolIs404Problem`, `#invalidQueryIs400Problem`; `PriceServiceTest#aSymbolNobodyPricesIsEmpty`, `#aBlankSymbolIsEmptyWithoutAProviderRequest` | PASS |
| AC-9 | The simulator uses the price service's last, static fallback, no Alpha Vantage | `PriceServiceKafkaIntegrationTest#ordersFillAtThePriceServiceQuote`, `#anEndOfDayQuoteIsTheReferenceNotTheStaticPrice`, `#priceServiceDown_staticSymbolStillTrades`, `#priceServiceDownAndNoStaticPrice_isRejected`, `#symbolUnknownToPriceServiceAndStatic_isRejected`; `ReferencePriceServiceTest#usesPriceServiceLast`, `#fallsBackToStaticWhenPriceServiceUnreachable`, `#unknownToBothIsEmpty`; `PriceServiceQuoteClientTest` (6); simulator `ConfigurationHasNoProviderKeyTest` | PASS |
| AC-10 | oms-ui forwards; no Alpha Vantage; "End-of-day close" label; notice when unreachable | `MarketDataControllerTest#forwardsSearchAndQuoteFromPriceService`, `#notFoundPassesThrough`, `#priceServiceUnreachableIs503Problem`, `#anInvalidQueryIs400AndNeverLeavesOmsUi`; `PriceServiceClientTest` (4); `OrderEntry.test.tsx` "labels an end-of-day quote with its date"; `MarketDataService.test.ts` "a 503 gives the unavailable notice for search and quote" | PASS |
| AC-11 | Key in no response or log; not configured in oms-ui or the simulator | `PriceServiceApiTest#keyAppearsInNoResponseOrLogLine` (search, live quote, refresh, rate-limited quote, 404, actuator; root logger captured); `AlphaVantageProviderTest` (key never logged, rate-limit text not passed on); `ConfigurationHasNoProviderKeyTest` (oms-ui and simulator); `MarketDataControllerTest#noProviderKeyIsConfiguredOrShown`; `ComposeEnvironmentTest#onlyThePriceServiceGetsTheProviderKey` | PASS |
| AC-12 | KB: assessment, Component page, updated pages; checker 0 errors | `node tools/okf-check/okf-check.mjs oms-knowledge-base`: 210 concepts, 0 errors. New: `architecture/context/price-service.md`, `architecture/assessments/market-data-providers-2026-11.md`. Updated: market-data-api, exchange-simulator, oms-ui, system-context, order-entry, local-docker-stack, exchange-simulation, FR-027, indexes, log | PASS |
| AC-13 | Prometheus: budget gauge, requests by kind, source, outcome | `PriceServiceApiTest#prometheusShowsBudgetGaugeAndRequestCounts` (gauge 0.0, search/FOUND, quote/PROVIDER, quote/BUDGET_SPENT series); exact counts in `PriceServiceTest` (count assertions) and `ReferenceDataRefresherTest` (refresh outcomes) | PASS |

## Goal Assessment

The goal asks, in the requester's words, for:
- free alternatives, or other ways of using Alpha Vantage;
- a price service providing price and reference data to the services;
- end-of-day data from a file as a fallback;
- symbol lookups against static file data without consuming the real-time API;
- falling back to static data and the previous day's close when the limit is reached.

**What was built:**
- **Alternatives:** assessed in the KB, with a dated comparison and a recommendation (stay with
  Alpha Vantage behind an interface; Finnhub as the second adapter if more live headroom is
  wanted).
- **Price service:** built, and the only holder of the key and caller of the provider. oms-ui and
  the simulator use it.
- **Symbol lookup:** a local instrument list, refreshed with one request a day; search never
  spends quota.
- **Prices:** live within a self-enforced budget that survives restarts. Otherwise the last known
  close and the previous close, from operator files, from closes learned from live quotes, or from
  the seed.

**Two things to know, neither a material gap:**
1. **Coverage grows with use.** Out of the box the end-of-day store prices only the five seed
   symbols, plus every symbol quoted live since. Broad end-of-day coverage needs an operator CSV;
   downloading one automatically was out of scope (approved proposal). Until a symbol has a close,
   an unpriced symbol is a 404 once the budget is spent.
2. **The seed is not "most recent date wins"** (AC-6's wording). The seed holds the simulator's
   five demo prices, dated when they were written. Ranking it by date would let it beat a real
   close from an earlier trading day. The design therefore ranks it below files and learned
   closes, and its answers say "demo price from the seed data, not a market close". This is
   recorded in design.md (Alternatives & Decisions) and flagged for the requester at sign-off. For
   operator files and learned closes, AC-6 holds as written.

## Policy Review

Against the working tree. Files of other tickets in the shared tree are not part of this ticket:
oms-core's SPEC-0077 changes, `oms-streaming-service/build.gradle`, `oms-query-api.yml` and the
developer-cockpit change.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | Only `oms-contracts/src/main/openapi/oms-marketdata-api.yml` changed; the price service generates `MarketDataApi` from it into `build/generated`; no `src/main/openapi` in any module (policy check: 0 errors) |
| P-02 | Specification before code, generated models only | PASS | Enum values (T-1) came first. After the review, the contract text was brought in line: the price service and oms-ui forwarding described, and 503 declared on both paths. The generated models are used in all three services; Alpha Vantage CSV/JSON is parsed inside the provider only |
| P-03 | Never edit generated code | PASS | Nothing under `build/generated` edited |
| P-04 | Contracts evolve compatibly | PASS | Additive: two enum values, one documented response; `BUILT_IN` kept; version 1.0.0 → 1.1.0 |
| P-05 | Every state change is recorded in the event log | N/A | No order state change |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka publishing added; the simulator's Kafka flow is unchanged |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database schema; files in a data directory |
| P-08 | Concurrency and idempotency are explicit | PASS | Per-symbol single flight (`PriceServiceTest#concurrentAsksForOneSymbolBuyOneRequest`, `#aSlowQuoteForOneSymbolDoesNotHoldUpAnother`); `synchronized` budget and store writes; atomic file replacement with temp-file cleanup |
| P-09 | Commands and queries stay separate | PASS | The price service is query-only |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No order state transitions |
| P-11 | Layering and conventions | PASS | Thin controllers → services → catalog/store/provider; constructor injection, Lombok; `org.example.price.<layer>`; module shaped like the simulator |
| P-12 | Jackson 3 only | PASS | `tools.jackson` in the provider; Spring's Jackson 3 converter for the generated models; R03 clean |
| P-13 | Errors and validation follow the framework specs | PASS | 400, 404 and 503 Problem+JSON with `urn:oms:error:*` types; every fallback is counted and logged |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Each AC above has a passing test; behaviour tasks were written red first (recorded in the session) |
| P-15 | Observability | PASS | SLF4J with reasons, `oms.price.*` metrics, OTLP export as in the other services. Provider calls use the static `RestClient.builder()` (as oms-ui and the simulator do), so they carry no client spans; recorded as a follow-up |
| P-16 | Security | PASS | Key only from env, only in the price service, never logged or returned (AC-11 tests); inputs validated by the generated interfaces; symbols passed as URI variables |
| P-17 | Simplicity and dependencies | PASS | No new third-party library; the new module and the build changes are recorded in design.md. R10's `oms-streaming-service/build.gradle` warning belongs to another ticket's change |
| P-18 | Modules build standalone | PASS | `oms-price-service` builds alone (`includeBuild('../oms-contracts')`) and is in the root composite and `buildAll`. Verify ran it and every contract consumer. The requester added it to `specs/config.json` and to `modules.oms-contracts.impacts` (T-0) |
| P-19 | Documentation follows behaviour | PASS | Knowledge base pages as in AC-12; the oms-ui, simulator and price-service READMEs; the contract text |

## Independent Review

The spec-reviewer agent (2026-11-26) returned NOT MET, on one blocking process finding plus
several fixable ones. All were handled before the final verify.

1. **[blocking] No run evidence for oms-price-service.** The review ran while verify was in
   progress. Resolved: the final verify ran the module, with 70 tests across 11 classes in
   `build/test-results` and `evidence/oms-price-service-1.log`.
2. **[major] Stale contract text, and no 503.** Fixed: the info, `notice`, `last` and `asOf`
   descriptions were rewritten, and 503 (oms-ui only) is declared on both paths.
3. **[minor/major] One lock for every cache miss.** A slow provider held up all quotes and could
   trip the simulator's 3 s timeout. Fixed: a per-symbol lock, and provider timeouts of 1 s / 2 s.
   Test: `PriceServiceTest#aSlowQuoteForOneSymbolDoesNotHoldUpAnother`.
4. **[minor] The budget reset on restart.** Fixed: kept in `budget.txt`. Tests:
   `RequestBudgetTest#aRestartKeepsTheDaysUseAndARateLimit`, `#anUnreadableStateFileStartsTheDayAfresh`.
5. **[minor, needs sign-off] Seed precedence differs from AC-6's wording; seed closes shown as
   real.** Kept by design (Goal Assessment, point 2). Seed answers now say they are demo prices
   (`PriceServiceTest#aSeedCloseSaysItIsADemoPrice`). **Flagged to the requester.**
6. **[minor] Blank and unknown symbols spent requests.** Fixed: a blank symbol is empty, and a
   symbol absent from a downloaded listing is `NOT_LISTED`. Neither costs a request
   (`#aBlankSymbolIsEmptyWithoutAProviderRequest`, `#aSymbolMissingFromTheDownloadedListingSpendsNoRequest`).
7. **[minor] Temp files left behind; a refresh write failure escaped.** Fixed: `finally` deletes
   the temp file, and the refresher counts `FAILED` (`#aListThatCannotBeWrittenIsKeptAndCounted`,
   `EndOfDayStoreTest#recordingLeavesNoTemporaryFiles`).
8. **[minor] The API tests depended on order.** Fixed: the stub listing holds every symbol the
   tests quote, so the downloaded listing changes no other test.
9. **[minor] `eod/` was missing on a fresh volume.** Fixed: created at startup
   (`EndOfDayStoreTest#createsTheOperatorFolder`).
10. **[minor] `oms-contracts.impacts` lacks oms-price-service.** Agents cannot edit
    `specs/config.json`. Resolved by the requester: the module entry and the impacts line were
    added (T-0). `oms-ui` is still not listed there; that is under Follow-ups.

## Automated Evidence

`evidence/last-run.json`:
- **Run:** 2026-11-26T15:00:38Z, result **pass**, fingerprint `f8ad9d94b29c43e7`.
- **Modules:** oms-contracts, oms-core, oms-streaming-service, oms-mcp-server,
  oms-exchange-simulator, oms-price-service, oms-ui, oms-knowledge-base.

| Command | Exit | Time |
|---|---|---|
| oms-contracts `check` | 0 | 2 s |
| oms-core `check` | 0 | 643 s |
| oms-streaming-service `check` | 0 | 64 s |
| oms-mcp-server `check` | 0 | 25 s |
| oms-exchange-simulator `check` | 0 | 122 s |
| oms-price-service `check` | 0 | 2 s (up to date; results from the identical preceding run) |
| oms-ui `npm test` | 0 | 27 s |
| oms-ui `check` | 0 | 43 s |

- **Policy check:** 0 errors. Six R10 warnings: five are recorded build changes of this ticket, one
  (`oms-streaming-service/build.gradle`) belongs to another ticket.
- **Also run:** `okf-check`, 0 errors; `docker compose config --quiet`, exit 0.

## Follow-ups

- **`specs/config.json`:** add `oms-ui` to `modules.oms-contracts.impacts`, so a contract-only
  change rebuilds it too (human edit). It consumes the market data models.
- **A second provider (Finnhub)**, as recommended in the assessment, if more live headroom is
  wanted.
- **Client spans for provider and price-service calls (P-15):** use an observation-instrumented
  `RestClient.Builder` in the price service, oms-ui and the simulator.
- **End-of-day coverage:** an importer for a common export format (e.g. Stooq's per-ticker files)
  that writes the price service's CSV, if operators do this often.

## Verdict

Verdict: GOAL MET
