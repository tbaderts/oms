package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.example.oms.OmsApplication;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.jayway.jsonpath.JsonPath;

/**
 * SPEC-0046 AC-10: an order's command log is read through the contracted query operation
 * {@code GET /api/query/orders/{orderId}/commands}, oldest first, in the contracted shape.
 */
@SpringBootTest(classes = OmsApplication.class)
@Testcontainers
class OrderCommandQueryIntegrationTest {

    private static final Set<String> CONTRACTED_PROPERTIES = Set.of(
            "commandId", "type", "orderId", "receivedAt", "source", "principal", "outcome", "reason", "eventVersion");

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

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext).build();
    }

    @Test
    void unknownOrderReturnsEmptyArray() throws Exception {
        mockMvc.perform(get("/api/query/orders/{orderId}/commands", "NO-SUCH-ORDER"))
                .andExpect(status().isOk())
                .andExpect(content().json("[]"));
    }

    @Test
    void entriesHaveOnlyContractedPropertiesInReceivedOrder() throws Exception {
        String orderId = createdOrder();
        execute("{\"type\":\"OrderAcceptCmd\",\"version\":\"1.0.0\",\"orderId\":\"" + orderId + "\",\"commandId\":\"A-1\"}", 200);
        execute(cancelRequest(orderId, "C-1"), 200);
        execute(cancelRequest(orderId, "C-2"), 400);

        List<Map<String, Object>> entries = JsonPath.read(
                mockMvc.perform(get("/api/query/orders/{orderId}/commands", orderId))
                        .andExpect(status().isOk())
                        .andReturn().getResponse().getContentAsString(),
                "$");

        assertEquals(List.of("OrderCreateCmd", "OrderAcceptCmd", "OrderCancelRequestCmd", "OrderCancelRequestCmd"),
                entries.stream().map(e -> e.get("type")).toList());
        assertEquals(List.of("APPLIED", "APPLIED", "APPLIED", "REFUSED"),
                entries.stream().map(e -> e.get("outcome")).toList());
        assertEquals(List.of(1, 2, 3), entries.subList(0, 3).stream().map(e -> ((Number) e.get("eventVersion")).intValue()).toList());
        Instant previous = Instant.MIN;
        for (Map<String, Object> entry : entries) {
            assertTrue(CONTRACTED_PROPERTIES.containsAll(entry.keySet()), "uncontracted properties in " + entry.keySet());
            assertEquals("REST", entry.get("source"));
            assertEquals(orderId, entry.get("orderId"));
            Instant receivedAt = Instant.parse((String) entry.get("receivedAt"));
            assertTrue(!receivedAt.isBefore(previous), "oldest first");
            previous = receivedAt;
        }
        assertEquals("C-2", entries.getLast().get("commandId"));
        assertTrue(((String) entries.getLast().get("reason")).contains("not allowed"));
    }

    @Test
    void apiDocsDeclareTheOperation() throws Exception {
        String docs = mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertEquals("getOrderCommands",
                JsonPath.read(docs, "$.paths['/api/query/orders/{orderId}/commands'].get.operationId"));
    }

    // --- helpers -------------------------------------------------------------------------------

    private String createdOrder() throws Exception {
        String body = execute("{\"type\":\"OrderCreateCmd\",\"version\":\"1.0.0\",\"order\":{"
                + "\"sessionId\":\"SES-CQ\",\"clOrdId\":\"CL-" + UUID.randomUUID() + "\",\"account\":\"ACC-CQ\","
                + "\"symbol\":\"AAPL\",\"side\":\"BUY\",\"ordType\":\"LIMIT\",\"orderQty\":100,\"price\":170,"
                + "\"timeInForce\":\"DAY\"}}", 201);
        return JsonPath.read(body, "$.id");
    }

    private static String cancelRequest(String orderId, String commandId) {
        return "{\"type\":\"OrderCancelRequestCmd\",\"version\":\"1.0.0\",\"orderId\":\"" + orderId
                + "\",\"commandId\":\"" + commandId + "\"}";
    }

    private String execute(String body, int expectedStatus) throws Exception {
        return mockMvc.perform(post("/api/command/execute").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expectedStatus))
                .andReturn().getResponse().getContentAsString();
    }
}
