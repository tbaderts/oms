package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.oms.OmsApplication;
import org.example.oms.repository.OrderRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** SPEC-0018 AC-9: the tree finders return every match instead of assuming one. */
@SpringBootTest(classes = OmsApplication.class)
@Testcontainers
class OrderRepositoryTreeIntegrationTest {

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

    @Autowired private OrderRepository orderRepository;

    @Test
    void rootAndParentFinders_returnLists() {
        orderRepository.deleteAll();
        orderRepository.save(order("R", null, null));
        orderRepository.save(order("C1", "R", "R"));
        orderRepository.save(order("C2", "R", "R"));
        orderRepository.save(order("G1", "C1", "R"));

        List<Order> descendants = orderRepository.findByRootOrderId("R");
        List<Order> children = orderRepository.findByParentOrderId("R");

        assertEquals(Set.of("C1", "C2", "G1"), orderIds(descendants));
        assertEquals(3, descendants.size());
        assertEquals(Set.of("C1", "C2"), orderIds(children));
        assertEquals(2, children.size());
    }

    private static Set<String> orderIds(List<Order> orders) {
        return orders.stream().map(Order::getOrderId).collect(Collectors.toSet());
    }

    private static Order order(String orderId, String parentOrderId, String rootOrderId) {
        return Order.builder()
                .orderId(orderId)
                .parentOrderId(parentOrderId)
                .rootOrderId(rootOrderId)
                .clOrdId("CL-" + orderId)
                .account("ACCT-1")
                .symbol("AAPL")
                .ordType(org.example.common.model.OrdType.LIMIT)
                .side(org.example.common.model.Side.BUY)
                .orderQty(new BigDecimal("10.0000"))
                .price(new BigDecimal("100.00"))
                .cumQty(BigDecimal.ZERO)
                .leavesQty(new BigDecimal("10.0000"))
                .state(State.NEW)
                .build();
    }
}
