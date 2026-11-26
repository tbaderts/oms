---
type: Component
title: "Price Service"
description: "Owns market data for the other services: instrument search from a local list, quotes from Alpha Vantage within a request budget, and end-of-day closes from files as the fallback."
tags: [component, price-service, market-data, alpha-vantage, reference-data]
status: draft
updated: "2026-11-26T15:00:00Z"
component: "price-service"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-26T15:00:00Z" }
sources:
  - resource: "repo:oms-price-service/src/main/java/org/example/price/service/PriceService.java"
  - resource: "repo:oms-price-service/src/main/java/org/example/price/budget/RequestBudget.java"
  - resource: "repo:oms-price-service/src/main/java/org/example/price/reference/InstrumentCatalog.java"
  - resource: "repo:oms-price-service/src/main/java/org/example/price/reference/ReferenceDataRefresher.java"
  - resource: "repo:oms-price-service/src/main/java/org/example/price/eod/EndOfDayStore.java"
  - resource: "repo:oms-price-service/src/main/java/org/example/price/provider/AlphaVantageProvider.java"
  - resource: "repo:oms-price-service/src/main/resources/application.yml"
  - resource: "repo:oms-contracts/src/main/openapi/oms-marketdata-api.yml"
  - resource: "repo:tools/stooq-eod/stooq_eod.py"
---
# Price Service

`oms-price-service` (port **8098**) owns market data for the other services (SPEC-0079). It holds
the market data provider's key and the only cache of its answers. It serves the
[Market Data API](../../domain/interfaces/market-data-api.md) to
[oms-ui](oms-ui.md), for order entry, and to the [Exchange Simulator](exchange-simulator.md), for
reference prices. Neither of those calls a provider any more. Context:
[System Context](system-context.md).

## 1. Why it exists

Alpha Vantage's free key allows **25 requests a day and 5 a minute**. Real-time and 15-minute-delayed
US quotes are premium-only, so free quotes are end-of-day-level data anyway. Before this service,
oms-ui and the simulator each spent the same quota through their own clients:
- every new search term cost a `SYMBOL_SEARCH`;
- a symbol was quoted twice, once for the trader and once for the venue.

Once the quota ran out, only five hard-coded symbols were left. The choice of provider is recorded
in [Market Data Providers (2026-11)](../assessments/market-data-providers-2026-11.md).

## 2. How it answers

| Request | Answer |
|---|---|
| Instrument search | From the **instrument list**, never the provider: `source: REFERENCE_DATA` |
| Quote, cached | The live answer from the last `quote-ttl` (default 15 min), "no quote" included |
| Quote, budget left | One `GLOBAL_QUOTE` request: `source: ALPHA_VANTAGE`. The price is also kept as that day's close |
| Quote, no live price | The **end-of-day store's** close: `source: END_OF_DAY`, `last` = close, `asOf` = its date, `previousClose`, `change`, and a `notice` saying why |
| Nobody prices it | 404 Problem+JSON |

**When a quote falls back to the end-of-day close**, the notice says why:
- no key is configured;
- the budget is spent;
- the provider is rate limited (a 200 with `Note` or `Information`);
- the provider is unreachable;
- the provider has no quote for the symbol (no notice in this case).

End-of-day answers are not cached, so live prices come back as soon as budget allows.
- **One request per symbol.** Cache misses for one symbol are served one at a time, so several
  callers asking for it cost one request; other symbols are not held up.
- **No request for unknowns.** A blank symbol costs nothing, and neither does a symbol missing from
  a downloaded listing: it is answered from the store, or 404.
- **Demo prices say so.** A close from the seed carries the notice "demo price from the seed data,
  not a market close".
- **Timeouts.** Provider calls give up after connect 1 s and read 2 s, below the exchange
  simulator's 3 s read timeout. A slow provider still leaves time to answer from the store.

### Request budget

`RequestBudget` counts the service's own provider requests:
- **Daily:** default 25. The day starts at 00:00 in `reset-zone`, default UTC. Alpha Vantage does
  not document its own reset time.
- **Per minute:** a sliding window, default 5.

A rate-limit answer from the provider counts the rest of the day as spent. Without that, each
refusal would waste a further request, for example when the same key is also used elsewhere.

The day and its use are kept in `<data-dir>/budget.txt` (`yyyy-MM-dd,used`). A restarted service
therefore neither spends the day again nor forgets a rate limit. An unreadable file starts the day
afresh.

### Instrument list

- **File:** `<data-dir>/instruments.csv`, with columns `symbol,name,type,region,currency`.
- **Search:** case-insensitive. An exact symbol ranks first, then symbols starting with the query,
  then names containing it. At most 25 results.
- **Refresh:** `ReferenceDataRefresher` runs hourly. When the list is older than
  `reference.refresh-interval` (default a day), it replaces it with Alpha Vantage `LISTING_STATUS`:
  every active US listing, about 12,000 rows, in **one request**.
- **Failures:** when the provider cannot answer, the old list stays.
- **Seed:** until the first download, search uses `seed/instruments.csv`, the simulator's five
  symbols.

### End-of-day store

The closes quotes fall back to come from three origins:

| Origin | Where | Wins |
|---|---|---|
| `SEED` | `seed/eod-prices.csv` (classpath): the simulator's five demo prices | never over the others |
| `FILE` | every `<data-dir>/eod/*.csv` the operator puts there | most recent date, against `LEARNED` |
| `LEARNED` | `<data-dir>/learned-closes.csv`, written from every live quote | most recent date (a tie goes to `LEARNED`) |

**Supplying end-of-day data.** Put a CSV in `<data-dir>/eod/`. In compose, that is the
`price-data` volume's `eod/` folder, which the service creates at startup:
`docker cp closes.csv oms-price-service:/data/eod/`.
- **Format:** UTF-8, with the header `symbol,date,close[,previousClose[,currency]]` and ISO dates
  (`2026-11-25`). Any end-of-day source works once converted. For Stooq, download its US daily
  archive or per-symbol CSVs in a browser and convert them with
  `tools/stooq-eod` (see its README):
  `python tools/stooq-eod/stooq_eod.py d_us_txt.zip --out .../eod/stooq.csv`.
- **Pick-up:** the service checks the folder every `eod.reload-interval` (default 1 min), so no
  restart is needed.
- **Bad rows:** a malformed row is skipped and logged as `file:line` with the reason. The rest of
  the file loads, and a summary line gives the counts.
- **No downloads:** the service doesn't download end-of-day files itself. Stooq has no API, and its
  terms are unclear.

## 3. Configuration

| Property | Environment | Default |
|---|---|---|
| `oms.price.alpha-vantage.api-key` | `ALPHAVANTAGE_API_KEY` | none: quotes are end-of-day closes |
| `oms.price.alpha-vantage.base-url` | `ALPHAVANTAGE_BASE_URL` | `https://www.alphavantage.co` |
| `oms.price.budget.daily` | `PRICE_BUDGET_DAILY` | 25 |
| `oms.price.budget.per-minute` | `PRICE_BUDGET_PER_MINUTE` | 5 |
| `oms.price.budget.reset-zone` | | UTC |
| `oms.price.quote-ttl` | | PT15M |
| `oms.price.reference.refresh-interval` | | P1D |
| `oms.price.data-dir` | `PRICE_DATA_DIR` | `./data` (`/data` in the container) |
| `oms.price.eod.reload-interval` | | PT1M |

**The key** is read only by `AlphaVantageProvider`:
- it is sent as a URI variable and never logged (requests are logged by function, failures by
  exception type);
- it is never returned;
- Alpha Vantage's own messages, which echo it, are not passed on.

`PriceServiceApiTest` asserts the key appears in no response and no log line.

## 4. Metrics

- **`oms.price.requests{kind, source, outcome}`:**
  - kind: `search`, `quote` or `refresh`;
  - source: `REFERENCE_DATA`, `ALPHA_VANTAGE`, `END_OF_DAY`, or `NONE` (404);
  - outcome: `FOUND`, `CACHE`, `PROVIDER`, `NOT_FOUND`, `NOT_CONFIGURED`, `BUDGET_SPENT`,
    `RATE_LIMITED` or `UNREACHABLE`.
- **`oms.price.provider.budget.remaining`:** provider requests left today.

Traces, metrics and logs go to Alloy over OTLP when `OTLP_EXPORT_ENABLED=true`, as for the other
services.

## 5. Code and tests

| Area | Code | Tests |
|---|---|---|
| Quotes and search | `service/PriceService`, `api/MarketDataController` | `PriceServiceTest`, `PriceServiceApiTest` |
| Budget | `budget/RequestBudget` | `RequestBudgetTest` |
| Instrument list | `reference/InstrumentCatalog`, `ReferenceDataRefresher` | `InstrumentCatalogTest`, `ReferenceDataRefresherTest` |
| End-of-day store | `eod/EndOfDayStore` | `EndOfDayStoreTest` |
| Provider | `provider/AlphaVantageProvider` | `AlphaVantageProviderTest` |
| Compose | `docker-compose.yml` service `price-service` | `ComposeEnvironmentTest` |

Another provider plugs in as a `MarketDataProvider` (`listings()`, `quote()`). The callers don't
change.
