package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.util.Map;

import org.example.common.model.Order;
import org.example.oms.OmsApplication;
import org.example.oms.repository.OrderRepository;
import org.example.oms.service.OrderSpecifications;
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
class OrderSpecificationsIntegrationTest {

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

    @BeforeEach
    void setup() {
        orderRepository.deleteAll();

        orderRepository.save(Order.builder()
                .orderId("ORD-A")
                .symbol("AAPL")
                .price(new BigDecimal("101.50"))
                .orderQty(new BigDecimal("10"))
                .build());

        orderRepository.save(Order.builder()
                .orderId("ORD-B")
                .symbol("MSFT")
                .price(new BigDecimal("250.00"))
                .orderQty(new BigDecimal("5"))
                .build());
    }

    @Test
    void dynamic_withLikeFilter_filtersBySymbol() {
        var spec = OrderSpecifications.dynamic(Map.of("symbol__like", "AAP"));
        var results = orderRepository.findAll(spec);
        assertEquals(1, results.size());
        assertEquals("ORD-A", results.get(0).getOrderId());
    }

    @Test
    void dynamic_withInvalidNumericValue_ignoresFilterGracefully() {
        var spec = OrderSpecifications.dynamic(Map.of("price__gt", "not-a-number"));
        var results = orderRepository.findAll(spec);
        assertEquals(2, results.size());
    }
}
