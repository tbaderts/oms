package org.example.simulator.kafka;

import static org.example.simulator.engine.TestOrders.order;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.example.common.model.msg.ExecutionCreateCmd;
import org.example.common.model.msg.OrdType;
import org.example.common.model.msg.OrderAcceptCmd;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.msg.OrderRejectCmd;
import org.example.common.model.msg.Side;
import org.example.common.model.msg.TimeInForce;
import org.example.simulator.AbstractKafkaIntegrationTest;
import org.example.simulator.marketdata.StubPriceService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import io.confluent.kafka.serializers.KafkaAvroDeserializer;
import io.confluent.kafka.serializers.KafkaAvroSerializer;

/**
 * SPEC-0079 AC-9 end to end: OrderMessages on Kafka priced by a stand-in for the price service, where
 * the venue's reference prices come from (SPEC-0073 introduced live prices, then from Alpha Vantage
 * directly). Its own topics, so the simulator contexts of other test classes do not answer these
 * orders. The back-off is off so one test's outage does not change the next test's prices; each test
 * uses its own symbols because answers are cached.
 */
@SpringBootTest(
        properties = {
            "simulator.order-topic=orders-ps",
            "simulator.command-topic=commands-ps",
            "simulator.fill-slices=1",
            "simulator.fill-delay=0ms",
            "simulator.provider-backoff=0s",
            "simulator.reference-prices.AAPL=170.00",
            "simulator.reference-prices.MSFT=420.00",
            "simulator.reference-prices.INTC=86.96",
            "spring.kafka.consumer.group-id=exchange-simulator-ps-it",
            "spring.kafka.consumer.auto-offset-reset=earliest"
        })
class PriceServiceKafkaIntegrationTest extends AbstractKafkaIntegrationTest {

    private static final StubPriceService priceService = new StubPriceService();

    /**
     * The base class blanks SIMULATOR_PRICE_SERVICE_URL; the resolved property set here takes
     * precedence over the placeholder in application.yml.
     */
    @DynamicPropertySource
    static void priceServiceProperties(DynamicPropertyRegistry registry) {
        registry.add("simulator.price-service.url", priceService::baseUrl);
    }

    @Autowired private WebApplicationContext context;

    private KafkaTemplate<String, Object> orders;
    private Consumer<String, Object> commands;
    private final Map<String, List<Object>> seen = new HashMap<>();

    @AfterAll
    static void stop() {
        priceService.close();
    }

    @BeforeEach
    void setUp() {
        priceService.failing(false);
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
        commands.subscribe(List.of("commands-ps"));
    }

    @AfterEach
    void tearDown() {
        commands.close();
    }

    @Test
    void ordersFillAtThePriceServiceQuote() throws Exception {
        priceService.quote("GOOGL", "141.80");
        String orderId = newOrderId();

        publish(marketOrder(orderId, "GOOGL"));

        List<Object> sent = awaitCommands(orderId, 2, Duration.ofSeconds(10));
        assertInstanceOf(OrderAcceptCmd.class, sent.get(0));
        ExecutionCreateCmd fill = assertInstanceOf(ExecutionCreateCmd.class, sent.get(1));
        assertEquals(0, new BigDecimal("141.80").compareTo(fill.getExecution().getLastPx()));
        assertEquals("GOOGL", fill.getExecution().getSymbol());
    }

    /** An end-of-day close from the price service is the reference too, not the static price. */
    @Test
    void anEndOfDayQuoteIsTheReferenceNotTheStaticPrice() throws Exception {
        priceService.quote("AAPL", "189.50", "END_OF_DAY");
        String orderId = newOrderId();

        publish(marketOrder(orderId, "AAPL"));

        List<Object> sent = awaitCommands(orderId, 2, Duration.ofSeconds(10));
        ExecutionCreateCmd fill = assertInstanceOf(ExecutionCreateCmd.class, sent.get(1));
        assertEquals(0, new BigDecimal("189.50").compareTo(fill.getExecution().getLastPx()), "not the static 170.00");
    }

    @Test
    void symbolUnknownToPriceServiceAndStatic_isRejected() throws Exception {
        String orderId = newOrderId(); // ZZZZ is not set up: the stub answers 404

        publish(marketOrder(orderId, "ZZZZ"));

        List<Object> sent = awaitCommands(orderId, 2, Duration.ofSeconds(5));
        assertEquals(1, sent.size(), "only the reject: " + sent);
        assertEquals("Unknown symbol ZZZZ", assertInstanceOf(OrderRejectCmd.class, sent.getFirst()).getText());
        assertEquals(1, priceService.requestsFor("ZZZZ"));
    }

    @Test
    void priceServiceDown_staticSymbolStillTrades() throws Exception {
        priceService.failing(true);
        String orderId = newOrderId();

        publish(marketOrder(orderId, "MSFT"));

        List<Object> sent = awaitCommands(orderId, 2, Duration.ofSeconds(10));
        ExecutionCreateCmd fill = assertInstanceOf(ExecutionCreateCmd.class, sent.get(1));
        assertEquals(0, new BigDecimal("420.00").compareTo(fill.getExecution().getLastPx()));
    }

    @Test
    void priceServiceDownAndNoStaticPrice_isRejected() throws Exception {
        priceService.failing(true);
        String orderId = newOrderId();

        publish(marketOrder(orderId, "IBMX"));

        List<Object> sent = awaitCommands(orderId, 2, Duration.ofSeconds(5));
        assertEquals(1, sent.size(), "only the reject: " + sent);
        assertEquals("Unknown symbol IBMX", assertInstanceOf(OrderRejectCmd.class, sent.getFirst()).getText());
    }

    @Test
    void secondOrderSameSymbol_usesCache() throws Exception {
        priceService.quote("KO", "60.10");
        String first = newOrderId();
        String second = newOrderId();

        publish(marketOrder(first, "KO"));
        assertEquals(2, awaitCommands(first, 2, Duration.ofSeconds(10)).size());
        publish(marketOrder(second, "KO"));
        List<Object> sent = awaitCommands(second, 2, Duration.ofSeconds(10));

        assertEquals(0, new BigDecimal("60.10").compareTo(assertInstanceOf(ExecutionCreateCmd.class, sent.get(1)).getExecution().getLastPx()));
        assertEquals(1, priceService.requestsFor("KO"), "the second order was priced from the cache");
    }

    @Test
    void lookupMetricOnPrometheusEndpoint() throws Exception {
        priceService.quote("NFLX", "650.00");
        List<String> orderIds = List.of(newOrderId(), newOrderId(), newOrderId(), newOrderId());

        publish(marketOrder(orderIds.get(0), "NFLX")); // PRICE_SERVICE / FOUND
        awaitCommands(orderIds.get(0), 2, Duration.ofSeconds(10));
        publish(marketOrder(orderIds.get(1), "NFLX")); // CACHE / FOUND
        awaitCommands(orderIds.get(1), 2, Duration.ofSeconds(10));
        priceService.failing(true);
        publish(marketOrder(orderIds.get(2), "INTC")); // STATIC / UNREACHABLE
        awaitCommands(orderIds.get(2), 2, Duration.ofSeconds(10));
        priceService.failing(false);
        publish(marketOrder(orderIds.get(3), "QQQQ")); // NONE / NOT_FOUND
        awaitCommands(orderIds.get(3), 1, Duration.ofSeconds(10));

        String body = MockMvcBuilders.webAppContextSetup(context).build()
                .perform(get("/actuator/prometheus"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        assertTrue(lookups(body, "PRICE_SERVICE", "FOUND") >= 1, body);
        assertTrue(lookups(body, "CACHE", "FOUND") >= 1, body);
        assertTrue(lookups(body, "STATIC", "UNREACHABLE") >= 1, body);
        assertTrue(lookups(body, "NONE", "NOT_FOUND") >= 1, body);
    }

    // ----------------------------------------------------------------------------------------

    private static double lookups(String body, String source, String outcome) {
        Matcher matcher = Pattern.compile("(?m)^simulator_reference_price_lookups_total\\{([^}]*)\\} ([0-9.Ee+-]+)$").matcher(body);
        while (matcher.find()) {
            String labels = matcher.group(1);
            if (labels.contains("source=\"" + source + "\"") && labels.contains("outcome=\"" + outcome + "\"")) {
                return Double.parseDouble(matcher.group(2));
            }
        }
        return -1;
    }

    private static OrderMessage marketOrder(String orderId, String symbol) {
        return order(orderId, symbol, OrdType.MARKET, Side.BUY, "100", null, TimeInForce.DAY);
    }

    private static String newOrderId() {
        return "PS-" + UUID.randomUUID();
    }

    private void publish(OrderMessage message) throws Exception {
        orders.send("orders-ps", message.getOrderId(), message).get(10, TimeUnit.SECONDS);
    }

    /** Collects the commands sent for one order until {@code expected} have arrived or the timeout passes. */
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
}
