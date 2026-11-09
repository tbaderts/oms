package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.ByteArrayDeserializer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.example.common.model.msg.CommandHeader;
import org.example.oms.model.CommandLogEntry;
import org.example.oms.model.CommandOutcome;
import org.example.oms.repository.CommandLogRepository;
import org.example.oms.repository.OrderEventRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import io.micrometer.core.instrument.MeterRegistry;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * SPEC-0050: a command may say which order version it acted on; a command whose expected version
 * is not the order's current version is refused (not a conflict), and an applied command's answer
 * says which version it produced.
 *
 * <p>Runs in a world of its own, so its dead-letter topic and command log hold only its commands.
 */
class ExpectedVersionIntegrationTest extends AbstractFillFlowIntegrationTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        isolate("expected", "commands-expected");
        registry.add("spring.kafka.consumer.group-id", () -> "oms-expected");
    }

    @Autowired CommandLogRepository commandLog;
    @Autowired OrderEventRepository orderEventRepository;
    @Autowired MeterRegistry meterRegistry;
    @Autowired JdbcTemplate jdbc;

    /** AC-1: a fill and a cancel request that name the current version apply and report the next. */
    @Test
    void matchingVersionApplies() throws Exception {
        String orderId = createLiveOrder();
        long n = version(orderId);

        MockHttpServletResponse fill = execute(fillJson(orderId, orderId + "-E1", "10", n));
        assertEquals(201, fill.getStatus(), fill.getContentAsString());
        assertEquals(n + 1, body(fill).get("eventVersion").asLong(), "the version the fill produced");
        assertEquals(n + 1, version(orderId));

        MockHttpServletResponse cancel = execute(
                "{\"type\":\"OrderCancelRequestCmd\",\"version\":\"1.0.0\",\"orderId\":\"" + orderId + "\",\"expectedVersion\":" + (n + 1) + "}");
        assertEquals(200, cancel.getStatus(), cancel.getContentAsString());
        assertEquals(n + 2, body(cancel).get("eventVersion").asLong());
        assertEquals(n + 2, orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).getLast().getVersion(),
                "eventVersion is the event the command wrote");
    }

    /** AC-2: a stale version over REST is refused with 400, changes nothing, and is logged REFUSED. */
    @Test
    void staleVersionIsRefusedOverRest() throws Exception {
        String orderId = createLiveOrder();
        long n = version(orderId);
        int events = orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).size();

        MockHttpServletResponse refused = execute(fillJson(orderId, orderId + "-E1", "10", n - 1));

        assertEquals(400, refused.getStatus(), refused.getContentAsString());
        JsonNode result = body(refused);
        assertEquals("FAILED", result.get("status").asString());
        assertNamesBoth(result.get("message").asString(), n - 1, n);
        assertTrue(result.get("eventVersion") == null || result.get("eventVersion").isNull(), "no version on a refusal");
        assertEquals(n, version(orderId), "the order is unchanged");
        assertEquals(events, orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).size(), "no event");
        assertEquals(0, executionCount(orderId));
        List<CommandLogEntry> refusals = commandLog.findByOrderIdOrderByReceivedAtAscIdAsc(orderId).stream()
                .filter(e -> e.getOutcome() == CommandOutcome.REFUSED).toList();
        assertEquals(1, refusals.size(), "one REFUSED row");
        assertNamesBoth(refusals.getFirst().getReason(), n - 1, n);

        // A lifecycle command is refused the same way.
        MockHttpServletResponse cancel = execute(
                "{\"type\":\"OrderCancelRequestCmd\",\"version\":\"1.0.0\",\"orderId\":\"" + orderId + "\",\"expectedVersion\":" + (n - 1) + "}");
        assertEquals(400, cancel.getStatus(), cancel.getContentAsString());
        assertNamesBoth(body(cancel).get("message").asString(), n - 1, n);
        assertEquals(n, version(orderId), "the cancel request changed nothing");
        assertEquals(events, orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).size(), "no event");
    }

    /** AC-3: a stale version over Kafka is refused and acknowledged; the current version applies. */
    @Test
    void staleVersionIsRefusedOverKafka() throws Exception {
        String orderId = createLiveOrder();
        long n = version(orderId);
        double refusedBefore = consumed("refused");

        var stale = fill(orderId + "-K1", orderId, "10");
        stale.setHeader(header(n - 1));
        send(orderId, stale);
        awaitUntil(() -> commandLog.findByOrderIdOrderByReceivedAtAscIdAsc(orderId).stream()
                .anyMatch(e -> e.getOutcome() == CommandOutcome.REFUSED), "the stale fill was refused");

        assertEquals(0, executionCount(orderId), "not applied");
        assertEquals(n, version(orderId));
        assertEquals(1.0, consumed("refused") - refusedBefore, "counted as refused, once: not retried");
        CommandLogEntry logged = commandLog.findByOrderIdOrderByReceivedAtAscIdAsc(orderId).stream()
                .filter(e -> e.getOutcome() == CommandOutcome.REFUSED).findFirst().orElseThrow();
        assertNamesBoth(logged.getReason(), n - 1, n);
        assertEquals(0, deadLetters("commands-expected.DLT", orderId), "nothing dead-lettered");

        var current = fill(orderId + "-K1", orderId, "10");
        current.setHeader(header(n));
        send(orderId, current);
        awaitUntil(() -> executionCount(orderId) == 1, "the fill with the current version applied");
        assertEquals(n + 1, version(orderId));
    }

    /** AC-4: without an expected version a command applies to an order of any version. */
    @Test
    void noExpectedVersionAppliesAsBefore() throws Exception {
        String orderId = createLiveOrder();
        for (int i = 1; i <= 3; i++) {
            assertEquals(201, postFill(orderId + "-N" + i, orderId, "10", null));
        }
        assertEquals(5, version(orderId), "an order at version 5");

        assertEquals(201, postFill(orderId + "-N4", orderId, "10", null), "applies without an expected version");
        assertEquals(6, version(orderId));
    }

    /** AC-5: a resent lifecycle command is a duplicate, not a version mismatch. */
    @Test
    void aDuplicateIsReportedAsADuplicate() throws Exception {
        String orderId = createLiveOrder();
        long n = version(orderId);
        String command = "{\"type\":\"OrderCancelRequestCmd\",\"version\":\"1.0.0\",\"orderId\":\"" + orderId
                + "\",\"commandId\":\"C-" + UUID.randomUUID() + "\",\"expectedVersion\":" + n + "}";

        assertEquals(200, execute(command).getStatus());
        MockHttpServletResponse again = execute(command);

        assertEquals(409, again.getStatus(), again.getContentAsString());
        assertTrue(again.getContentAsString().contains("urn:oms:error:duplicate-command"), again.getContentAsString());
    }

    /** AC-6: a create expects no version: absent or 0 creates at version 1; anything else is refused. */
    @Test
    void createExpectsNoVersion() throws Exception {
        MockHttpServletResponse absent = execute(createJson("CL-" + UUID.randomUUID(), null));
        assertEquals(201, absent.getStatus(), absent.getContentAsString());
        assertEquals(1, body(absent).get("eventVersion").asLong());

        MockHttpServletResponse zero = execute(createJson("CL-" + UUID.randomUUID(), 0L));
        assertEquals(201, zero.getStatus(), zero.getContentAsString());
        assertEquals(1, body(zero).get("eventVersion").asLong());

        String clOrdId = "CL-" + UUID.randomUUID();
        MockHttpServletResponse three = execute(createJson(clOrdId, 3L));
        assertEquals(400, three.getStatus(), three.getContentAsString());
        assertNamesBoth(body(three).get("message").asString(), 3, 0);
        assertEquals(0, jdbc.queryForObject("select count(*) from orders where cl_ord_id = ?", Integer.class, clOrdId),
                "no order was created");
    }

    // --- helpers -------------------------------------------------------------------------------

    private MockHttpServletResponse execute(String json) throws Exception {
        return mockMvc().perform(post("/api/command/execute").contentType(MediaType.APPLICATION_JSON).content(json))
                .andReturn().getResponse();
    }

    private static JsonNode body(MockHttpServletResponse response) throws Exception {
        return JSON.readTree(response.getContentAsString());
    }

    private long version(String orderId) {
        return orderRepository.findByOrderId(orderId).orElseThrow().getTxNr();
    }

    private static String fillJson(String orderId, String execId, String qty, long expectedVersion) {
        return "{\"type\":\"ExecutionCreateCmd\",\"version\":\"1.0.0\",\"expectedVersion\":" + expectedVersion + ","
                + "\"execution\":{\"execId\":\"" + execId + "\",\"orderId\":\"" + orderId + "\","
                + "\"lastQty\":" + qty + ",\"lastPx\":170,\"execType\":\"F\",\"lastMkt\":\"XSIM\"}}";
    }

    private static String createJson(String clOrdId, Long expectedVersion) {
        return "{\"type\":\"OrderCreateCmd\",\"version\":\"1.0.0\""
                + (expectedVersion != null ? ",\"expectedVersion\":" + expectedVersion : "")
                + ",\"order\":{\"sessionId\":\"SES-EXP\",\"clOrdId\":\"" + clOrdId + "\",\"account\":\"ACC-EXP\","
                + "\"symbol\":\"AAPL\",\"side\":\"BUY\",\"ordType\":\"LIMIT\",\"price\":170,\"orderQty\":100,"
                + "\"timeInForce\":\"DAY\"}}";
    }

    private static CommandHeader header(long expectedVersion) {
        return CommandHeader.newBuilder()
                .setCommandId(UUID.randomUUID().toString())
                .setSentAt(Instant.now())
                .setProducer("it-expected")
                .setExpectedVersion(expectedVersion)
                .build();
    }

    private static void assertNamesBoth(String text, long expected, long actual) {
        assertTrue(text != null && text.contains("Expected version " + expected) && text.contains("version " + actual),
                "names expected " + expected + " and actual " + actual + ": " + text);
    }

    private double consumed(String outcome) {
        var counter = meterRegistry.find("oms.commands.consumed").tag("type", "ExecutionCreateCmd").tag("outcome", outcome).counter();
        return counter == null ? 0 : counter.count();
    }

    private static int deadLetters(String topic, String key) {
        Map<String, Object> config = Map.of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers(),
                ConsumerConfig.GROUP_ID_CONFIG, "it-dlt-" + UUID.randomUUID(),
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest",
                ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
                ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, ByteArrayDeserializer.class);
        int count = 0;
        try (KafkaConsumer<String, byte[]> consumer = new KafkaConsumer<>(config)) {
            consumer.subscribe(List.of(topic));
            long deadline = System.nanoTime() + Duration.ofSeconds(3).toNanos();
            while (System.nanoTime() < deadline) {
                for (var record : consumer.poll(Duration.ofMillis(250))) {
                    if (key.equals(record.key())) {
                        count++;
                    }
                }
            }
        }
        return count;
    }
}
