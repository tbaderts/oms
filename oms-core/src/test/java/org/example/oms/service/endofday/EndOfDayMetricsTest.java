package org.example.oms.service.endofday;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.mock;

import org.example.oms.repository.OrderRepository;
import org.example.oms.service.lifecycle.OrderLifecycleCommandProcessor;
import org.junit.jupiter.api.Test;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/**
 * The end-of-day counters exist from startup at 0 (SPEC-0038), so their dashboard panels have a
 * series before the first end of day runs. Names and tags are those of SPEC-0029.
 */
class EndOfDayMetricsTest {

    @Test
    void seriesExistFromStartup() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        OrderRepository orderRepository = mock(OrderRepository.class);
        OrderLifecycleCommandProcessor processor = mock(OrderLifecycleCommandProcessor.class);
        OrderExpiryService expiry = new OrderExpiryService(orderRepository, processor, registry);
        EndOfDayService endOfDay = new EndOfDayService(orderRepository, expiry, processor, registry);

        expiry.registerMeters();
        endOfDay.registerMeters();

        for (String step : new String[] {"expire", "close"}) {
            for (String name : new String[] {"oms.end-of-day.orders", "oms.end-of-day.failures"}) {
                Counter counter = registry.find(name).tag("step", step).counter();
                assertNotNull(counter, name + "{step=" + step + "}");
                assertEquals(0.0, counter.count());
            }
        }
    }
}
