package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.model.cmd.OrderCancelRejectCmd;
import org.example.common.model.cmd.OrderCancelRequestCmd;
import org.example.oms.OmsApplication;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.repository.ExecutionRepository;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.repository.OrderRepository;
import org.example.oms.repository.OutboxRepository;
import org.example.oms.service.command.OrderAcceptCommandProcessor;
import org.example.oms.service.execution.ExecutionCommandProcessor;
import org.example.oms.service.lifecycle.OrderLifecycleCommandProcessor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest(classes = OmsApplication.class)
@Testcontainers
class OrderLifecycleIntegrationTest {

    private static final String ORDER_ID = "ORD-LIFE-1";

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

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private ExecutionRepository executionRepository;

    @Autowired
    private OrderAcceptCommandProcessor orderAcceptCommandProcessor;

    @Autowired
    private ExecutionCommandProcessor executionCommandProcessor;

    @Autowired
    private OrderEventRepository orderEventRepository;

    @Autowired
    private OrderLifecycleCommandProcessor orderLifecycleCommandProcessor;

    @Autowired
    private OutboxRepository outboxRepository;

    @Autowired
    private WebApplicationContext webApplicationContext;

    @BeforeEach
    void setup() {
        executionRepository.deleteAll();
        orderEventRepository.deleteAll();
        orderRepository.deleteAll();

        orderRepository.save(Order.builder()
                .orderId("ORD-LIFE-1")
                .clOrdId("CL-1")
                .account("ACCT-1")
                .symbol("AAPL")
                .ordType(org.example.common.model.OrdType.LIMIT)
                .side(org.example.common.model.Side.BUY)
                .orderQty(new BigDecimal("10.0000"))
                .price(new BigDecimal("100.00"))
                .cumQty(BigDecimal.ZERO)
                .leavesQty(new BigDecimal("10.0000"))
                .state(State.UNACK)
                .build());
    }

    @Test
    void executionRequiresLive_thenSucceedsAfterOrderAccept() {
        Execution blockedExecution = Execution.builder()
                .orderId("ORD-LIFE-1")
                .execID("EX-UNACK")
                .lastQty(new BigDecimal("1.0000"))
                .lastPx(new BigDecimal("100.00"))
                .build();

        var blockedResult = executionCommandProcessor.process(blockedExecution);
        assertFalse(blockedResult.isSuccess());
        assertEquals(0L, executionRepository.count());

        Optional<Order> beforeAccept = orderRepository.findByOrderId("ORD-LIFE-1");
        assertTrue(beforeAccept.isPresent());
        assertEquals(State.UNACK, beforeAccept.get().getState());

        var acceptResult =
                orderAcceptCommandProcessor.process(new OrderAcceptCmd("ORD-LIFE-1", "OrderAcceptCmd"), java.time.Instant.now());
        assertTrue(acceptResult.isSuccess());

        Execution liveExecution = Execution.builder()
                .orderId("ORD-LIFE-1")
                .execID("EX-LIVE")
                .lastQty(new BigDecimal("10.0000"))
                .lastPx(new BigDecimal("100.00"))
                .build();

        var liveResult = executionCommandProcessor.process(liveExecution);
        assertTrue(liveResult.isSuccess());
        assertEquals(1L, executionRepository.count());

        Optional<Order> updated = orderRepository.findByOrderId("ORD-LIFE-1");
        assertTrue(updated.isPresent());
                assertEquals(State.FILLED, updated.get().getState());
                assertEquals(new BigDecimal("10.0000"), updated.get().getCumQty());
                assertEquals(new BigDecimal("0.0000"), updated.get().getLeavesQty());
    }

    // SPEC-0018 AC-6: each lifecycle event stores its command's commandId; a command without one is
    // still applied and leaves the column null.
    @Test
    void lifecycleEvent_storesCommandId_andCommandWithoutIdIsStillApplied() {
        accept();

        var request = orderLifecycleCommandProcessor.process(cancelRequest("CR-AC6"), Instant.now());
        assertTrue(request.isSuccess(), request.getErrorMessage());
        OrderEvent requestEvent = lastEvent();
        assertEquals(Event.CXL_REQUEST, requestEvent.getEvent());
        assertEquals("CR-AC6", requestEvent.getCommandId());

        var reject =
                orderLifecycleCommandProcessor.process(
                        new OrderCancelRejectCmd().type("OrderCancelRejectCmd").orderId(ORDER_ID).text("Too late"),
                        Instant.now());
        assertTrue(reject.isSuccess(), reject.getErrorMessage());
        OrderEvent rejectEvent = lastEvent();
        assertEquals(Event.CXL_REJ, rejectEvent.getEvent());
        assertNull(rejectEvent.getCommandId());
    }

    // SPEC-0018 AC-5: a commandId the order has already applied is refused over REST with 400 FAILED
    // naming it, whatever lifecycle command reuses it, and the order and its log stay unchanged.
    @Test
    void duplicateCommandId_isRefusedOverRestAndLeavesOrderUnchanged() throws Exception {
        accept();
        MockMvc mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext).build();
        String cancelRequest =
                "{\"type\":\"OrderCancelRequestCmd\",\"version\":\"1.0.0\",\"orderId\":\"" + ORDER_ID
                        + "\",\"commandId\":\"C-AC5\"}";
        mockMvc.perform(post("/api/command/execute").contentType(MediaType.APPLICATION_JSON).content(cancelRequest))
                .andExpect(status().isOk());
        // LIVE with cancel state REJ again, so the request's own precondition would hold once more.
        assertTrue(orderLifecycleCommandProcessor
                .process(new OrderCancelRejectCmd().type("OrderCancelRejectCmd").orderId(ORDER_ID), Instant.now())
                .isSuccess());
        Order before = orderRepository.findByOrderId(ORDER_ID).orElseThrow();
        int eventsBefore = orderEventRepository.findByOrderIdOrderByVersionAsc(ORDER_ID).size();

        String cancelReusingId =
                "{\"type\":\"OrderCancelCmd\",\"version\":\"1.0.0\",\"orderId\":\"" + ORDER_ID
                        + "\",\"commandId\":\"C-AC5\"}";
        for (String duplicate : new String[] {cancelRequest, cancelReusingId}) {
            mockMvc.perform(post("/api/command/execute").contentType(MediaType.APPLICATION_JSON).content(duplicate))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.status").value("FAILED"))
                    .andExpect(jsonPath("$.message").value(containsString("C-AC5")));

            Order after = orderRepository.findByOrderId(ORDER_ID).orElseThrow();
            assertEquals(before.getState(), after.getState());
            assertEquals(before.getCancelState(), after.getCancelState());
            assertEquals(before.getTxNr(), after.getTxNr());
            assertEquals(eventsBefore, orderEventRepository.findByOrderIdOrderByVersionAsc(ORDER_ID).size());
        }
    }

    // SPEC-0034 AC-3: a create without sessionId breaks the contract, so request validation rejects
    // it with the validation-failed problem, and nothing reaches orders, order_events or the outbox.
    @Test
    void orderCreateWithoutSessionId_isRejectedAndPersistsNothing() throws Exception {
        MockMvc mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext).build();
        long orders = orderRepository.count();
        long events = orderEventRepository.count();
        long outbox = outboxRepository.count();

        mockMvc.perform(post("/api/command/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"OrderCreateCmd\",\"version\":\"1.0.0\",\"order\":{\"clOrdId\":\"SPEC-0034-1\","
                                + "\"account\":\"A1\",\"symbol\":\"AAPL\",\"side\":\"BUY\",\"ordType\":\"LIMIT\",\"orderQty\":1,\"price\":1}}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("urn:oms:error:validation-failed"))
                .andExpect(jsonPath("$.errors['order.sessionId']").isNotEmpty());

        assertEquals(orders, orderRepository.count());
        assertEquals(events, orderEventRepository.count());
        assertEquals(outbox, outboxRepository.count());
    }

    // SPEC-0018 AC-7: two concurrent copies of one command: exactly one is applied, the other is
    // refused as a duplicate (not failed with a concurrency conflict).
    @Test
    void concurrentDuplicates_exactlyOneApplied() throws Exception {
        accept();
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<OrderLifecycleCommandProcessor.OrderLifecycleResult>> copies = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                copies.add(pool.submit(() -> {
                    start.await();
                    return orderLifecycleCommandProcessor.process(cancelRequest("C-AC7"), Instant.now());
                }));
            }
            start.countDown();

            List<OrderLifecycleCommandProcessor.OrderLifecycleResult> results = new ArrayList<>();
            for (var copy : copies) {
                results.add(copy.get(10, TimeUnit.SECONDS));
            }
            assertEquals(1, results.stream().filter(OrderLifecycleCommandProcessor.OrderLifecycleResult::isSuccess).count());
            var refused = results.stream().filter(r -> !r.isSuccess()).findFirst().orElseThrow();
            assertTrue(refused.getErrorMessage().contains("Duplicate command C-AC7"), refused.getErrorMessage());
            assertEquals(
                    1,
                    orderEventRepository.findByOrderIdOrderByVersionAsc(ORDER_ID).stream()
                            .filter(e -> "C-AC7".equals(e.getCommandId()))
                            .count());
        } finally {
            pool.shutdownNow();
        }
    }

    private void accept() {
        var result = orderAcceptCommandProcessor.process(new OrderAcceptCmd(ORDER_ID, "OrderAcceptCmd"), Instant.now());
        assertTrue(result.isSuccess());
    }

    private static OrderCancelRequestCmd cancelRequest(String commandId) {
        return new OrderCancelRequestCmd().type("OrderCancelRequestCmd").orderId(ORDER_ID).commandId(commandId);
    }

    private OrderEvent lastEvent() {
        return orderEventRepository.findByOrderIdOrderByVersionAsc(ORDER_ID).getLast();
    }
}
