package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.example.common.model.Order;
import org.example.common.model.cmd.OrdType;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.SecurityIdSource;
import org.example.common.model.cmd.Side;
import org.example.common.model.cmd.TimeInForce;
import org.example.common.model.msg.Execution;
import org.example.common.model.msg.OrderAcceptCmd;
import org.example.common.model.msg.SecurityIDSource;
import org.example.oms.model.CommandLogEntry;
import org.example.oms.model.CommandOutcome;
import org.example.oms.repository.CommandLogRepository;
import org.example.oms.repository.OrderEventRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * SPEC-0069: a fill carries the FIX Instrument block. It is stored and published as the venue
 * reported it (AC-1, AC-2); a fill without one, or with one other than its order's, is refused and
 * changes nothing (AC-3, AC-4).
 */
class ExecutionInstrumentIntegrationTest extends AbstractFillFlowIntegrationTest {

    private static final String MSFT_ISIN = "US5949181045";

    @Autowired CommandLogRepository commandLog;
    @Autowired OrderEventRepository orderEventRepository;
    @Autowired JdbcTemplate jdbc;
    @Autowired ConsumerFactory<Object, Object> consumerFactory;

    /** AC-1 */
    @Test
    void fillWithFullInstrumentIsStoredAndPublished() throws Exception {
        String orderId = createLiveMsftOrder(MSFT_ISIN);

        MockHttpServletResponse response = postFill(orderId, orderId + "-F1",
                "\"symbol\":\"MSFT\",\"securityId\":\"" + MSFT_ISIN + "\",\"securityIdSource\":\"ISIN\",");

        assertEquals(201, response.getStatus(), response.getContentAsString());
        Map<String, Object> row = storedInstrument(orderId);
        assertEquals("MSFT", row.get("symbol"));
        assertEquals(MSFT_ISIN, row.get("security_id"));
        assertEquals("ISIN", row.get("security_id_source"));

        Execution published = awaitPublishedExecution(orderId);
        assertEquals("MSFT", published.getSymbol());
        assertEquals(MSFT_ISIN, published.getSecurityId());
        assertEquals(SecurityIDSource.ISIN, published.getSecurityIdSource());
    }

    /** AC-2 */
    @Test
    void fillWithSecurityIdOnlyIsApplied() throws Exception {
        String orderId = createLiveMsftOrder(MSFT_ISIN);

        MockHttpServletResponse response = postFill(orderId, orderId + "-F1", "\"securityId\":\"" + MSFT_ISIN + "\",");

        assertEquals(201, response.getStatus(), response.getContentAsString());
        Map<String, Object> row = storedInstrument(orderId);
        assertNull(row.get("symbol"), "stored as reported: no symbol");
        assertEquals(MSFT_ISIN, row.get("security_id"));
    }

    /** AC-3 */
    @Test
    void fillWithoutInstrumentIsRefused() throws Exception {
        String orderId = createLiveMsftOrder(null);

        assertRefusedAndNothingChanged(orderId, "", "Instrument is required", "symbol nor securityId");
    }

    /** AC-4 */
    @Test
    void fillOnAnotherSymbolIsRefused() throws Exception {
        String orderId = createLiveMsftOrder(MSFT_ISIN);

        assertRefusedAndNothingChanged(orderId, "\"symbol\":\"AAPL\",", "AAPL", "MSFT");
    }

    /** AC-4, by securityId */
    @Test
    void fillOnAnotherSecurityIdIsRefused() throws Exception {
        String orderId = createLiveMsftOrder(MSFT_ISIN);

        assertRefusedAndNothingChanged(orderId, "\"securityId\":\"US0378331005\",", "US0378331005", MSFT_ISIN);
    }

    private void assertRefusedAndNothingChanged(String orderId, String instrumentJson, String... reasonNames)
            throws Exception {
        Order before = orderRepository.findByOrderId(orderId).orElseThrow();
        int events = orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).size();

        MockHttpServletResponse response = postFill(orderId, orderId + "-F1", instrumentJson);

        assertEquals(400, response.getStatus(), response.getContentAsString());
        for (String name : reasonNames) {
            assertTrue(response.getContentAsString().contains(name), name + " in " + response.getContentAsString());
        }
        assertEquals(0, executionCount(orderId), "no executions row");
        Order after = orderRepository.findByOrderId(orderId).orElseThrow();
        assertEquals(before.getState(), after.getState());
        assertEquals(0, compare(before.getCumQty(), after.getCumQty()), "cumQty unchanged");
        assertEquals(0, compare(before.getLeavesQty(), after.getLeavesQty()), "leavesQty unchanged");
        assertEquals(events, orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).size(), "no event");
        List<CommandLogEntry> refusals = commandLog.findByOrderIdOrderByReceivedAtAscIdAsc(orderId).stream()
                .filter(e -> e.getOutcome() == CommandOutcome.REFUSED).toList();
        assertEquals(1, refusals.size(), "one REFUSED row");
        for (String name : reasonNames) {
            assertTrue(refusals.getFirst().getReason().contains(name), name + " in " + refusals.getFirst().getReason());
        }
    }

    private static int compare(BigDecimal a, BigDecimal b) {
        return (a == null ? BigDecimal.ZERO : a).compareTo(b == null ? BigDecimal.ZERO : b);
    }

    /** A LIVE limit order for 100 MSFT, with the given ISIN or none. */
    private String createLiveMsftOrder(String isin) throws Exception {
        var order = new org.example.common.model.cmd.Order()
                .clOrdId("CL-" + UUID.randomUUID())
                .sessionId("SES-INSTR")
                .account("ACC-INSTR")
                .symbol("MSFT")
                .securityId(isin)
                .securityIdSource(isin != null ? SecurityIdSource.ISIN : null)
                .side(Side.BUY)
                .ordType(OrdType.LIMIT)
                .price(new BigDecimal("420"))
                .orderQty(new BigDecimal("100"))
                .timeInForce(TimeInForce.DAY);
        var result = orderCreateCommandProcessor.process(
                new OrderCreateCmd().type("OrderCreateCmd").order(order), Instant.now());
        assertTrue(result.isSuccess(), result.getErrorMessage());
        String orderId = result.getOrderId();
        send(orderId, new OrderAcceptCmd(TestCommands.header(), orderId));
        awaitUntil(() -> state(orderId) == org.example.common.model.State.LIVE, orderId + " LIVE");
        return orderId;
    }

    /** Posts a fill of 10 @ 420 with the given instrument JSON (each field followed by a comma). */
    private MockHttpServletResponse postFill(String orderId, String execId, String instrumentJson) throws Exception {
        return mockMvc()
                .perform(post("/api/command/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"ExecutionCreateCmd\",\"version\":\"1.0.0\",\"execution\":{"
                                + instrumentJson
                                + "\"execId\":\"" + execId + "\",\"orderId\":\"" + orderId + "\","
                                + "\"lastQty\":10,\"lastPx\":420,\"execType\":\"F\",\"lastMkt\":\"XSIM\"}}"))
                .andReturn()
                .getResponse();
    }

    private Map<String, Object> storedInstrument(String orderId) {
        return jdbc.queryForMap(
                "select symbol, security_id, security_id_source from executions where order_id = ?", orderId);
    }

    /** The Execution record oms_executions carries for the order's fill. */
    private Execution awaitPublishedExecution(String orderId) {
        Properties fromStart = TestCommands.avroValues();
        fromStart.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        List<Execution> found = new ArrayList<>();
        try (Consumer<Object, Object> consumer =
                consumerFactory.createConsumer("it-" + UUID.randomUUID(), null, null, fromStart)) {
            consumer.subscribe(List.of("oms_executions"));
            long deadline = System.nanoTime() + TIMEOUT.toNanos();
            while (found.isEmpty() && System.nanoTime() < deadline) {
                consumer.poll(Duration.ofMillis(200)).forEach(r -> {
                    if (r.value() instanceof Execution e && orderId.equals(e.getOrderId())) {
                        found.add(e);
                    }
                });
            }
        }
        assertEquals(1, found.size(), "one Execution on oms_executions for " + orderId);
        return found.getFirst();
    }
}
