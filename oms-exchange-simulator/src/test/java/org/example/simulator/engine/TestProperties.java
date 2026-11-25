package org.example.simulator.engine;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Map;

import org.example.simulator.config.SimulatorProperties;

/** {@link SimulatorProperties} with defaults for simulator unit tests. */
public final class TestProperties {

    private TestProperties() {}

    public static SimulatorProperties of(Map<String, BigDecimal> referencePrices, int slices, Duration delay, int maxTrackedOrders) {
        return new SimulatorProperties(
                referencePrices,
                null,
                Duration.ofMinutes(5),
                Duration.ofSeconds(60),
                null,
                slices,
                delay,
                "XSIM",
                "oms_orders",
                "commands",
                maxTrackedOrders);
    }

    public static SimulatorProperties aapl170(int slices, Duration delay, int maxTrackedOrders) {
        return of(Map.of("AAPL", new BigDecimal("170.00")), slices, delay, maxTrackedOrders);
    }
}
