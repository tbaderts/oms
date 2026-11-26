package org.example.price.service;

import org.example.price.budget.RequestBudget;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;

/**
 * The price service's metrics (SPEC-0079): {@code oms.price.requests{kind, source, outcome}} counts
 * every search, quote and refresh by where its answer came from and why; the gauge
 * {@code oms.price.provider.budget.remaining} shows the provider requests left today.
 */
public class PriceMetrics {

    /** Why an answer came from where it did. */
    public enum Outcome { FOUND, CACHE, PROVIDER, NOT_FOUND, NOT_LISTED, FAILED, NOT_CONFIGURED, BUDGET_SPENT, RATE_LIMITED, UNREACHABLE }

    private final MeterRegistry meters;

    public PriceMetrics(MeterRegistry meters, RequestBudget budget) {
        this.meters = meters;
        Gauge.builder("oms.price.provider.budget.remaining", budget, RequestBudget::remainingToday)
                .description("Provider requests the price service may still make today")
                .register(meters);
    }

    /** One answered request; {@code kind} is search, quote or refresh. */
    public void request(String kind, String source, Outcome outcome) {
        meters.counter("oms.price.requests", "kind", kind, "source", source, "outcome", outcome.name()).increment();
    }
}
