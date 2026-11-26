# oms-price-service

Price and reference data for the other OMS services (SPEC-0079). The only holder of the market data
provider's key (Alpha Vantage) and the only caller of the provider. It serves the Market Data API
(`oms-contracts/src/main/openapi/oms-marketdata-api.yml`) on port **8098**.

- **Instrument search:** from a local instrument list, refreshed daily with one `LISTING_STATUS`
  request; never a live call.
- **Quotes:** live within a request budget (25 a day, 5 a minute by default), cached for 15 min.
  Otherwise the last known close from the end-of-day store (`source: END_OF_DAY`).
- **End-of-day closes:** from the seed, from operator CSVs in `<data-dir>/eod/`
  (`symbol,date,close[,previousClose[,currency]]`), and from every live quote.

Full description, configuration and metrics:
[Price Service](../oms-knowledge-base/architecture/context/price-service.md).

## Build and run

```bash
./gradlew build                 # tests included
./gradlew bootRun               # http://localhost:8098, data in ./data
```

Set `ALPHAVANTAGE_API_KEY` for live prices; without it, quotes are end-of-day closes. In docker
compose the service is `price-service`, with its data in the volume `price-data` (`/data`). Build
the jar first (`./gradlew bootJar`): the image copies it from `build/libs`.

```bash
curl 'http://localhost:8098/api/market-data/instruments?query=micro'
curl http://localhost:8098/api/market-data/quotes/MSFT
curl http://localhost:8098/actuator/prometheus | grep oms_price
```
