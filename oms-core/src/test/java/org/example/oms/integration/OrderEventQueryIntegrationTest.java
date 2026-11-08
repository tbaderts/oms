package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.example.common.model.Execution;
import org.example.common.model.State;
import org.example.common.model.cmd.OrdType;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.model.cmd.OrderCancelRequestCmd;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.Side;
import org.example.common.model.cmd.TimeInForce;
import org.example.oms.OmsApplication;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.repository.OrderRepository;
import org.example.oms.service.OrderEventAppender;
import org.example.oms.service.command.OrderCreateCommandProcessor;
import org.example.oms.service.execution.ExecutionCommandProcessor;
import org.example.oms.service.lifecycle.OrderLifecycleCommandProcessor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.jayway.jsonpath.JsonPath;

/**
 * SPEC-0035: an order's event log is read through the contracted query operation
 * {@code GET /api/query/orders/{orderId}/events}, in version order and in the contracted shape; the
 * old hidden {@code /api/order-events} endpoint is gone.
 */
@SpringBootTest(classes = OmsApplication.class)
@Testcontainers
class OrderEventQueryIntegrationTest {

    private static final Set<String> CONTRACTED_PROPERTIES = Set.of(
            "orderId", "version", "event", "commandId", "resultingState", "timeStamp", "transaction",
            "orderSnapshot");

    @Container
    static PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("oms")
                    .withUsername("oms")
                    .withPassword("oms");

    @DynamicPropertySource
    static void registerProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("kafka.enabled", () -> "false");
    }

    @Autowired private WebApplicationContext webApplicationContext;
    @Autowired private OrderCreateCommandProcessor orderCreateCommandProcessor;
    @Autowired private OrderLifecycleCommandProcessor orderLifecycleCommandProcessor;
    @Autowired private OrderEventRepository orderEventRepository;
    @Autowired private OrderRepository orderRepository;
    @Autowired private ExecutionCommandProcessor executionCommandProcessor;
    @Autowired private OrderEventAppender orderEventAppender;
    @Autowired private TransactionTemplate transactionTemplate;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext).build();
    }

    @Test
    void returnsEventLogInVersionOrder() throws Exception {
        String orderId = createAndAcceptOrder();
        List<OrderEvent> stored = orderEventRepository.findByOrderIdOrderByVersionAsc(orderId);
        assertEquals(2, stored.size(), "create + accept store two events");

        List<Map<String, Object>> events = getEvents(orderId);

        assertEquals(2, events.size());
        for (int i = 0; i < stored.size(); i++) {
            OrderEvent row = stored.get(i);
            Map<String, Object> event = events.get(i);
            assertEquals(i + 1L, ((Number) event.get("version")).longValue());
            assertEquals(row.getVersion(), ((Number) event.get("version")).longValue());
            assertEquals(orderId, event.get("orderId"));
            assertEquals(row.getEvent().name(), event.get("event"));
            assertEquals(row.getResultingState().name(), event.get("resultingState"));
            assertEquals(row.getCommandId(), event.get("commandId"));
            assertEquals(row.getTimeStamp(), Instant.parse((String) event.get("timeStamp")));
            assertEquals(
                    row.getTransaction().getType(),
                    ((Map<?, ?>) event.get("transaction")).get("type"));
            assertEquals(orderId, ((Map<?, ?>) event.get("orderSnapshot")).get("orderId"));
        }
    }

    @Test
    void carriesTheStoredCommandId() throws Exception {
        // Create and accept store no commandId; a cancel request does.
        String orderId = createAndAcceptOrder();
        var requested = orderLifecycleCommandProcessor.process(
                new OrderCancelRequestCmd()
                        .type("OrderCancelRequestCmd")
                        .orderId(orderId)
                        .commandId("CR-SPEC35"),
                Instant.now());
        assertTrue(requested.isSuccess());

        List<Map<String, Object>> events = getEvents(orderId);

        assertEquals(3, events.size());
        assertEquals("CXL_REQUEST", events.get(2).get("event"));
        assertEquals("CR-SPEC35", events.get(2).get("commandId"));
        assertEquals("CR-SPEC35", ((Map<?, ?>) events.get(2).get("transaction")).get("commandId"));
    }

    @Test
    void responseHasOnlyContractedProperties() throws Exception {
        String orderId = createAndAcceptOrder();

        for (Map<String, Object> event : getEvents(orderId)) {
            assertTrue(
                    CONTRACTED_PROPERTIES.containsAll(event.keySet()),
                    "uncontracted properties in " + event.keySet());
        }
    }

    @Test
    void unknownOrderReturnsEmptyArray() throws Exception {
        mockMvc.perform(get("/api/query/orders/{orderId}/events", "NO-SUCH-ORDER"))
                .andExpect(status().isOk())
                .andExpect(content().json("[]"));
    }

    @Test
    void apiDocsDeclareEventLogOperation() throws Exception {
        String docs = mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        String operation = "$.paths['/api/query/orders/{orderId}/events'].get";
        assertEquals("getOrderEvents", JsonPath.read(docs, operation + ".operationId"));
        List<Map<String, Object>> parameters = JsonPath.read(docs, operation + ".parameters");
        assertEquals(2, parameters.size());
        assertEquals("orderId", parameters.get(0).get("name"));
        assertEquals("path", parameters.get(0).get("in"));
        assertEquals(Boolean.TRUE, parameters.get(0).get("required"));
        // SPEC-0044: the optional execution filter.
        assertEquals("execId", parameters.get(1).get("name"));
        assertEquals("query", parameters.get(1).get("in"));
        assertTrue(!Boolean.TRUE.equals(parameters.get(1).get("required")), "execId is optional");
        assertTrue(JsonPath.<Map<String, Object>>read(docs, "$.paths").containsKey("/api/query/search"));
    }

    /**
     * SPEC-0044 AC-10: with execId, only the events about that execution: its fill and its bust, in
     * version order. Without it, the whole log as before.
     */
    @Test
    void execIdFilterReturnsOnlyThatExecutionsEvents() throws Exception {
        String orderId = createAndAcceptOrder();
        String ex1 = orderId + "-EX-1";
        fill(orderId, ex1, "4");
        fill(orderId, orderId + "-EX-2", "6");
        bust(orderId, ex1, "6", "4");

        List<Map<String, Object>> events = getEvents(orderId, ex1);

        assertEquals(List.of(3, 5), events.stream().map(e -> ((Number) e.get("version")).intValue()).toList());
        assertEquals(List.of("PARTIAL_FILL", "EXEC_BUST"), events.stream().map(e -> e.get("event")).toList());
        assertEquals(
                List.of("NEW_ORDER", "ACK", "PARTIAL_FILL", "FILL", "EXEC_BUST"),
                getEvents(orderId).stream().map(e -> e.get("event")).toList());
    }

    /** SPEC-0044 AC-10: an execution the order does not have matches nothing. */
    @Test
    void unknownExecIdReturnsEmptyArray() throws Exception {
        String orderId = createAndAcceptOrder();
        fill(orderId, orderId + "-EX-1", "4");

        mockMvc.perform(get("/api/query/orders/{orderId}/events", orderId).param("execId", "NO-SUCH-EXEC"))
                .andExpect(status().isOk())
                .andExpect(content().json("[]"));
    }

    @Test
    void oldPathIsGone() throws Exception {
        String orderId = createAndAcceptOrder();

        mockMvc.perform(get("/api/order-events/orderId/{orderId}", orderId))
                .andExpect(status().isNotFound());
    }

    private List<Map<String, Object>> getEvents(String orderId, String execId) throws Exception {
        String body = mockMvc.perform(get("/api/query/orders/{orderId}/events", orderId).param("execId", execId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$");
    }

    private void fill(String orderId, String execId, String lastQty) {
        var result = TestCommands.applyFill(executionCommandProcessor, Execution.builder()
                .orderId(orderId)
                .execId(execId)
                .lastQty(new BigDecimal(lastQty))
                .lastPx(new BigDecimal("100.00"))
                .execType("F")
                .build());
        assertTrue(result.isSuccess(), () -> "fill " + execId + " failed");
    }

    /** Applies a bust as SPEC-0030's pipeline will: the order's quantities, then the lifecycle event. */
    private void bust(String orderId, String execId, String cumQty, String leavesQty) {
        transactionTemplate.executeWithoutResult(tx -> {
            var order = orderRepository.findByOrderId(orderId).orElseThrow();
            var saved = orderRepository.save(order.toBuilder()
                    .state(State.LIVE)
                    .cumQty(new BigDecimal(cumQty))
                    .leavesQty(new BigDecimal(leavesQty))
                    .build());
            orderEventAppender.appendExecutionLifecycleEvent(saved, execId, Event.EXEC_BUST, null);
        });
    }

    private List<Map<String, Object>> getEvents(String orderId) throws Exception {
        String body = mockMvc.perform(get("/api/query/orders/{orderId}/events", orderId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$");
    }

    private String createAndAcceptOrder() {
        var order = new org.example.common.model.cmd.Order()
                .clOrdId("CL-" + UUID.randomUUID())
                .sessionId("SES-EVT")
                .account("ACC-EVT")
                .symbol("AAPL")
                .side(Side.BUY)
                .ordType(OrdType.LIMIT)
                .orderQty(new BigDecimal("10"))
                .price(new BigDecimal("100.00"))
                .timeInForce(TimeInForce.DAY);
        var created = orderCreateCommandProcessor.process(
                new OrderCreateCmd().type("OrderCreateCmd").order(order), Instant.now());
        assertTrue(created.isSuccess(), created.getErrorMessage());
        var accepted = orderLifecycleCommandProcessor.process(
                new OrderAcceptCmd(created.getOrderId(), "OrderAcceptCmd"), Instant.now());
        assertTrue(accepted.isSuccess(), accepted.getErrorMessage());
        return created.getOrderId();
    }
}
