# Tasks — SPEC-0079: Add price service with static fallback data

> **Stage 3 of 3 — the executable plan.** The implement stage works top to bottom and ticks each
> box only when its `verify:` check passes. Keep tasks small (one focused change, about one
> red→green cycle) and in dependency order:
>
> 1. Contracts (oms-contracts) and regeneration
> 2. Migration (new Liquibase changelog)
> 3. Behaviour, one task per AC or slice: write the failing test, implement, make it green
> 4. Wiring: API, messaging, configuration
> 5. Observability (logs, metrics)
> 6. Knowledge base and docs
> 7. Full verification (`spec verify`)
>
> Format, which the gate parses:
>
> ```
> - [ ] **T-1** Imperative summary (AC-1, AC-2)
>   - files: path/one.java, path/two.yaml
>   - verify: `./gradlew test --tests 'org.example.oms…SomeTest'` passes
> ```
>
> Every AC must be covered by at least one task, and every task needs a `verify:` line. Tasks may
> be added during implementation; record why under Notes.

## Tasks

- [x] **T-0** Confirm the human-added spec config for the new module, then add it to the ticket (AC-12)
  - files: specs/config.json (human), ticket modules via `spec set`
  - verify: `node -e "const c=require('./specs/config.json');process.exit(c.modules['oms-price-service']&&c.modules['oms-contracts'].impacts.includes('oms-price-service')?0:1)"` exits 0, then `node specs/tools/spec.mjs set SPEC-0079 modules oms-contracts,oms-price-service,oms-ui,oms-exchange-simulator,oms-knowledge-base` succeeds
- [x] **T-1** Add `END_OF_DAY` and `REFERENCE_DATA` to `MarketDataSource`, bump the spec's minor version and regenerate (AC-4, AC-1)
  - files: oms-contracts/src/main/openapi/oms-marketdata-api.yml
  - verify: `cd oms-contracts && ./gradlew build` passes and `MarketDataSource.END_OF_DAY` / `REFERENCE_DATA` exist in the generated jar
- [x] **T-2** Scaffold `oms-price-service`: build, settings, wrapper, Dockerfile, application, `openApiGenerateMarketData`, root `includeBuild` (AC-8)
  - files: oms-price-service/{build.gradle,settings.gradle,gradlew,gradlew.bat,gradle/wrapper/*,Dockerfile,README.md}, oms-price-service/src/main/java/org/example/price/PriceServiceApplication.java, oms-price-service/src/main/resources/application.yml, settings.gradle, oms-price-service/src/test/java/org/example/price/PriceServiceApplicationTest.java
  - verify: `cd oms-price-service && ./gradlew test --tests 'org.example.price.PriceServiceApplicationTest'` passes (context loads)
- [x] **T-3** `Csv` line splitter, test first (AC-6, AC-2)
  - files: oms-price-service/src/main/java/org/example/price/util/Csv.java, oms-price-service/src/test/java/org/example/price/util/CsvTest.java
  - verify: `cd oms-price-service && ./gradlew test --tests 'org.example.price.util.CsvTest'` passes
- [x] **T-4** `RequestBudget` (daily window to 00:00 UTC, sliding per-minute window, `exhaust`, `remainingToday`), test first (AC-4, AC-5)
  - files: oms-price-service/src/main/java/org/example/price/budget/RequestBudget.java, oms-price-service/src/test/java/org/example/price/budget/RequestBudgetTest.java
  - verify: `cd oms-price-service && ./gradlew test --tests 'org.example.price.budget.RequestBudgetTest'` passes
- [x] **T-5** Move the Alpha Vantage provider: `MarketDataProvider`, `ProviderUnavailableException`, `AlphaVantageProvider` with `quote` and new `listings()` (`LISTING_STATUS` CSV), `TtlCache`, `StubAlphaVantage` with `LISTING_STATUS`; tests first (AC-2, AC-3, AC-11)
  - files: oms-price-service/src/main/java/org/example/price/provider/*.java, oms-price-service/src/main/java/org/example/price/util/TtlCache.java, oms-price-service/src/test/java/org/example/price/provider/{AlphaVantageProviderTest,StubAlphaVantage}.java, oms-price-service/src/test/java/org/example/price/util/TtlCacheTest.java
  - verify: `cd oms-price-service && ./gradlew test --tests 'org.example.price.provider.*' --tests 'org.example.price.util.TtlCacheTest'` passes, including key-never-logged and JSON-instead-of-CSV is `RATE_LIMITED`
- [x] **T-6** `InstrumentCatalog` with seed `instruments.csv`, ranked search, atomic `replace`, `age`; test first (AC-1)
  - files: oms-price-service/src/main/java/org/example/price/reference/InstrumentCatalog.java, oms-price-service/src/main/resources/seed/instruments.csv, oms-price-service/src/test/java/org/example/price/reference/InstrumentCatalogTest.java
  - verify: `cd oms-price-service && ./gradlew test --tests 'org.example.price.reference.InstrumentCatalogTest'` passes (incl. the 12,000-instrument bound)
- [x] **T-7** `ReferenceDataRefresher`: one `LISTING_STATUS` per interval within budget, keep the list on failure; test first (AC-2)
  - files: oms-price-service/src/main/java/org/example/price/reference/ReferenceDataRefresher.java, oms-price-service/src/test/java/org/example/price/reference/ReferenceDataRefresherTest.java
  - verify: `cd oms-price-service && ./gradlew test --tests 'org.example.price.reference.ReferenceDataRefresherTest'` passes
- [x] **T-8** `EndOfDayStore`: seed, operator `eod/*.csv`, `learned-closes.csv`, precedence, malformed-row logging, `reloadIfChanged`, `record`; test first (AC-6, AC-7)
  - files: oms-price-service/src/main/java/org/example/price/eod/{EndOfDayStore,Close}.java, oms-price-service/src/main/resources/seed/eod-prices.csv, oms-price-service/src/test/java/org/example/price/eod/EndOfDayStoreTest.java
  - verify: `cd oms-price-service && ./gradlew test --tests 'org.example.price.eod.EndOfDayStoreTest'` passes
- [x] **T-9** `PriceService` (search from the catalog; quote via cache, single flight, budget, provider, write-back, EOD fallback with notice) and metrics; unit test first (AC-1, AC-3, AC-4, AC-5, AC-7, AC-13)
  - files: oms-price-service/src/main/java/org/example/price/service/PriceService.java, oms-price-service/src/test/java/org/example/price/service/PriceServiceTest.java
  - verify: `cd oms-price-service && ./gradlew test --tests 'org.example.price.service.PriceServiceTest'` passes
- [x] **T-10** Wire the API: `PriceProperties`, `PriceConfiguration`, `MarketDataController`, `PriceExceptionHandler`; `PriceServiceApiTest` against `StubAlphaVantage` (AC-1, AC-3, AC-4, AC-5, AC-7, AC-8, AC-11, AC-13)
  - files: oms-price-service/src/main/java/org/example/price/{config,api}/*.java, oms-price-service/src/main/resources/application.yml, oms-price-service/src/test/java/org/example/price/api/PriceServiceApiTest.java
  - verify: `cd oms-price-service && ./gradlew test --tests 'org.example.price.api.PriceServiceApiTest'` passes
- [x] **T-11** oms-ui backend: `PriceServiceClient`, controller delegating, 503 Problem; remove the Alpha Vantage provider, built-in data, service, cache and their tests and properties; `ConfigurationHasNoProviderKeyTest` (AC-10, AC-11)
  - files: oms-ui/src/main/java/org/example/omsui/marketdata/*.java, oms-ui/src/main/resources/application.yml, oms-ui/src/test/java/org/example/omsui/marketdata/{MarketDataControllerTest,PriceServiceClientTest,ConfigurationHasNoProviderKeyTest}.java
  - verify: `cd oms-ui && ./gradlew test --tests 'org.example.omsui.marketdata.*'` passes and no `AlphaVantage` class remains in oms-ui
- [x] **T-12** oms-ui frontend: `END_OF_DAY` / `REFERENCE_DATA` types, "End-of-day close" label with date, 503 notice test (AC-10)
  - files: oms-ui/frontend/src/services/MarketDataService.ts, oms-ui/frontend/src/services/MarketDataService.test.ts, oms-ui/frontend/src/components/OrderEntry.tsx, oms-ui/frontend/src/components/OrderEntry.test.tsx
  - verify: `cd oms-ui/frontend && CI=true npx react-scripts test --watchAll=false src/services/MarketDataService src/components/OrderEntry` passes and `npx tsc --noEmit --ignoreDeprecations 6.0` exits 0
- [x] **T-13** Simulator: `PriceServiceQuoteClient`, `ReferencePriceService` source rename, `SimulatorProperties.priceService`, remove Alpha Vantage client/config; `StubPriceService`, `PriceServiceQuoteClientTest`, `ReferencePriceServiceTest`, `PriceServiceKafkaIntegrationTest`, `ConfigurationHasNoProviderKeyTest` (AC-9, AC-11)
  - files: oms-exchange-simulator/src/main/java/org/example/simulator/marketdata/*.java, oms-exchange-simulator/src/main/java/org/example/simulator/config/SimulatorProperties.java, oms-exchange-simulator/src/main/resources/application.yml, oms-exchange-simulator/src/test/java/org/example/simulator/{marketdata,kafka}/*.java, oms-exchange-simulator/src/test/java/org/example/simulator/AbstractKafkaIntegrationTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew test` passes and no `AlphaVantage` class remains in the simulator
- [x] **T-14** Compose: `price-service` service and `price-data` volume; oms-ui and simulator get the price service URL and lose the Alpha Vantage variables; `ComposeEnvironmentTest` (AC-11)
  - files: docker-compose.yml, oms-price-service/src/test/java/org/example/price/ComposeEnvironmentTest.java
  - verify: `docker compose config --quiet` exits 0 and `cd oms-price-service && ./gradlew test --tests 'org.example.price.ComposeEnvironmentTest'` passes
- [x] **T-15** Knowledge base: price service Component page, provider assessment, and the updated market data API, exchange simulator, oms-ui, order entry, docker stack and exchange-simulation pages; indexes and log; module READMEs (AC-12)
  - files: oms-knowledge-base/architecture/context/price-service.md, oms-knowledge-base/architecture/assessments/market-data-providers-2026-11.md, oms-knowledge-base/domain/interfaces/market-data-api.md, oms-knowledge-base/architecture/context/{exchange-simulator,oms-ui}.md, oms-knowledge-base/ui/order-entry.md, oms-knowledge-base/infrastructure/local-docker-stack.md, oms-knowledge-base/capabilities/exchange-simulation.md, oms-knowledge-base/log.md, oms-ui/README.md, oms-exchange-simulator/README.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports 0 errors and no page outside `specs/` and `log.md` still says oms-ui or the simulator calls Alpha Vantage
- [x] **T-16** Run spec verify (all ACs)
  - files: —
  - verify: `node specs/tools/spec.mjs verify SPEC-0079` exits 0

## Notes

- **T-0 is a precondition.** Agents cannot edit `specs/config.json`, so the `oms-price-service`
  module entry (`verify: ["./gradlew check"]`) and its addition to `oms-contracts.impacts` come
  from a human.
  - Without them `spec verify` would not build the new module, and AC evidence for it would be
    missing.
  - If they are absent when implementation starts, the ticket is blocked with that reason.
- **Order.** T-1 must precede T-2 and T-11 to T-13, which use the new enum values. T-5 moves
  `StubAlphaVantage` out of the simulator into the price service, so T-13 replaces the simulator's
  use of it with `StubPriceService`.
- **Shared tree.** A peer session (SPEC-0078) may stop the compose stack. Nothing here needs the
  running stack: T-14 only validates `docker compose config`.

**Implementation notes (2026-11-26):**
- **T-0.** The ticket was unblocked at 13:19 without the config entry. T-1 to T-15 went ahead
  because none of them needs it. T-0 stays unticked, and T-16 waits for it.
- **Scheduling.** The refresher and the end-of-day reload run from a separate `PriceSchedule`
  bean, switched off with `oms.price.reference.scheduled=false`. That keeps scheduled
  `LISTING_STATUS` requests out of tests that count requests. Small and local.
- **HTTP client.** `PriceConfiguration` uses the static `RestClient.builder()`, as oms-ui and the
  simulator do, rather than an injected builder (Boot 4 provides none without an extra starter).
  The design's P-15 note about the instrumented builder is therefore moot.
- **Simulator reasons.** `ProviderUnavailableException` loses `RATE_LIMITED`: the price service
  never rate-limits its callers, because rate limits are handled behind it. Its metric outcome and
  the KB page say so.
- **AC-11 test.** `ConfigurationHasNoProviderKeyTest` exists in oms-ui and in the simulator, as
  designed. oms-ui's `MarketDataControllerTest#noProviderKeyIsConfiguredOrShown` also checks the
  running context.
- **New KB pages.** The page list grew by `architecture/context/system-context.md` (the new
  component), `capabilities/functional-requirements/FR-027` and its index (the description), one
  storyboard step, and `oms-price-service/README.md` (planned in T-2, written in T-15).
