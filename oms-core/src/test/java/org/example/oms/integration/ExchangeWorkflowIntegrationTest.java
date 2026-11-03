package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.header.Header;
import org.example.common.model.CancelState;
import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.cmd.OrdType;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.Side;
import org.example.common.model.cmd.TimeInForce;
import org.example.common.model.msg.ExecutionCreateCmd;
import org.example.common.model.msg.OrderAcceptCmd;
import org.example.common.model.msg.OrderCancelCmd;
import org.example.common.model.msg.OrderCancelRejectCmd;
import org.example.common.model.msg.OrderCancelRequestCmd;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.msg.OrderRejectCmd;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.repository.ExecutionRepository;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.repository.OrderRepository;
import org.example.oms.service.OrderReplayService;
import org.example.oms.service.command.OrderCreateCommandProcessor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * The OMS half of the exchange workflow (SPEC-0001).
 *
 * <p>Each test plays the exact command sequence the exchange simulator emits for a scenario, over
 * the real {@code commands} topic, and asserts the resulting order, executions and event log. The
 * simulator's own integration test proves the other half: that a given order produces exactly
 * this sequence. Together they cover the round trip without coupling the two module builds.
 */
class ExchangeWorkflowIntegrationTest extends AbstractKafkaPostgresIntegrationTest {

    private static final Duration TIMEOUT = Duration.ofSeconds(10);
    private static final BigDecimal REFERENCE = new BigDecimal("170.00");
    private static final String CLIENT_TEXT = "Sample order";

    @Autowired private OrderCreateCommandProcessor orderCreateCommandProcessor;
    @Autowired private OrderRepository orderRepository;
    @Autowired private ExecutionRepository executionRepository;
    @Autowired private OrderEventRepository orderEventRepository;
    @Autowired private OrderReplayService orderReplayService;
    @Autowired private ProducerFactory<Object, Object> producerFactory;
    @Autowired private ConsumerFactory<Object, Object> consumerFactory;
    @Autowired private WebApplicationContext webApplicationContext;

    private KafkaTemplate<String, Object> commands;

    @BeforeEach
    void setUp() {
        executionRepository.deleteAll();
        orderEventRepository.deleteAll();
        orderRepository.deleteAll();
        commands =
                TestCommands.commandTemplate(producerFactory);
    }

    // AC-1
    @Test
    void ackThenSingleFill_ordersFilledWithNewAckFillEvents() throws Exception {
        String orderId = createOrder(OrdType.MARKET, null, "100", null);

        send(orderId, accept(orderId));
        send(orderId, fill(orderId, 1, "100", "100", "0"));

        awaitUntil(() -> state(orderId) == State.FILLED, "order FILLED");
        Order order = order(orderId);
        assertQty("100", order.getCumQty());
        assertQty("0", order.getLeavesQty());

        List<Execution> executions = executions(orderId);
        assertEquals(1, executions.size());
        assertQty("100", executions.getFirst().getLastQty());
        assertQty("170", executions.getFirst().getLastPx());
        assertEquals("F", executions.getFirst().getExecType());

        assertEquals(List.of(Event.NEW_ORDER, Event.ACK, Event.FILL), events(orderId));
    }

    // AC-2
    @Test
    void ackThenThreeFills_eventsPartialPartialFill() throws Exception {
        String orderId = createOrder(OrdType.MARKET, null, "100", null);

        send(orderId, accept(orderId));
        send(orderId, fill(orderId, 1, "33", "33", "67"));
        send(orderId, fill(orderId, 2, "33", "66", "34"));
        send(orderId, fill(orderId, 3, "34", "100", "0"));

        awaitUntil(() -> state(orderId) == State.FILLED, "order FILLED");
        List<Execution> executions = executions(orderId);
        assertEquals(3, executions.size());
        assertEquals(3, executions.stream().map(Execution::getExecId).distinct().count());
        assertQty(
                "100",
                executions.stream().map(Execution::getLastQty).reduce(BigDecimal.ZERO, BigDecimal::add));
        assertEquals(
                List.of(Event.NEW_ORDER, Event.ACK, Event.PARTIAL_FILL, Event.PARTIAL_FILL, Event.FILL),
                events(orderId));
    }

    // AC-3
    @Test
    void ackOnly_orderLiveWithFullLeaves() throws Exception {
        String orderId = createOrder(OrdType.LIMIT, "165.00", "100", null);

        send(orderId, accept(orderId));

        awaitUntil(() -> state(orderId) == State.LIVE, "order LIVE");
        Order order = order(orderId);
        assertQty("0", order.getCumQty());
        assertQty("100", order.getLeavesQty());
        assertTrue(executions(orderId).isEmpty());
    }

    // AC-4
    @Test
    void reject_orderRejWithReasonAndNoExecutions() throws Exception {
        String orderId = createOrder(OrdType.MARKET, null, "100", null);

        send(orderId, new OrderRejectCmd(TestCommands.header(), orderId, "Unknown symbol ZZZZ"));

        awaitUntil(() -> state(orderId) == State.REJ, "order REJ");
        Order order = order(orderId);
        assertQty("0", order.getLeavesQty());
        assertEquals("Unknown symbol ZZZZ", order.getRejectReason());
        assertEquals(CLIENT_TEXT, order.getText(), "the client's text must survive the reject");
        assertEquals(Event.REJ, events(orderId).getLast());
        assertReplayMatches(orderId);
        assertTrue(executions(orderId).isEmpty());
    }

    // SPEC-0003 AC-6: the venue's reason reaches every reader of the order, not only the database.
    @Test
    void reject_reasonReachesOrdersTopicAndQueryApi() throws Exception {
        String orderId = createOrder(OrdType.MARKET, null, "100", null);

        try (Consumer<Object, Object> orders = consumerFactory.createConsumer("it-" + UUID.randomUUID(), null, null, TestCommands.avroValues())) {
            orders.subscribe(List.of("orders"));
            send(orderId, new OrderRejectCmd(TestCommands.header(), orderId, "Unknown symbol ZZZZ"));

            OrderMessage published = awaitOrderMessage(orders, orderId, m -> m.getRejectReason() != null);
            assertEquals("Unknown symbol ZZZZ", published.getRejectReason());
            assertEquals(CLIENT_TEXT, published.getText());
        }

        mockMvc()
                .perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/query/search").param("orderId", orderId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].rejectReason").value("Unknown symbol ZZZZ"))
                .andExpect(jsonPath("$.content[0].text").value(CLIENT_TEXT));
    }

    // AC-6
    @Test
    void ackThenCancel_orderCxlWithZeroLeaves() throws Exception {
        String orderId = createOrder(OrdType.LIMIT, "165.00", "100", TimeInForce.IMMEDIATE_OR_CANCEL);

        send(orderId, accept(orderId));
        send(orderId, new OrderCancelCmd(TestCommands.header(), orderId, "IOC remainder cancelled"));

        awaitUntil(() -> state(orderId) == State.CXL, "order CXL");
        Order order = order(orderId);
        assertEquals(CancelState.CXL, order.getCancelState());
        assertQty("0", order.getCumQty());
        assertQty("0", order.getLeavesQty());
        assertEquals(List.of(Event.NEW_ORDER, Event.ACK, Event.CXL), events(orderId));
        assertReplayMatches(orderId);
    }

    // AC-7
    @Test
    void cancelRequestViaRest_thenCancelConfirm_orderCxl() throws Exception {
        String orderId = createOrder(OrdType.LIMIT, "165.00", "100", null);
        send(orderId, accept(orderId));
        awaitUntil(() -> state(orderId) == State.LIVE, "order LIVE");

        try (Consumer<Object, Object> orders = consumerFactory.createConsumer("it-" + UUID.randomUUID(), null, null, TestCommands.avroValues())) {
            orders.subscribe(List.of("orders"));

            mockMvc()
                    .perform(post("/api/command/execute")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"type\":\"OrderCancelRequestCmd\",\"version\":\"1.0.0\",\"orderId\":\"" + orderId + "\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("OK"));

            Order pending = order(orderId);
            assertEquals(State.LIVE, pending.getState());
            assertEquals(CancelState.PCXL, pending.getCancelState());

            // The cancel request reaches the venue as an order update carrying PCXL.
            assertTrue(
                    awaitOrderMessage(orders, orderId, org.example.common.model.msg.CancelState.PCXL),
                    "expected an OrderMessage with cancelState PCXL on the orders topic");
        }

        send(orderId, new OrderCancelCmd(TestCommands.header(), orderId, null));

        awaitUntil(() -> state(orderId) == State.CXL, "order CXL");
        Order cancelled = order(orderId);
        assertEquals(CancelState.CXL, cancelled.getCancelState());
        assertQty("0", cancelled.getLeavesQty());
        assertEquals(
                List.of(Event.NEW_ORDER, Event.ACK, Event.CXL_REQUEST, Event.CXL), events(orderId));
        assertReplayMatches(orderId);
    }

    // AC-8
    @Test
    void cancelRequestThenCancelReject_orderStaysLiveWithCancelStateRej() throws Exception {
        String orderId = createOrder(OrdType.LIMIT, "165.00", "100", null);
        send(orderId, accept(orderId));
        send(orderId, new OrderCancelRequestCmd(TestCommands.header(), orderId));
        send(orderId, new OrderCancelRejectCmd(TestCommands.header(), orderId, "Unknown order"));

        awaitUntil(() -> cancelState(orderId) == CancelState.REJ, "cancelState REJ");
        Order order = order(orderId);
        assertEquals(State.LIVE, order.getState());
        assertQty("100", order.getLeavesQty());
        assertEquals(Event.CXL_REJ, events(orderId).getLast());
        assertEquals("Unknown order", order.getRejectReason());
        assertEquals(CLIENT_TEXT, order.getText());
        assertReplayMatches(orderId);
    }

    // AC-10
    @Test
    void duplicateLifecycleCommands_onKafka_haveNoSecondEffect() throws Exception {
        String live = createOrder(OrdType.LIMIT, "165.00", "100", null);
        String unack = createOrder(OrdType.MARKET, null, "100", null);
        String sentinel = createOrder(OrdType.MARKET, null, "100", null);
        long liveTxNr = order(live).getTxNr();
        long unackTxNr = order(unack).getTxNr();

        // One key for everything: a single partition, so the sentinel is consumed strictly after
        // every duplicate and its arrival proves the duplicates have been processed.
        String key = "dup-" + live;
        send(key, accept(live));
        send(key, new OrderCancelRequestCmd(TestCommands.header(), live));
        send(key, new OrderCancelRequestCmd(TestCommands.header(), live));
        send(key, new OrderCancelRejectCmd(TestCommands.header(), live, "Too late"));
        send(key, new OrderCancelRejectCmd(TestCommands.header(), live, "Too late"));
        send(key, new OrderCancelCmd(TestCommands.header(), live, null));
        send(key, new OrderCancelCmd(TestCommands.header(), live, null));
        send(key, new OrderRejectCmd(TestCommands.header(), unack, "Unknown symbol"));
        send(key, new OrderRejectCmd(TestCommands.header(), unack, "Unknown symbol"));
        send(key, accept(sentinel));

        awaitUntil(() -> state(sentinel) == State.LIVE, "sentinel LIVE");

        assertEquals(
                List.of(Event.NEW_ORDER, Event.ACK, Event.CXL_REQUEST, Event.CXL_REJ, Event.CXL),
                events(live));
        Order cancelled = order(live);
        assertEquals(State.CXL, cancelled.getState());
        assertEquals(CancelState.CXL, cancelled.getCancelState());
        assertEquals(liveTxNr + 4, cancelled.getTxNr(), "only the four distinct commands may write");

        assertEquals(List.of(Event.NEW_ORDER, Event.REJ), events(unack));
        Order rejected = order(unack);
        assertEquals(State.REJ, rejected.getState());
        assertEquals(unackTxNr + 1, rejected.getTxNr());
    }

    // AC-10: a Kafka replay from an uncommitted offset redelivers [request, reject] after both were
    // applied. The order is LIVE/REJ again, so the request's state precondition holds; only its
    // commandId identifies it as already applied.
    @Test
    void replayedCancelRequestAndReject_afterProcessing_haveNoSecondEffect() throws Exception {
        String orderId = createOrder(OrdType.LIMIT, "165.00", "100", null);
        send(orderId, accept(orderId));
        send(orderId, new OrderCancelRequestCmd(TestCommands.header("CR-1"), orderId));
        send(orderId, new OrderCancelRejectCmd(TestCommands.header("CXLREJ-1"), orderId, "Unknown order"));
        awaitUntil(() -> cancelState(orderId) == CancelState.REJ, "cancelState REJ");
        long txNr = order(orderId).getTxNr();

        // The replay, then a genuinely new request with a new id, which must still be applied.
        send(orderId, new OrderCancelRequestCmd(TestCommands.header("CR-1"), orderId));
        send(orderId, new OrderCancelRejectCmd(TestCommands.header("CXLREJ-1"), orderId, "Unknown order"));
        send(orderId, new OrderCancelRequestCmd(TestCommands.header("CR-2"), orderId));

        awaitUntil(() -> cancelState(orderId) == CancelState.PCXL, "the new request applied");
        assertEquals(
                List.of(Event.NEW_ORDER, Event.ACK, Event.CXL_REQUEST, Event.CXL_REJ, Event.CXL_REQUEST),
                events(orderId));
        assertEquals(txNr + 1, order(orderId).getTxNr(), "only the new request may write");
        assertReplayMatches(orderId);
    }

    // SPEC-0018 AC-1: every record of one order carries the order id as its key, on both topics, so
    // all of an order's fills land on one partition and are consumed in order.
    @Test
    void fills_areKeyedByOrderIdOnBothTopics() throws Exception {
        String orderId = createOrder(OrdType.MARKET, null, "100", null);

        send(orderId, accept(orderId));
        send(orderId, fill(orderId, 1, "40", "40", "60"));
        send(orderId, fill(orderId, 2, "60", "100", "0"));
        awaitUntil(() -> state(orderId) == State.FILLED, "order FILLED");

        Properties fromStart = TestCommands.avroValues();
        fromStart.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        List<ConsumerRecord<Object, Object>> executionRecords = new ArrayList<>();
        List<ConsumerRecord<Object, Object>> orderRecords = new ArrayList<>();
        try (Consumer<Object, Object> consumer =
                consumerFactory.createConsumer("it-" + UUID.randomUUID(), null, null, fromStart)) {
            consumer.subscribe(List.of("orders", "oms_executions"));
            long deadline = System.nanoTime() + TIMEOUT.toNanos();
            // NEW_ORDER, ACK, PARTIAL_FILL and FILL on the orders topic; the two fills on executions.
            while ((executionRecords.size() < 2 || orderRecords.size() < 4) && System.nanoTime() < deadline) {
                for (ConsumerRecord<Object, Object> record : consumer.poll(Duration.ofMillis(200))) {
                    if (record.value() instanceof org.example.common.model.msg.Execution execution
                            && orderId.equals(execution.getOrderId())) {
                        executionRecords.add(record);
                    } else if (record.value() instanceof OrderMessage message
                            && orderId.equals(message.getOrderId())) {
                        orderRecords.add(record);
                    }
                }
            }
        }

        assertEquals(2, executionRecords.size(), "both fills on oms_executions");
        assertEquals(4, orderRecords.size(), "every order event on orders");
        executionRecords.forEach(r -> assertEquals(orderId, String.valueOf(r.key()), "oms_executions key"));
        orderRecords.forEach(r -> assertEquals(orderId, String.valueOf(r.key()), "orders key"));
    }

    // SPEC-0018 AC-2: a fill posted over REST keeps its command in the event log, as Kafka fills do.
    @Test
    void restFill_recordsItsCommandInTheEventLog() throws Exception {
        String orderId = createOrder(OrdType.MARKET, null, "100", null);
        send(orderId, accept(orderId));
        awaitUntil(() -> state(orderId) == State.LIVE, "order LIVE");
        String execId = orderId + "-REST1";

        mockMvc()
                .perform(post("/api/command/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"ExecutionCreateCmd\",\"version\":\"1.0.0\",\"execution\":{"
                                + "\"execId\":\"" + execId + "\",\"orderId\":\"" + orderId + "\","
                                + "\"lastQty\":40,\"lastPx\":170,\"cumQty\":40,\"leavesQty\":60,"
                                + "\"execType\":\"F\",\"lastMkt\":\"XSIM\"}}"))
                .andExpect(status().isCreated());

        OrderEvent fillEvent = orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).getLast();
        assertEquals(Event.PARTIAL_FILL, fillEvent.getEvent());
        assertTrue(
                fillEvent.getTransaction() instanceof org.example.common.model.cmd.ExecutionCreateCmd,
                () -> "transaction was " + fillEvent.getTransaction());
        assertEquals(
                execId,
                ((org.example.common.model.cmd.ExecutionCreateCmd) fillEvent.getTransaction())
                        .getExecution()
                        .getExecId());
    }

    // SPEC-0018 AC-3: the query API reports the order's latest event-log version, the number its
    // newest orders-topic message carries as eventId.
    @Test
    void queryApi_reportsTheLatestEventVersion() throws Exception {
        String orderId = createOrder(OrdType.MARKET, null, "100", null);
        send(orderId, accept(orderId));
        send(orderId, fill(orderId, 1, "40", "40", "60"));
        awaitUntil(() -> events(orderId).size() == 3, "versions 1 to 3");

        mockMvc()
                .perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/query/search").param("orderId", orderId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].eventVersion").value(3));

        send(orderId, fill(orderId, 2, "60", "100", "0"));
        awaitUntil(() -> events(orderId).size() == 4, "version 4");

        mockMvc()
                .perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/query/search").param("orderId", orderId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].eventVersion").value(4));
    }

    // SPEC-0018 AC-5: over Kafka, a command whose commandId the order already applied is refused and
    // acknowledged: no second effect, no retry and nothing dead-lettered. The second duplicate is a
    // different lifecycle command reusing the id, which is refused too.
    @Test
    void duplicateCommandId_overKafka_isAcknowledgedNotDeadLettered() throws Exception {
        String orderId = createOrder(OrdType.LIMIT, "165.00", "100", null);
        String sentinel = createOrder(OrdType.MARKET, null, "100", null);
        String key = "dup-k-" + orderId;
        send(key, accept(orderId));
        send(key, new OrderCancelRequestCmd(TestCommands.header("CK-1"), orderId));
        awaitUntil(() -> cancelState(orderId) == CancelState.PCXL, "cancel request applied");
        long txNr = order(orderId).getTxNr();
        List<Event> eventsBefore = events(orderId);

        // Dead letters are the original bytes (SPEC-0025), not necessarily Avro: read them as bytes,
        // the consumer factory's default. Only the key matters here.
        Properties fromStart = new Properties();
        fromStart.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        try (Consumer<Object, Object> dlt =
                consumerFactory.createConsumer("it-" + UUID.randomUUID(), null, null, fromStart)) {
            dlt.subscribe(List.of("commands.DLT"));

            // One key, one partition: the sentinel is consumed strictly after both duplicates.
            send(key, new OrderCancelRequestCmd(TestCommands.header("CK-1"), orderId));
            send(key, new OrderCancelCmd(TestCommands.header("CK-1"), orderId, null));
            send(key, accept(sentinel));
            awaitUntil(() -> state(sentinel) == State.LIVE, "sentinel LIVE");

            assertEquals(eventsBefore, events(orderId));
            assertEquals(txNr, order(orderId).getTxNr());
            assertEquals(CancelState.PCXL, order(orderId).getCancelState());

            long deadline = System.nanoTime() + Duration.ofSeconds(2).toNanos();
            while (System.nanoTime() < deadline) {
                for (ConsumerRecord<Object, Object> record : dlt.poll(Duration.ofMillis(200))) {
                    assertTrue(!key.equals(String.valueOf(record.key())), "dead-lettered: " + record);
                }
            }
        }
    }

    // SPEC-0033 AC-3: what the outbox publishes carries the W3C trace context, so the venue's
    // consumer continues oms-core's trace.
    @Test
    void publishedOrdersCarryTraceparent() throws Exception {
        try (Consumer<Object, Object> orders = consumerFactory.createConsumer("it-" + UUID.randomUUID(), null, null, TestCommands.avroValues())) {
            orders.subscribe(List.of("orders"));
            String orderId = createOrder(OrdType.MARKET, null, "100", null);

            ConsumerRecord<Object, Object> published = awaitOrderRecord(orders, orderId);
            Header traceparent = published.headers().lastHeader("traceparent");
            assertNotNull(traceparent, "the OrderMessage record has no traceparent header");
            String value = new String(traceparent.value(), StandardCharsets.UTF_8);
            assertTrue(value.matches("00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}"), value);
        }
    }

    // ----------------------------------------------------------------------------------------

    /** P-05: replaying the event log must reproduce the stored order. */
    private void assertReplayMatches(String orderId) {
        Order live = order(orderId);
        Order replayed = orderReplayService.replay(orderId).orElseThrow();
        assertEquals(live.getState(), replayed.getState());
        assertEquals(live.getCancelState(), replayed.getCancelState());
        assertEquals(live.getRejectReason(), replayed.getRejectReason());
        assertEquals(live.getText(), replayed.getText());
        assertEquals(0, live.getLeavesQty().compareTo(replayed.getLeavesQty()));
        assertEquals(0, live.getCumQty().compareTo(replayed.getCumQty()));
    }

    private String createOrder(OrdType ordType, String price, String qty, TimeInForce tif) {
        var order =
                new org.example.common.model.cmd.Order()
                        .clOrdId("CL-" + UUID.randomUUID())
                        .sessionId("SES-EXCH")
                        .account("ACC-EXCH")
                        .symbol("AAPL")
                        .side(Side.BUY)
                        .ordType(ordType)
                        .orderQty(new BigDecimal(qty))
                        .price(price != null ? new BigDecimal(price) : null)
                        .timeInForce(tif != null ? tif : TimeInForce.DAY)
                        .text(CLIENT_TEXT);
        var result =
                orderCreateCommandProcessor.process(
                        new OrderCreateCmd().type("OrderCreateCmd").order(order), Instant.now());
        assertTrue(result.isSuccess(), result.getErrorMessage());
        return result.getOrderId();
    }

    private static OrderAcceptCmd accept(String orderId) {
        return new OrderAcceptCmd(TestCommands.header(), orderId);
    }

    /** The ExecutionCreateCmd the simulator sends for one slice: execType F at the reference price. */
    private static ExecutionCreateCmd fill(String orderId, int n, String lastQty, String cum, String leaves) {
        var execution =
                org.example.common.model.msg.Execution.newBuilder()
                        .setExecId(orderId + "-F" + n)
                        .setOrderId(orderId)
                        .setLastQty(scale4(lastQty))
                        .setLastPx(REFERENCE.setScale(4, RoundingMode.HALF_UP))
                        .setCumQty(scale4(cum))
                        .setLeavesQty(scale4(leaves))
                        .setExecType("F")
                        .setLastMkt("XSIM")
                        .setTransactTime(Instant.now())
                        .build();
        return new ExecutionCreateCmd(TestCommands.header(), execution);
    }

    private static BigDecimal scale4(String value) {
        return new BigDecimal(value).setScale(4, RoundingMode.HALF_UP);
    }

    private void send(String key, Object command) throws Exception {
        commands.send("commands", key, command).get(10, TimeUnit.SECONDS);
    }

    private MockMvc mockMvc() {
        return MockMvcBuilders.webAppContextSetup(webApplicationContext).build();
    }

    private Order order(String orderId) {
        return orderRepository.findByOrderId(orderId).orElseThrow();
    }

    private State state(String orderId) {
        return orderRepository.findByOrderId(orderId).map(Order::getState).orElse(null);
    }

    private CancelState cancelState(String orderId) {
        return orderRepository.findByOrderId(orderId).map(Order::getCancelState).orElse(null);
    }

    private List<Execution> executions(String orderId) {
        return executionRepository.findAll().stream()
                .filter(execution -> orderId.equals(execution.getOrderId()))
                .toList();
    }

    private List<Event> events(String orderId) {
        return orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).stream()
                .map(OrderEvent::getEvent)
                .toList();
    }

    private static void assertQty(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual), () -> "expected " + expected + " but was " + actual);
    }

    private static void awaitUntil(BooleanSupplier condition, String description) throws InterruptedException {
        long deadline = System.nanoTime() + TIMEOUT.toNanos();
        while (System.nanoTime() < deadline) {
            if (condition.getAsBoolean()) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("Timed out after " + TIMEOUT + " waiting for: " + description);
    }

    private static ConsumerRecord<Object, Object> awaitOrderRecord(Consumer<Object, Object> consumer, String orderId) {
        long deadline = System.nanoTime() + TIMEOUT.toNanos();
        while (System.nanoTime() < deadline) {
            for (ConsumerRecord<Object, Object> record : consumer.poll(Duration.ofMillis(200))) {
                if (record.value() instanceof OrderMessage message && orderId.equals(message.getOrderId())) {
                    return record;
                }
            }
        }
        throw new AssertionError("No OrderMessage record for " + orderId + " within " + TIMEOUT);
    }

    private static OrderMessage awaitOrderMessage(
            Consumer<Object, Object> consumer, String orderId, java.util.function.Predicate<OrderMessage> condition) {
        long deadline = System.nanoTime() + TIMEOUT.toNanos();
        while (System.nanoTime() < deadline) {
            for (ConsumerRecord<Object, Object> record : consumer.poll(Duration.ofMillis(200))) {
                if (record.value() instanceof OrderMessage message
                        && orderId.equals(message.getOrderId())
                        && condition.test(message)) {
                    return message;
                }
            }
        }
        throw new AssertionError("No matching OrderMessage for " + orderId + " within " + TIMEOUT);
    }

    private static boolean awaitOrderMessage(
            Consumer<Object, Object> consumer,
            String orderId,
            org.example.common.model.msg.CancelState cancelState) {
        long deadline = System.nanoTime() + TIMEOUT.toNanos();
        while (System.nanoTime() < deadline) {
            for (ConsumerRecord<Object, Object> record : consumer.poll(Duration.ofMillis(200))) {
                if (record.value() instanceof OrderMessage message
                        && orderId.equals(message.getOrderId())
                        && cancelState == message.getCancelState()) {
                    return true;
                }
            }
        }
        return false;
    }
}
