# Tasks — SPEC-0072: Add an order entry tab to oms-ui

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

- [x] **T-1** oms-contracts: `oms-marketdata-api.yml`, model task `openApiGenerateMarketDataModels` (`org.example.common.model.marketdata`), oms-ui in `verifyContracts` (AC-5, AC-6)
  - files: oms-contracts/src/main/openapi/oms-marketdata-api.yml, oms-contracts/build.gradle
  - verify: `cd oms-contracts && ./gradlew clean build` passes and the jar contains `org/example/common/model/marketdata/Quote.class`
- [x] **T-2** oms-ui build consumes the contracts: `includeBuild('../oms-contracts')`, the contracts dependency, the openapi generator plugin and `openApiGenerateMarketData` (apis only) wired before `compileJava` (AC-5, AC-6)
  - files: oms-ui/settings.gradle, oms-ui/build.gradle
  - verify: `cd oms-ui && ./gradlew compileJava -x buildReact -x copyReactBuild` passes and `build/generated/src/main/java/org/example/common/api/MarketDataApi.java` exists
- [x] **T-3** `TtlCacheTest` first, then `TtlCache` (AC-8)
  - files: oms-ui/src/test/java/org/example/omsui/marketdata/TtlCacheTest.java, oms-ui/src/main/java/org/example/omsui/marketdata/TtlCache.java
  - verify: `cd oms-ui && ./gradlew test -x buildReact -x copyReactBuild --tests 'org.example.omsui.marketdata.TtlCacheTest'` passes
- [x] **T-4** `AlphaVantageProviderTest` (MockRestServiceServer, recorded JSON: search, quote, empty quote, `Note`/`Information`, HTTP error, no key; the key never in a log line) first, then `MarketDataProvider`, `ProviderUnavailableException`, `AlphaVantageProvider` (AC-5, AC-6, AC-7)
  - files: oms-ui/src/test/java/org/example/omsui/marketdata/AlphaVantageProviderTest.java, oms-ui/src/main/java/org/example/omsui/marketdata/MarketDataProvider.java, oms-ui/src/main/java/org/example/omsui/marketdata/ProviderUnavailableException.java, oms-ui/src/main/java/org/example/omsui/marketdata/AlphaVantageProvider.java
  - verify: `cd oms-ui && ./gradlew test -x buildReact -x copyReactBuild --tests 'org.example.omsui.marketdata.AlphaVantageProviderTest'` passes
- [x] **T-5** `MarketDataServiceTest` first (cache hit/miss/expiry, fallbacks not cached, built-in filtering and quote, notices, 404), then `BuiltInMarketData`, `MarketDataProperties`, `MarketDataService`, metrics (AC-7, AC-8)
  - files: oms-ui/src/test/java/org/example/omsui/marketdata/MarketDataServiceTest.java, oms-ui/src/main/java/org/example/omsui/marketdata/BuiltInMarketData.java, oms-ui/src/main/java/org/example/omsui/marketdata/MarketDataProperties.java, oms-ui/src/main/java/org/example/omsui/marketdata/MarketDataService.java
  - verify: `cd oms-ui && ./gradlew test -x buildReact -x copyReactBuild --tests 'org.example.omsui.marketdata.MarketDataServiceTest'` passes
- [x] **T-6** `MarketDataControllerTest` (web-mvc: search, quote, 404, 400, fallbacks, key in no response) and `ConfigControllerTest` (session id offered, no key) first, then `MarketDataController implements MarketDataApi`, `application.yml` settings, `ConfigController` `orderEntry.sessionId` (AC-5, AC-6, AC-7)
  - files: oms-ui/src/test/java/org/example/omsui/marketdata/MarketDataControllerTest.java, oms-ui/src/test/java/org/example/omsui/controller/ConfigControllerTest.java, oms-ui/src/main/java/org/example/omsui/marketdata/MarketDataController.java, oms-ui/src/main/java/org/example/omsui/controller/ConfigController.java, oms-ui/src/main/resources/application.yml
  - verify: `cd oms-ui && ./gradlew test -x buildReact -x copyReactBuild` passes
- [x] **T-7** Frontend ticket model: `orderTicket.test.ts` first (validation rules, command mapping per order type, clOrdId rule, field-error mapping, duplicate recognition), then `services/orderTicket.ts` (AC-1, AC-2, AC-3, AC-4)
  - files: oms-ui/frontend/src/services/orderTicket.test.ts, oms-ui/frontend/src/services/orderTicket.ts
  - verify: `cd oms-ui/frontend && CI=true npx react-app-rewired test --watchAll=false orderTicket` passes
- [x] **T-8** Frontend services: tests first, then `MarketDataService.ts` (search, quote, unavailable → notice), `OMSApiService.createOrder` and `findOrderByClOrdId`, `ConfigService` `orderEntry.sessionId` (AC-1, AC-4, AC-5, AC-6, AC-7)
  - files: oms-ui/frontend/src/services/MarketDataService.ts, oms-ui/frontend/src/services/MarketDataService.test.ts, oms-ui/frontend/src/services/OMSApiService.ts, oms-ui/frontend/src/services/OMSApiService.test.ts, oms-ui/frontend/src/services/ConfigService.ts
  - verify: `cd oms-ui/frontend && CI=true npx react-app-rewired test --watchAll=false MarketDataService OMSApiService` passes
- [x] **T-9** Order Entry tab: `OrderEntry.test.tsx` first (the AC-1 to AC-7 cases in the design), then `components/OrderEntry.tsx`, `OrderEntry.scss`, the `orderEntry` tab in `App.tsx` (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7)
  - files: oms-ui/frontend/src/components/OrderEntry.test.tsx, oms-ui/frontend/src/components/OrderEntry.tsx, oms-ui/frontend/src/components/OrderEntry.scss, oms-ui/frontend/src/App.tsx
  - verify: `cd oms-ui/frontend && CI=true npx react-app-rewired test --watchAll=false` passes and `npx tsc --noEmit -p . --ignoreDeprecations 6.0` reports nothing
- [x] **T-10** Docker: oms-contracts as the named build context of the oms-ui image (compose `additional_contexts`, `COPY --from=oms-contracts`, `oms-contracts/.dockerignore`), `ALPHAVANTAGE_API_KEY` and `OMS_UI_SESSION_ID` passed through (AC-7)
  - files: docker-compose.yml, oms-ui/Dockerfile, oms-contracts/.dockerignore
  - verify: `docker buildx build --build-context oms-contracts=./oms-contracts -t oms-ui:latest --load oms-ui` succeeds (what compose runs; compose's own Bake run asks for an interactive `fs.read` grant on this host, with or without this change)
- [x] **T-11** Knowledge base and docs: order entry UI page, market data interface page (+ interfaces index), command-api client note, local Docker stack settings, `log.md`, `oms-ui/README.md` (AC-1, AC-5, AC-7)
  - files: oms-knowledge-base/ui/order-entry.md, oms-knowledge-base/ui/admin-ui.md, oms-knowledge-base/domain/interfaces/market-data-api.md, oms-knowledge-base/domain/interfaces/index.md, oms-knowledge-base/domain/interfaces/command-api.md, oms-knowledge-base/infrastructure/local-docker-stack.md, oms-knowledge-base/log.md, oms-ui/README.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports 0 errors
- [x] **T-12** End-to-end on the running stack: rebuild oms-ui, submit a LIMIT order from the Order Entry tab, see it in the Orders blotter and in `/api/query/search?clOrdId=…` (AC-1)
  - verify: the order id and the search result are recorded in verification.md
- [x] **T-13** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0072` exits 0

## Notes

- oms-ui's frontend build runs inside `./gradlew build`; backend tasks skip it with
  `-x buildReact -x copyReactBuild` for speed. `spec verify` runs the full build.
- T-12 needs the local stack (oms-core, simulator, oms-ui) running with current images; if Docker
  is unavailable, block with that reason rather than skip.
- Added in T-5/T-6: `MarketDataConfiguration` (beans; the provider's timeouts are set here, since
  setting them in the provider replaced the test server's request factory) and
  `MarketDataExceptionHandler` (constraint violations → 400 Problem, as oms-core answers them).
