---
type: Interface
title: "Market Data API"
description: "Instrument lookup and quote endpoints, served by the price service and forwarded by oms-ui for order entry: instruments from a local list, quotes live within a request budget or end-of-day closes."
tags: [api, rest, market-data, oms-ui, price-service]
status: draft
updated: "2026-11-26T15:00:00Z"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-24T18:00:00Z" }
covers: ["openapi:/api/market-data/instruments", "openapi:/api/market-data/quotes/{symbol}"]
sources:
  - resource: "repo:oms-contracts/src/main/openapi/oms-marketdata-api.yml"
  - resource: "repo:oms-price-service/src/main/java/org/example/price/api/MarketDataController.java"
  - resource: "repo:oms-price-service/src/main/java/org/example/price/service/PriceService.java"
  - resource: "repo:oms-ui/src/main/java/org/example/omsui/marketdata/MarketDataController.java"
  - resource: "repo:oms-ui/src/main/java/org/example/omsui/marketdata/PriceServiceClient.java"
---
# Market Data API

Specified in `oms-contracts/src/main/openapi/oms-marketdata-api.yml` (version 1.1.0). The models are
generated in oms-contracts (`org.example.common.model.marketdata`); the interface `MarketDataApi` is
generated in each service that serves it.

- **[Price Service](../../architecture/context/price-service.md)** (port 8098) serves it
  (SPEC-0079). It owns market data and the provider's key.
- **oms-ui's backend** (port 8080) serves the same paths for the
  [Order Entry](../../ui/order-entry.md) tab (SPEC-0072) and forwards them to the price service. The
  browser keeps one origin.
- **The [Exchange Simulator](../../architecture/context/exchange-simulator.md)** calls the price
  service's quote endpoint for its reference prices.

| Endpoint | Answer |
|---|---|
| `GET /api/market-data/instruments?query=…` (1–40 characters) | `InstrumentSearchResult`: `instruments` (`symbol`, `name`, `type`, `region`, `currency`), `source`, `notice` |
| `GET /api/market-data/quotes/{symbol}` | `Quote`: `last`, `change`, `changePercent`, `high`, `low`, `previousClose`, `bid`, `ask` (absent when unknown), `currency`, `asOf`, `source`, `notice`; 404 when nobody prices the symbol |

## Sources (`MarketDataSource`)

| Value | Meaning |
|---|---|
| `REFERENCE_DATA` | Search results from the price service's instrument list (refreshed daily from Alpha Vantage `LISTING_STATUS`, else the seed). Search never calls the provider |
| `ALPHA_VANTAGE` | A live `GLOBAL_QUOTE`, within the price service's request budget (25 a day, 5 a minute), cached for 15 min |
| `END_OF_DAY` | The last known close from the end-of-day store: `last` is the close, `asOf` its trading day. Used when no live price can be had; the `notice` says why |
| `BUILT_IN` | No longer produced (SPEC-0079); kept in the enum so older answers still parse |

The sources, the budget and the end-of-day files are described in
[Price Service](../../architecture/context/price-service.md).

## Errors

| Status | When |
|---|---|
| 400 Problem+JSON `urn:oms:error:validation-failed` | a query outside the contract. oms-ui checks it before forwarding, so a bad query never leaves oms-ui |
| 404 (Problem+JSON `urn:oms:error:not-found` from the price service) | neither a live quote nor the end-of-day store has a price |
| 503 Problem+JSON `urn:oms:error:price-service-unavailable` (oms-ui only) | the price service cannot be reached. Order entry shows "Market data unavailable" and takes a symbol typed by hand |

A provider problem is never an error for the caller: the price service answers from its end-of-day
store instead.

## The key

Only the price service has it: `oms.price.alpha-vantage.api-key`, env `ALPHAVANTAGE_API_KEY`.
- It is never logged and never returned, and Alpha Vantage's own messages, which echo it, are not
  passed on.
- oms-ui and the simulator have no Alpha Vantage setting. `ConfigurationHasNoProviderKeyTest`
  checks both modules, and `ComposeEnvironmentTest` checks the compose file.

## Metrics

On the price service:
- `oms.price.requests{kind=search|quote|refresh, source, outcome}`;
- `oms.price.provider.budget.remaining`.

The former `oms.ui.marketdata.requests` is gone with oms-ui's provider. See
[Price Service §4](../../architecture/context/price-service.md#4-metrics).
