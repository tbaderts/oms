package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.Optional;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.oms.OmsApplication;
import org.example.oms.repository.ExecutionRepository;
import org.example.oms.repository.OrderRepository;
import org.example.oms.service.command.OrderAcceptCommandProcessor;
import org.example.oms.service.execution.ExecutionCommandProcessor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest(classes = OmsApplication.class)
@Testcontainers
class OrderLifecycleIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("oms")
                    .withUsername("oms")
                    .withPassword("oms");

    @DynamicPropertySource
    static void registerProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.write.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.write.username", postgres::getUsername);
        registry.add("spring.datasource.write.password", postgres::getPassword);
        registry.add("spring.datasource.read.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.read.username", postgres::getUsername);
        registry.add("spring.datasource.read.password", postgres::getPassword);
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

    @BeforeEach
    void setup() {
        executionRepository.deleteAll();
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
                orderAcceptCommandProcessor.process(new OrderAcceptCmd("ORD-LIFE-1", "OrderAcceptCmd"));
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
}
