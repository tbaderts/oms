package org.example.omsui.marketdata;

import java.time.Clock;
import java.time.Duration;
import java.util.Locale;
import java.util.Optional;

import org.example.common.model.marketdata.InstrumentSearchResult;
import org.example.common.model.marketdata.MarketDataSource;
import org.example.common.model.marketdata.Quote;

import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;

/**
 * Instrument lookup and quotes for order entry (SPEC-0072): from the cache, else the provider, else
 * the built-in instruments with a notice saying why. Only provider answers are cached, so data comes
 * back as soon as the provider does; a fallback is never an error for the user.
 *
 * <p>Requests are counted in {@code oms.ui.marketdata.requests{kind, source, outcome}}; outcome is
 * {@code CACHE}, {@code PROVIDER} or the reason the provider could not answer.
 */
@Slf4j
public class MarketDataService {

    private static final String NO_MATCH_NOTICE = null;

    private final MarketDataProvider provider;
    private final BuiltInMarketData builtIn;
    private final TtlCache<String, InstrumentSearchResult> searches;
    private final TtlCache<String, Quote> quotes;
    private final MeterRegistry meters;

    public MarketDataService(
            MarketDataProvider provider,
            BuiltInMarketData builtIn,
            Duration searchTtl,
            Duration quoteTtl,
            Clock clock,
            MeterRegistry meters) {
        this.provider = provider;
        this.builtIn = builtIn;
        this.searches = new TtlCache<>(searchTtl, clock);
        this.quotes = new TtlCache<>(quoteTtl, clock);
        this.meters = meters;
    }

    public InstrumentSearchResult search(String query) {
        String key = query.trim().toLowerCase(Locale.ROOT);
        if (key.isEmpty()) {
            // Nothing to look up: no provider quota is spent on it.
            return InstrumentSearchResult.builder().source(MarketDataSource.BUILT_IN).build();
        }
        Optional<InstrumentSearchResult> cached = searches.get(key);
        if (cached.isPresent()) {
            count("search", cached.get().getSource(), "CACHE");
            return cached.get();
        }
        try {
            InstrumentSearchResult result = InstrumentSearchResult.builder()
                    .instruments(provider.search(key))
                    .source(MarketDataSource.ALPHA_VANTAGE)
                    .build();
            searches.put(key, result);
            count("search", MarketDataSource.ALPHA_VANTAGE, "PROVIDER");
            return result;
        } catch (ProviderUnavailableException e) {
            count("search", MarketDataSource.BUILT_IN, e.reason().name());
            return InstrumentSearchResult.builder()
                    .instruments(builtIn.search(key))
                    .source(MarketDataSource.BUILT_IN)
                    .notice(e.reason().notice())
                    .build();
        }
    }

    /** The latest quote, or empty when neither the provider nor the built-in list has the symbol. */
    public Optional<Quote> quote(String symbol) {
        String key = symbol.trim().toUpperCase(Locale.ROOT);
        Optional<Quote> cached = quotes.get(key);
        if (cached.isPresent()) {
            count("quote", cached.get().getSource(), "CACHE");
            return cached;
        }
        try {
            Optional<Quote> fromProvider = provider.quote(key);
            if (fromProvider.isPresent()) {
                quotes.put(key, fromProvider.get());
                count("quote", MarketDataSource.ALPHA_VANTAGE, "PROVIDER");
                return fromProvider;
            }
            // Not a symbol the provider knows; the built-in list may still price it.
            count("quote", MarketDataSource.BUILT_IN, "NOT_FOUND");
            return builtIn.quote(key, NO_MATCH_NOTICE);
        } catch (ProviderUnavailableException e) {
            count("quote", MarketDataSource.BUILT_IN, e.reason().name());
            return builtIn.quote(key, e.reason().notice());
        }
    }

    private void count(String kind, MarketDataSource source, String outcome) {
        meters.counter("oms.ui.marketdata.requests", "kind", kind, "source", source.name(), "outcome", outcome)
                .increment();
    }
}
