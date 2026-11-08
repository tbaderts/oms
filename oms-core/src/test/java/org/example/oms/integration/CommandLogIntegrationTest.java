package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.example.oms.OmsApplication;
import org.example.oms.model.CommandLogEntry;
import org.example.oms.model.CommandOutcome;
import org.example.oms.model.CommandSource;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.repository.CommandLogRepository;
import org.example.oms.repository.OrderEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.jayway.jsonpath.JsonPath;

import io.micrometer.core.instrument.MeterRegistry;

/**
 * SPEC-0046: every command received over REST leaves a row in the command log with its outcome. A
 * refused command's row survives the rollback of the command, and losing that row does not change
 * the answer.
 */
@SpringBootTest(classes = OmsApplication.class)
@Testcontainers
class CommandLogIntegrationTest {

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
    @Autowired private OrderEventRepository orderEventRepository;
    @Autowired private MeterRegistry meterRegistry;
    @MockitoSpyBean private CommandLogRepository commandLogRepository;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext).build();
    }

    /** AC-1 */
    @Test
    void appliedRestCommandIsLogged() throws Exception {
        String orderId = liveOrder();
        String commandId = "C-" + UUID.randomUUID();

        execute(cancelRequest(orderId, commandId)).andExpect(status().isOk());

        CommandLogEntry entry = last(orderId);
        assertEquals(commandId, entry.getCommandId());
        assertEquals("OrderCancelRequestCmd", entry.getType());
        assertEquals(CommandSource.REST, entry.getSource());
        assertNull(entry.getPrincipal(), "REST has no authenticated principal yet");
        assertEquals(CommandOutcome.APPLIED, entry.getOutcome());
        assertNull(entry.getReason());
        OrderEvent event = orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).getLast();
        assertEquals(Event.CXL_REQUEST, event.getEvent());
        assertEquals(event.getVersion(), entry.getEventVersion());
        assertNotNull(entry.getReceivedAt());
    }

    /** AC-2 */
    @Test
    void refusedRestCommandIsLoggedAndSurvivesRollback() throws Exception {
        String orderId = liveOrder();
        execute(cancelRequest(orderId, "C-" + UUID.randomUUID())).andExpect(status().isOk());
        int eventsBefore = orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).size();
        String commandId = "C-" + UUID.randomUUID();

        execute(cancelRequest(orderId, commandId)).andExpect(status().isBadRequest());

        assertEquals(eventsBefore, orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).size());
        CommandLogEntry entry = last(orderId);
        assertEquals(commandId, entry.getCommandId());
        assertEquals(CommandOutcome.REFUSED, entry.getOutcome());
        assertNull(entry.getEventVersion());
        assertTrue(entry.getReason() != null && entry.getReason().contains("CANCEL_REQUEST not allowed"), entry.getReason());
    }

    /** AC-11 */
    @Test
    void logWriteFailureLeavesTheResultUnchanged() throws Exception {
        String orderId = liveOrder();
        execute(cancelRequest(orderId, "C-" + UUID.randomUUID())).andExpect(status().isOk());
        String expectedMessage = JsonPath.read(
                execute(cancelRequest(orderId, "C-" + UUID.randomUUID()))
                        .andExpect(status().isBadRequest())
                        .andReturn().getResponse().getContentAsString(),
                "$.message");
        double failuresBefore = meterRegistry.counter("oms.command_log.write_failures").count();
        doThrow(new DataAccessResourceFailureException("command_log unavailable"))
                .when(commandLogRepository)
                .save(argThat((CommandLogEntry entry) -> entry != null && entry.getOutcome() == CommandOutcome.REFUSED));

        execute(cancelRequest(orderId, "C-" + UUID.randomUUID()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(expectedMessage));

        assertEquals(failuresBefore + 1, meterRegistry.counter("oms.command_log.write_failures").count());
    }

    /**
     * Review: a refused create never got an order. Its answer names none, and its row has a null
     * order id rather than the id of an order that was rolled back.
     */
    @Test
    void refusedCreateNamesNoOrder() throws Exception {
        String clOrdId = "CL-" + UUID.randomUUID();
        execute(create(clOrdId)).andExpect(status().isCreated());
        long before = commandLogRepository.count();

        execute(create(clOrdId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.id").value(""));

        List<CommandLogEntry> added = commandLogRepository.findAll().stream()
                .sorted(java.util.Comparator.comparing(CommandLogEntry::getId))
                .skip(before)
                .toList();
        assertEquals(1, added.size());
        assertEquals("OrderCreateCmd", added.getFirst().getType());
        assertEquals(CommandOutcome.REFUSED, added.getFirst().getOutcome());
        assertNull(added.getFirst().getOrderId(), "no order exists for a refused create");
    }

    /**
     * Review: if the change cannot be completed after it was applied (here, its APPLIED row cannot be
     * written), the command fails as a whole and still leaves a FAILED row.
     */
    @Test
    void failureAfterApplyingIsLoggedFailed() throws Exception {
        String orderId = liveOrder();
        String commandId = "C-" + UUID.randomUUID();
        doThrow(new DataAccessResourceFailureException("command_log unavailable for APPLIED"))
                .when(commandLogRepository)
                .save(argThat((CommandLogEntry entry) -> entry != null && entry.getOutcome() == CommandOutcome.APPLIED));
        int eventsBefore = orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).size();

        execute(cancelRequest(orderId, commandId)).andExpect(status().isInternalServerError());

        assertEquals(eventsBefore, orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).size(), "rolled back");
        CommandLogEntry entry = last(orderId);
        assertEquals(commandId, entry.getCommandId());
        assertEquals(CommandOutcome.FAILED, entry.getOutcome());
        assertTrue(entry.getReason().contains("command_log unavailable"), entry.getReason());
    }

    // --- helpers -------------------------------------------------------------------------------

    private static String create(String clOrdId) {
        return "{\"type\":\"OrderCreateCmd\",\"version\":\"1.0.0\",\"order\":{"
                + "\"sessionId\":\"SES-CL\",\"clOrdId\":\"" + clOrdId + "\",\"account\":\"ACC-CL\","
                + "\"symbol\":\"AAPL\",\"side\":\"BUY\",\"ordType\":\"LIMIT\",\"orderQty\":100,\"price\":170,"
                + "\"timeInForce\":\"DAY\"}}";
    }

    private String liveOrder() throws Exception {
        String body = execute("{\"type\":\"OrderCreateCmd\",\"version\":\"1.0.0\",\"order\":{"
                        + "\"sessionId\":\"SES-CL\",\"clOrdId\":\"CL-" + UUID.randomUUID() + "\",\"account\":\"ACC-CL\","
                        + "\"symbol\":\"AAPL\",\"side\":\"BUY\",\"ordType\":\"LIMIT\",\"orderQty\":100,\"price\":170,"
                        + "\"timeInForce\":\"DAY\"}}")
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String orderId = JsonPath.read(body, "$.id");
        execute("{\"type\":\"OrderAcceptCmd\",\"version\":\"1.0.0\",\"orderId\":\"" + orderId + "\"}")
                .andExpect(status().isOk());
        return orderId;
    }

    private static String cancelRequest(String orderId, String commandId) {
        return "{\"type\":\"OrderCancelRequestCmd\",\"version\":\"1.0.0\",\"orderId\":\"" + orderId
                + "\",\"commandId\":\"" + commandId + "\"}";
    }

    private ResultActions execute(String body) throws Exception {
        return mockMvc.perform(post("/api/command/execute").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private CommandLogEntry last(String orderId) {
        List<CommandLogEntry> entries = commandLogRepository.findByOrderIdOrderByReceivedAtAscIdAsc(orderId);
        assertTrue(!entries.isEmpty(), "the order has a command log");
        return entries.getLast();
    }
}
