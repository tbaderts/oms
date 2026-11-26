# Proposal — SPEC-0079: Add price service with static fallback data

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

SPEC-0073 made Alpha Vantage the market data source for order entry in oms-ui (SPEC-0072) and for
the exchange simulator's reference prices.
- **The limit.** The free key allows **25 requests a day and 5 a minute**. The paid plans remove
  the daily cap but are a subscription we don't want for a dev and demo system (goal).

**Today the quota goes further than it needs to:**
- **Two clients spend it separately.** oms-ui (`AlphaVantageProvider`) and the simulator
  (`AlphaVantageQuoteClient`) each have their own client and their own cache, but share one key and
  one daily quota. The same AAPL quote is bought twice: once when the trader looks it up, once when
  the order reaches the simulator.
- **Symbol search spends it.** Each new search term in order entry costs a `SYMBOL_SEARCH` request,
  even though the set of listed instruments changes rarely.
- **The fallback is thin.** When the quota is gone, both fall back to five hard-coded symbols at
  fixed prices: `oms.ui.market-data.built-in` and `simulator.reference-prices`. Every other symbol
  can no longer be looked up, quoted or traded at a realistic price.

**What the free tiers actually offer** (checked 2026-11-26; summarised for the KB in AC-12):
- **Alpha Vantage free:** 25 requests a day. Its support page says real-time and 15-minute-delayed
  US stock data are premium-only. So the free `GLOBAL_QUOTE` already gives end-of-day-level data,
  and live calls buy little over a daily file.
- **`LISTING_STATUS`:** returns every active US listing as CSV in **one** request, so reference
  data can be refreshed for one call a day.
- **Other free providers** have more headroom, but none is unrestricted:
  - Finnhub: 60 calls a minute.
  - Twelve Data: 8 a minute, 800 a day.
  - Tiingo: 50 an hour, 1,000 a day.
  - Stooq: end-of-day bulk CSV downloads, with no API and unclear terms.
  - Most free plans are for personal or internal, non-commercial use only. That fits a dev and
    demo OMS, but it means no provider is a drop-in "free forever" answer.

**If we do nothing**, a handful of searches and quotes exhausts the day. After that, order entry
and the simulator know only five symbols.

The goal suggests a **price service** that owns price and reference data for the other services:
- reference lookups go to static data from a file;
- the live API is used only for prices;
- when the limit is reached, quotes fall back to static data and the previous day's close.

This proposal does that, keeps Alpha Vantage as the provider, and records the alternatives.

## What Changes

- **New service `oms-price-service`** (Spring Boot; in docker-compose).
  - It is the only holder of the Alpha Vantage key, the only caller of Alpha Vantage, and the
    only cache of its answers.
  - It serves the existing Market Data API (`oms-marketdata-api.yml`): instrument search and
    quote.
- **Reference data from a file.**
  - Instrument search runs against a local instrument list and never calls the provider.
  - The list is refreshed from `LISTING_STATUS` at most once per refresh interval (default daily).
  - A small committed seed covers the simulator's symbols, so the service works with no key and
    no network.
- **End-of-day prices from a file.**
  - The service keeps a store of the last known close per symbol.
  - The store is filled from:
    - the committed seed;
    - an operator-supplied CSV in a documented format (e.g. an export from Stooq or any vendor);
    - every successful live quote, whose close and previous close are written back.
  - So the fallback improves with use.
- **A request budget the service enforces itself.**
  - The service counts its own provider requests against a configured daily and per-minute
    budget (defaults 25 and 5).
  - When the budget is spent, or the provider says it is rate limited, it stops calling until the
    budget window resets.
  - Meanwhile quotes answer from the end-of-day store: `source: END_OF_DAY`, the close as `last`,
    its date as `asOf`, and a notice.
- **oms-ui** forwards `/api/market-data/*` to the price service and no longer calls Alpha Vantage.
  - Order entry labels an end-of-day quote as such, with its date.
- **oms-exchange-simulator** takes its reference price from the price service's quote and no
  longer calls Alpha Vantage.
  - If the price service is unreachable, it uses its static `simulator.reference-prices`, as it
    does today when the provider fails.
- **Contract (additive):** `MarketDataSource` gains `END_OF_DAY` (a quote from the end-of-day
  store) and `REFERENCE_DATA` (search results from the instrument list).
  - `BUILT_IN` stays in the enum but is no longer produced.
  - Consumers are oms-ui (frontend and backend) and the simulator, all in this repository and all
    updated here.
- **Metrics:** the provider budget remaining, and requests by kind, source and outcome.
- **Knowledge base:**
  - a market data provider assessment (free alternatives, limits, licence notes, recommendation);
  - an Interface page for the price service;
  - the Market Data API and exchange simulator pages updated.

## Scope

### In scope

- The price service with instrument search, quote, the instrument file and its refresh, the
  end-of-day store (seed, CSV import, write-back) and the request budget.
- A provider interface with the Alpha Vantage implementation (moved from oms-ui), so another
  provider is one class plus configuration later.
- oms-ui backend and frontend and the simulator switched to the price service. Their own Alpha
  Vantage clients and caches are removed.
- The docker-compose service, configuration, metrics, tests and knowledge base pages.

### Out of scope

- A second provider adapter (Finnhub, Twelve Data, Tiingo). The assessment recommends one; the
  adapter is a follow-up ticket.
- Downloading or scraping Stooq or any other source automatically. End-of-day files come from an
  operator. Stooq has no API and unclear redistribution terms.
- Streaming or intraday prices, price history and charts, and corporate actions (splits,
  dividends).
- Market data in oms-core (e.g. a pre-trade check). oms-core does not call the price service in
  this ticket.
- Committing vendor data to the repository. The seed holds only the simulator's own five symbols
  and prices; the full listing is downloaded at run time into the service's data directory.
- Persisting data in PostgreSQL. The service keeps its files in a data directory (a volume in
  docker-compose).

## Acceptance Criteria

- **AC-1** — Given an instrument list containing "MSFT Microsoft Corporation", when
  `GET /api/market-data/instruments?query=micro` is called on the price service, then the result
  includes MSFT with `source: REFERENCE_DATA` and the provider receives no request.
- **AC-2** — Given a configured key and an instrument list older than the refresh interval, when
  the refresh runs, then exactly one `LISTING_STATUS` request is made and its listings replace the
  list. Given the provider fails or answers rate limited during the refresh, then the existing list
  stays in use and search answers as before.
- **AC-3** — Given budget remains and a symbol is not cached, when the price service is asked for
  its quote twice within the quote TTL (once by oms-ui, once by the simulator), then the provider
  receives one `GLOBAL_QUOTE` request and both answers have `source: ALPHA_VANTAGE` and the same
  `last`.
- **AC-4** — Given the configured daily budget (default 25) has been used by the service's own
  requests, when a quote is asked for a symbol in the end-of-day store, then the provider receives
  no request. The answer has `source: END_OF_DAY`, `last` equal to the stored close,
  `previousClose`, `asOf` equal to the close's date, and a notice that the provider limit is
  reached. The per-minute budget behaves the same within its minute.
- **AC-5** — Given budget remains but the provider answers rate limited (Alpha Vantage's 200 with a
  `Note` or `Information` member), when a quote is asked, then the answer is the AC-4 end-of-day
  answer. No further provider request is made until the daily budget window resets.
- **AC-6** — Given an operator CSV in the documented format (`symbol,date,close` plus optional
  `previousClose,currency`) in the data directory, when the service starts or reloads, then
  fallback quotes use its closes. Malformed rows are skipped and reported in the log with their
  line number and count; valid rows are loaded. For a symbol in several sources, the most recent
  date wins.
- **AC-7** — Given a successful live quote for a symbol, when the provider becomes unavailable
  (budget spent, not configured or unreachable), including after a restart of the service, then
  that symbol's quote is the stored close from that live quote, with `source: END_OF_DAY`.
- **AC-8** — Given a symbol that no live quote answers and the end-of-day store doesn't hold,
  when its quote is asked, then the answer is 404 Problem+JSON. A query outside the contract is
  400, as today.
- **AC-9** — Given the price service quotes symbol X, when an order for X reaches the exchange
  simulator, then its reference price is that quote's `last` and the simulator makes no Alpha
  Vantage request. Given the price service is unreachable, then the simulator uses its static
  `simulator.reference-prices`, and rejects a symbol known to neither, as today.
- **AC-10** — Given oms-ui is configured with the price service URL, when order entry searches and
  quotes, then oms-ui's `/api/market-data/*` answers are the price service's, and oms-ui makes no
  Alpha Vantage request. The order entry form shows an `END_OF_DAY` quote as
  "End-of-day close" with its date. Given the price service is unreachable, then order entry shows
  a notice and still allows entering a symbol by hand, as today.
- **AC-11** — Given the Alpha Vantage key is configured, when the price service searches, quotes,
  refreshes and fails (rate limited, unreachable), then the key appears in no response and no log
  line. oms-ui's and the simulator's configurations and compose environments no longer contain it.
- **AC-12** — Given the knowledge base after this ticket, when the KB checker runs, then it reports
  no errors, and the knowledge base contains:
  - the provider assessment (Alpha Vantage, Finnhub, Twelve Data, Tiingo, Stooq: limits, data
    delay, licence, with a recommendation and the date checked);
  - the price service's Interface page;
  - the updated Market Data API and exchange simulator pages.
- **AC-13** — Given the price service has answered a search, a live quote and an end-of-day
  quote, when `/actuator/prometheus` is read, then it shows the remaining daily provider budget as
  a gauge, and a requests counter tagged by kind (search, quote, refresh), source and outcome that
  counts each of them.

## Impact

| Area | Impact |
|---|---|
| Modules | new `oms-price-service`; `oms-contracts` (enum values); `oms-ui` (backend forwards, frontend label); `oms-exchange-simulator` (client of the price service); `oms-knowledge-base`; `docker-compose.yml` |
| Contracts (OpenAPI / Avro) | `oms-marketdata-api.yml`: `MarketDataSource` gains `END_OF_DAY` and `REFERENCE_DATA` (additive; every consumer is in this repo and updated here). No Avro change. |
| Data (tables, migrations) | none in PostgreSQL. The price service keeps an instrument list and an end-of-day store as files in its data directory (a docker volume). |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-ui backend and frontend and the exchange simulator switch to the price service. The `ALPHAVANTAGE_API_KEY` env var moves from oms-ui and the simulator to the price service in compose. |
| Knowledge base | new: provider assessment, price service Interface page. Updated: `domain/interfaces/market-data-api.md`, `architecture/context/exchange-simulator.md`, `ui/order-entry.md`, the Docker stack page. |

## Open Questions

- [resolved] Stay with Alpha Vantage or switch providers? → assumption: **stay**, behind a provider
  interface.
  - With reference data and end-of-day closes served from files, the service needs only a few
    quote calls a day.
  - On Alpha Vantage's free tier those quotes are end-of-day data anyway.
  - The assessment (AC-12) recommends the alternative to add if more live headroom is wanted
    (likely Finnhub, 60 calls a minute); the adapter is a follow-up.
  - **Reviewer: please confirm, or ask for the second adapter in this ticket.**
- [resolved] A new module, or the price service inside oms-ui's backend (which serves the Market
  Data API today)? → assumption: **new module `oms-price-service`**.
  - The goal asks for a service that serves "our services", and the simulator should not depend on
    the UI application.
  - Agents cannot edit `specs/config.json`. **Reviewer: please add an `oms-price-service` entry to
    `modules` (with its `./gradlew build` verify command) when approving.** The design will then
    add it to the ticket's modules.
- [resolved] Where do end-of-day closes for many symbols come from? → assumption: an
  operator-supplied CSV in a documented, vendor-neutral format, plus the committed seed and
  write-back from live quotes. Automatic downloads (Stooq bulk zips, paid EOD APIs) are out of
  scope: Stooq has no API and unclear terms.
- [resolved] When does the daily budget reset? → assumption: at 00:00 UTC, configurable. Alpha
  Vantage does not document its reset time; a wrong guess only shifts when live calls resume.
- [resolved] What happens to `BUILT_IN`? → assumption: it stays in the enum so no consumer breaks,
  but nothing produces it any more. The seed takes its place as `END_OF_DAY` and
  `REFERENCE_DATA`. Removing it can follow later.
- [resolved] Does the frontend call the price service directly? → assumption: no. oms-ui's backend
  forwards `/api/market-data/*`, so the browser keeps one origin and nothing about CORS changes.
