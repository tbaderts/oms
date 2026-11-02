package org.example.oms.service.endofday;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.example.common.model.State;
import org.example.common.model.cmd.OrderCloseCmd;
import org.example.oms.repository.OrderRepository;
import org.example.oms.service.lifecycle.OrderLifecycleCommandProcessor;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.stereotype.Service;

import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * End of day (SPEC-0029): expire the DAY orders still open, then close every order that is finished
 * — FILLED, CXL, REJ or EXP — so that nothing more happens to it.
 *
 * <p>An order is closed if its last event is before the cutoff, the instant end of day started,
 * or if this run expired it. An order that changed after the cutoff is left for the next end of day.
 * Each close is an {@code OrderCloseCmd} through the lifecycle pipeline, with a command id derived
 * from the order and the day.
 *
 * <p>One order's problem never stops the run: a refusal is logged, and any exception is logged with
 * the order id, counted in {@code oms.end-of-day.failures{step=close}} and left for the next end of
 * day. Applied closes are counted in {@code oms.end-of-day.orders{step=close}}.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class EndOfDayService {

    static final String STEP = "close";
    private static final List<State> FINISHED = List.of(State.FILLED, State.CXL, State.REJ, State.EXP);
    private static final DateTimeFormatter DAY = DateTimeFormatter.BASIC_ISO_DATE.withZone(ZoneOffset.UTC);

    private final OrderRepository orderRepository;
    private final OrderExpiryService orderExpiryService;
    private final OrderLifecycleCommandProcessor orderLifecycleCommandProcessor;
    private final MeterRegistry meterRegistry;

    /** What one end of day did: orders expired, closed, and those that failed (either step). */
    public record EndOfDayResult(int expired, int closed, int failed) {}

    public EndOfDayResult run(Instant cutoff) {
        OrderExpiryService.Expiry expiry = orderExpiryService.expireDayOrders(cutoff);

        Set<String> toClose = new LinkedHashSet<>(orderRepository.findIdsUnchangedSince(FINISHED, cutoff));
        toClose.addAll(expiry.expired());

        int closed = 0;
        int failed = 0;
        for (String orderId : toClose) {
            OrderCloseCmd command = new OrderCloseCmd().orderId(orderId).text("End of day");
            command.setType("OrderCloseCmd");
            command.setCommandId("EOD-" + orderId + "-" + DAY.format(cutoff));
            try {
                var result = orderLifecycleCommandProcessor.process(command, cutoff);
                if (result.isSuccess()) {
                    closed++;
                    meterRegistry.counter("oms.end-of-day.orders", "step", STEP).increment();
                } else {
                    log.warn("End-of-day close of order {} refused: {}", orderId, result.getErrorMessage());
                }
            } catch (ConcurrencyFailureException e) {
                failed++;
                meterRegistry.counter("oms.end-of-day.failures", "step", STEP).increment();
                log.warn("End-of-day close of order {} lost to a concurrent command; next end of day", orderId);
            } catch (RuntimeException e) {
                failed++;
                meterRegistry.counter("oms.end-of-day.failures", "step", STEP).increment();
                log.error("End-of-day close of order {} failed; next end of day", orderId, e);
            }
        }
        int expired = expiry.expired().size();
        int allFailed = expiry.failed() + failed;
        log.info("End of day at {}: {} order(s) expired, {} closed, {} failed", cutoff, expired, closed, allFailed);
        return new EndOfDayResult(expired, closed, allFailed);
    }
}
