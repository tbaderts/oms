package org.example.simulator.config;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Map;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * How the simulated venue behaves.
 *
 * @param referencePrices the price each tradable symbol fills at; a symbol not listed is unknown to
 *     the venue and its orders are rejected
 * @param priceBandPercent a limit price further than this from the reference price is rejected
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
        @DefaultValue("10") BigDecimal priceBandPercent,
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
    }
}
