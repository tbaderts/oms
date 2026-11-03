package org.example.simulator.kafka;

import static org.example.simulator.engine.TestOrders.limit;
import static org.example.simulator.engine.TestOrders.market;
import static org.example.simulator.engine.TestOrders.order;
import static org.example.simulator.engine.TestOrders.update;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.header.Header;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.example.common.model.msg.CancelState;
import org.example.common.model.msg.CommandHeader;
import org.example.common.model.msg.ExecutionCreateCmd;
import org.example.common.model.msg.OrdType;
import org.example.common.model.msg.OrderAcceptCmd;
import org.example.common.model.msg.OrderCancelCmd;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.msg.OrderRejectCmd;
import org.example.common.model.msg.Side;
import org.example.common.model.msg.State;
import org.example.common.model.msg.TimeInForce;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.example.simulator.AbstractKafkaIntegrationTest;

import io.confluent.kafka.schemaregistry.testutil.MockSchemaRegistry;
import io.confluent.kafka.serializers.KafkaAvroDeserializer;
import io.confluent.kafka.serializers.KafkaAvroSerializer;

/**
 * The simulator half of the exchange workflow (SPEC-0001): an {@link OrderMessage} on the orders
 * topic produces exactly the expected command sequence on the commands topic. oms-core's
 * {@code ExchangeWorkflowIntegrationTest} proves that the same sequence drives the order correctly.
 */
@SpringBootTest(
        properties = {
            "simulator.order-topic=orders",
            "simulator.command-topic=commands",
            "simulator.fill-slices=1",
            "simulator.fill-delay=0ms",
            "simulator.reference-prices.AAPL=170.00",
            "spring.kafka.consumer.group-id=exchange-simulator-it",
            "spring.kafka.consumer.auto-offset-reset=earliest"
        })
class ExchangeSimulatorKafkaIntegrationTest extends AbstractKafkaIntegrationTest {

    private KafkaTemplate<String, Object> orders;
    private Consumer<String, Object> commands;

    @BeforeEach
    void setUp() {
        Map<String, Object> producer = new HashMap<>();
        producer.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers());
        producer.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        producer.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, KafkaAvroSerializer.class);
        producer.put("schema.registry.url", REGISTRY);
        orders = new KafkaTemplate<>(new DefaultKafkaProducerFactory<>(producer));

        Map<String, Object> consumer = new HashMap<>();
        consumer.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers());
        consumer.put(ConsumerConfig.GROUP_ID_CONFIG, "it-" + UUID.randomUUID());
        consumer.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        consumer.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        consumer.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, KafkaAvroDeserializer.class);
        consumer.put("schema.registry.url", REGISTRY);
        consumer.put("specific.avro.reader", true);
        commands = new DefaultKafkaConsumerFactory<String, Object>(consumer).createConsumer();
        commands.subscribe(List.of("commands"));
    }

    @AfterEach
    void tearDown() {
        commands.close();
    }

    // AC-1; SPEC-0025 AC-5: bare records keyed by orderId (awaitCommands matches the key), each
    // with a header naming the order tree, the event answered and the simulator.
    @Test
    void unackOrder_producesAckThenSingleFill() throws Exception {
        String orderId = newOrderId();
        OrderMessage order = market(orderId, Side.BUY, "100");
        order.setRootOrderId("ROOT-" + orderId);

        publish(order);

        List<Object> sent = awaitCommands(orderId, 2, Duration.ofSeconds(10));
        OrderAcceptCmd accept = assertInstanceOf(OrderAcceptCmd.class, sent.get(0));
        ExecutionCreateCmd fill = assertInstanceOf(ExecutionCreateCmd.class, sent.get(1));
        for (CommandHeader header : List.of(accept.getHeader(), fill.getHeader())) {
            assertDoesNotThrow(() -> UUID.fromString(header.getCommandId()));
            assertEquals("ROOT-" + orderId, header.getCorrelationId());
            assertEquals(orderId + ":1", header.getCausationId());
            assertEquals("oms-exchange-simulator", header.getProducer());
        }
        assertEquals(orderId, accept.getOrderId());
        assertEquals(orderId + "-F1", fill.getExecution().getExecId());
        assertEquals(0, new BigDecimal("100").compareTo(fill.getExecution().getLastQty()));
        assertEquals(0, new BigDecimal("170").compareTo(fill.getExecution().getLastPx()));
        assertEquals("F", fill.getExecution().getExecType());
        assertEquals(2, awaitCommands(orderId, 3, Duration.ofSeconds(1)).size(), "nothing after the fill");
    }

    // AC-3
    @Test
    void nonMarketableLimit_ackOnlyNoFillsWithin3s() throws Exception {
        String orderId = newOrderId();

        publish(limit(orderId, Side.BUY, "100", "165.00"));

        List<Object> sent = awaitCommands(orderId, 2, Duration.ofSeconds(5));
        assertEquals(1, sent.size(), "only the ack: " + sent);
        assertInstanceOf(OrderAcceptCmd.class, sent.getFirst());
    }

    // AC-4
    @Test
    void unknownSymbol_producesRejectOnly() throws Exception {
        String orderId = newOrderId();

        publish(order(orderId, "ZZZZ", OrdType.MARKET, Side.BUY, "100", null, TimeInForce.DAY));

        List<Object> sent = awaitCommands(orderId, 2, Duration.ofSeconds(5));
        assertEquals(1, sent.size(), "only the reject: " + sent);
        OrderRejectCmd reject = assertInstanceOf(OrderRejectCmd.class, sent.getFirst());
        assertTrue(reject.getText().contains("Unknown symbol ZZZZ"), reject.getText());
    }

    // AC-7
    @Test
    void pcxlForRestingOrder_producesCancel() throws Exception {
        String orderId = newOrderId();
        OrderMessage resting = limit(orderId, Side.BUY, "100", "165.00");

        publish(resting);
        publish(update(resting, State.LIVE, null));
        publish(update(resting, State.LIVE, CancelState.PCXL));

        List<Object> sent = awaitCommands(orderId, 2, Duration.ofSeconds(10));
        assertInstanceOf(OrderAcceptCmd.class, sent.get(0));
        OrderCancelCmd cancel = assertInstanceOf(OrderCancelCmd.class, sent.get(1));
        assertEquals(orderId, cancel.getOrderId());
    }

    // SPEC-0025 AC-5
    @Test
    void commandsUseOneSubjectPerRecord() throws Exception {
        String orderId = newOrderId();

        publish(market(orderId, Side.BUY, "100"));
        assertEquals(2, awaitCommands(orderId, 2, Duration.ofSeconds(10)).size());

        var subjects = MockSchemaRegistry.getClientForScope(REGISTRY.substring("mock://".length())).getAllSubjects();
        assertTrue(subjects.contains("commands-org.example.common.model.msg.OrderAcceptCmd"), subjects.toString());
        assertTrue(subjects.contains("commands-org.example.common.model.msg.ExecutionCreateCmd"), subjects.toString());
        assertFalse(subjects.contains("commands-value"), subjects.toString());
    }

    // SPEC-0033 AC-3: the venue's answers continue the trace of the OrderMessage they answer,
    // across the hop from the listener to the engine thread.
    @Test
    void commandsCarryTheOrdersTrace() throws Exception {
        String orderId = newOrderId();
        String traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
        var record = new ProducerRecord<String, Object>("orders", orderId, market(orderId, Side.BUY, "100"));
        record.headers().add("traceparent", ("00-" + traceId + "-00f067aa0ba902b7-01").getBytes(StandardCharsets.UTF_8));
        orders.send(record).get(10, TimeUnit.SECONDS);

        List<String> traceparents = new ArrayList<>();
        long deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos();
        while (traceparents.size() < 2 && System.nanoTime() < deadline) {
            for (ConsumerRecord<String, Object> sent : commands.poll(Duration.ofMillis(200))) {
                if (orderId.equals(sent.key())) {
                    Header header = sent.headers().lastHeader("traceparent");
                    traceparents.add(header == null ? "none" : new String(header.value(), StandardCharsets.UTF_8));
                }
            }
        }
        assertEquals(2, traceparents.size(), "accept and fill: " + traceparents);
        for (String traceparent : traceparents) {
            assertTrue(traceparent.startsWith("00-" + traceId + "-"), traceparent);
        }
    }

    // ----------------------------------------------------------------------------------------

    private static String newOrderId() {
        return "ORD-" + UUID.randomUUID();
    }

    private void publish(OrderMessage message) throws Exception {
        orders.send("orders", message.getOrderId(), message).get(10, TimeUnit.SECONDS);
    }

    /**
     * Collects the commands sent for one order until {@code expected} have arrived or the timeout
     * passes. Returning fewer than expected is how the negative checks assert that nothing else came.
     */
    private List<Object> awaitCommands(String orderId, int expected, Duration timeout) {
        long deadline = System.nanoTime() + timeout.toNanos();
        List<Object> found = new ArrayList<>(seen.getOrDefault(orderId, List.of()));
        while (found.size() < expected && System.nanoTime() < deadline) {
            for (ConsumerRecord<String, Object> record : commands.poll(Duration.ofMillis(200))) {
                seen.computeIfAbsent(record.key(), k -> new ArrayList<>()).add(record.value());
                if (orderId.equals(record.key())) {
                    found.add(record.value());
                }
            }
        }
        return found;
    }

    private final Map<String, List<Object>> seen = new HashMap<>();
}
