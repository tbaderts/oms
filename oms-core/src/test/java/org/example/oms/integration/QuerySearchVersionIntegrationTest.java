package org.example.oms.integration;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.oms.OmsApplication;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.repository.OrderRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * SPEC-0027 AC-5: an order's eventVersion is its own version, read with the order itself, so it
 * always belongs to the state on the same page and the event log is not queried.
 *
 * <p>Replaces SPEC-0018's isolation check: with two queries the version had to be read in the same
 * REPEATABLE_READ snapshot as the order; with one there is nothing to keep consistent.
 */
@SpringBootTest(classes = OmsApplication.class)
@Testcontainers
class QuerySearchVersionIntegrationTest {

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
    @MockitoSpyBean private OrderEventRepository orderEventRepository;

    @Test
    void search_readsTheVersionFromTheOrderWithoutQueryingTheEventLog() throws Exception {
        orderRepository.save(order("ORD-VER-1", 4L));
        orderRepository.save(order("ORD-VER-NONE", 0L));

        var mvc = MockMvcBuilders.webAppContextSetup(webApplicationContext).build();
        mvc.perform(get("/api/query/search").param("orderId", "ORD-VER-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].txNr").value(4))
                .andExpect(jsonPath("$.content[0].eventVersion").value(4));
        mvc.perform(get("/api/query/search").param("orderId", "ORD-VER-NONE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].eventVersion").doesNotExist());

        verifyNoInteractions(orderEventRepository);
    }

    private static Order order(String orderId, long version) {
        return Order.builder()
                .orderId(orderId)
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
                .txNr(version)
                .build();
    }
}
