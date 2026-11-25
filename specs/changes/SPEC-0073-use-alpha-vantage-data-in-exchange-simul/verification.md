# Verification — SPEC-0073: Use Alpha Vantage data in exchange simulator

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests below ran in the full `./gradlew check` of oms-exchange-simulator (results
`oms-exchange-simulator/build/test-results/test/TEST-*.xml`) that the final `spec verify` ran on
2026-11-25 at 05:06 UTC after the review fixes: 117 tests, 0 failures, 0 skipped
(`evidence/oms-exchange-simulator-1.log`).
Integration tests run against Testcontainers Kafka and a JDK HTTP stub of Alpha Vantage
(`StubAlphaVantage`).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Symbol only Alpha Vantage prices → accept + fill at its last price | `AlphaVantageKafkaIntegrationTest#symbolOnlyKnownToAlphaVantage_fillsAtItsLastPrice` (GOOGL 141.80 → `OrderAcceptCmd`, `ExecutionCreateCmd` lastPx 141.80); `AlphaVantageQuoteClientTest#globalQuote_returnsLastPrice`; `ReferencePriceServiceTest#symbolOnlyKnownToProvider_isPriced` | PASS |
| AC-2 | Provider price wins over static | `AlphaVantageKafkaIntegrationTest#knownSymbol_fillsAtProviderPriceNotStatic` (AAPL fills 189.50, not 170.00); `ReferencePriceServiceTest#providerPriceWinsOverStaticPrice` | PASS |
| AC-3 | Empty Global Quote, not static → `Unknown symbol <s>` | `AlphaVantageKafkaIntegrationTest#symbolUnknownToProviderAndStatic_isRejected` (exact text `Unknown symbol ZZZZ`, stub asked once); `AlphaVantageQuoteClientTest#emptyGlobalQuote_isNotFound` | PASS |
| AC-4 | Not configured / rate limited / timeout → static, else unknown; never unanswered | `ReferencePriceServiceTest#notConfigured_usesStaticWithoutRequest`, `#rateLimited_fallsBackToStatic`, `#unreachable_fallsBackToStatic`, `#unavailableAndNotStatic_isEmpty`, `#backoff_skipsProviderUntilItExpires`; `AlphaVantageQuoteClientTest#noteAnswer_isRateLimited`, `#informationAnswer_isRateLimited`, `#serverError_isUnreachable`, `#errorMessageAnswer_isUnreachable`, `#unknownShapeOrInvalidJson_isUnreachable`, `#notConfigured_makesNoRequest`, `#readTimeout_isUnreachable` (a `SocketTimeoutException` maps to UNREACHABLE); `ReferencePriceServiceTest#unexpectedFailure_fallsBackAsUnreachable` (no exception escapes onto the engine thread); end to end `AlphaVantageKafkaIntegrationTest#providerRateLimited_staticSymbolStillTrades` (MSFT fills at static 420.00), `#providerErrorAndNoStaticPrice_isRejectedWithoutTheKey`; no key: all of `ExchangeSimulatorKafkaIntegrationTest` (AAPL fills at 170, ZZZZ rejected) | PASS |
| AC-5 | Cached within `quote-ttl`, no second request; refetched after | `AlphaVantageKafkaIntegrationTest#secondOrderSameSymbol_usesCache` (two KO orders, stub saw 1 request); `ReferencePriceServiceTest#cachedWithinTtl_noSecondRequest_refetchedAfterTtl` (clock at TTL−1 s: cached; at TTL: refetched), `#notFoundIsCachedToo` | PASS |
| AC-6 | Tick: 170.005 rejected with exact text; 0.1234 accepted, 0.12345 rejected (tick 0.0001) | `OrderEvaluatorTest#subPennyLimitAboveOneDollar_rejected` (`Price 170.005 is not a multiple of tick 0.01`), `#fourDecimalLimitBelowOneDollar_accepted_fiveDecimalsRejected`, `#nonPositiveLimit_rejected` (0 and −5, buy and sell: `Invalid limit price <p>`); `LimitPriceRulesTest#tickIsOneCentFromOneDollar_otherwiseHundredthOfACent`, `#tickViolation_namesPriceAndTick` | PASS |
| AC-7 | Collar per tier, buy and sell, exact boundaries; passive buy rests | `OrderEvaluatorTest#buyCollar_perTier` (20/40/170: 22.00/42.00/175.10 accepted and marketable, 22.01/42.01/175.11 rejected with `Price <p> outside collar <lo>-<hi>`), `#sellCollar_perTier` (SELL and SELL_SHORT: 18.00/38.00/164.90 ✓, 17.99/37.99/164.89 ✗), `#passiveBuyFarBelowReference_acceptedAndRests` (100.00 vs 170.00 accepted, not marketable); `LimitPriceRulesTest#collarTiers`, `#collarViolation_buyAboveHighSellBelowLow`; end to end `ExchangeSimulatorKafkaIntegrationTest#limitThroughCollar_rejected` | PASS |
| AC-8 | Key in no command, reject text or log line, through every path | `AlphaVantageKafkaIntegrationTest` `@AfterEach` over all 7 tests (every command received and every captured `org.example.simulator` log line incl. stack traces free of the key; the stub's rate-limit and error answers echo it; the stub confirms the key was sent to it); `AlphaVantageQuoteClientTest` `@AfterEach` log check over all 11 tests, `#exceptionsNeverCarryTheKey` (message free of key, no cause kept) | PASS |
| AC-9 | `simulator_reference_price_lookups_total{source,outcome}` on `/actuator/prometheus` | `AlphaVantageKafkaIntegrationTest#lookupMetricOnPrometheusEndpoint` (series ALPHA_VANTAGE/FOUND, CACHE/FOUND, STATIC/RATE_LIMITED, NONE/NOT_FOUND present); `ReferencePriceServiceTest#lookupsCountedBySourceAndOutcome` (exact counts 1/2/1, total 4) and the per-outcome counts asserted in the AC-4 tests | PASS |

## Goal Assessment

Goal (ticket.md): switch the simulator to Alpha Vantage "so it has access to securities reference
data and prices", and "add some price checks that make sure, user submitted limit is within
acceptable range of what stock exchanges such as NASDAQ or NYSE accept".

- **Prices and coverage — met.** With a key, the simulator now trades any symbol Alpha Vantage
  quotes, at the last price that order entry shows (AC-1, AC-2). Without a key, or when the free
  quota is spent, it degrades to today's behaviour instead of failing (AC-4). Compose passes the
  same `.env` key that oms-ui reads, so one setting turns both on.
- **Reference data — met as far as the venue needs it, and narrowed on purpose.** The simulator
  learns from Alpha Vantage whether a symbol exists and what it trades at; an unknown symbol is
  rejected (AC-3). It does not take names, types or currencies (`SYMBOL_SEARCH`), because no venue
  decision uses them. This was an explicit non-goal in the approved proposal.
- **Exchange-acceptable limits — met, for the rules chosen.** Limits now follow Reg NMS Rule 612
  tick sizes and the NYSE Limit Order Price Protection tiers (AC-6, AC-7). They replace a flat
  ±10 % band that was stricter on the passive side and looser on the aggressive side than real
  venues. Not covered: LULD bands, halts and auctions (non-goals), and Nasdaq's own thresholds,
  which differ in detail from NYSE's. The tiers are configurable.
- **Where the check runs.** The check is in the venue, so the trader learns of a bad limit from a
  REJ with the reason, not before sending. The approved proposal settled this (the open question
  was resolved, and the human approved it). An OMS pre-trade check is a candidate follow-up (below).

No material gap between the goal and what was built, given the scope the requester approved.

## Policy Review

Reviewed against the working tree. The ticket's diff spans commit `7a89621` (which swept in a
mid-work snapshot) and the uncommitted changes after it.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contract files added or changed; no `src/main/openapi`/`avro` in the simulator |
| P-02 | Specification before code, generated models only | N/A | No API or message change; Alpha Vantage JSON parsed inside the client as in oms-ui |
| P-03 | Never edit generated code | PASS | Nothing under `build/generated*` touched |
| P-04 | Contracts evolve compatibly | N/A | No contract change |
| P-05 | Every state change is recorded in the event log | N/A | oms-core untouched; rejects reach it through the existing `OrderRejectCmd` path |
| P-06 | Kafka only through the transactional outbox | N/A | oms-core rule; the simulator's `CommandGateway` is unchanged by this ticket |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database |
| P-08 | Concurrency and idempotency are explicit | PASS | Lookup happens only in `ExchangeEngine#newOrder` (first sight of UNACK), so redelivery triggers no second lookup or answer; cache is a `ConcurrentHashMap`; back-off fields `volatile`; commandIds unchanged |
| P-09 | Commands and queries stay separate | N/A | No API |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No oms-core state change |
| P-11 | Layering and conventions | PASS | `marketdata` package mirrors oms-ui's; constructor injection; `@ConfigurationProperties` record; `@Configuration` wiring; Lombok `@Slf4j` |
| P-12 | Jackson 3 only | PASS | `tools.jackson.databind.json.JsonMapper`; no `com.fasterxml` import added (auto R03 passed) |
| P-13 | Errors and validation follow the framework specs | PASS | No REST API. Provider failures are mapped to fallbacks, logged (type only) and counted, never swallowed silently; every order is still answered |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Each slice was red before green (skeletons throwing `UnsupportedOperationException`, then implementation); every AC maps to tests above |
| P-15 | Observability | PASS | New counter `simulator.reference.price.lookups{source,outcome}`; provider calls logged with function and latency; engine logs keep `orderId` in MDC; no `System.out` (auto R08 passed) |
| P-16 | Security | PASS | Key only from env, `toString` hides it, URI-variable encoding, never logged or forwarded (AC-8 tests); test base blanks `ALPHAVANTAGE_*` so a developer's real key is never used by tests |
| P-17 | Simplicity and dependencies | PASS | No dependency or `build.gradle` change; ~150 lines copied from oms-ui instead of a new shared module (decision recorded); compose env pass-through recorded in design (R10 warning addressed) |
| P-18 | Modules build standalone | PASS | Only oms-exchange-simulator code; its `./gradlew check` passes; no contract change, so no consumer impact |
| P-19 | Documentation follows behaviour | PASS | Exchange Simulator page §4.1/§4.2/§5/§6/§7, capability page, FR-027 + index, order lifecycle, market data API, storyboard step and module README updated; `okf-check` 0 errors |

## Independent Review

The spec-reviewer agent judged the goal **met**: AC-1 to AC-3 and AC-5 to AC-9 proven, AC-4 "weak"
because the timeout clause had no test. Its findings and what was done:

1. **[major] A LIMIT at 0 or a negative price was accepted and rested.** This was a regression
   against the old band, and oms-core only checks that a price is present. **Fixed** (T-13):
   `OrderEvaluator` rejects `price ≤ 0` with `Invalid limit price <p>` before the tick check; test
   `OrderEvaluatorTest#nonPositiveLimit_rejected` failed first, then passed. Added to the KB reject
   table.
2. **[minor] AC-4's read-timeout clause had no test.** **Fixed** (T-14):
   `AlphaVantageQuoteClientTest#readTimeout_isUnreachable`. It passed at once, so the behaviour was
   already right; only its proof was missing.
3. **[minor] An `Error Message` answer starts the 60 s back-off for every symbol.** **Not changed,
   by design.** For `GLOBAL_QUOTE`, Alpha Vantage answers an unknown symbol with an empty
   `Global Quote` (AC-3), not with `Error Message`. That member means the call itself is bad (bad
   key, bad function), so every symbol would fail alike, and backing off is right. During the
   back-off, static symbols still trade.
4. **[minor] An unexpected RuntimeException could escape onto the engine thread.** **Fixed**
   (T-14): `ReferencePriceService` catches it, logs the type only and falls back as UNREACHABLE;
   `#unexpectedFailure_fallsBackAsUnreachable` failed first, then passed.
5. **[minor] The AC-9 integration test asserts `>= 1`, not exact counts.** **Accepted as is.** The
   Spring context and its registry are shared across the class's tests, so exact deltas would
   couple the tests to their order. Exact counts per source and outcome are asserted in
   `ReferencePriceServiceTest#lookupsCountedBySourceAndOutcome` and the AC-4 unit tests; the
   integration test proves that the series reach `/actuator/prometheus`.
6. **[minor] verification.md unfilled.** The reviewer read it before this draft was written; now
   complete.

## Automated Evidence

`evidence/last-run.json`: ran 2026-11-25T05:07:10Z, after the last code change; result **pass**;
modules oms-exchange-simulator and oms-knowledge-base. Policy check (changes since merge-base
`7a89621a`): 0 errors, 1 warning (R10 on `docker-compose.yml`, decision recorded in design.md →
Alternatives & Decisions). Command: oms-exchange-simulator `./gradlew check`, exit 0 after 58 s, a
full run with fresh test results (117 tests, 0 failures, 0 skipped); log
`evidence/oms-exchange-simulator-1.log`.

## Follow-ups

- **OMS pre-trade limit check** in oms-core or order entry, so a bad limit is caught before it is
  sent (needs market data in oms-core). Out of scope by the approved proposal.
- **Shared Alpha Vantage client.** oms-ui's `AlphaVantageProvider` and the simulator's
  `AlphaVantageQuoteClient`/`TtlCache` are deliberate copies. If a third user appears, extract a
  small library module.
- **Storyboard illustration** `storyboards/order-lifecycle/place-and-fill-order/assets/venue-accepts-venue-rejects.excalidraw.svg`
  still says "band"; redraw it in Excalidraw (the step text is updated).
- **`oms-exchange-simulator/build.gradle` header comment** still says the simulator evaluates orders
  "against static reference prices". It was left alone so the build file stays out of this diff;
  update it with the next build change.
- **Mid-ticket commit.** `7a89621` contains a partial snapshot of this ticket. The commit for
  SPEC-0073 should take the remaining working-tree changes.

## Verdict

Verdict: GOAL MET
