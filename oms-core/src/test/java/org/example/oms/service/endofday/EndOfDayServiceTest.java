package org.example.oms.service.endofday;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;

import org.example.common.model.TimeInForce;
import org.example.common.model.cmd.Command;
import org.example.oms.repository.OrderRepository;
import org.example.oms.service.command.CommandDispatch;
import org.example.oms.service.command.CommandDispatcher;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/**
 * SPEC-0029 review: one order's failure does not stop expiry or end of day; the remaining orders are
 * still processed, and the failure is counted.
 */
class EndOfDayServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-02T22:00:00Z");

    private final OrderRepository orderRepository = mock(OrderRepository.class);
    private final CommandDispatcher processor = mock(CommandDispatcher.class);
    private final SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    private final OrderExpiryService expiry = new OrderExpiryService(orderRepository, processor, meterRegistry);
    private final EndOfDayService endOfDay = new EndOfDayService(orderRepository, expiry, processor, meterRegistry);

    @Test
    void aFailingOrderDoesNotStopExpiryOrClose() {
        when(orderRepository.findDayOrderIds(any())).thenReturn(List.of("DAY-BAD", "DAY-OK"));
        when(orderRepository.findIdsUnchangedSince(any(), any())).thenReturn(List.of("DONE-BAD", "DONE-OK"));
        when(processor.dispatch(argThat((Command c) -> c != null && orderIdOf(c).endsWith("-BAD")), any()))
                .thenThrow(new DataAccessResourceFailureException("connection reset"));
        when(processor.dispatch(argThat((Command c) -> c != null && orderIdOf(c).endsWith("-OK")), any()))
                .thenReturn(new CommandDispatch.Applied("ORD", "ORD", 2L, "applied", false));

        EndOfDayService.EndOfDayResult result = endOfDay.run(NOW);

        assertEquals(1, result.expired(), "DAY-OK expired despite DAY-BAD");
        assertEquals(2, result.closed(), "DONE-OK and the expired DAY-OK closed despite DONE-BAD");
        assertEquals(2, result.failed());
        assertEquals(1.0, meterRegistry.get("oms.end-of-day.failures").tag("step", "expire").counter().count());
        assertEquals(1.0, meterRegistry.get("oms.end-of-day.failures").tag("step", "close").counter().count());
        assertEquals(1.0, meterRegistry.get("oms.end-of-day.orders").tag("step", "expire").counter().count());
        assertEquals(2.0, meterRegistry.get("oms.end-of-day.orders").tag("step", "close").counter().count());
    }

    @Test
    void gtdExpiryContinuesPastAFailingOrder() {
        when(orderRepository.findIdsToExpire(any(), any(TimeInForce.class), any())).thenReturn(List.of("GTD-BAD", "GTD-OK"));
        when(processor.dispatch(argThat((Command c) -> c != null && orderIdOf(c).equals("GTD-BAD")), any()))
                .thenThrow(new IllegalStateException("boom"));
        when(processor.dispatch(argThat((Command c) -> c != null && orderIdOf(c).equals("GTD-OK")), any()))
                .thenReturn(new CommandDispatch.Applied("ORD", "ORD", 2L, "applied", false));

        assertEquals(1, expiry.expireDueGtd(NOW));
        assertEquals(1.0, meterRegistry.get("oms.end-of-day.failures").tag("step", "expire").counter().count());
    }

    private static String orderIdOf(Command command) {
        return switch (command) {
            case org.example.common.model.cmd.OrderExpireCmd c -> c.getOrderId();
            case org.example.common.model.cmd.OrderCloseCmd c -> c.getOrderId();
            default -> "";
        };
    }
}
