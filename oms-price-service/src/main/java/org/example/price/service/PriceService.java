package org.example.price.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import org.example.common.model.marketdata.Instrument;
import org.example.common.model.marketdata.InstrumentSearchResult;
import org.example.common.model.marketdata.MarketDataSource;
import org.example.common.model.marketdata.Quote;
import org.example.price.budget.RequestBudget;
import org.example.price.eod.Close;
import org.example.price.eod.EndOfDayStore;
import org.example.price.provider.MarketDataProvider;
import org.example.price.provider.ProviderUnavailableException;
import org.example.price.reference.InstrumentCatalog;
import org.example.price.service.PriceMetrics.Outcome;
import org.example.price.util.TtlCache;

import lombok.extern.slf4j.Slf4j;

/**
 * Price and reference data for the other services (SPEC-0079).
 *
 * <ul>
 *   <li><b>Search</b> answers from the instrument list, never the provider.
 *   <li><b>Quotes</b> come from the cache (live answers only, "no quote" included, for
 *       {@code quoteTtl}), else from the provider when it is configured and the request budget
 *       allows, else from the end-of-day store with a notice saying why. A live quote is written to
 *       the store, so it is the fallback later. End-of-day answers are not cached, so live prices
 *       return as soon as the budget does.
 *   <li>Cache misses for one symbol are served one at a time, so concurrent asks for it buy one
 *       request; a slow answer for one symbol does not hold up the others.
 *   <li>No request is spent on a blank symbol, nor, once the full listing is downloaded, on a
 *       symbol that is not listed.
 *   <li>A seed close (the simulator's demo prices) says so in its notice.
 * </ul>
 */
@Slf4j
public class PriceService {

    private static final String NOT_CONFIGURED = "Market data provider not configured: end-of-day close shown";
    private static final String BUDGET_SPENT = "Live price request limit reached: end-of-day close shown";
    private static final String RATE_LIMITED = "Market data provider rate limit reached: end-of-day close shown";
    private static final String UNREACHABLE = "Market data provider not reachable: end-of-day close shown";

    private final MarketDataProvider provider;
    private final InstrumentCatalog catalog;
    private final EndOfDayStore store;
    private final RequestBudget budget;
    private final TtlCache<String, Optional<Quote>> quotes;
    private final PriceMetrics metrics;
    private final java.util.concurrent.ConcurrentMap<String, Object> misses = new java.util.concurrent.ConcurrentHashMap<>();

    public PriceService(
            MarketDataProvider provider,
            InstrumentCatalog catalog,
            EndOfDayStore store,
            RequestBudget budget,
            Duration quoteTtl,
            Clock clock,
            PriceMetrics metrics) {
        this.provider = provider;
        this.catalog = catalog;
        this.store = store;
        this.budget = budget;
        this.quotes = new TtlCache<>(quoteTtl, clock);
        this.metrics = metrics;
    }

    /** Instruments matching part of a symbol or name, from the instrument list. */
    public InstrumentSearchResult search(String query) {
        List<Instrument> found = catalog.search(query);
        metrics.request("search", MarketDataSource.REFERENCE_DATA.name(), found.isEmpty() ? Outcome.NOT_FOUND : Outcome.FOUND);
        return InstrumentSearchResult.builder().instruments(found).source(MarketDataSource.REFERENCE_DATA).build();
    }

    /** The latest price: live, cached or the last close; empty when nobody prices the symbol. */
    public Optional<Quote> quote(String symbol) {
        String key = symbol.strip().toUpperCase(Locale.ROOT);
        if (key.isEmpty()) {
            metrics.request("quote", "NONE", Outcome.NOT_FOUND);
            return Optional.empty();
        }
        Optional<Optional<Quote>> cached = quotes.get(key);
        if (cached.isPresent()) {
            return fromCache(key, cached.get());
        }
        // One miss per symbol at a time: concurrent asks for a symbol buy one request, and a slow
        // answer for one symbol does not hold up the others.
        synchronized (misses.computeIfAbsent(key, k -> new Object())) {
            return quoteMiss(key);
        }
    }

    private Optional<Quote> quoteMiss(String key) {
        // Another caller may have bought it while this one waited.
        Optional<Optional<Quote>> cached = quotes.get(key);
        if (cached.isPresent()) {
            return fromCache(key, cached.get());
        }
        if (catalog.isDownloaded() && !catalog.contains(key)) {
            // Not an active listing: no request is spent on it; a close may still price it.
            return endOfDay(key, Outcome.NOT_LISTED, null);
        }
        if (!provider.isConfigured()) {
            return endOfDay(key, Outcome.NOT_CONFIGURED, NOT_CONFIGURED);
        }
        if (!budget.tryAcquire()) {
            return endOfDay(key, Outcome.BUDGET_SPENT, BUDGET_SPENT);
        }
        try {
            Optional<Quote> live = provider.quote(key);
            quotes.put(key, live);
            if (live.isEmpty()) {
                // The provider does not quote it; a close may still price it.
                return endOfDay(key, Outcome.NOT_FOUND, null);
            }
            store.record(live.get());
            metrics.request("quote", MarketDataSource.ALPHA_VANTAGE.name(), Outcome.PROVIDER);
            return live;
        } catch (ProviderUnavailableException e) {
            if (e.reason() == ProviderUnavailableException.Reason.RATE_LIMITED) {
                budget.exhaust();
                log.warn("Provider rate limited; no further provider requests until the budget resets");
                return endOfDay(key, Outcome.RATE_LIMITED, RATE_LIMITED);
            }
            if (e.reason() == ProviderUnavailableException.Reason.NOT_CONFIGURED) {
                return endOfDay(key, Outcome.NOT_CONFIGURED, NOT_CONFIGURED);
            }
            return endOfDay(key, Outcome.UNREACHABLE, UNREACHABLE);
        }
    }

    private Optional<Quote> fromCache(String key, Optional<Quote> cached) {
        if (cached.isPresent()) {
            metrics.request("quote", cached.get().getSource().name(), Outcome.CACHE);
            return cached;
        }
        return endOfDay(key, Outcome.NOT_FOUND, null);
    }

    /** The store's close as a quote, with the notice; counted by why no live price was used. */
    private Optional<Quote> endOfDay(String key, Outcome why, String notice) {
        Optional<Close> close = store.get(key);
        if (close.isEmpty()) {
            metrics.request("quote", "NONE", why);
            log.info("No price for {} ({})", key, why);
            return Optional.empty();
        }
        metrics.request("quote", MarketDataSource.END_OF_DAY.name(), why);
        Close c = close.get();
        BigDecimal change = c.previousClose() == null ? null : c.close().subtract(c.previousClose());
        BigDecimal changePercent = change == null || c.previousClose().signum() == 0 ? null
                : change.multiply(BigDecimal.valueOf(100)).divide(c.previousClose(), 4, RoundingMode.HALF_UP);
        return Optional.of(Quote.builder()
                .symbol(key)
                .last(c.close())
                .previousClose(c.previousClose())
                .change(change)
                .changePercent(changePercent)
                .currency(c.currency())
                .asOf(c.date().toString())
                .source(MarketDataSource.END_OF_DAY)
                .notice(c.origin() == Close.Origin.SEED ? withSeedNote(notice) : notice)
                .build());
    }

    /** The seed's closes are the simulator's demo prices, not market closes: the answer says so. */
    private static String withSeedNote(String notice) {
        String seed = "demo price from the seed data, not a market close";
        return notice == null ? "End-of-day " + seed : notice + " (" + seed + ")";
    }
}
