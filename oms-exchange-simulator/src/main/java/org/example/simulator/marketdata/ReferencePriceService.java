package org.example.simulator.marketdata;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.example.simulator.metrics.SimulatorMetrics;

import lombok.extern.slf4j.Slf4j;

/**
 * The venue's reference price for a symbol (SPEC-0073, SPEC-0079): from the cache, else the price
 * service (live or an end-of-day close), else the static {@code simulator.reference-prices}.
 *
 * <ul>
 *   <li>The price service's answers, including "no quote", are cached for {@code quoteTtl}. Fallbacks
 *       are not cached, so the price service is used again as soon as it answers.
 *   <li>After an outage, the price service is not asked for {@code providerBackoff}. Lookups run on
 *       the engine's single thread, so this bounds how long a dead price service can hold up the
 *       venue: one read timeout per back-off period.
 *   <li>The price service's price wins over the static one. A symbol it has no price for falls back
 *       to the static price, so configured test and demo symbols stay tradable.
 * </ul>
 *
 * Every lookup is counted by where its price came from ({@link Source}) and why the provider's
 * price was not used ({@link Outcome}).
 */
@Slf4j
public class ReferencePriceService implements ReferencePrices {

    /** Where a lookup's price came from. */
    public enum Source { CACHE, PRICE_SERVICE, STATIC, NONE }

    /** FOUND when the provider's price was used; otherwise why it was not. */
    public enum Outcome { FOUND, NOT_FOUND, NOT_CONFIGURED, UNREACHABLE }

    private final PriceServiceQuoteClient client;
    private final Map<String, BigDecimal> staticPrices;
    private final TtlCache<String, Optional<BigDecimal>> cache;
    private final Duration providerBackoff;
    private final Clock clock;
    private final SimulatorMetrics metrics;

    private volatile Instant backoffUntil = Instant.MIN;
    private volatile Outcome lastFailure = Outcome.UNREACHABLE;

    public ReferencePriceService(
            PriceServiceQuoteClient client,
            Map<String, BigDecimal> staticPrices,
            Duration quoteTtl,
            Duration providerBackoff,
            Clock clock,
            SimulatorMetrics metrics) {
        this.client = client;
        Map<String, BigDecimal> normalized = new HashMap<>();
        staticPrices.forEach((symbol, price) -> normalized.put(key(symbol), price));
        this.staticPrices = Map.copyOf(normalized);
        this.cache = new TtlCache<>(quoteTtl, clock);
        this.providerBackoff = providerBackoff;
        this.clock = clock;
        this.metrics = metrics;
    }

    @Override
    public Optional<BigDecimal> referencePrice(String symbol) {
        if (symbol == null || symbol.isBlank()) {
            return fallback("", Outcome.NOT_FOUND);
        }
        String key = key(symbol);

        Optional<Optional<BigDecimal>> cached = cache.get(key);
        if (cached.isPresent()) {
            if (cached.get().isPresent()) {
                metrics.referencePriceLookup(Source.CACHE.name(), Outcome.FOUND.name());
                return cached.get();
            }
            return fallback(key, Outcome.NOT_FOUND);
        }

        if (!client.isConfigured()) {
            return fallback(key, Outcome.NOT_CONFIGURED);
        }
        if (clock.instant().isBefore(backoffUntil)) {
            return fallback(key, lastFailure);
        }
        try {
            Optional<BigDecimal> price = client.lastPrice(symbol.trim());
            cache.put(key, price);
            if (price.isPresent()) {
                metrics.referencePriceLookup(Source.PRICE_SERVICE.name(), Outcome.FOUND.name());
                return price;
            }
            return fallback(key, Outcome.NOT_FOUND);
        } catch (ProviderUnavailableException e) {
            return unavailable(key, Outcome.valueOf(e.reason().name()));
        } catch (RuntimeException e) {
            // Lookups run on the engine thread: nothing may escape, or the order is never answered.
            // Log the type only: the message adds nothing an operator can act on.
            log.warn("Price service lookup failed unexpectedly: {}", e.getClass().getSimpleName());
            return unavailable(key, Outcome.UNREACHABLE);
        }
    }

    private Optional<BigDecimal> unavailable(String key, Outcome outcome) {
        if (outcome != Outcome.NOT_CONFIGURED) {
            lastFailure = outcome;
            backoffUntil = clock.instant().plus(providerBackoff);
            log.warn("Price service unavailable ({}); using static reference prices for {}", outcome, providerBackoff);
        }
        return fallback(key, outcome);
    }

    private Optional<BigDecimal> fallback(String key, Outcome outcome) {
        Optional<BigDecimal> price = Optional.ofNullable(staticPrices.get(key));
        metrics.referencePriceLookup((price.isPresent() ? Source.STATIC : Source.NONE).name(), outcome.name());
        return price;
    }

    private static String key(String symbol) {
        return symbol.trim().toUpperCase(Locale.ROOT);
    }
}
