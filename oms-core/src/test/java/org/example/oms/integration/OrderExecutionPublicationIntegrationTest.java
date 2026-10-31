package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.function.Predicate;
import java.util.stream.Collectors;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.cmd.OrdType;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.Side;
import org.example.common.model.cmd.TimeInForce;
import org.example.common.model.msg.CommandMessage;
import org.example.common.model.msg.Execution;
import org.example.common.model.msg.ExecutionCreateCmd;
import org.example.common.model.msg.OrderAcceptCmd;
import org.example.common.model.msg.OrderExecution;
import org.example.common.model.msg.OrderMessage;
import org.example.oms.model.OrderEvent;
import org.example.oms.model.OutboxMessage;
import org.example.oms.repository.ExecutionRepository;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.repository.OrderRepository;
import org.example.oms.service.MessagePublisher;
import org.example.oms.service.OrderEventAppender;
import org.example.oms.service.command.OrderCreateCommandProcessor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * SPEC-0019: every applied fill publishes one OrderExecution with the order as of that fill, all
 * three outbound topics are keyed by the root order id, and a consumer sees one tree's fills on one
 * partition in commit order.
 *
 * <p>Reads the real topics from the earliest offset. The base class creates them with several
 * partitions, so a shared partition is evidence of the key and not a coincidence of a one-partition
 * topic. Records from other tests stay on the topics, so every assertion filters by this test's
 * order ids.
 */
class OrderExecutionPublicationIntegrationTest extends AbstractKafkaPostgresIntegrationTest {

    private static final Duration TIMEOUT = Duration.ofSeconds(15);
    private static final String ORDERS = "orders";
    private static final String EXECUTIONS = "oms_executions";
    private static final String ORDER_EXECUTIONS = "oms_order_executions";

    @Autowired private OrderCreateCommandProcessor orderCreateCommandProcessor;
    @Autowired private OrderRepository orderRepository;
    @Autowired private ExecutionRepository executionRepository;
    @Autowired private OrderEventRepository orderEventRepository;
    @Autowired private MessagePublisher messagePublisher;
    @Autowired private org.example.oms.mapper.OrderExecutionMessageMapper orderExecutionMessageMapper;
    @Autowired private org.example.oms.mapper.AvroPayloadCodec payloadCodec;
    @Autowired private ProducerFactory<Object, Object> producerFactory;
    @Autowired private ConsumerFactory<Object, Object> consumerFactory;
    @Autowired private WebApplicationContext webApplicationContext;

    private KafkaTemplate<String, CommandMessage> commands;

    @BeforeEach
    void setUp() {
        commands =
                new KafkaTemplate<>(
                        new DefaultKafkaProducerFactory<>(producerFactory.getConfigurationProperties()));
    }

    // AC-2
    @Test
    void fillsOverRestAndKafka_publishOneOrderExecutionEach() throws Exception {
        String orderId = createLiveOrder(null);
        String restExecId = orderId + "-REST1";
        String kafkaExecId = orderId + "-KAFKA1";

        postFill(restExecId, orderId, "40", "2026-10-30T23:30:00Z");
        send(orderId, fill(kafkaExecId, orderId, "30"));
        awaitUntil(() -> executionCount(orderId) == 2, "both fills applied");

        List<ConsumerRecord<Object, Object>> records = consumeUntil(
                List.of(ORDER_EXECUTIONS, ORDERS),
                rs -> orderExecutions(rs, orderId).size() == 2 && orderMessages(rs, orderId).size() == 4);

        List<ConsumerRecord<Object, Object>> published = orderExecutions(records, orderId);
        assertEquals(2, published.size(), "one OrderExecution per applied fill");
        Map<Long, OrderMessage> orderMessagesByEventId = orderMessages(records, orderId).stream()
                .map(r -> (OrderMessage) r.value())
                .collect(Collectors.toMap(OrderMessage::getEventId, m -> m));
        Map<String, Long> expectedVersion = Map.of(restExecId, 3L, kafkaExecId, 4L);

        for (ConsumerRecord<Object, Object> record : published) {
            OrderExecution oe = (OrderExecution) record.value();
            assertEquals(orderId, String.valueOf(record.key()), "key");
            long version = expectedVersion.get(oe.getExecId());
            assertEquals(version, oe.getOrderVersion(), "orderVersion of " + oe.getExecId());

            OrderEvent fillEvent = event(orderId, version);
            Order asOfFill = fillEvent.getOrderSnapshot();
            org.example.common.model.Execution fill =
                    executionRepository.findAll().stream()
                            .filter(e -> oe.getExecId().equals(e.getExecID()))
                            .findFirst()
                            .orElseThrow();

            assertQty(fill.getLastQty(), oe.getLastQty());
            assertQty(fill.getLastPx(), oe.getLastPx());
            assertEquals(asOfFill.getAccount(), oe.getAccount());
            assertEquals(asOfFill.getSide().name(), oe.getSide().name());
            assertEquals(asOfFill.getSymbol(), oe.getSymbol());
            assertQty(asOfFill.getOrderQty(), oe.getOrderQty());
            assertQty(asOfFill.getPrice(), oe.getPrice());
            assertQty(asOfFill.getCumQty(), oe.getCumQty());
            assertQty(asOfFill.getLeavesQty(), oe.getLeavesQty());
            assertEquals(asOfFill.getState().name(), oe.getState().name());
            assertNotNull(orderMessagesByEventId.get(version), "an orders record with eventId " + version);

            LocalDate expectedTradeDate = restExecId.equals(oe.getExecId())
                    ? LocalDate.of(2026, 10, 30)
                    : LocalDate.ofInstant(oe.getTransactTime(), ZoneOffset.UTC);
            assertEquals(expectedTradeDate, oe.getTradeDate(), "tradeDate of " + oe.getExecId());
        }
    }

    // AC-3
    @Test
    void executionRecords_carryRootOrderIdAndOrderVersion() throws Exception {
        String orderId = createLiveOrder(null);
        postFill(orderId + "-E1", orderId, "10", null);
        send(orderId, fill(orderId + "-E2", orderId, "10"));
        awaitUntil(() -> executionCount(orderId) == 2, "both fills applied");

        List<ConsumerRecord<Object, Object>> records = consumeUntil(
                List.of(EXECUTIONS, ORDER_EXECUTIONS),
                rs -> executionMessages(rs, orderId).size() == 2 && orderExecutions(rs, orderId).size() == 2);

        Map<String, Long> versionByExecId = orderExecutions(records, orderId).stream()
                .map(r -> (OrderExecution) r.value())
                .collect(Collectors.toMap(OrderExecution::getExecId, OrderExecution::getOrderVersion));
        List<ConsumerRecord<Object, Object>> executions = executionMessages(records, orderId);
        assertEquals(2, executions.size());
        for (ConsumerRecord<Object, Object> record : executions) {
            Execution execution = (Execution) record.value();
            assertEquals(orderId, execution.getRootOrderId(), "rootOrderId of " + execution.getExecId());
            assertEquals(versionByExecId.get(execution.getExecId()), execution.getOrderVersion(),
                    "orderVersion of " + execution.getExecId());
        }
    }

    // AC-5
    @Test
    void childOrder_isKeyedByRootOnAllThreeTopics() throws Exception {
        String rootId = createLiveOrder(null);
        String childId = createLiveOrder(rootId);
        postFill(rootId + "-R1", rootId, "10", null);
        postFill(childId + "-C1", childId, "10", null);

        List<String> topics = List.of(ORDERS, EXECUTIONS, ORDER_EXECUTIONS);
        // Per order: NEW_ORDER, ACK and the fill on orders, the fill on each fill topic.
        List<ConsumerRecord<Object, Object>> records = consumeUntil(
                topics, rs -> recordsOf(rs, rootId).size() == 5 && recordsOf(rs, childId).size() == 5);

        for (String orderId : List.of(rootId, childId)) {
            List<ConsumerRecord<Object, Object>> ofOrder = recordsOf(records, orderId);
            assertEquals(5, ofOrder.size(), "records of " + orderId);
            assertEquals(topics.stream().sorted().toList(),
                    ofOrder.stream().map(ConsumerRecord::topic).distinct().sorted().toList(),
                    "records of " + orderId + " on all three topics");
            ofOrder.forEach(r -> assertEquals(rootId, String.valueOf(r.key()),
                    r.topic() + " key of " + orderId));
        }
    }

    // AC-4. Refusals already roll back the whole command; this guards that the new outbox row is
    // staged only for applied fills.
    @Test
    void refusedFills_publishNothing() throws Exception {
        String orderId = createLiveOrder(null);
        String appliedExecId = orderId + "-OK1";
        postFill(appliedExecId, orderId, "10", null);
        int eventsAfterFill = orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).size();

        postRefusedFill(appliedExecId, orderId, "10"); // duplicate execId
        postRefusedFill(orderId + "-OVER", orderId, "200"); // leavesQty is 90
        assertEquals(eventsAfterFill, orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).size(),
                "refused fills append no event");

        // A later fill on the same order is staged after anything the refusals could have staged and
        // lands on the same partition, so once it is consumed, the refusals' records would have been.
        String sentinelExecId = orderId + "-OK2";
        postFill(sentinelExecId, orderId, "10", null);
        List<ConsumerRecord<Object, Object>> records = consumeUntil(
                List.of(EXECUTIONS, ORDER_EXECUTIONS),
                rs -> orderExecutions(rs, orderId).stream().anyMatch(r -> sentinelExecId.equals(((OrderExecution) r.value()).getExecId()))
                        && executionMessages(rs, orderId).stream().anyMatch(r -> sentinelExecId.equals(((Execution) r.value()).getExecId())));

        assertEquals(List.of(appliedExecId, sentinelExecId), orderExecutions(records, orderId).stream()
                .map(r -> ((OrderExecution) r.value()).getExecId())
                .toList(), "only the applied fills on " + ORDER_EXECUTIONS);
        assertEquals(List.of(appliedExecId, sentinelExecId), executionMessages(records, orderId).stream()
                .map(r -> ((Execution) r.value()).getExecId())
                .toList(), "only the applied fills on " + EXECUTIONS);
    }

    // AC-6. Finding 16 of the architecture review: what a consumer of the topic can rely on.
    @Test
    void rootAndChildFills_arriveOnOnePartitionInCommitOrder() throws Exception {
        String rootId = createLiveOrder(null);
        String childId = createLiveOrder(rootId);
        List<String> committed = List.of(rootId + "-1", childId + "-1", rootId + "-2", childId + "-2", rootId + "-3");
        for (String execId : committed) {
            // REST fills are applied synchronously, so the list is the commit order.
            postFill(execId, execId.startsWith(childId) ? childId : rootId, "10", null);
        }

        List<ConsumerRecord<Object, Object>> records = consumeUntil(
                List.of(ORDER_EXECUTIONS),
                rs -> orderExecutions(rs, rootId).size() + orderExecutions(rs, childId).size() == committed.size());
        List<ConsumerRecord<Object, Object>> tree = new ArrayList<>(orderExecutions(records, rootId));
        tree.addAll(orderExecutions(records, childId));
        tree.sort(java.util.Comparator.comparingLong(ConsumerRecord::offset));

        assertEquals(committed.size(), tree.size(), "every fill of the tree");
        assertEquals(1, tree.stream().map(ConsumerRecord::partition).distinct().count(),
                "one partition for the whole tree, out of " + OUTBOUND_PARTITIONS);
        assertEquals(committed, tree.stream().map(r -> ((OrderExecution) r.value()).getExecId()).toList(),
                "consumed in commit order");
        for (String orderId : List.of(rootId, childId)) {
            List<Long> versions = tree.stream()
                    .map(r -> (OrderExecution) r.value())
                    .filter(oe -> orderId.equals(oe.getOrderId()))
                    .map(OrderExecution::getOrderVersion)
                    .toList();
            for (int i = 1; i < versions.size(); i++) {
                assertTrue(versions.get(i) > versions.get(i - 1), "orderVersion increases for " + orderId + ": " + versions);
            }
        }
    }

    /**
     * Finding 16 of the architecture review, deduplication half. The relay deletes a row only after
     * the broker acknowledged it, so a crash in between sends the same row again. Republishing the
     * fill's row through the real publisher shows what a consumer then reads from the real topic:
     * two identical records, which collapse to one on (orderId, execId, orderVersion).
     */
    @Test
    void relayRedelivery_carriesTheSameDedupKey() throws Exception {
        String orderId = createLiveOrder(null);
        String execId = orderId + "-D1";
        postFill(execId, orderId, "10", "2026-10-31T10:00:00Z");
        consumeUntil(List.of(ORDER_EXECUTIONS), rs -> orderExecutions(rs, orderId).size() == 1);

        // The row as OrderEventAppender staged it: the order as of the fill and the fill itself.
        long version = 3L;
        org.example.common.model.Execution fill = executionRepository.findAll().stream()
                .filter(e -> execId.equals(e.getExecID()))
                .findFirst()
                .orElseThrow();
        // Since SPEC-0020 the projection stages it as a generic payload: the encoded record.
        var snapshot = event(orderId, version).getOrderSnapshot();
        var record = orderExecutionMessageMapper.toOrderExecutionMessage(fill, snapshot, version, Instant.now());
        messagePublisher.publish(OutboxMessage.builder()
                .id(-1L)
                .aggregateType(OutboxMessage.AggregateType.PROJECTION)
                .aggregateId(OrderEventAppender.partitionKey(snapshot))
                .topic(ORDER_EXECUTIONS)
                .aggregateVersion(version)
                .payloadType(record.getSchema().getFullName())
                .payload(payloadCodec.encode(record))
                .createdAt(Instant.now())
                .build());

        List<ConsumerRecord<Object, Object>> delivered = orderExecutions(
                consumeUntil(List.of(ORDER_EXECUTIONS), rs -> orderExecutions(rs, orderId).size() == 2), orderId);
        assertEquals(2, delivered.size(), "the fill and its redelivery");
        assertEquals(delivered.get(0).value(), delivered.get(1).value(), "a redelivery is the same record");
        assertEquals(delivered.get(0).partition(), delivered.get(1).partition(), "on the same partition");
        assertEquals(1, delivered.stream()
                .map(r -> (OrderExecution) r.value())
                .map(oe -> List.of(oe.getOrderId(), oe.getExecId(), oe.getOrderVersion()))
                .distinct()
                .count(), "one fill after deduplicating on (orderId, execId, orderVersion)");
    }

    // --- helpers -------------------------------------------------------------------------------

    private void postRefusedFill(String execId, String orderId, String lastQty) throws Exception {
        mockMvc()
                .perform(post("/api/command/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"ExecutionCreateCmd\",\"version\":\"1.0.0\",\"execution\":{"
                                + "\"execId\":\"" + execId + "\",\"orderId\":\"" + orderId + "\","
                                + "\"lastQty\":" + lastQty + ",\"lastPx\":170,"
                                + "\"execType\":\"F\",\"lastMkt\":\"XSIM\"}}"))
                .andExpect(result -> assertNotEquals(201, result.getResponse().getStatus(),
                        () -> "fill " + execId + " should be refused"));
    }

    /** Every record of the order on any of the three outbound topics. */
    private static List<ConsumerRecord<Object, Object>> recordsOf(
            List<ConsumerRecord<Object, Object>> records, String orderId) {
        List<ConsumerRecord<Object, Object>> ofOrder = new ArrayList<>(orderMessages(records, orderId));
        ofOrder.addAll(executionMessages(records, orderId));
        ofOrder.addAll(orderExecutions(records, orderId));
        return ofOrder;
    }

    /** Creates a limit order (optionally under a root) and waits until it is LIVE. */
    private String createLiveOrder(String rootOrderId) throws Exception {
        var order =
                new org.example.common.model.cmd.Order()
                        .clOrdId("CL-" + UUID.randomUUID())
                        .sessionId("SES-OE")
                        .account("ACC-OE")
                        .symbol("AAPL")
                        .side(Side.BUY)
                        .ordType(OrdType.LIMIT)
                        .price(new BigDecimal("170"))
                        .orderQty(new BigDecimal("100"))
                        .timeInForce(TimeInForce.DAY)
                        .rootOrderId(rootOrderId)
                        .parentOrderId(rootOrderId);
        var result =
                orderCreateCommandProcessor.process(
                        new OrderCreateCmd().type("OrderCreateCmd").order(order), Instant.now());
        assertTrue(result.isSuccess(), result.getErrorMessage());
        String orderId = result.getOrderId();
        send(orderId, new OrderAcceptCmd("OrderAcceptCmd", "1.0.0", orderId));
        awaitUntil(() -> state(orderId) == State.LIVE, orderId + " LIVE");
        return orderId;
    }

    private void postFill(String execId, String orderId, String lastQty, String transactTime) throws Exception {
        mockMvc()
                .perform(post("/api/command/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"ExecutionCreateCmd\",\"version\":\"1.0.0\",\"execution\":{"
                                + "\"execId\":\"" + execId + "\",\"orderId\":\"" + orderId + "\","
                                + "\"lastQty\":" + lastQty + ",\"lastPx\":170,"
                                + "\"execType\":\"F\",\"lastMkt\":\"XSIM\""
                                + (transactTime != null ? ",\"transactTime\":\"" + transactTime + "\"" : "")
                                + "}}"))
                .andExpect(status().isCreated());
    }

    private static ExecutionCreateCmd fill(String execId, String orderId, String lastQty) {
        var execution =
                Execution.newBuilder()
                        .setExecId(execId)
                        .setOrderId(orderId)
                        .setLastQty(new BigDecimal(lastQty).setScale(4, RoundingMode.HALF_UP))
                        .setLastPx(new BigDecimal("170").setScale(4, RoundingMode.HALF_UP))
                        .setExecType("F")
                        .setLastMkt("XSIM")
                        .setTransactTime(Instant.now())
                        .build();
        return new ExecutionCreateCmd("ExecutionCreateCmd", "1.0.0", execution);
    }

    private void send(String key, Object command) throws Exception {
        commands.send("commands", key, new CommandMessage(command)).get(10, TimeUnit.SECONDS);
    }

    /** Reads the topics from the earliest offset until {@code done} holds for everything read so far. */
    private List<ConsumerRecord<Object, Object>> consumeUntil(
            List<String> topics, Predicate<List<ConsumerRecord<Object, Object>>> done) {
        Properties fromStart = new Properties();
        fromStart.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        List<ConsumerRecord<Object, Object>> records = new ArrayList<>();
        try (Consumer<Object, Object> consumer =
                consumerFactory.createConsumer("it-" + UUID.randomUUID(), null, null, fromStart)) {
            consumer.subscribe(topics);
            long deadline = System.nanoTime() + TIMEOUT.toNanos();
            while (!done.test(records) && System.nanoTime() < deadline) {
                consumer.poll(Duration.ofMillis(200)).forEach(records::add);
            }
        }
        return records;
    }

    private static List<ConsumerRecord<Object, Object>> orderExecutions(
            List<ConsumerRecord<Object, Object>> records, String orderId) {
        return records.stream()
                .filter(r -> r.value() instanceof OrderExecution oe && orderId.equals(oe.getOrderId()))
                .toList();
    }

    private static List<ConsumerRecord<Object, Object>> executionMessages(
            List<ConsumerRecord<Object, Object>> records, String orderId) {
        return records.stream()
                .filter(r -> r.value() instanceof Execution e && orderId.equals(e.getOrderId()))
                .toList();
    }

    private static List<ConsumerRecord<Object, Object>> orderMessages(
            List<ConsumerRecord<Object, Object>> records, String orderId) {
        return records.stream()
                .filter(r -> r.value() instanceof OrderMessage m && orderId.equals(m.getOrderId()))
                .toList();
    }

    private OrderEvent event(String orderId, long version) {
        return orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).stream()
                .filter(e -> e.getVersion() == version)
                .findFirst()
                .orElseThrow(() -> new AssertionError("no event v" + version + " for " + orderId));
    }

    private long executionCount(String orderId) {
        return executionRepository.findAll().stream()
                .filter(e -> orderId.equals(e.getOrderId()))
                .count();
    }

    private State state(String orderId) {
        return orderRepository.findByOrderId(orderId).map(Order::getState).orElse(null);
    }

    private MockMvc mockMvc() {
        return MockMvcBuilders.webAppContextSetup(webApplicationContext).build();
    }

    private static void assertQty(BigDecimal expected, BigDecimal actual) {
        assertEquals(0, expected.compareTo(actual), () -> "expected " + expected + " but was " + actual);
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
}
