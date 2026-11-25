# Proposal — SPEC-0072: Add an order entry tab to oms-ui

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The requester ([ticket Goal](./ticket.md)):

> for oms-ui I would like to have an order entry tab that lets me enter new orders with all the
> necessary information like economics, account etc, so that it can be submitted to oms-core. as
> far as securities related information is concerned like instrument names/symbols, ask/bid price
> etc, we can use some opensource api like www.alphavantage.co or similar

**Today.** oms-ui is read-only: its tabs are the order and execution blotters (REST and live) and
two "coming soon" placeholders (quotes, quote requests). Nothing in it sends a command. Orders are
created through the developer cockpit's API Explorer (raw `OrderCreateCmd` JSON), `oms-core/rest.http`,
or Kafka. A trader using oms-ui cannot place an order, and nothing in the OMS knows instrument names
or prices: an order's `symbol` is free text, and the exchange simulator prices from a fixed list
(AAPL, MSFT, IBM, NVDA, INTC in `oms-exchange-simulator/src/main/resources/application.yml`),
rejecting any other symbol.

**The contract already exists.** `POST /api/command/execute` with an `OrderCreateCmd`
(`oms-contracts/src/main/openapi/oms-cmd-api.yml`): required `clOrdId`, `sessionId`, `account`,
`ordType`, `side`, `symbol`, `orderQty` (> 0); optional economics (`price`, `stopPx`,
`timeInForce`, `expireTime`, `cashOrderQty`, `settlCurrency`, `priceType`), routing (`exDestination`,
`handlInst`, `execInst`), instrument (`securityId`, `securityIdSource`, `securityDesc`,
`securityType`, `securityExchange`) and `text`. oms-core validates it (`ValidateOrderTask`: a price
for limit orders, a stop price for stop orders) and answers 400 Problem+JSON with field errors, or
refuses a repeated `(sessionId, clOrdId)`.

**Market data.** The requester suggests Alpha Vantage or similar. Its free tier is small — about
25 requests per day and 5 per minute (as published on 2026-11-24) — and its quote endpoint returns
the last price and the day's range, not bid and ask; other free providers (e.g. Finnhub) are
similar. So the market data must be used sparingly (cached), must not be required for entering an
order, and its API key must not reach the browser.

## What Changes

- **Order Entry tab in oms-ui.** A form for a new order:
  - **Instrument:** symbol with lookup (name, exchange/region, currency) and a quote panel (last
    price, change, day high/low, as-of time; bid/ask when the provider gives them).
  - **Economics:** side, order type, quantity, limit price (prefilled from the last price on
    request), stop price, time in force, expire time, settlement currency.
  - **Account and routing:** account, destination, handling instruction, free text.
  - Fields appear and are required by order type (price for LIMIT/STOP_LIMIT, stop price for
    STOP/STOP_LIMIT), mirroring oms-core's rules; invalid input is shown and not sent.
  - **Submit** sends an `OrderCreateCmd` to `POST /api/command/execute` with a generated `clOrdId`
    and the configured `sessionId`; the result (new `orderId`, or oms-core's refusal with its
    field errors) is shown, and the order appears in the order blotters.
- **Market data through oms-ui's backend.** oms-ui's Spring Boot backend gets a small market data
  API — symbol search and quote — specified in `oms-contracts` like the other APIs, backed by a
  provider:
  - **Alpha Vantage** when an API key is configured (environment variable, never sent to the
    browser), with responses cached to stay within the free tier;
  - **a built-in list** otherwise (the simulator's symbols with their reference prices), so order
    entry works offline and in tests.
  - Provider errors, rate limits and a missing key degrade to the built-in list or manual symbol
    entry with a notice; they never block an order.
- **Knowledge base and docs:** a UI page for order entry, the market data API and its
  configuration (key, cache), the local Docker stack setting.

## Scope

### In scope

- `oms-ui` frontend: the tab, the form, validation, submission, result display, lookup and quote.
- `oms-ui` backend: the market data endpoints, provider interface, Alpha Vantage and built-in
  providers, cache, configuration.
- `oms-contracts`: the market data API specification (OpenAPI).
- `oms-knowledge-base`: UI and interface pages, `log.md`; `docker-compose.yml` setting for the key.

### Out of scope

- Changing `OrderCreateCmd` or oms-core's validation.
- Amending or cancelling orders from oms-ui (cancel/replace), order trees, basket entry.
- Derivatives fields (maturity, strike, put/call, underlying) and `cashOrderQty` orders.
- Account reference data or entitlements (account is free text, as in the contract today).
- Streaming market data, depth of book, charts; a paid provider.
- Making the exchange simulator price symbols outside its list (orders for them are rejected by the
  simulator, as today).

## Acceptance Criteria

- **AC-1** — Given the Order Entry tab with a valid LIMIT order filled in (symbol, side, quantity,
  price, account, time in force), when the user submits, then oms-ui sends one `OrderCreateCmd` to
  `POST /api/command/execute` carrying those values, a generated `clOrdId` and the configured
  `sessionId`, and on success shows the new `orderId`; the order is then returned by
  `/api/query/search` and shown in the order blotter.
- **AC-2** — Given incomplete or inconsistent input — no symbol or account, quantity ≤ 0, LIMIT or
  STOP_LIMIT without a price, STOP or STOP_LIMIT without a stop price — when the user tries to
  submit, then the offending fields are marked with a message and nothing is sent.
- **AC-3** — Given oms-core refuses the command (400 with field errors, or a duplicate), when the
  answer arrives, then the form shows oms-core's message (per field where it names one), keeps the
  user's input, and offers to submit again.
- **AC-4** — Given one filled-in ticket, when the user submits it twice (a double click, or a retry
  after a network error), then both requests carry the same `clOrdId` and oms-core creates at most
  one order; and when the user submits again after a successful submit or a reset, then the
  request carries a new `clOrdId`.
- **AC-5** — Given a configured market data provider, when the user types part of a symbol or name,
  then matching instruments (symbol, name, region, currency) are listed from oms-ui's backend, and
  choosing one fills the symbol (and the settlement currency when it is empty).
- **AC-6** — Given a chosen instrument, then the form shows its quote (last price, change, day
  high/low, as-of time) and bid/ask when the provider supplies them (otherwise marked as not
  available); "use last price" fills the limit price.
- **AC-7** — Given no API key, an unreachable provider or an exhausted rate limit, when the user
  looks up a symbol, then the built-in instruments are offered with a notice, a symbol can still be
  typed by hand, and the order can still be submitted. Given a configured key, when any page,
  asset or oms-ui API response is fetched, then the key does not appear in it.
- **AC-8** — Given a symbol search or quote that oms-ui's backend has answered, when the same
  request comes again within the cache time, then it is answered from the cache and the provider is
  not called again.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-ui (frontend and backend), oms-contracts (new market data API spec), oms-knowledge-base |
| Contracts (OpenAPI / Avro) | New `oms-contracts/src/main/openapi/` spec for the market data API (additive). No change to the command or query APIs |
| Data (tables, migrations) | None |
| Events / Kafka topics | None (orders go through the existing command API) |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-ui gains a writer role; oms-core receives `OrderCreateCmd`s from it like from any REST client. No breaking change |
| Knowledge base | `ui/` order entry page, the market data interface, `infrastructure/` Docker stack setting, `log.md` |

## Open Questions

- [resolved] Which provider? → assumption: Alpha Vantage first (as the requester suggested),
  behind a provider interface so another (e.g. Finnhub) can be added without UI changes; key from
  an environment variable (`ALPHAVANTAGE_API_KEY`).
- [resolved] Bid/ask? → assumption: shown when the provider supplies them; Alpha Vantage's free
  quote does not, so the form shows last price and day range and marks bid/ask as not available.
  Needs the requester's confirmation at approval: real bid/ask needs a paid or different provider.
- [resolved] Where does the API key live? → assumption: in oms-ui's backend only, which proxies and
  caches the provider; the browser never sees it.
- [resolved] Is the market data API a contract? → assumption: yes, an OpenAPI spec in
  `oms-contracts` (P-01, P-02), even though only oms-ui uses it.
- [resolved] Which `sessionId`? → assumption: one configured per oms-ui deployment
  (default `OMS-UI`); `clOrdId` is generated per ticket.
- [resolved] Accounts? → assumption: free text, remembered per browser for convenience; no account
  reference data exists.
- [resolved] Symbols the simulator does not know? → assumption: allowed; the simulator rejects them
  as today, and the built-in instrument list (the simulator's symbols) is the default offline.
