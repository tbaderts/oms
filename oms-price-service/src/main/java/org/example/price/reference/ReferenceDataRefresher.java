package org.example.price.reference;

import java.time.Duration;
import java.util.List;

import org.example.common.model.marketdata.Instrument;
import org.example.common.model.marketdata.MarketDataSource;
import org.example.price.budget.RequestBudget;
import org.example.price.provider.MarketDataProvider;
import org.example.price.provider.ProviderUnavailableException;
import org.example.price.service.PriceMetrics;
import org.example.price.service.PriceMetrics.Outcome;

import lombok.extern.slf4j.Slf4j;

/**
 * Keeps the instrument list current (SPEC-0079): when it is older than {@code refreshInterval}
 * (default a day), one {@code LISTING_STATUS} request within the budget replaces it. Searches never
 * ask the provider. When the provider cannot answer, the list in use stays; a rate limit also
 * spends the rest of the day's budget.
 */
@Slf4j
public class ReferenceDataRefresher {

    private static final String SOURCE = MarketDataSource.REFERENCE_DATA.name();

    private final MarketDataProvider provider;
    private final InstrumentCatalog catalog;
    private final RequestBudget budget;
    private final Duration refreshInterval;
    private final PriceMetrics metrics;

    public ReferenceDataRefresher(
            MarketDataProvider provider,
            InstrumentCatalog catalog,
            RequestBudget budget,
            Duration refreshInterval,
            PriceMetrics metrics) {
        this.provider = provider;
        this.catalog = catalog;
        this.budget = budget;
        this.refreshInterval = refreshInterval;
        this.metrics = metrics;
    }

    /** Refreshes only when the list is due; checked hourly by {@code PriceSchedule}. */
    public synchronized void refresh() {
        if (!provider.isConfigured() || catalog.age().compareTo(refreshInterval) <= 0) {
            return;
        }
        if (!budget.tryAcquire()) {
            log.info("Instrument list due for a refresh, but the provider budget is spent; trying again later");
            metrics.request("refresh", SOURCE, Outcome.BUDGET_SPENT);
            return;
        }
        try {
            List<Instrument> listings = provider.listings();
            if (listings.isEmpty()) {
                log.warn("The provider listed no instruments; keeping the current list of {}", catalog.size());
                metrics.request("refresh", SOURCE, Outcome.NOT_FOUND);
                return;
            }
            catalog.replace(listings);
            metrics.request("refresh", SOURCE, Outcome.PROVIDER);
        } catch (ProviderUnavailableException e) {
            if (e.reason() == ProviderUnavailableException.Reason.RATE_LIMITED) {
                budget.exhaust();
            }
            log.warn("Instrument list not refreshed ({}); keeping the current list of {}", e.reason(), catalog.size());
            metrics.request("refresh", SOURCE, Outcome.valueOf(e.reason().name()));
        } catch (java.io.UncheckedIOException e) {
            // The download is spent; the list in use stays, and the next check tries again.
            log.warn("Instrument list downloaded but not written ({}); keeping the current list of {}",
                    e.getCause().getClass().getSimpleName(), catalog.size());
            metrics.request("refresh", SOURCE, Outcome.FAILED);
        }
    }
}
