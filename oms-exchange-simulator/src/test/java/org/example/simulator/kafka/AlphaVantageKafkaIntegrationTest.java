package org.example.simulator.kafka;

import static org.example.simulator.engine.TestOrders.order;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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
import java.util.concurrent.CopyOnWriteArrayList;
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
import org.example.simulator.marketdata.StubAlphaVantage;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.ThrowableProxyUtil;
import ch.qos.logback.core.AppenderBase;
import io.confluent.kafka.serializers.KafkaAvroDeserializer;
import io.confluent.kafka.serializers.KafkaAvroSerializer;

/**
 * SPEC-0073 end to end: OrderMessages on Kafka priced by a stand-in for Alpha Vantage. Its own
 * topics, so the simulator contexts of other test classes do not answer these orders. The back-off
 * is off so one test's rate limit does not change the next test's prices; each test uses its own
 * symbols because answers are cached.
 */
@SpringBootTest(
        properties = {
            "simulator.order-topic=orders-av",
            "simulator.command-topic=commands-av",
            "simulator.fill-slices=1",
            "simulator.fill-delay=0ms",
            "simulator.provider-backoff=0s",
            "simulator.reference-prices.AAPL=170.00",
            "simulator.reference-prices.MSFT=420.00",
            "simulator.reference-prices.INTC=86.96",
            "spring.kafka.consumer.group-id=exchange-simulator-av-it",
            "spring.kafka.consumer.auto-offset-reset=earliest"
        })
class AlphaVantageKafkaIntegrationTest extends AbstractKafkaIntegrationTest {

    private static final String KEY = "IT-SECRET-KEY-73";
    private static final StubAlphaVantage alphaVantage = new StubAlphaVantage();
    private static final List<String> logLines = new CopyOnWriteArrayList<>();
    private static final AppenderBase<ILoggingEvent> logCapture = new AppenderBase<>() {
        @Override
        protected void append(ILoggingEvent event) {
            logLines.add(event.getFormattedMessage()
                    + (event.getThrowableProxy() != null ? ThrowableProxyUtil.asString(event.getThrowableProxy()) : ""));
        }
    };

    /**
     * The base class blanks the ALPHAVANTAGE_* environment variables; the resolved properties set
     * here take precedence over application.yml's placeholders for them.
     */
    @DynamicPropertySource
    static void alphaVantageProperties(DynamicPropertyRegistry registry) {
        registry.add("simulator.alpha-vantage.api-key", () -> KEY);
        registry.add("simulator.alpha-vantage.base-url", alphaVantage::baseUrl);
    }

    @Autowired private WebApplicationContext context;

    private KafkaTemplate<String, Object> orders;
    private Consumer<String, Object> commands;
    private final List<Object> allCommands = new ArrayList<>();
    private final Map<String, List<Object>> seen = new HashMap<>();

    @BeforeAll
    static void captureLogs() {
        logCapture.start();
        ((Logger) LoggerFactory.getLogger("org.example.simulator")).addAppender(logCapture);
    }

    @AfterAll
    static void stop() {
        ((Logger) LoggerFactory.getLogger("org.example.simulator")).detachAppender(logCapture);
        alphaVantage.close();
    }

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
        commands.subscribe(List.of("commands-av"));
    }

    // AC-8: whatever happened in the test, the key is in no command and no log line.
    @AfterEach
    void tearDown() {
        commands.close();
        for (Object command : allCommands) {
            assertFalse(command.toString().contains(KEY), "a command carries the API key: " + command);
        }
        for (String line : logLines) {
            assertFalse(line.contains(KEY), "a log line carries the API key: " + line);
        }
        assertTrue(alphaVantage.requests().stream().allMatch(r -> KEY.equals(r.params().get("apikey"))),
                "the key is sent to Alpha Vantage, which proves the stub is the one configured");
    }

    // AC-1
    @Test
    void symbolOnlyKnownToAlphaVantage_fillsAtItsLastPrice() throws Exception {
        alphaVantage.quote("GOOGL", "141.80");
        String orderId = newOrderId();

        publish(marketOrder(orderId, "GOOGL"));

        List<Object> sent = awaitCommands(orderId, 2, Duration.ofSeconds(10));
        assertInstanceOf(OrderAcceptCmd.class, sent.get(0));
        ExecutionCreateCmd fill = assertInstanceOf(ExecutionCreateCmd.class, sent.get(1));
        assertEquals(0, new BigDecimal("141.80").compareTo(fill.getExecution().getLastPx()));
        assertEquals("GOOGL", fill.getExecution().getSymbol());
    }

    // AC-2
    @Test
    void knownSymbol_fillsAtProviderPriceNotStatic() throws Exception {
        alphaVantage.quote("AAPL", "189.50");
        String orderId = newOrderId();

        publish(marketOrder(orderId, "AAPL"));

        List<Object> sent = awaitCommands(orderId, 2, Duration.ofSeconds(10));
        ExecutionCreateCmd fill = assertInstanceOf(ExecutionCreateCmd.class, sent.get(1));
        assertEquals(0, new BigDecimal("189.50").compareTo(fill.getExecution().getLastPx()), "not the static 170.00");
    }

    // AC-3
    @Test
    void symbolUnknownToProviderAndStatic_isRejected() throws Exception {
        String orderId = newOrderId(); // ZZZZ is not set up: the stub answers an empty Global Quote

        publish(marketOrder(orderId, "ZZZZ"));

        List<Object> sent = awaitCommands(orderId, 2, Duration.ofSeconds(5));
        assertEquals(1, sent.size(), "only the reject: " + sent);
        assertEquals("Unknown symbol ZZZZ", assertInstanceOf(OrderRejectCmd.class, sent.getFirst()).getText());
        assertEquals(1, alphaVantage.requestsFor("ZZZZ"));
    }

    // AC-4, AC-8: the rate-limit answer echoes the key, the order still trades at the static price.
    @Test
    void providerRateLimited_staticSymbolStillTrades() throws Exception {
        alphaVantage.answer("MSFT", "{\"Information\":\"We have detected your API key as " + KEY + " and our standard API rate limit is 25 requests per day.\"}");
        String orderId = newOrderId();

        publish(marketOrder(orderId, "MSFT"));

        List<Object> sent = awaitCommands(orderId, 2, Duration.ofSeconds(10));
        ExecutionCreateCmd fill = assertInstanceOf(ExecutionCreateCmd.class, sent.get(1));
        assertEquals(0, new BigDecimal("420.00").compareTo(fill.getExecution().getLastPx()));
    }

    // AC-4, AC-8: an error answer that echoes the key, for a symbol with no static price.
    @Test
    void providerErrorAndNoStaticPrice_isRejectedWithoutTheKey() throws Exception {
        alphaVantage.answer("IBMX", "{\"Error Message\":\"Invalid API call. apikey=" + KEY + "\"}");
        String orderId = newOrderId();

        publish(marketOrder(orderId, "IBMX"));

        List<Object> sent = awaitCommands(orderId, 2, Duration.ofSeconds(5));
        assertEquals(1, sent.size(), "only the reject: " + sent);
        assertEquals("Unknown symbol IBMX", assertInstanceOf(OrderRejectCmd.class, sent.getFirst()).getText());
    }

    // AC-5
    @Test
    void secondOrderSameSymbol_usesCache() throws Exception {
        alphaVantage.quote("KO", "60.10");
        String first = newOrderId();
        String second = newOrderId();

        publish(marketOrder(first, "KO"));
        assertEquals(2, awaitCommands(first, 2, Duration.ofSeconds(10)).size());
        publish(marketOrder(second, "KO"));
        List<Object> sent = awaitCommands(second, 2, Duration.ofSeconds(10));

        assertEquals(0, new BigDecimal("60.10").compareTo(assertInstanceOf(ExecutionCreateCmd.class, sent.get(1)).getExecution().getLastPx()));
        assertEquals(1, alphaVantage.requestsFor("KO"), "the second order was priced from the cache");
    }

    // AC-9
    @Test
    void lookupMetricOnPrometheusEndpoint() throws Exception {
        alphaVantage.quote("NFLX", "650.00");
        alphaVantage.answer("INTC", "{\"Note\":\"Thank you for using Alpha Vantage! 5 calls per minute.\"}");
        List<String> orderIds = List.of(newOrderId(), newOrderId(), newOrderId(), newOrderId());

        publish(marketOrder(orderIds.get(0), "NFLX")); // ALPHA_VANTAGE / FOUND
        awaitCommands(orderIds.get(0), 2, Duration.ofSeconds(10));
        publish(marketOrder(orderIds.get(1), "NFLX")); // CACHE / FOUND
        publish(marketOrder(orderIds.get(2), "INTC")); // STATIC / RATE_LIMITED
        publish(marketOrder(orderIds.get(3), "QQQQ")); // NONE / NOT_FOUND
        awaitCommands(orderIds.get(1), 2, Duration.ofSeconds(10));
        awaitCommands(orderIds.get(2), 2, Duration.ofSeconds(10));
        awaitCommands(orderIds.get(3), 1, Duration.ofSeconds(10));

        String body = MockMvcBuilders.webAppContextSetup(context).build()
                .perform(get("/actuator/prometheus"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        assertTrue(lookups(body, "ALPHA_VANTAGE", "FOUND") >= 1, body);
        assertTrue(lookups(body, "CACHE", "FOUND") >= 1, body);
        assertTrue(lookups(body, "STATIC", "RATE_LIMITED") >= 1, body);
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
        return "AV-" + UUID.randomUUID();
    }

    private void publish(OrderMessage message) throws Exception {
        orders.send("orders-av", message.getOrderId(), message).get(10, TimeUnit.SECONDS);
    }

    /** Collects the commands sent for one order until {@code expected} have arrived or the timeout passes. */
    private List<Object> awaitCommands(String orderId, int expected, Duration timeout) {
        long deadline = System.nanoTime() + timeout.toNanos();
        List<Object> found = new ArrayList<>(seen.getOrDefault(orderId, List.of()));
        while (found.size() < expected && System.nanoTime() < deadline) {
            for (ConsumerRecord<String, Object> record : commands.poll(Duration.ofMillis(200))) {
                allCommands.add(record.value());
                seen.computeIfAbsent(record.key(), k -> new ArrayList<>()).add(record.value());
                if (orderId.equals(record.key())) {
                    found.add(record.value());
                }
            }
        }
        return found;
    }
}
