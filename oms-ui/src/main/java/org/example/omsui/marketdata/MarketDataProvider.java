package org.example.omsui.marketdata;

import java.util.List;
import java.util.Optional;

import org.example.common.model.marketdata.Instrument;
import org.example.common.model.marketdata.Quote;

/**
 * A source of instrument names and quotes for order entry (SPEC-0072). Alpha Vantage is the first;
 * another provider plugs in here without changing the UI or the API.
 */
public interface MarketDataProvider {

    /** Whether it can be asked at all (e.g. it has an API key). */
    boolean isConfigured();

    /**
     * Instruments matching part of a symbol or name.
     *
     * @throws ProviderUnavailableException when the provider cannot answer now
     */
    List<Instrument> search(String query);

    /**
     * The latest quote, or empty when the provider has none for this symbol.
     *
     * @throws ProviderUnavailableException when the provider cannot answer now
     */
    Optional<Quote> quote(String symbol);
}
