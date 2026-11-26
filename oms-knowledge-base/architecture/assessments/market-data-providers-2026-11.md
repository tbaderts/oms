---
type: Assessment
title: "Market Data Providers (2026-11)"
description: "Free market data APIs compared for the OMS's development and demo use: limits, data delay, licence, and why the price service keeps Alpha Vantage behind a provider interface."
tags: [market-data, alpha-vantage, finnhub, twelve-data, tiingo, stooq, assessment]
status: draft
updated: "2026-11-26T15:00:00Z"
point_in_time: true
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-26T15:00:00Z" }
---
# Market Data Providers — 2026-11

Checked on **2026-11-26** for SPEC-0079. The question: are there free alternatives to Alpha Vantage
with less punishing limits, or better ways of using Alpha Vantage? Free tiers change often, and
the sources below sometimes disagree. Treat the figures as a snapshot, and check the provider's
own pricing page before relying on one.

## Comparison

| Provider | Free limits | US stock data on the free tier | Licence on the free tier | Notes |
|---|---|---|---|---|
| **Alpha Vantage** | 25 requests a day, 5 a minute | end-of-day level: real-time and 15-min delayed US data are premium | personal, non-commercial | `LISTING_STATUS` returns every active US listing as CSV in one request. Paid plans drop the daily cap |
| **Finnhub** | 60 calls a minute, WebSocket for up to 50 symbols | real-time quotes; one source says no US candles on the free plan | personal use | the most live headroom; sources disagree on per-symbol quote limits |
| **Twelve Data** | 8 credits a minute, 800 a day | delayed (sources say 15 min to 4 h for stocks) | non-commercial | |
| **Tiingo** | 50 requests an hour, 1,000 a day, 500 unique symbols a month | end-of-day, plus intraday per one source | internal use only; no display or sharing | the most daily headroom |
| **Stooq** | no API; a daily-hits limit on downloads, figure unknown. Since at least 2026-11-26 the CSV download URLs answer with a JavaScript browser check (proof of work), and the multi-symbol quote URL is gone | end-of-day bulk CSV files (zipped, one file per ticker) | terms not found | download by hand in a browser, then convert with `tools/stooq-eod`; not for automation |

No free plan is unrestricted, and most allow only personal or internal, non-commercial use. That
fits a development and demo OMS, but none is a drop-in "free forever" source for showing prices to
customers.

## Findings

1. **Live calls on Alpha Vantage's free tier buy little.** Its free quotes are end-of-day-level
   data. A close from yesterday's file is about as current as today's `GLOBAL_QUOTE`.
2. **Reference data costs one request a day.** `LISTING_STATUS` covers every active US listing.
   Instrument search therefore needs no live call at all.
3. **The waste was structural.** Before SPEC-0079, oms-ui and the simulator spent the same quota
   through two clients and two caches, and every new search term spent a request.

## Recommendation

- **Keep Alpha Vantage**, behind the price service's `MarketDataProvider` interface (SPEC-0079):
  - reference data comes from a local list, refreshed daily;
  - quotes are live within a self-enforced budget, with end-of-day closes from files as the
    fallback.
  - With that, a few live calls a day suffice.
- **If more live headroom is wanted, add Finnhub** as a second `MarketDataProvider`. It offers
  60 calls a minute and real-time quotes. That is a follow-up ticket, one class plus configuration;
  check the free plan's quote limits and terms first.
- **For end-of-day data across many symbols**, an operator exports from any end-of-day source,
  converts it to the price service's CSV format and drops it in the `eod/` folder. Do not automate
  downloads from sources whose terms are unclear (Stooq).

See [Price Service](../context/price-service.md).

## Sources

- Alpha Vantage, support and premium pages: alphavantage.co/support, alphavantage.co/premium
- Macroption, "Alpha Vantage API Request Limits"
- marketparquet.com, "Market Data API Pricing Compared: 14 Providers (2026)"
- DEV Community, "Best Free Stock Market APIs and Data Tools in 2026"
- bestmarketdataapi.com, "Free Market Data API: Limits of Free Tiers"
- QuantStart, "An Introduction to Stooq Pricing Data"; pandas-datareader, Stooq reader; Wealth-Lab
  wiki, Stooq provider
