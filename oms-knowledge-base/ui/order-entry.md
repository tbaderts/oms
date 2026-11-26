---
type: Specification
title: "Order Entry"
description: "The Order Entry tab of the OMS UI: a new order's instrument, economics and account, checked before it is sent to oms-core as an OrderCreateCmd, with instrument lookup and quotes from a market data provider."
tags: [ui, order-entry, market-data]
status: draft
updated: "2026-11-26T15:00:00Z"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-24T18:00:00Z" }
sources:
  - resource: "repo:oms-ui/frontend/src/components/OrderEntry.tsx"
  - resource: "repo:oms-ui/frontend/src/services/orderTicket.ts"
  - resource: "repo:oms-ui/frontend/src/services/MarketDataService.ts"
  - resource: "repo:oms-ui/src/main/java/org/example/omsui/marketdata/PriceServiceClient.java"
  - resource: "repo:oms-price-service/src/main/java/org/example/price/service/PriceService.java"
  - resource: "repo:oms-contracts/src/main/openapi/oms-marketdata-api.yml"
---
# Order Entry

The **Order Entry** tab of the [OMS Admin Tool](admin-ui.md) creates a new order (SPEC-0072). It
sends the same `OrderCreateCmd` any client sends to the [Command API](../domain/interfaces/command-api.md);
oms-core validates and applies it, and the order appears in the order blotters like any other.

## The form

| Section | Fields |
|---|---|
| Instrument | Symbol (with lookup), the chosen instrument's name (sent as `securityDesc`), a quote panel |
| Economics | Side (Buy, Sell, Sell short), order type (Limit, Market, Stop, Stop limit, Market on close), quantity, price (Limit, Stop limit), stop price (Stop, Stop limit), time in force (default Day), expire time, settlement currency |
| Account and routing | Account (free text; the last five used are suggested, per browser), destination, handling instruction (default Automated), text |

A summary line ("BUY 100 AAPL LIMIT 170.5 DAY for ACC-1") sits above **Submit order**.

**Checked before sending** (the rules of oms-core's `ValidateOrderTask` and the contract): symbol and
account required; quantity, price and stop price positive with at most 8 decimals and 15
significant digits (what a JavaScript number carries exactly); a price for Limit
and Stop limit, a stop price for Stop and Stop limit (the other fields are hidden and not sent); an
expire time in the future. Errors show under their fields after the first submit attempt; nothing
is sent while any remain.

## Submitting

- **Command:** `{"type":"OrderCreateCmd","version":"1.0.0","order":{…}}` with the entered fields,
  `sendingTime`, the `sessionId` of this oms-ui (`oms.ui.order-entry.session-id`, env
  `OMS_UI_SESSION_ID`, default `OMS-UI`, served in `/api/config` as `orderEntry.sessionId`) and the
  ticket's `clOrdId`. Empty optional fields are left out.
- **clOrdId:** `UI-<uuid>`, made when the ticket is; every retry of the ticket sends the same one,
  and a new one is made only after a successful submit or **Reset**. Submit is disabled while a
  request is in flight. So a double click or a retry creates at most one order.
- **Answers:**
  - created: "Order ORD-… created", with **View in Orders**;
  - refused: oms-core's message in a banner, its field errors (`errors["order.<field>"]`) under the
    fields, the input kept. If oms-core refused this ticket's own clOrdId as a duplicate ("Order
    creation failed: Duplicate order for sessionId=… and clOrdId=…"), an earlier attempt was
    applied: the order is looked up by clOrdId and shown as created "by an earlier attempt";
  - not reached: "Could not reach oms-core" with **Retry** (same clOrdId). Whether the order was
    applied is then unknown, so the next submit first looks the clOrdId up: an order found is shown
    (not sent again, even if the form was edited meanwhile); otherwise the ticket is sent;
  - if that lookup fails: "Could not confirm whether the order was created; check the Orders tab
    before submitting again", and nothing is sent.

## Instrument lookup and quotes

Typing two or more characters of a symbol or name lists matching instruments (debounced); choosing
one fills the symbol, its name and, if empty, the settlement currency, and loads its quote: last
price, change, day range, as-of date, bid and ask. **Use last price** copies the last price into the
limit price.

The data comes from oms-ui's own backend, the [Market Data API](../domain/interfaces/market-data-api.md),
which forwards to the [Price Service](../architecture/context/price-service.md) (SPEC-0079):
- **Search** lists instruments from the price service's instrument list, all active US listings
  once it has downloaded them, else the exchange simulator's AAPL, MSFT, IBM, NVDA and INTC. Search
  never spends the provider's quota.
- **The quote** is a live Alpha Vantage price while the price service's daily budget lasts. The
  footer then says "Alpha Vantage". Its free quote has no bid or ask, so they show "n/a".
- **Otherwise the quote is the last known close.** The footer says **End-of-day close**, "As of"
  shows its trading day, and a notice says why: limit reached, provider not configured or not
  reachable.

  **Use last price** copies the close like any last price. The simulator fills at the same price.
  It rejects orders for symbols nobody prices.

If oms-ui's backend or the price service cannot be reached (the React dev server proxies to
oms-core), the form says "Market data unavailable" and the symbol can be typed by hand. Market data
never blocks an order.

## Not covered

Amending or cancelling orders, order trees and baskets, derivatives fields, cash quantities,
account reference data and entitlements, streaming market data.
