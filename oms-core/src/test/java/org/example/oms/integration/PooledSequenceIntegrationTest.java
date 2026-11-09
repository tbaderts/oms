package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.IntFunction;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.oms.OmsApplication;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.model.OrderExecutionProjectionRow;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;

import jakarta.persistence.EntityManager;

/**
 * SPEC-0047 AC-6: the four hot entities draw ids in blocks. Sixty rows of each cost at most two
 * sequence calls per sequence, and every id is unique.
 *
 * <p>Runs in its own database with Kafka off. Sequence calls are counted by {@link SqlCounter}.
 */
@SpringBootTest(classes = OmsApplication.class)
class PooledSequenceIntegrationTest {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        String url = AbstractKafkaPostgresIntegrationTest.isolatedDatabaseUrl("pooled");
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", AbstractKafkaPostgresIntegrationTest.postgres::getUsername);
        registry.add("spring.datasource.password", AbstractKafkaPostgresIntegrationTest.postgres::getPassword);
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("spring.jpa.properties.hibernate.session_factory.statement_inspector", SqlCounter.class::getName);
        registry.add("kafka.enabled", () -> "false");
        registry.add("spring.datasource.hikari.maximum-pool-size", () -> "3");
    }

    @Autowired EntityManager entityManager;
    @Autowired TransactionTemplate transactionTemplate;
    @Autowired JdbcTemplate jdbc;

    @Test
    void sixtyRowsCostAtMostTwoSequenceCalls() {
        String run = UUID.randomUUID().toString().substring(0, 8);
        Map<String, IntFunction<Object>> entities = Map.of(
                "order_seq", i -> Order.builder()
                        .orderId("ORD-" + run + "-" + i).clOrdId("CL-" + run + "-" + i).sessionId("SES-POOL")
                        .state(State.NEW).txNr(0).build(),
                "execution_seq", i -> Execution.builder()
                        .orderId("ORD-" + run).execId("E-" + run + "-" + i)
                        .lastQty(BigDecimal.ONE).lastPx(BigDecimal.TEN).build(),
                "order_event_seq", i -> OrderEvent.builder()
                        .orderId("ORD-" + run + "-" + i).version(1).event(Event.NEW_ORDER)
                        .timeStamp(Instant.now()).build(),
                "order_execution_projection_seq", i -> OrderExecutionProjectionRow.builder()
                        .orderId("ORD-" + run).execId("E-" + run + "-" + i).orderVersion(i + 1)
                        .projectedAt(Instant.now()).build());

        for (Map.Entry<String, IntFunction<Object>> entity : entities.entrySet()) {
            SqlCounter.reset();
            List<Object> saved = new ArrayList<>();
            transactionTemplate.executeWithoutResult(status -> {
                for (int i = 0; i < 60; i++) {
                    Object row = entity.getValue().apply(i);
                    entityManager.persist(row);
                    saved.add(row);
                }
            });

            String sequence = entity.getKey();
            assertTrue(SqlCounter.nextvals(sequence) <= 2,
                    "60 rows cost " + SqlCounter.nextvals(sequence) + " calls to " + sequence + ", at most 2 allowed");
            List<Long> ids = saved.stream().map(PooledSequenceIntegrationTest::idOf).toList();
            assertEquals(60, new HashSet<>(ids).size(), "every id from " + sequence + " is unique");
            // pooled-lo: the value a call returns is the low end of its block, so the second call
            // returned (and the sequence now stands at) exactly 50 above the first id.
            long last = jdbc.queryForObject("select last_value from " + sequence, Long.class);
            long first = ids.stream().mapToLong(Long::longValue).min().orElseThrow();
            assertEquals(last - 50, first, sequence + ": ids start at the low end of the first block");
        }
    }

    private static Long idOf(Object entity) {
        return switch (entity) {
            case Order order -> order.getId();
            case Execution execution -> execution.getId();
            case OrderEvent event -> event.getId();
            case OrderExecutionProjectionRow row -> row.getId();
            default -> throw new IllegalArgumentException(String.valueOf(entity));
        };
    }
}
