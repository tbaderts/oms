package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.oms.OmsApplication;
import org.example.oms.model.CommandLogEntry;
import org.example.oms.model.CommandOutcome;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.repository.CommandLogRepository;
import org.example.oms.repository.ExecutionRepository;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.repository.OrderRepository;
import org.example.oms.repository.OutboxRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.jayway.jsonpath.JsonPath;

/**
 * SPEC-0046: a command whose commandId the order already applied gets one answer on every path, a
 * typed 409, and writes nothing; and the acknowledgement is a lifecycle action like any other.
 */
@SpringBootTest(classes = OmsApplication.class)
@Testcontainers
class DuplicateCommandIntegrationTest {

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
    @Autowired private OrderRepository orderRepository;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean private OrderEventRepository orderEventRepository;
    @Autowired private ExecutionRepository executionRepository;
    @Autowired private OutboxRepository outboxRepository;
    @Autowired private CommandLogRepository commandLogRepository;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext).build();
    }

    /** AC-6 over REST: the same commandId with a new execId is a duplicate, not a second fill. */
    @Test
    void duplicateFillCommandIdOverRestIs409() throws Exception {
        String orderId = accept(createOrder(), "A-" + UUID.randomUUID()).orderId();
        String commandId = "F-" + UUID.randomUUID();
        execute(fill(orderId, commandId, orderId + "-E1")).andExpect(status().isCreated());
        long executions = executionRepository.count();
        int events = events(orderId).size();
        long outbox = outboxRepository.count();

        execute(fill(orderId, commandId, orderId + "-E2"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("urn:oms:error:duplicate-command"))
                .andExpect(jsonPath("$.commandId").value(commandId))
                .andExpect(jsonPath("$.orderId").value(orderId));

        assertEquals(executions, executionRepository.count(), "no second execution");
        assertEquals(events, events(orderId).size(), "no event");
        assertEquals(outbox, outboxRepository.count(), "nothing staged");
        assertRefusedAsDuplicate(orderId, commandId);
    }

    /** AC-7: a repeated lifecycle command is the same typed 409 (it was a 400 before SPEC-0046). */
    @Test
    void repeatedLifecycleCommandIs409() throws Exception {
        String orderId = accept(createOrder(), "A-" + UUID.randomUUID()).orderId();
        String commandId = "C-" + UUID.randomUUID();
        String cancelRequest = "{\"type\":\"OrderCancelRequestCmd\",\"version\":\"1.0.0\",\"orderId\":\"" + orderId
                + "\",\"commandId\":\"" + commandId + "\"}";
        execute(cancelRequest).andExpect(status().isOk());
        Order before = orderRepository.findByOrderId(orderId).orElseThrow();

        execute(cancelRequest)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("urn:oms:error:duplicate-command"));

        Order after = orderRepository.findByOrderId(orderId).orElseThrow();
        assertEquals(before.getTxNr(), after.getTxNr(), "the order is unchanged");
        assertEquals(before.getCancelState(), after.getCancelState());
        assertRefusedAsDuplicate(orderId, commandId);
    }

    /**
     * AC-6/AC-7, the race: two deliveries that both pass the dedup lookup meet the unique
     * {@code (order_id, command_id)} in Postgres, and the loser gets the same typed 409. The lookup is
     * made to miss for this commandId to stage the race deterministically.
     */
    @Test
    void commandIdConstraintRaceIsTheSame409() throws Exception {
        String orderId = accept(createOrder(), "A-" + UUID.randomUUID()).orderId();
        String commandId = "C-RACE-" + UUID.randomUUID();
        String cancelRequest = "{\"type\":\"OrderCancelRequestCmd\",\"version\":\"1.0.0\",\"orderId\":\"" + orderId
                + "\",\"commandId\":\"" + commandId + "\"}";
        execute(cancelRequest).andExpect(status().isOk());
        // LIVE/REJ again, so the state allows another cancel request; only the commandId gives it away.
        execute("{\"type\":\"OrderCancelRejectCmd\",\"version\":\"1.0.0\",\"orderId\":\"" + orderId + "\"}")
                .andExpect(status().isOk());
        org.mockito.Mockito.doReturn(false)
                .when(orderEventRepository).existsByOrderIdAndCommandId(orderId, commandId);
        int events = events(orderId).size();

        execute(cancelRequest)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("urn:oms:error:duplicate-command"))
                .andExpect(jsonPath("$.commandId").value(commandId));

        assertEquals(events, events(orderId).size(), "the raced event was rolled back");
        assertRefusedAsDuplicate(orderId, commandId);
    }

    /** AC-8: accept once; a repeat is a duplicate; any accept of a non-UNACK order is refused. */
    @Test
    void acceptAppliesOnceAndRefusesRepeatAndNonUnack() throws Exception {
        String orderId = createOrder();
        String commandId = "A-" + UUID.randomUUID();

        Accepted accepted = accept(orderId, commandId);
        assertEquals("Order accepted successfully: " + orderId, accepted.message());
        Order live = orderRepository.findByOrderId(orderId).orElseThrow();
        assertEquals(State.LIVE, live.getState());
        assertNotNull(live.getMarketAckTime(), "the market ack is stamped");
        assertEquals(1, events(orderId).stream().filter(e -> e.getEvent() == Event.ACK).count());

        execute(acceptCmd(orderId, commandId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("urn:oms:error:duplicate-command"));
        execute(acceptCmd(orderId, "A-" + UUID.randomUUID())).andExpect(status().isBadRequest());
        assertEquals(1, events(orderId).stream().filter(e -> e.getEvent() == Event.ACK).count(), "still one ACK");

        execute(fill(orderId, "F-" + UUID.randomUUID(), orderId + "-ALL")).andExpect(status().isCreated());
        assertEquals(State.FILLED, orderRepository.findByOrderId(orderId).orElseThrow().getState());
        execute(acceptCmd(orderId, "A-" + UUID.randomUUID())).andExpect(status().isBadRequest());
        assertEquals(State.FILLED, orderRepository.findByOrderId(orderId).orElseThrow().getState(),
                "an ACK never reopens a filled order");
    }

    // --- helpers -------------------------------------------------------------------------------

    record Accepted(String orderId, String message) {}

    private String createOrder() throws Exception {
        String body = execute("{\"type\":\"OrderCreateCmd\",\"version\":\"1.0.0\",\"order\":{"
                        + "\"sessionId\":\"SES-DUP\",\"clOrdId\":\"CL-" + UUID.randomUUID() + "\",\"account\":\"ACC-DUP\","
                        + "\"symbol\":\"AAPL\",\"side\":\"BUY\",\"ordType\":\"LIMIT\",\"orderQty\":100,\"price\":170,"
                        + "\"timeInForce\":\"DAY\"}}")
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    private Accepted accept(String orderId, String commandId) throws Exception {
        String body = execute(acceptCmd(orderId, commandId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return new Accepted(orderId, JsonPath.read(body, "$.message"));
    }

    private static String acceptCmd(String orderId, String commandId) {
        return "{\"type\":\"OrderAcceptCmd\",\"version\":\"1.0.0\",\"orderId\":\"" + orderId
                + "\",\"commandId\":\"" + commandId + "\"}";
    }

    private static String fill(String orderId, String commandId, String execId) {
        return "{\"type\":\"ExecutionCreateCmd\",\"version\":\"1.0.0\",\"commandId\":\"" + commandId + "\","
                + "\"execution\":{\"execId\":\"" + execId + "\",\"orderId\":\"" + orderId + "\","
                + "\"lastQty\":100,\"lastPx\":170,\"execType\":\"F\"}}";
    }

    private ResultActions execute(String body) throws Exception {
        return mockMvc.perform(post("/api/command/execute").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private List<OrderEvent> events(String orderId) {
        return orderEventRepository.findByOrderIdOrderByVersionAsc(orderId);
    }

    private void assertRefusedAsDuplicate(String orderId, String commandId) {
        CommandLogEntry last = commandLogRepository.findByOrderIdOrderByReceivedAtAscIdAsc(orderId).getLast();
        assertEquals(commandId, last.getCommandId());
        assertEquals(CommandOutcome.REFUSED, last.getOutcome());
        assertTrue(last.getReason() != null && last.getReason().contains("Duplicate"), last.getReason());
    }
}
