package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.time.Instant;
import java.util.Map;

import org.example.common.model.CancelState;
import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.cmd.OrderCancelRequestCmd;
import org.example.oms.OmsApplication;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.repository.OrderRepository;
import org.example.oms.service.lifecycle.OrderLifecycleCommandProcessor;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

import liquibase.Scope;
import liquibase.command.CommandScope;
import liquibase.resource.ClassLoaderResourceAccessor;

/**
 * SPEC-0018 AC-8: events written before the {@code command_id} column existed get it from their
 * stored command, so a redelivery of a command applied before the upgrade is still refused.
 *
 * <p>The database is migrated to the tag just before the change, legacy rows are inserted, and only
 * then does Spring start and apply the rest of the changelog, as a real upgrade would.
 */
@SpringBootTest(classes = OmsApplication.class)
class CommandIdBackfillMigrationIntegrationTest {

    private static final String ORDER_ID = "ORD-LEGACY-1";
    private static final String COMMAND_ID = "C-LEGACY";

    static final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("oms")
                    .withUsername("oms")
                    .withPassword("oms");

    static {
        postgres.start();
        migrateToTagAndSeedLegacyEvents();
    }

    @DynamicPropertySource
    static void registerProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("kafka.enabled", () -> "false");
    }

    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private OrderRepository orderRepository;
    @Autowired private OrderEventRepository orderEventRepository;
    @Autowired private OrderLifecycleCommandProcessor orderLifecycleCommandProcessor;

    @Test
    void legacyEventsAreBackfilled_andRedeliveryIsRefused() {
        assertEquals(
                COMMAND_ID,
                jdbcTemplate.queryForObject(
                        "select command_id from order_events where order_id = ? and version = 2",
                        String.class,
                        ORDER_ID));
        assertEquals(
                null,
                jdbcTemplate.queryForObject(
                        "select command_id from order_events where order_id = ? and version = 1",
                        String.class,
                        ORDER_ID));

        // The order as the legacy events left it, after a cancel reject: LIVE/REJ, so the request's
        // state precondition holds again and only the commandId identifies the redelivery.
        orderRepository.save(Order.builder()
                .orderId(ORDER_ID)
                .clOrdId("CL-LEGACY-1")
                .account("ACCT-1")
                .symbol("AAPL")
                .ordType(org.example.common.model.OrdType.LIMIT)
                .side(org.example.common.model.Side.BUY)
                .orderQty(new BigDecimal("10.0000"))
                .price(new BigDecimal("100.00"))
                .cumQty(BigDecimal.ZERO)
                .leavesQty(new BigDecimal("10.0000"))
                .state(State.LIVE)
                .cancelState(CancelState.REJ)
                .build());
        int eventsBefore = orderEventRepository.findByOrderIdOrderByVersionAsc(ORDER_ID).size();

        var result =
                orderLifecycleCommandProcessor.process(
                        new OrderCancelRequestCmd().type("OrderCancelRequestCmd").orderId(ORDER_ID).commandId(COMMAND_ID),
                        Instant.now());

        assertFalse(result.isSuccess());
        assertTrue(result.getErrorMessage().contains("Duplicate command " + COMMAND_ID), result.getErrorMessage());
        assertEquals(eventsBefore, orderEventRepository.findByOrderIdOrderByVersionAsc(ORDER_ID).size());
        assertEquals(CancelState.REJ, orderRepository.findByOrderId(ORDER_ID).orElseThrow().getCancelState());
    }

    private static void migrateToTagAndSeedLegacyEvents() {
        try {
            Scope.child(
                    Map.of(Scope.Attr.resourceAccessor.name(), new ClassLoaderResourceAccessor()),
                    () -> new CommandScope("updateToTag")
                            .addArgumentValue("changelogFile", "db/changelog/db.changelog-master.yaml")
                            .addArgumentValue("url", postgres.getJdbcUrl())
                            .addArgumentValue("username", postgres.getUsername())
                            .addArgumentValue("password", postgres.getPassword())
                            .addArgumentValue("tag", "before-006-command-id")
                            .execute());

            try (Connection connection =
                            DriverManager.getConnection(
                                    postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
                    Statement statement = connection.createStatement()) {
                statement.execute(
                        "insert into order_events (id, order_id, version, event, transaction, resulting_state, time_stamp) values "
                                + "(nextval('order_event_seq'), '" + ORDER_ID + "', 1, 'NEW_ORDER', null, 'UNACK', now()), "
                                + "(nextval('order_event_seq'), '" + ORDER_ID + "', 2, 'CXL_REQUEST', "
                                + "'{\"type\":\"OrderCancelRequestCmd\",\"version\":\"1.0.0\",\"orderId\":\"" + ORDER_ID
                                + "\",\"commandId\":\"" + COMMAND_ID + "\"}'::jsonb, 'LIVE', now())");
            }
        } catch (Exception e) {
            throw new IllegalStateException("Could not prepare the legacy database", e);
        }
    }
}
