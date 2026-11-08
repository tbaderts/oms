package org.example.oms.integration;

import java.util.Map;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.Environment;

import io.micrometer.core.instrument.MeterRegistry;

/**
 * SPEC-0048 AC-7: every {@link OrderVersionIntegrationTest} scenario holds with a second instance
 * running on the same database and broker, consuming the same command topic.
 *
 * <p>Commands are split between the instances by partition, so a failed attempt may be counted by
 * either; {@link #failedFills} sums both.
 */
class OrderVersionTwoInstanceIntegrationTest extends OrderVersionIntegrationTest {

    private static ConfigurableApplicationContext second;

    @Autowired Environment environment;

    @BeforeEach
    void startSecondInstance() {
        if (second == null) {
            second = SecondInstance.start(environment, Map.of());
        }
    }

    @AfterAll
    static void stopSecondInstance() {
        if (second != null) {
            second.close();
            second = null;
        }
    }

    @Override
    protected double failedFills() {
        return super.failedFills() + failed(second.getBean(MeterRegistry.class));
    }

    private static double failed(MeterRegistry registry) {
        var counter = registry.find("oms.commands.consumed").tag("type", "ExecutionCreateCmd").tag("outcome", "failed").counter();
        return counter == null ? 0 : counter.count();
    }
}
