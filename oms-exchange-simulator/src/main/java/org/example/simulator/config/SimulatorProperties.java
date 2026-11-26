package org.example.simulator.config;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * How the simulated venue behaves.
 *
 * @param referencePrices the fallback price per symbol, used when the price service is not
 *     configured, cannot answer or has no price (SPEC-0073, SPEC-0079); a symbol priced by neither is
 *     unknown to the venue and its orders are rejected
 * @param priceCollar how far through the reference price a limit may be before it is rejected
 * @param quoteTtl how long a price service answer is reused
 * @param providerBackoff after the price service was unreachable, how long it is not asked; the
 *     static prices are used meanwhile
 * @param priceService where reference prices come from (SPEC-0079); without a URL it is never asked
 * @param fillSlices how many executions a marketable quantity is split into (1 = single fill)
 * @param fillDelay pause between consecutive executions of one order
 * @param lastMkt market identifier reported on every execution (FIX LastMkt)
 * @param orderTopic topic the OMS publishes orders on
 * @param commandTopic topic the OMS consumes commands from
 * @param maxTrackedOrders how many orders the venue remembers; beyond this the oldest are forgotten,
 *     which bounds memory. A cancel request for a forgotten order is refused as unknown.
 */
@ConfigurationProperties("simulator")
public record SimulatorProperties(
        @DefaultValue Map<String, BigDecimal> referencePrices,
        @DefaultValue PriceCollar priceCollar,
        @DefaultValue("5m") Duration quoteTtl,
        @DefaultValue("60s") Duration providerBackoff,
        @DefaultValue PriceService priceService,
        @DefaultValue("1") int fillSlices,
        @DefaultValue("0ms") Duration fillDelay,
        @DefaultValue("XSIM") String lastMkt,
        @DefaultValue("oms_orders") String orderTopic,
        @DefaultValue("commands") String commandTopic,
        @DefaultValue("100000") int maxTrackedOrders) {

    public SimulatorProperties {
        if (fillSlices < 1) {
            throw new IllegalArgumentException("simulator.fill-slices must be at least 1");
        }
        if (maxTrackedOrders < 1) {
            throw new IllegalArgumentException("simulator.max-tracked-orders must be at least 1");
        }
        referencePrices = Map.copyOf(referencePrices);
        priceCollar = priceCollar != null ? priceCollar : new PriceCollar(null, null);
        priceService = priceService != null ? priceService : new PriceService(null);
    }

    /**
     * The limit-order price collar, by reference price (SPEC-0073). Defaults to the NYSE Limit Order
     * Price Protection tiers: 10 % up to 25.00, 5 % up to 50.00, 3 % above.
     *
     * @param tiers ascending by {@code maxReference}; the first whose {@code maxReference} is at or
     *     above the reference price applies. Empty or unset means the default tiers.
     * @param defaultPercent the collar above the last tier
     */
    public record PriceCollar(List<Tier> tiers, BigDecimal defaultPercent) {

        public static final List<Tier> DEFAULT_TIERS =
                List.of(new Tier(new BigDecimal("25.00"), new BigDecimal("10")), new Tier(new BigDecimal("50.00"), new BigDecimal("5")));

        public PriceCollar {
            tiers = tiers == null || tiers.isEmpty()
                    ? DEFAULT_TIERS
                    : tiers.stream().sorted(Comparator.comparing(Tier::maxReference)).toList();
            defaultPercent = defaultPercent != null ? defaultPercent : new BigDecimal("3");
        }

        public record Tier(BigDecimal maxReference, BigDecimal percent) {}
    }

    /** The price service (SPEC-0079), which owns market data; blank means static prices only. */
    public record PriceService(String url) {

        public PriceService {
            url = url != null ? url.trim() : "";
        }
    }
}
