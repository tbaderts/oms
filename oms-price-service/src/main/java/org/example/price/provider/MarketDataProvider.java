package org.example.price.provider;

import java.util.List;
import java.util.Optional;

import org.example.common.model.marketdata.Instrument;
import org.example.common.model.marketdata.Quote;

/**
 * A source of listed instruments and quotes (SPEC-0072, moved here by SPEC-0079). Alpha Vantage is
 * the first; another provider plugs in here without changing the price service's callers.
 */
public interface MarketDataProvider {

    /** Whether it can be asked at all (e.g. it has an API key). */
    boolean isConfigured();

    /**
     * Every active listing, for the instrument list: one request.
     *
     * @throws ProviderUnavailableException when the provider cannot answer now
     */
    List<Instrument> listings();

    /**
     * The latest quote, or empty when the provider has none for this symbol: one request.
     *
     * @throws ProviderUnavailableException when the provider cannot answer now
     */
    Optional<Quote> quote(String symbol);
}
