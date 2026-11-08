package org.example.oms.service.endofday;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

import org.example.common.model.State;
import org.example.common.model.TimeInForce;
import org.example.common.model.cmd.OrderExpireCmd;
import org.example.oms.repository.OrderRepository;
import org.example.oms.service.command.CommandDispatch;
import org.example.oms.service.command.CommandDispatcher;
import org.example.oms.service.command.CommandOrigin;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.stereotype.Service;

import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Expires orders whose time in force has run out (SPEC-0029): GTD orders past their expiry time,
 * and DAY orders — including those without a time in force, the FIX default — at end of day.
 *
 * <p>Each order is expired with an {@code OrderExpireCmd} through the lifecycle pipeline, in its own
 * transaction, exactly as a venue's expiry would be: an {@code EXP} event and a published order. The
 * command id is derived from the order and the day, so a repeated run is refused as a duplicate.
 *
 * <p>One order's problem never stops the others: a refusal is logged, and any exception — a
 * concurrent command, a database error — is logged with the order id, counted in
 * {@code oms.end-of-day.failures{step=expire}}, and retried by the next run. Applied expiries are
 * counted in {@code oms.end-of-day.orders{step=expire}}.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class OrderExpiryService {

    static final String STEP = "expire";
    /** Who the command log names as the sender of expiries (SPEC-0046). */
    static final String PRINCIPAL = "oms-core:expiry";
    private static final List<State> OPEN = List.of(State.LIVE, State.UNACK);
    private static final DateTimeFormatter DAY = DateTimeFormatter.BASIC_ISO_DATE.withZone(ZoneOffset.UTC);

    private final OrderRepository orderRepository;
    private final CommandDispatcher commandDispatcher;
    private final MeterRegistry meterRegistry;

    /** Registers this step's counters at 0, so their series exist before the first run (SPEC-0038). */
    @PostConstruct
    void registerMeters() {
        meterRegistry.counter("oms.end-of-day.orders", "step", STEP);
        meterRegistry.counter("oms.end-of-day.failures", "step", STEP);
    }

    /** The orders one expiry pass expired, and how many it could not. */
    public record Expiry(List<String> expired, int failed) {}

    /** Expires the open GTD orders whose expiry time is at or before {@code now}. */
    public int expireDueGtd(Instant now) {
        List<String> due = orderRepository.findIdsToExpire(OPEN, TimeInForce.GOOD_TILL_DATE, now);
        return expire(due, now, "GTD expiry time reached").expired().size();
    }

    /** Expires the open DAY orders; end of day. */
    public Expiry expireDayOrders(Instant now) {
        return expire(orderRepository.findDayOrderIds(OPEN), now, "DAY order expired at end of day");
    }

    private Expiry expire(List<String> orderIds, Instant now, String reason) {
        List<String> expired = new ArrayList<>();
        int failed = 0;
        for (String orderId : orderIds) {
            OrderExpireCmd command = new OrderExpireCmd().orderId(orderId).text(reason);
            command.setType("OrderExpireCmd");
            command.setCommandId("EXP-" + orderId + "-" + DAY.format(now));
            try {
                var result = commandDispatcher.dispatch(command, CommandOrigin.scheduler(PRINCIPAL, now));
                if (result instanceof CommandDispatch.Applied) {
                    expired.add(orderId);
                    meterRegistry.counter("oms.end-of-day.orders", "step", STEP).increment();
                } else {
                    log.warn("Expiry of order {} refused: {}", orderId, result.message());
                }
            } catch (ConcurrencyFailureException e) {
                failed++;
                meterRegistry.counter("oms.end-of-day.failures", "step", STEP).increment();
                log.warn("Expiry of order {} lost to a concurrent command; retried on the next run", orderId);
            } catch (RuntimeException e) {
                failed++;
                meterRegistry.counter("oms.end-of-day.failures", "step", STEP).increment();
                log.error("Expiry of order {} failed; retried on the next run", orderId, e);
            }
        }
        if (!orderIds.isEmpty()) {
            log.info("Expired {} of {} order(s), {} failed: {}", expired.size(), orderIds.size(), failed, reason);
        }
        return new Expiry(expired, failed);
    }
}
