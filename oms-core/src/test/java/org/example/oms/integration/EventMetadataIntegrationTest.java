package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

import org.example.common.model.State;
import org.example.common.model.cmd.OrdType;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.Side;
import org.example.common.model.cmd.TimeInForce;
import org.example.common.model.msg.CommandHeader;
import org.example.oms.model.CommandSource;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.service.OrderChanges;
import org.example.oms.service.command.CommandDispatch;
import org.example.oms.service.command.CommandDispatcher;
import org.example.oms.service.command.CommandOrigin;
import org.example.oms.service.endofday.EndOfDayService;
import org.example.oms.service.endofday.OrderExpiryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * SPEC-0049: an event records who caused it (correlation and causation ids, principal, source) and
 * what it changed (field-level {@code changes}).
 *
 * <p>Runs in a world of its own: the scheduler services act on every due order in the database.
 */
class EventMetadataIntegrationTest extends AbstractFillFlowIntegrationTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        isolate("metadata", "commands-metadata");
        registry.add("spring.kafka.consumer.group-id", () -> "oms-metadata");
    }

    @Autowired OrderEventRepository orderEventRepository;
    @Autowired CommandDispatcher commandDispatcher;
    @Autowired OrderExpiryService orderExpiryService;
    @Autowired EndOfDayService endOfDayService;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    /** AC-1: a Kafka command's header ids and producer, and source KAFKA. */
    @Test
    void kafkaCommandCarriesHeaderMetadata() throws Exception {
        String orderId = createLiveOrder();
        String run = UUID.randomUUID().toString();
        var command = fill(orderId + "-K1", orderId, "10");
        command.setHeader(CommandHeader.newBuilder()
                .setCommandId(run)
                .setSentAt(Instant.now())
                .setProducer("it-metadata-producer")
                .setCorrelationId("CORR-" + run)
                .setCausationId("CAUS-" + run)
                .build());

        send(orderId, command);
        awaitUntil(() -> executionCount(orderId) == 1, "the Kafka fill applied");

        OrderEvent event = latest(orderId);
        assertEquals("CORR-" + run, event.getCorrelationId());
        assertEquals("CAUS-" + run, event.getCausationId());
        assertEquals("it-metadata-producer", event.getPrincipal());
        assertEquals(CommandSource.KAFKA, event.getSource());
    }

    /**
     * AC-2: a REST command's correlationId, source REST and no principal; scheduler jobs record
     * themselves.
     */
    @Test
    void restAndSchedulerCommandsCarryTheirOrigin() throws Exception {
        String orderId = createLiveOrder();
        String correlation = "CORR-REST-" + UUID.randomUUID();
        int status = mockMvc().perform(post("/api/command/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"ExecutionCreateCmd\",\"version\":\"1.0.0\",\"correlationId\":\"" + correlation + "\","
                                + "\"execution\":{\"execId\":\"" + orderId + "-R1\",\"orderId\":\"" + orderId + "\","
                                + "\"lastQty\":10,\"lastPx\":170,\"execType\":\"F\",\"lastMkt\":\"XSIM\"}}"))
                .andReturn().getResponse().getStatus();
        assertEquals(201, status);
        OrderEvent rest = latest(orderId);
        assertEquals(correlation, rest.getCorrelationId());
        assertEquals(CommandSource.REST, rest.getSource());
        assertNull(rest.getPrincipal(), "no principal on REST until authentication exists");

        String gtd = createLiveGtd(Instant.now().minusSeconds(60));
        orderExpiryService.expireDueGtd(Instant.now());
        awaitUntil(() -> state(gtd) == State.EXP, gtd + " expired");
        OrderEvent expired = event(gtd, Event.EXP);
        assertEquals(CommandSource.SCHEDULER, expired.getSource());
        assertEquals("oms-core:expiry", expired.getPrincipal());

        endOfDayService.run(Instant.now());
        OrderEvent closed = event(gtd, Event.CLOSE);
        assertEquals(CommandSource.SCHEDULER, closed.getSource());
        assertEquals("oms-core:end-of-day", closed.getPrincipal());
    }

    /**
     * AC-3: a partial fill records exactly the fields it changed: cumQty 0 → 40, leavesQty
     * 100 → 60, txNr; not state, which stays LIVE. (The order has no average price; the fill's is on
     * the execution.)
     */
    @Test
    void aFillRecordsExactlyTheChangedFields() throws Exception {
        String orderId = createLiveOrder();
        assertEquals(201, postFill(orderId + "-E1", orderId, "40", null));

        List<OrderEvent> history = orderEventRepository.findByOrderIdOrderByVersionAsc(orderId);
        OrderEvent fill = history.getLast();
        JsonNode changes = JSON.readTree(fill.getChanges());

        assertNumber(changes, "cumQty", "0", "40");
        assertNumber(changes, "leavesQty", "100", "60");
        assertTrue(changes.has("txNr"), "the version changed: " + changes);
        assertTrue(!changes.has("state"), "state stays LIVE, so it is not listed: " + changes);

        // Exactly the fields that differ between the snapshot before and after the fill. Instants are
        // compared to the microsecond: a snapshot keeps the nanoseconds of Instant.now(), the row the
        // fill loaded keeps what Postgres stores (rounded to the microsecond), so the two only differ
        // below a microsecond.
        JsonNode before = micros(JSON.valueToTree(history.get(history.size() - 2).getOrderSnapshot()));
        JsonNode after = micros(JSON.valueToTree(fill.getOrderSnapshot()));
        assertEquals(names(OrderChanges.diff(before, after)), names(changes), "no unchanged field is listed; snapshot diff " + OrderChanges.diff(before, after));
    }

    /** AC-4: a create lists every field it set, each from null. */
    @Test
    void aCreateListsEveryFieldItSet() throws Exception {
        String orderId = createLiveOrder();

        OrderEvent created = orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).getFirst();
        JsonNode changes = JSON.readTree(created.getChanges());
        JsonNode snapshot = JSON.valueToTree(created.getOrderSnapshot());

        Set<String> set = new TreeSet<>();
        snapshot.propertyNames().forEach(name -> {
            if (!snapshot.get(name).isNull()) {
                set.add(name);
            }
        });
        assertEquals(set, names(changes), "every field set at creation");
        changes.propertyNames().forEach(name -> assertTrue(changes.get(name).get("from").isNull(), name + " from null"));
    }

    /**
     * AC-5: the order-events endpoint returns the five fields as stored, with changes as a JSON
     * object; an event recorded before SPEC-0049 (nulls) returns them null and its other fields as
     * before.
     */
    @Test
    void theEventsEndpointReturnsMetadataAndChanges() throws Exception {
        String orderId = createLiveOrder();
        String correlation = "CORR-API-" + UUID.randomUUID();
        assertEquals(201, mockMvc().perform(post("/api/command/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"ExecutionCreateCmd\",\"version\":\"1.0.0\",\"correlationId\":\"" + correlation + "\","
                                + "\"causationId\":\"CAUSE-API\",\"execution\":{\"execId\":\"" + orderId + "-A1\",\"orderId\":\"" + orderId + "\","
                                + "\"lastQty\":40,\"lastPx\":170,\"execType\":\"F\",\"lastMkt\":\"XSIM\"}}"))
                .andReturn().getResponse().getStatus());
        // The create event stands in for one recorded before SPEC-0049.
        jdbc.update("update order_events set correlation_id = null, causation_id = null, principal = null, source = null,"
                + " changes = null where order_id = ? and version = 1", orderId);

        String body = mockMvc().perform(get("/api/query/orders/" + orderId + "/events"))
                .andReturn().getResponse().getContentAsString();
        JsonNode events = JSON.readTree(body);
        JsonNode fill = events.get(events.size() - 1);
        assertEquals(correlation, fill.get("correlationId").asString());
        assertEquals("CAUSE-API", fill.get("causationId").asString());
        assertEquals("REST", fill.get("source").asString());
        assertTrue(fill.get("principal") == null || fill.get("principal").isNull(), "no REST principal");
        assertTrue(fill.get("changes").isObject(), "changes is a JSON object: " + fill.get("changes"));
        assertEquals(0, new BigDecimal("40").compareTo(fill.get("changes").get("cumQty").get("to").decimalValue()));

        JsonNode legacy = events.get(0);
        for (String field : List.of("correlationId", "causationId", "principal", "source", "changes")) {
            assertTrue(legacy.get(field) == null || legacy.get(field).isNull(), field + " is null on an older event: " + legacy);
        }
        assertEquals(1, legacy.get("version").asInt());
        assertEquals("NEW_ORDER", legacy.get("event").asString());
        assertTrue(legacy.get("orderSnapshot").isObject(), "the older event's snapshot is returned as before");
    }

    /**
     * AC-5, "as stored": a quantity with more significant digits than a double holds (within the
     * contract's 10 integer and 8 decimal digits) comes back from the endpoint exactly.
     */
    @Test
    void theEndpointReturnsChangesWithExactDecimals() throws Exception {
        var order = new org.example.common.model.cmd.Order()
                .clOrdId("CL-" + UUID.randomUUID()).sessionId("SES-META").account("ACC-META").symbol("AAPL")
                .side(Side.BUY).ordType(OrdType.LIMIT).price(new BigDecimal("170")).orderQty(new BigDecimal("9999999999"))
                .timeInForce(TimeInForce.DAY);
        CommandDispatch created = commandDispatcher.dispatch(
                new OrderCreateCmd().type("OrderCreateCmd").order(order), CommandOrigin.rest(Instant.now()));
        String orderId = created.orderId();
        send(orderId, new org.example.common.model.msg.OrderAcceptCmd(TestCommands.header(), orderId));
        awaitUntil(() -> state(orderId) == State.LIVE, orderId + " LIVE");
        assertEquals(201, postFill(orderId + "-X1", orderId, "1234567890.12345678", null));

        String body = mockMvc().perform(get("/api/query/orders/" + orderId + "/events"))
                .andReturn().getResponse().getContentAsString();

        JsonNode events = JsonMapper.builder()
                .enable(tools.jackson.databind.DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
                .build()
                .readTree(body);
        JsonNode to = events.get(events.size() - 1).get("changes").get("cumQty").get("to");
        assertEquals(new BigDecimal("1234567890.12345678"), to.decimalValue().stripTrailingZeros().setScale(8),
                "changes.cumQty.to is returned exactly, not as a double: " + to);
    }

    // --- helpers -------------------------------------------------------------------------------

    private String createLiveGtd(Instant expireTime) throws Exception {
        var order = new org.example.common.model.cmd.Order()
                .clOrdId("CL-" + UUID.randomUUID()).sessionId("SES-META").account("ACC-META").symbol("AAPL")
                .side(Side.BUY).ordType(OrdType.LIMIT).price(new BigDecimal("170")).orderQty(new BigDecimal("100"))
                .timeInForce(TimeInForce.GOOD_TILL_DATE)
                .expireTime(OffsetDateTime.ofInstant(expireTime, ZoneOffset.UTC));
        CommandDispatch outcome = commandDispatcher.dispatch(
                new OrderCreateCmd().type("OrderCreateCmd").order(order), CommandOrigin.rest(Instant.now()));
        assertTrue(outcome instanceof CommandDispatch.Applied, "created: " + outcome);
        String orderId = outcome.orderId();
        send(orderId, new org.example.common.model.msg.OrderAcceptCmd(TestCommands.header(), orderId));
        awaitUntil(() -> state(orderId) == State.LIVE, orderId + " LIVE");
        return orderId;
    }

    private OrderEvent latest(String orderId) {
        return orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).getLast();
    }

    private OrderEvent event(String orderId, Event type) {
        return orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).stream()
                .filter(e -> e.getEvent() == type)
                .findFirst()
                .orElseThrow(() -> new AssertionError("no " + type + " event for " + orderId));
    }

    private static void assertNumber(JsonNode changes, String field, String from, String to) {
        JsonNode change = changes.get(field);
        assertTrue(change != null, field + " is listed: " + changes);
        assertEquals(0, new BigDecimal(from).compareTo(change.get("from").decimalValue()), field + " from");
        assertEquals(0, new BigDecimal(to).compareTo(change.get("to").decimalValue()), field + " to");
    }

    /** The tree with every ISO instant rounded to whole microseconds, as Postgres stores it. */
    private static JsonNode micros(JsonNode node) {
        var copy = ((tools.jackson.databind.node.ObjectNode) node).deepCopy();
        for (String name : new TreeSet<>(copy.propertyNames())) {
            JsonNode value = copy.get(name);
            if (value.isString() && value.asString().matches("\\d{4}-\\d{2}-\\d{2}T.*Z")) {
                copy.put(name, Instant.parse(value.asString()).plusNanos(500).truncatedTo(java.time.temporal.ChronoUnit.MICROS).toString());
            }
        }
        return copy;
    }

    private static Set<String> names(JsonNode node) {
        Set<String> names = new TreeSet<>();
        node.propertyNames().forEach(names::add);
        return names;
    }
}
