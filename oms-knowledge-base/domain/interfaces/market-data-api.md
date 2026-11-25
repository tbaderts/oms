---
type: Interface
title: "Market Data API"
description: "oms-ui's instrument lookup and quote endpoints for order entry, backed by Alpha Vantage or built-in instruments, with the provider's key kept on the server and answers cached."
tags: [api, rest, market-data, oms-ui]
status: draft
updated: "2026-11-24T18:00:00Z"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-24T18:00:00Z" }
covers: ["openapi:/api/market-data/instruments", "openapi:/api/market-data/quotes/{symbol}"]
sources:
  - resource: "repo:oms-contracts/src/main/openapi/oms-marketdata-api.yml"
  - resource: "repo:oms-ui/src/main/java/org/example/omsui/marketdata/MarketDataController.java"
  - resource: "repo:oms-ui/src/main/java/org/example/omsui/marketdata/MarketDataService.java"
  - resource: "repo:oms-ui/src/main/java/org/example/omsui/marketdata/AlphaVantageProvider.java"
---
# Market Data API

Served by **oms-ui's backend** (port 8080), not by oms-core, for the [Order Entry](../../ui/order-entry.md)
tab (SPEC-0072). Specified in `oms-contracts/src/main/openapi/oms-marketdata-api.yml`; the models are
generated in oms-contracts (`org.example.common.model.marketdata`), the interface `MarketDataApi` in
oms-ui.

| Endpoint | Answer |
|---|---|
| `GET /api/market-data/instruments?query=…` (1–40 characters) | `InstrumentSearchResult`: `instruments` (`symbol`, `name`, `type`, `region`, `currency`), `source`, `notice` |
| `GET /api/market-data/quotes/{symbol}` | `Quote`: `last`, `change`, `changePercent`, `high`, `low`, `previousClose`, `bid`, `ask` (absent when the provider has none), `currency`, `asOf`, `source`, `notice`; 404 when nobody prices the symbol |

A query outside the contract is a 400 Problem+JSON (`urn:oms:error:validation-failed`).

## Sources and fallback

`MarketDataService` answers from its cache, else the provider, else the built-in instruments:
- **Provider: Alpha Vantage** (`AlphaVantageProvider`, `SYMBOL_SEARCH` and `GLOBAL_QUOTE`), asked only
  when `ALPHAVANTAGE_API_KEY` is set. Timeouts: connect 2 s, read 5 s.
- **Built-in instruments** (`oms.ui.market-data.built-in`): the exchange simulator's symbols with its
  reference prices as `last`. Used, with `source: BUILT_IN` and a `notice`, when the provider is not
  configured, rate limited (Alpha Vantage answers 200 with a `Note` or `Information` member) or not
  reachable. A provider problem is never an error for the caller.
- **Cache:** provider answers only, searches for `search-ttl` (default 24 h), quotes for `quote-ttl`
  (default 5 min); fallbacks are not cached, so data returns as soon as the provider does.

## The key

`oms.ui.market-data.alpha-vantage.api-key` (env `ALPHAVANTAGE_API_KEY`) is read only by
`AlphaVantageProvider`: never logged (requests are logged by function), never returned, not in
`/api/config`; Alpha Vantage's own messages, which echo it, are not passed on. Tests assert it is in
no response.

## Metrics

`oms.ui.marketdata.requests{kind=search|quote, source, outcome}`; outcome `CACHE`, `PROVIDER`,
`NOT_FOUND` or the reason the provider could not answer (`NOT_CONFIGURED`, `RATE_LIMITED`,
`UNREACHABLE`).
