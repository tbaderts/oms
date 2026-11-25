# Proposal — SPEC-0073: Use Alpha Vantage data in exchange simulator

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The Order Entry tab (SPEC-0072, [Market Data API](../../../oms-knowledge-base/domain/interfaces/market-data-api.md))
lets a trader search any instrument Alpha Vantage knows and see its quote, then submit an order for
it. The exchange simulator that answers those orders
([Exchange Simulator §4](../../../oms-knowledge-base/architecture/context/exchange-simulator.md))
still knows only five symbols with hard-coded reference prices (`simulator.reference-prices`: AAPL
170.00, MSFT 420.00, IBM 250.00, NVDA 120.00, INTC 86.96). Today:

- An order for any other symbol the UI offers (e.g. `GOOGL`, `KO`) is rejected with
  `Unknown symbol`, so most of what order entry shows cannot be traded end to end.
- An order for a known symbol is filled at a price unrelated to the quote the trader just saw
  (e.g. AAPL fills at 170.00 whatever the market is), so a limit placed near the displayed quote
  is rejected or filled at a surprising price.
- The only limit-price check is a flat ±10 % band around that static price. Real US venues apply
  stricter, price-dependent rules: Reg NMS Rule 612 forbids sub-penny limits at or above $1.00, and
  NYSE and Nasdaq reject limit orders priced too far through the market (NYSE "Limit Order Price
  Protection": 10 % up to $25, 5 % up to $50, 3 % above). The simulator accepts limits a real
  exchange would refuse, so the OMS's reject path is not exercised realistically.

Doing nothing leaves order entry demonstrating instruments that cannot be traded, and leaves
limit-price rejects untested against venue-like rules.

## What Changes

- The simulator takes each symbol's **reference price from Alpha Vantage** (`GLOBAL_QUOTE`, last
  price) when an API key is configured (`ALPHAVANTAGE_API_KEY`), so any US-listed symbol Alpha
  Vantage prices can be traded; it fills marketable quantity at that price.
- A symbol Alpha Vantage has no quote for is rejected (`Unknown symbol <s>`), as today.
- Quotes are **cached** for a configurable TTL (default 5 min, matching oms-ui), so the free quota
  (about 25 requests a day) is not spent per order.
- When Alpha Vantage is not configured, rate limited or unreachable, the simulator **falls back to
  the static `simulator.reference-prices`**, as it works today; a symbol in neither is rejected.
- New **limit-price checks** replace the flat `price-band-percent` band, checked in this order
  after the existing ones:
  1. **Tick size** (Reg NMS Rule 612): a limit ≥ 1.00 must be a whole multiple of 0.01, a limit
     < 1.00 a multiple of 0.0001. Otherwise reject `Price <p> is not a multiple of tick <t>`.
  2. **Price collar** (NYSE Limit Order Price Protection tiers) around the reference price:
     10 % when reference ≤ 25.00, 5 % when ≤ 50.00, 3 % above, configurable. A **buy** limit above
     `reference × (1 + pct)` or a **sell** limit below `reference × (1 − pct)` is rejected
     `Price <p> outside collar <lo>-<hi>`. A limit that is passive (buy below / sell above the
     reference) is not collared, as on the exchanges, and rests.
- The API key stays inside the simulator: never logged, never in a reject reason or any command.
- New metric `simulator_reference_price_lookups_total{source, outcome}` shows where prices came
  from (cache, Alpha Vantage, static fallback) and why the provider did not answer.
- **Behaviour change (not a contract break):** `simulator.price-band-percent` /
  `SIMULATOR_PRICE_BAND_PERCENT` is removed. Passive limits far from the market, which were
  rejected before, now rest. Only the simulator reads it; no other module is affected.

## Scope

### In scope

- oms-exchange-simulator: Alpha Vantage reference-price lookup with cache and static fallback,
  tick-size and collar checks, metric, configuration.
- `docker-compose.yml`: pass `ALPHAVANTAGE_API_KEY` (and the base URL) to the simulator.
- Knowledge base: Exchange Simulator page §4–§7 and the capability page if it lists the rules.

### Out of scope

- **Pre-trade limit checks in oms-core or oms-ui.** This ticket makes the *venue* reject what a
  real venue would; an OMS-side check that stops the order before it is sent is a separate ticket
  (oms-core has no market data today).
- Limit Up–Limit Down (LULD) trading bands, trading halts, opening/closing auctions, the doubled
  bands near the open and close.
- Bid/ask, an order book, or intraday price movement: the simulator still fills at one reference
  price per symbol (Alpha Vantage's free quote has no bid or ask).
- Using Alpha Vantage `SYMBOL_SEARCH` or other reference data (name, type, currency) in the
  simulator: the quote answers whether a symbol is tradable and at what price, which is all the
  venue needs.
- Non-US venues and currencies; collar rules per venue.
- Changing oms-ui's market data provider or its built-in list.

## Acceptance Criteria

- **AC-1** — Given Alpha Vantage is configured and quotes a symbol that is not in
  `simulator.reference-prices` at last price P, when a MARKET order for that symbol arrives on
  `oms_orders`, then the simulator sends `OrderAcceptCmd` and `ExecutionCreateCmd`(s) with
  `lastPx` = P.
- **AC-2** — Given Alpha Vantage is configured and quotes AAPL at P different from the static
  170.00, when a marketable order for AAPL arrives, then it fills at P (the provider wins over the
  static price).
- **AC-3** — Given Alpha Vantage answers with an empty `Global Quote` for a symbol that is not in
  `simulator.reference-prices`, when an order for it arrives, then the simulator sends
  `OrderRejectCmd` with text `Unknown symbol <symbol>`.
- **AC-4** — Given Alpha Vantage is not configured, or answers with a rate-limit `Note` /
  `Information`, or does not answer within the read timeout, when an order for a symbol in
  `simulator.reference-prices` arrives, then it is evaluated against the static price; and for a
  symbol in neither source, it is rejected `Unknown symbol <symbol>`. No order is left
  unanswered.
- **AC-5** — Given a quote for a symbol was fetched less than `quote-ttl` ago, when a second order
  for the same symbol arrives, then Alpha Vantage receives no second request (counted at a stub
  server) and the order uses the cached price; after `quote-ttl` it is requested again.
- **AC-6** — Given a reference price ≥ 1.00, when a LIMIT order arrives with a price that is not a
  multiple of 0.01 (e.g. 170.005), then it is rejected `Price 170.005 is not a multiple of tick 0.01`;
  and given a reference price < 1.00, a limit of 0.1234 is accepted and 0.12345 is rejected with
  tick 0.0001.
- **AC-7** — Given reference prices 20.00, 40.00 and 170.00, when a LIMIT **buy** arrives at
  22.00 / 42.00 / 175.10 it is accepted (marketable), and at 22.01 / 42.01 / 175.11 it is rejected
  `Price <p> outside collar <lo>-<hi>`; symmetrically a LIMIT **sell** at 18.00 / 38.00 / 164.90 is
  accepted and at 17.99 / 37.99 / 164.89 rejected; and a passive LIMIT buy at 100.00 against
  170.00 is accepted and rests (no fill).
- **AC-8** — Given an API key is configured and Alpha Vantage's answers echo it, when orders are
  evaluated through every path above (quote, unknown symbol, rate limit, error), then the key
  appears in no command sent to Kafka, no reject text and no log line of the simulator.
- **AC-9** — Given lookups served from the cache, from Alpha Vantage and from the static fallback,
  when `/actuator/prometheus` is read, then `simulator_reference_price_lookups_total` has a series
  per `source` (`CACHE`, `ALPHA_VANTAGE`, `STATIC`) and the fallback reason in `outcome`
  (`NOT_CONFIGURED`, `RATE_LIMITED`, `UNREACHABLE`, `NOT_FOUND`), with the counts of those lookups.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-exchange-simulator, oms-knowledge-base (plus root `docker-compose.yml`) |
| Contracts (OpenAPI / Avro) | none — the simulator still consumes `OrderMessage` and sends the existing commands; reject reasons are free text |
| Data (tables, migrations) | none — the simulator is stateless apart from an in-memory quote cache |
| Events / Kafka topics | none — same topics and commands; more orders are accepted (any priced symbol) and some limits now rejected for tick/collar instead of band |
| Consumers (oms-ui, oms-mcp-server, downstream) | none in code. oms-ui's order entry now trades end to end for Alpha Vantage symbols; oms-core load suite (MARKET orders on static symbols) is unaffected when no key is set |
| Knowledge base | `architecture/context/exchange-simulator.md` §4 economics, §5 configuration, §7 observability; `capabilities/exchange-simulation.md` if it lists the rules; `domain/interfaces/market-data-api.md` note that the simulator uses the same provider |

## Open Questions

- [resolved] Where should the limit-price checks live: in the simulator (the venue rejects) or in
  oms-core / oms-ui (pre-trade, before sending)? → assumption: in the **simulator**, since the
  goal asks what *exchanges* accept and the simulator plays the exchange; an OMS pre-trade check is
  out of scope and can follow as its own ticket. **Reviewer: please confirm at approval.**
- [resolved] Which exchange rules count as "acceptable range"? → assumption: Reg NMS Rule 612 tick
  size plus the NYSE Limit Order Price Protection tiers (10 % ≤ $25, 5 % ≤ $50, 3 % above), applied
  to the aggressive side only; tiers configurable. LULD bands are out of scope. Easily retuned by
  configuration.
- [resolved] What is the reference price, given the free Alpha Vantage quote has no bid/ask? →
  assumption: `GLOBAL_QUOTE` "05. price" (last), the same field oms-ui shows the trader as `last`.
- [resolved] What happens when Alpha Vantage cannot answer? → assumption: fall back to the static
  `simulator.reference-prices` (today's behaviour), never leave an order unanswered; a symbol known
  to neither is rejected.
- [resolved] Should `price-band-percent` stay alongside the collar? → assumption: no, the collar
  replaces it (keeping both would make the stricter one silently win); the setting is removed and
  documented as such.
- [deferred] Share one Alpha Vantage client between oms-ui and the simulator (e.g. in a library
  module) vs. a small client in the simulator → a design decision (P-17), reversible, no effect on
  the ACs.
