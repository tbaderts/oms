# Tasks — SPEC-0073: Use Alpha Vantage data in exchange simulator

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

- [x] **T-1** Add `LimitPriceRules` (Rule 612 tick, collar tiers) test-first (AC-6, AC-7)
  - files: oms-exchange-simulator/src/main/java/org/example/simulator/engine/LimitPriceRules.java, oms-exchange-simulator/src/test/java/org/example/simulator/engine/LimitPriceRulesTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew test --tests 'org.example.simulator.engine.LimitPriceRulesTest'` passes
- [x] **T-2** Add `price-collar`, `quote-ttl`, `provider-backoff`, `alpha-vantage` to `SimulatorProperties` and `application.yml`; remove `price-band-percent` (AC-4, AC-5, AC-7)
  - files: oms-exchange-simulator/src/main/java/org/example/simulator/config/SimulatorProperties.java, oms-exchange-simulator/src/main/resources/application.yml
  - verify: `cd oms-exchange-simulator && ./gradlew compileJava` succeeds and `application.yml` has no `price-band-percent`
- [x] **T-3** Introduce `ReferencePrices`; make `OrderEvaluator` use it and apply tick then collar instead of the band; rewrite band tests (AC-6, AC-7)
  - files: oms-exchange-simulator/src/main/java/org/example/simulator/marketdata/ReferencePrices.java, oms-exchange-simulator/src/main/java/org/example/simulator/engine/OrderEvaluator.java, oms-exchange-simulator/src/test/java/org/example/simulator/engine/OrderEvaluatorTest.java, oms-exchange-simulator/src/test/java/org/example/simulator/engine/ExchangeEngineTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew test --tests 'org.example.simulator.engine.*'` passes, incl. `OrderEvaluatorTest#subPennyLimitAboveOneDollar_rejected`, `#fourDecimalLimitBelowOneDollar_accepted_fiveDecimalsRejected`, `#buyCollar_perTier`, `#sellCollar_perTier`, `#passiveBuyFarBelowReference_acceptedAndRests`
- [ ] **T-4** Add `AlphaVantageQuoteClient` and `ProviderUnavailableException` test-first: GLOBAL_QUOTE, not found, rate limit, errors, key never logged (AC-1, AC-3, AC-4, AC-8)
  - files: oms-exchange-simulator/src/main/java/org/example/simulator/marketdata/AlphaVantageQuoteClient.java, oms-exchange-simulator/src/main/java/org/example/simulator/marketdata/ProviderUnavailableException.java, oms-exchange-simulator/src/test/java/org/example/simulator/marketdata/AlphaVantageQuoteClientTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew test --tests 'org.example.simulator.marketdata.AlphaVantageQuoteClientTest'` passes
- [ ] **T-5** Add `TtlCache` and `ReferencePriceService` (cache, provider, static fallback, back-off) test-first (AC-2, AC-4, AC-5)
  - files: oms-exchange-simulator/src/main/java/org/example/simulator/marketdata/TtlCache.java, oms-exchange-simulator/src/main/java/org/example/simulator/marketdata/ReferencePriceService.java, oms-exchange-simulator/src/test/java/org/example/simulator/marketdata/ReferencePriceServiceTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew test --tests 'org.example.simulator.marketdata.ReferencePriceServiceTest'` passes, incl. `#providerPriceWinsOverStaticPrice`, `#notConfigured_usesStaticWithoutRequest`, `#rateLimited_fallsBackToStatic`, `#unreachable_fallsBackToStatic`, `#unavailableAndNotStatic_isEmpty`, `#backoff_skipsProviderUntilItExpires`, `#cachedWithinTtl_noSecondRequest_refetchedAfterTtl`, `#notFoundIsCachedToo`
- [ ] **T-6** Count lookups in `SimulatorMetrics` as `simulator.reference.price.lookups{source,outcome}` test-first (AC-9)
  - files: oms-exchange-simulator/src/main/java/org/example/simulator/metrics/SimulatorMetrics.java, oms-exchange-simulator/src/main/java/org/example/simulator/marketdata/ReferencePriceService.java, oms-exchange-simulator/src/test/java/org/example/simulator/marketdata/ReferencePriceServiceTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew test --tests 'org.example.simulator.marketdata.ReferencePriceServiceTest.lookupsCountedBySourceAndOutcome'` passes
- [ ] **T-7** Wire `MarketDataConfiguration` (RestClient timeouts, Clock, startup log without key); isolate integration tests from a real key in `AbstractKafkaIntegrationTest`; add the collar Kafka test (AC-4, AC-7)
  - files: oms-exchange-simulator/src/main/java/org/example/simulator/marketdata/MarketDataConfiguration.java, oms-exchange-simulator/src/test/java/org/example/simulator/AbstractKafkaIntegrationTest.java, oms-exchange-simulator/src/test/java/org/example/simulator/kafka/ExchangeSimulatorKafkaIntegrationTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew test --tests 'org.example.simulator.kafka.ExchangeSimulatorKafkaIntegrationTest'` passes, incl. `#limitThroughCollar_rejected` and the existing no-key tests
- [ ] **T-8** Add `StubAlphaVantage` and `AlphaVantageKafkaIntegrationTest` end to end (AC-1, AC-2, AC-3, AC-4, AC-5, AC-8, AC-9)
  - files: oms-exchange-simulator/src/test/java/org/example/simulator/marketdata/StubAlphaVantage.java, oms-exchange-simulator/src/test/java/org/example/simulator/kafka/AlphaVantageKafkaIntegrationTest.java
  - verify: `cd oms-exchange-simulator && ./gradlew test --tests 'org.example.simulator.kafka.AlphaVantageKafkaIntegrationTest'` passes: fill at provider price, unknown reject, rate-limit fallback, one request per symbol within TTL, no key in commands or logs, metric on `/actuator/prometheus`
- [ ] **T-9** Pass `ALPHAVANTAGE_API_KEY` and `ALPHAVANTAGE_BASE_URL` to the simulator in `docker-compose.yml` (AC-1)
  - files: docker-compose.yml
  - verify: `docker compose config` succeeds and shows both variables under the `oms-exchange-simulator` environment
- [ ] **T-10** Run the module's full check (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9)
  - files: (none)
  - verify: `cd oms-exchange-simulator && ./gradlew check` passes
- [ ] **T-11** Update the knowledge base and the simulator README (P-19)
  - files: oms-knowledge-base/architecture/context/exchange-simulator.md, oms-knowledge-base/capabilities/exchange-simulation.md, oms-knowledge-base/domain/concepts/order-lifecycle.md, oms-knowledge-base/domain/interfaces/market-data-api.md, oms-exchange-simulator/README.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports no errors, and grep for `price-band` in those files finds nothing
- [ ] **T-12** Run spec verify
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0073` exits 0

## Notes

T-2 and T-3 change constructors used by existing tests; T-3 adapts them so the module compiles
again. T-8 depends on T-7's isolation of the base integration test.
