package org.example.simulator.engine;

import static org.example.simulator.engine.TestOrders.limit;
import static org.example.simulator.engine.TestOrders.market;
import static org.example.simulator.engine.TestOrders.order;
import static org.example.simulator.engine.TestOrders.update;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.example.common.model.msg.CancelState;
import org.example.common.model.msg.OrdType;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.msg.Side;
import org.example.common.model.msg.State;
import org.example.common.model.msg.TimeInForce;
import org.example.simulator.config.SimulatorProperties;
import org.example.simulator.engine.RecordingSink.Sent;
import org.example.simulator.metrics.SimulatorMetrics;
import org.slf4j.LoggerFactory;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class ExchangeEngineTest {

    private final RecordingSink sink = new RecordingSink();
    private final SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    private ExchangeEngine engine;

    @AfterEach
    void tearDown() {
        if (engine != null) {
            engine.shutdown();
        }
    }

    // AC-1
    @Test
    void marketOrder_singleSlice_acksThenFillsAtReference() {
        engine = engine(1, Duration.ZERO);

        engine.onOrderMessage(market("O1", Side.BUY, "100"));
        engine.flush();

        List<Sent> sent = sink.sent();
        assertEquals(List.of("ACCEPT", "FILL"), sink.types());
        assertQty("100", sent.get(1).lastQty());
        assertQty("170", sent.get(1).lastPx());
        assertEquals("O1-F1", sent.get(1).execId());
    }

    // AC-2
    @Test
    void threeSlices_sendsThreeFillsWithDistinctExecIds() {
        engine = engine(3, Duration.ZERO);

        engine.onOrderMessage(market("O1", Side.BUY, "100"));
        engine.flush();

        List<Sent> fills = sink.sent().stream().filter(s -> s.type().equals("FILL")).toList();
        assertEquals(List.of("ACCEPT", "FILL", "FILL", "FILL"), sink.types());
        assertEquals(List.of("O1-F1", "O1-F2", "O1-F3"), fills.stream().map(Sent::execId).toList());
        assertEquals(List.of(qty("33"), qty("33"), qty("34")), fills.stream().map(Sent::lastQty).toList());
    }

    // AC-3
    @Test
    void nonMarketableLimit_isAckedAndRests() {
        engine = engine(1, Duration.ZERO);

        engine.onOrderMessage(limit("O1", Side.BUY, "100", "165.00"));
        engine.flush();

        assertEquals(List.of("ACCEPT"), sink.types());
    }

    // AC-4
    @Test
    void unknownSymbol_sendsRejectOnly() {
        engine = engine(1, Duration.ZERO);

        engine.onOrderMessage(order("O1", "ZZZZ", OrdType.MARKET, Side.BUY, "100", null, TimeInForce.DAY));
        engine.flush();

        assertEquals(List.of("REJECT"), sink.types());
        assertTrue(sink.sent().getFirst().text().contains("Unknown symbol ZZZZ"));
    }

    // AC-5
    @Test
    void invalidQty_sendsRejectOnly() {
        engine = engine(1, Duration.ZERO);

        engine.onOrderMessage(market("O1", Side.BUY, "0"));
        engine.onOrderMessage(market("O2", Side.BUY, null));
        engine.flush();

        assertEquals(List.of("REJECT", "REJECT"), sink.types());
    }

    // AC-6
    @Test
    void iocNotMarketable_acksThenCancels() {
        engine = engine(1, Duration.ZERO);

        engine.onOrderMessage(
                order("O1", "AAPL", OrdType.LIMIT, Side.BUY, "100", "165.00", TimeInForce.IMMEDIATE_OR_CANCEL));
        engine.flush();

        assertEquals(List.of("ACCEPT", "CANCEL"), sink.types());
    }

    // AC-6
    @Test
    void iocMarketable_fillsAndDoesNotCancel() {
        engine = engine(2, Duration.ZERO);

        engine.onOrderMessage(
                order("O1", "AAPL", OrdType.LIMIT, Side.BUY, "100", "171.00", TimeInForce.IMMEDIATE_OR_CANCEL));
        engine.flush();

        assertEquals(List.of("ACCEPT", "FILL", "FILL"), sink.types());
    }

    // AC-7
    @Test
    void cancelRequestForRestingOrder_sendsCancel() {
        engine = engine(1, Duration.ZERO);
        OrderMessage resting = limit("O1", Side.BUY, "100", "165.00");

        engine.onOrderMessage(resting);
        engine.onOrderMessage(update(resting, State.LIVE, null));
        engine.onOrderMessage(update(resting, State.LIVE, CancelState.PCXL));
        engine.flush();

        assertEquals(List.of("ACCEPT", "CANCEL"), sink.types());
    }

    // AC-7, with fills racing the cancel (order-lifecycle.md §9.2)
    @Test
    void cancelRequestDuringSlicing_cancelsOnlyTheRemainder() throws Exception {
        engine = engine(4, Duration.ofMillis(300));
        OrderMessage order = market("O1", Side.BUY, "100");

        engine.onOrderMessage(order);
        awaitTypes(List.of("ACCEPT", "FILL"));
        engine.onOrderMessage(update(order, State.LIVE, CancelState.PCXL));
        Thread.sleep(1_500);

        assertEquals(List.of("ACCEPT", "FILL", "CANCEL"), sink.types());
    }

    @Test
    void cancelRequestAfterFullFill_sendsCancelReject() {
        engine = engine(1, Duration.ZERO);
        OrderMessage order = market("O1", Side.BUY, "100");

        engine.onOrderMessage(order);
        engine.onOrderMessage(update(order, State.LIVE, CancelState.PCXL));
        engine.flush();

        assertEquals(List.of("ACCEPT", "FILL", "CANCEL_REJECT"), sink.types());
        assertEquals("Too late to cancel", sink.sent().getLast().text());
    }

    // AC-8
    @Test
    void cancelRequestForUnknownOrder_sendsCancelReject() {
        engine = engine(1, Duration.ZERO);

        engine.onOrderMessage(update(limit("O9", Side.BUY, "100", "165.00"), State.LIVE, CancelState.PCXL));
        engine.flush();

        assertEquals(List.of("CANCEL_REJECT"), sink.types());
        assertEquals("Unknown order", sink.sent().getFirst().text());
    }

    @Test
    void secondCancelRequest_afterACancelReject_isAnsweredAgain() {
        engine = engine(1, Duration.ZERO);
        OrderMessage unknown = update(limit("O9", Side.BUY, "100", "165.00"), State.LIVE, CancelState.PCXL);

        engine.onOrderMessage(unknown);
        engine.onOrderMessage(update(unknown, State.LIVE, CancelState.REJ));
        engine.onOrderMessage(update(unknown, State.LIVE, CancelState.PCXL));
        engine.flush();

        assertEquals(List.of("CANCEL_REJECT", "CANCEL_REJECT"), sink.types());
    }

    // AC-10
    @Test
    void redeliveredUnack_andOmsOwnUpdates_sendNothing() {
        engine = engine(1, Duration.ZERO);
        OrderMessage order = market("O1", Side.BUY, "100");
        OrderMessage resting = limit("O2", Side.BUY, "100", "165.00");

        engine.onOrderMessage(order);
        engine.onOrderMessage(resting);
        engine.flush();
        List<String> before = sink.types();

        engine.onOrderMessage(order); // redelivered NewOrderSingle
        engine.onOrderMessage(update(order, State.LIVE, null)); // OMS echo of the ack
        engine.onOrderMessage(update(order, State.FILLED, null)); // OMS echo of the fill
        engine.onOrderMessage(resting);
        engine.onOrderMessage(update(resting, State.LIVE, CancelState.PCXL));
        engine.onOrderMessage(update(resting, State.LIVE, CancelState.PCXL)); // redelivered request
        engine.onOrderMessage(update(resting, State.CXL, CancelState.CXL)); // OMS echo of the cancel
        engine.flush();

        List<String> after = sink.types();
        assertEquals(before.size() + 1, after.size(), "only the first cancel request is answered: " + after);
        assertEquals("CANCEL", after.getLast());
    }

    // AC-10: an answer's commandId is derived from the OMS event it answers, so a replayed event
    // yields the same id (oms-core refuses it as a duplicate) and a new event a new one.
    @Test
    void commandIdsAreDeterministicPerAnswer() {
        engine = engine(1, Duration.ZERO);
        OrderMessage resting = limit("O2", Side.BUY, "100", "165.00");
        OrderMessage cancelRequest = update(update(resting, State.LIVE, null), State.LIVE, CancelState.PCXL);
        OrderMessage unknownRequest = update(limit("O9", Side.BUY, "1", "165.00"), State.LIVE, CancelState.PCXL);
        unknownRequest.setEventId(7L);

        engine.onOrderMessage(order("O3", "ZZZZ", OrdType.MARKET, Side.BUY, "100", null, TimeInForce.DAY));
        engine.onOrderMessage(order("O1", "AAPL", OrdType.LIMIT, Side.BUY, "100", "165.00", TimeInForce.IMMEDIATE_OR_CANCEL));
        engine.onOrderMessage(resting);
        engine.onOrderMessage(cancelRequest);
        engine.onOrderMessage(unknownRequest);
        engine.flush();

        assertEquals(
                List.of("O3-REJ-1", "O1-CXL-1", "O2-CXL-3", "O9-CXLREJ-7"),
                sink.sent().stream().map(Sent::commandId).filter(java.util.Objects::nonNull).toList());

        // A restarted venue answering the same request produces the same id.
        engine.shutdown();
        RecordingSink restartedSink = new RecordingSink();
        SimulatorProperties properties = properties(1, Duration.ZERO);
        engine = new ExchangeEngine(new OrderEvaluator(properties), properties, restartedSink, new SimulatorMetrics(meterRegistry));
        engine.onOrderMessage(unknownRequest);
        engine.flush();
        assertEquals("O9-CXLREJ-7", restartedSink.sent().getFirst().commandId());
    }

    // Bounded memory: the oldest orders are forgotten beyond the window, recent ones are not, so a
    // replayed NewOrderSingle within the window is still recognised.
    @Test
    void orderStateIsBounded_oldestForgottenRecentKept() {
        maxTrackedOrders = 2;
        engine = engine(1, Duration.ZERO);
        OrderMessage oldest = limit("O1", Side.BUY, "100", "165.00");
        OrderMessage recent = limit("O3", Side.BUY, "100", "165.00");

        engine.onOrderMessage(oldest);
        engine.onOrderMessage(limit("O2", Side.BUY, "100", "165.00"));
        engine.onOrderMessage(recent);
        engine.onOrderMessage(recent); // replay within the window: ignored
        engine.onOrderMessage(update(oldest, State.LIVE, CancelState.PCXL));
        engine.flush();

        assertEquals(List.of("ACCEPT", "ACCEPT", "ACCEPT", "CANCEL_REJECT"), sink.types());
        assertEquals("Unknown order", sink.sent().getLast().text());
    }

    // AC-12
    @Test
    void logsIncludeOrderId() {
        engine = engine(1, Duration.ZERO);
        Logger logger = (Logger) LoggerFactory.getLogger(ExchangeEngine.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            engine.onOrderMessage(market("O-LOG", Side.BUY, "100"));
            engine.flush();
        } finally {
            logger.detachAppender(appender);
        }

        assertTrue(!appender.list.isEmpty(), "the engine should log what it does");
        assertTrue(
                appender.list.stream().allMatch(event -> "O-LOG".equals(event.getMDCPropertyMap().get("orderId"))),
                "every engine log line carries the orderId in the MDC");
    }

    // AC-12
    @Test
    void countsEveryAnswerByKind() {
        engine = engine(2, Duration.ZERO);
        OrderMessage resting = limit("O2", Side.BUY, "100", "165.00");

        engine.onOrderMessage(market("O1", Side.BUY, "100"));
        engine.onOrderMessage(order("O3", "ZZZZ", OrdType.MARKET, Side.BUY, "100", null, TimeInForce.DAY));
        engine.onOrderMessage(resting);
        engine.onOrderMessage(update(resting, State.LIVE, CancelState.PCXL));
        engine.onOrderMessage(update(limit("O9", Side.BUY, "1", "165.00"), State.LIVE, CancelState.PCXL));
        engine.flush();

        assertEquals(3.0, meterRegistry.counter("simulator.orders.received").count());
        assertEquals(2.0, meterRegistry.counter("simulator.acks").count());
        assertEquals(2.0, meterRegistry.counter("simulator.executions").count());
        assertEquals(1.0, meterRegistry.counter("simulator.rejects").count());
        assertEquals(1.0, meterRegistry.counter("simulator.cancels").count());
        assertEquals(1.0, meterRegistry.counter("simulator.cancel.rejects").count());
    }

    // ----------------------------------------------------------------------------------------

    private ExchangeEngine engine(int slices, Duration delay) {
        SimulatorProperties properties = properties(slices, delay);
        return new ExchangeEngine(new OrderEvaluator(properties), properties, sink, new SimulatorMetrics(meterRegistry));
    }

    private int maxTrackedOrders = 100_000;

    private SimulatorProperties properties(int slices, Duration delay) {
        return
                new SimulatorProperties(
                        Map.of("AAPL", new BigDecimal("170.00")),
                        new BigDecimal("10"),
                        slices,
                        delay,
                        "XSIM",
                        "oms_orders",
                        "commands",
                        maxTrackedOrders);
    }

    private void awaitTypes(List<String> expected) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5_000;
        while (System.currentTimeMillis() < deadline && !sink.types().equals(expected)) {
            Thread.sleep(10);
        }
        assertEquals(expected, sink.types());
    }

    private static BigDecimal qty(String value) {
        return new BigDecimal(value).setScale(4);
    }

    private static void assertQty(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual), () -> expected + " vs " + actual);
    }
}
