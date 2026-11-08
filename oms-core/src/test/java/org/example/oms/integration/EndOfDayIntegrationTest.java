package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import org.example.common.model.State;
import org.example.common.model.cmd.OrdType;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.Side;
import org.example.common.model.cmd.TimeInForce;
import org.example.oms.model.Event;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.service.endofday.EndOfDayService;
import org.example.oms.service.endofday.OrderExpiryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * SPEC-0029 AC-4 and AC-5: the expiry step expires only GTD orders whose expiry time has passed;
 * end of day also expires DAY orders, then closes every order finished before it. Both issue the
 * same commands as a client would, so each change is an event with a published message.
 *
 * <p>The scheduler itself is off in tests (config/application.yml); the services are called with
 * explicit instants.
 */
class EndOfDayIntegrationTest extends AbstractFillFlowIntegrationTest {

    @Autowired OrderExpiryService orderExpiryService;
    @Autowired EndOfDayService endOfDayService;
    @Autowired OrderEventRepository orderEventRepository;
    @Autowired org.example.oms.repository.CommandLogRepository commandLogRepository;
    @Autowired org.example.oms.service.lifecycle.OrderLifecycleCommandProcessor orderLifecycleCommandProcessor;
    @Autowired org.springframework.kafka.core.ConsumerFactory<Object, Object> consumerFactory;

    private static final Instant NOW = Instant.now();

    // AC-4
    @Test
    void gtdExpiryExpiresOnlyDueGtdOrders() {
        String dueLive = live(order(TimeInForce.GOOD_TILL_DATE, NOW.minusSeconds(60)));
        String dueUnack = order(TimeInForce.GOOD_TILL_DATE, NOW.minusSeconds(60));
        String notYetDue = live(order(TimeInForce.GOOD_TILL_DATE, NOW.plusSeconds(3_600)));
        String day = live(order(TimeInForce.DAY, null));
        String gtc = live(order(TimeInForce.GOOD_TILL_CANCEL, null));

        orderExpiryService.expireDueGtd(NOW);

        assertEquals(State.EXP, state(dueLive));
        assertEquals(State.EXP, state(dueUnack));
        assertEquals(State.LIVE, state(notYetDue));
        assertEquals(State.LIVE, state(day));
        assertEquals(State.LIVE, state(gtc));
        assertEquals(Event.EXP, lastEvent(dueLive));
    }

    // AC-4
    @Test
    void endOfDayExpiresDayOrders() {
        String dayLive = live(order(TimeInForce.DAY, null));
        String dayUnack = order(TimeInForce.DAY, null);
        String gtc = live(order(TimeInForce.GOOD_TILL_CANCEL, null));
        // No time in force: DAY, the FIX default (review).
        String noTif = live(order(null, null));

        endOfDayService.run(Instant.now());

        assertEquals(State.CLOSED, state(dayLive), "expired, then closed by the same end of day");
        assertEquals(State.CLOSED, state(dayUnack));
        assertTrue(orderEventRepository.findByOrderIdOrderByVersionAsc(dayLive).stream().anyMatch(e -> e.getEvent() == Event.EXP),
                "the expiry is recorded before the close");
        assertEquals(State.LIVE, state(gtc), "good till cancel survives the day");
        assertEquals(State.CLOSED, state(noTif), "no time in force means DAY");
    }

    // AC-5
    @Test
    void endOfDayClosesOrdersFinishedBeforeTheCutoff() throws Exception {
        String filled = live(order(TimeInForce.GOOD_TILL_CANCEL, null));
        assertEquals(201, postFill(filled + "-F1", filled, "100", null));
        String expired = live(order(TimeInForce.GOOD_TILL_DATE, NOW.minusSeconds(60)));
        orderExpiryService.expireDueGtd(NOW);
        assertEquals(State.EXP, state(expired));
        String cancelled = live(order(TimeInForce.GOOD_TILL_CANCEL, null));
        assertTrue(orderLifecycleCommandProcessor.process(
                new org.example.common.model.cmd.OrderCancelCmd(cancelled, "OrderCancelCmd"), Instant.now()).isSuccess());
        String rejected = order(TimeInForce.GOOD_TILL_CANCEL, null);
        assertTrue(orderLifecycleCommandProcessor.process(
                new org.example.common.model.cmd.OrderRejectCmd(rejected, "OrderRejectCmd"), Instant.now()).isSuccess());

        Thread.sleep(20);
        Instant cutoff = Instant.now();
        Thread.sleep(20);
        String filledAfterCutoff = live(order(TimeInForce.GOOD_TILL_CANCEL, null));
        assertEquals(201, postFill(filledAfterCutoff + "-F1", filledAfterCutoff, "100", null));

        endOfDayService.run(cutoff);

        for (String finished : java.util.List.of(filled, expired, cancelled, rejected)) {
            assertEquals(State.CLOSED, state(finished), finished);
            assertEquals(Event.CLOSE, lastEvent(finished), finished);
        }
        assertTrue(publishedClosed(filled), "the close is published on orders");
        assertEquals(0, new BigDecimal("100").compareTo(orderRepository.findByOrderId(filled).orElseThrow().getCumQty()));
        assertEquals(State.FILLED, state(filledAfterCutoff), "finished after the cutoff: closed by the next end of day");
    }

    /** SPEC-0046 AC-5: the scheduled jobs' commands are logged with the scheduler as their sender. */
    @Test
    void scheduledCommandsAreLoggedAsScheduler() throws Exception {
        String filled = live(order(TimeInForce.GOOD_TILL_CANCEL, null));
        assertEquals(201, postFill(filled + "-F1", filled, "100", null));
        String due = live(order(TimeInForce.GOOD_TILL_DATE, NOW.minusSeconds(60)));
        orderExpiryService.expireDueGtd(NOW);
        Thread.sleep(20);

        endOfDayService.run(Instant.now());

        org.example.oms.model.CommandLogEntry close = scheduled(filled, "OrderCloseCmd");
        assertEquals(org.example.oms.model.CommandSource.SCHEDULER, close.getSource());
        assertEquals("oms-core:end-of-day", close.getPrincipal());
        assertEquals(org.example.oms.model.CommandOutcome.APPLIED, close.getOutcome());
        assertEquals(versionOf(filled, Event.CLOSE), close.getEventVersion(), "the CLOSE event's version");
        org.example.oms.model.CommandLogEntry expiry = scheduled(due, "OrderExpireCmd");
        assertEquals(org.example.oms.model.CommandSource.SCHEDULER, expiry.getSource());
        assertEquals("oms-core:expiry", expiry.getPrincipal());
        assertEquals(org.example.oms.model.CommandOutcome.APPLIED, expiry.getOutcome());
        assertEquals(versionOf(due, Event.EXP), expiry.getEventVersion(), "the EXP event's version");
    }

    private long versionOf(String orderId, Event event) {
        return orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).stream()
                .filter(e -> e.getEvent() == event)
                .findFirst()
                .orElseThrow(() -> new AssertionError(event + " of " + orderId + " not recorded"))
                .getVersion();
    }

    private org.example.oms.model.CommandLogEntry scheduled(String orderId, String type) {
        return commandLogRepository.findByOrderIdOrderByReceivedAtAscIdAsc(orderId).stream()
                .filter(e -> type.equals(e.getType()))
                .findFirst()
                .orElseThrow(() -> new AssertionError(type + " of " + orderId + " not logged"));
    }

    // AC-4, AC-5
    @Test
    void stepsAreIdempotent() {
        String due = live(order(TimeInForce.GOOD_TILL_DATE, NOW.minusSeconds(60)));
        String day = live(order(TimeInForce.DAY, null));
        orderExpiryService.expireDueGtd(NOW);
        endOfDayService.run(Instant.now());
        long dueEvents = events(due);
        long dayEvents = events(day);

        orderExpiryService.expireDueGtd(NOW);
        endOfDayService.run(Instant.now());

        assertEquals(State.CLOSED, state(due));
        assertEquals(State.CLOSED, state(day));
        assertEquals(dueEvents, events(due), "nothing more for an order already closed");
        assertEquals(dayEvents, events(day));
    }

    // ----------------------------------------------------------------------------------------

    /** Creates an UNACK order with the given time in force. */
    private String order(TimeInForce timeInForce, Instant expireTime) {
        var order = new org.example.common.model.cmd.Order()
                .clOrdId("CL-" + UUID.randomUUID())
                .sessionId("SES-EOD")
                .account("ACC-EOD")
                .symbol("AAPL")
                .side(Side.BUY)
                .ordType(OrdType.LIMIT)
                .price(new BigDecimal("170"))
                .orderQty(new BigDecimal("100"))
                .timeInForce(timeInForce)
                .expireTime(expireTime == null ? null : OffsetDateTime.ofInstant(expireTime, ZoneOffset.UTC));
        var result = orderCreateCommandProcessor.process(new OrderCreateCmd().type("OrderCreateCmd").order(order), Instant.now());
        assertTrue(result.isSuccess(), result.getErrorMessage());
        return result.getOrderId();
    }

    private String live(String orderId) {
        var accepted = orderLifecycleCommandProcessor.process(
                new OrderAcceptCmd().orderId(orderId).type("OrderAcceptCmd"), Instant.now());
        assertTrue(accepted.isSuccess(), accepted.getErrorMessage());
        return orderId;
    }

    private boolean publishedClosed(String orderId) {
        java.util.Properties fromStart = TestCommands.avroValues();
        fromStart.put(org.apache.kafka.clients.consumer.ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        try (var consumer = consumerFactory.createConsumer("it-" + UUID.randomUUID(), null, null, fromStart)) {
            consumer.subscribe(java.util.List.of("orders"));
            long deadline = System.nanoTime() + TIMEOUT.toNanos();
            while (System.nanoTime() < deadline) {
                for (var record : consumer.poll(java.time.Duration.ofMillis(200))) {
                    if (record.value() instanceof org.example.common.model.msg.OrderMessage message
                            && orderId.equals(message.getOrderId())
                            && message.getState() == org.example.common.model.msg.State.CLOSED) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private Event lastEvent(String orderId) {
        return orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).getLast().getEvent();
    }

    private long events(String orderId) {
        return orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).size();
    }

}
