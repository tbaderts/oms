package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.sql.Connection;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.oms.OmsApplication;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.repository.OrderRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * SPEC-0018: an order's eventVersion must belong to the state on the same page, so the Query API
 * reads the orders and their versions in one REPEATABLE_READ snapshot. Otherwise a commit between
 * the two reads pairs an older state with a newer version, and the streaming service then drops the
 * live event carrying the newer state.
 */
@SpringBootTest(classes = OmsApplication.class)
@Testcontainers
class QuerySearchIsolationIntegrationTest {

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
    @Autowired private JdbcTemplate jdbcTemplate;
    @MockitoSpyBean private OrderEventRepository orderEventRepository;

    @Test
    void search_readsOrdersAndVersionsUnderRepeatableRead() throws Exception {
        orderRepository.save(Order.builder()
                .orderId("ORD-ISO-1")
                .clOrdId("CL-ISO-1")
                .account("ACCT-1")
                .symbol("AAPL")
                .ordType(org.example.common.model.OrdType.LIMIT)
                .side(org.example.common.model.Side.BUY)
                .orderQty(new BigDecimal("10.0000"))
                .price(new BigDecimal("100.00"))
                .cumQty(BigDecimal.ZERO)
                .leavesQty(new BigDecimal("10.0000"))
                .state(State.NEW)
                .build());

        AtomicReference<Integer> isolation = new AtomicReference<>();
        AtomicReference<String> dbIsolation = new AtomicReference<>();
        // A Spring Data proxy cannot call its real method from a spy, and the versions themselves are
        // covered by ExchangeWorkflowIntegrationTest; only the isolation in effect matters here, both
        // as Spring declared it and as Postgres runs the transaction.
        doAnswer(invocation -> {
                    isolation.set(TransactionSynchronizationManager.getCurrentTransactionIsolationLevel());
                    dbIsolation.set(jdbcTemplate.queryForObject(
                            "SELECT current_setting('transaction_isolation')", String.class));
                    return List.of();
                })
                .when(orderEventRepository)
                .findLatestVersions(any());

        MockMvcBuilders.webAppContextSetup(webApplicationContext).build()
                .perform(get("/api/query/search").param("orderId", "ORD-ISO-1"))
                .andExpect(status().isOk());

        assertEquals(Connection.TRANSACTION_REPEATABLE_READ, isolation.get());
        assertEquals("repeatable read", dbIsolation.get());
    }
}
