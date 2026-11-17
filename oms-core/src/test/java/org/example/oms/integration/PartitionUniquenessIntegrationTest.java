package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import java.util.UUID;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.cmd.OrderCancelRequestCmd;
import org.example.oms.model.Event;
import org.example.oms.service.DuplicateCommandException;
import org.example.oms.service.OrderEventAppender;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * SPEC-0052 AC-2: with {@code order_events} partitioned by month, {@code (order_id, version)} and
 * {@code (order_id, command_id)} stay unique across partitions. An event already stored in an
 * earlier month's partition still refuses a second event with the same version (a version
 * conflict) or the same command (a duplicate command), appended through the real appender.
 */
class PartitionUniquenessIntegrationTest extends AbstractKafkaPostgresIntegrationTest {

    @Autowired private OrderEventAppender appender;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private TransactionTemplate tx;

    /** One event, version 1 with command {@code commandId}, stored in an earlier month (August 2026). */
    private String seedEventInAugust(String commandId) {
        String orderId = "PU-" + UUID.randomUUID();
        jdbc.update(
                "insert into order_events (id, order_id, version, event, command_id, resulting_state, time_stamp) "
                        + "values (nextval('order_event_seq'), ?, 1, 'NEW_ORDER', ?, 'UNACK', timestamptz '2026-08-15 10:00:00+00')",
                orderId, commandId);
        // August has no partition of its own in a database migrated empty (partitions start at the
        // migration's month), so it sits in the default one. Either way: not the partition an event
        // appended now lands in, which is the point.
        String seeded = jdbc.queryForObject(
                "select tableoid::regclass::text from order_events where order_id = ?", String.class, orderId);
        String now = "order_events_p" + java.time.YearMonth.now(java.time.ZoneOffset.UTC).toString().replace("-", "");
        org.junit.jupiter.api.Assertions.assertNotEquals(now, seeded);
        return orderId;
    }

    private static Order order(String orderId, long txNr) {
        Order order = Order.builder()
                .orderId(orderId)
                .clOrdId("CL-" + orderId)
                .account("ACCT-1")
                .symbol("AAPL")
                .ordType(org.example.common.model.OrdType.LIMIT)
                .side(org.example.common.model.Side.BUY)
                .orderQty(new BigDecimal("10"))
                .price(new BigDecimal("100"))
                .cumQty(BigDecimal.ZERO)
                .leavesQty(new BigDecimal("10"))
                .state(State.LIVE)
                .build();
        order.setTxNr(txNr);
        return order;
    }

    private static OrderCancelRequestCmd command(String orderId, String commandId) {
        return OrderCancelRequestCmd.builder().orderId(orderId).commandId(commandId).build();
    }

    @Test
    void sameVersionInAnotherMonthIsAVersionConflict() {
        String orderId = seedEventInAugust("C-" + UUID.randomUUID());

        // The appender takes version txNr + 1 = 1 and stamps now: a different month's partition.
        assertThrows(
                OptimisticLockingFailureException.class,
                () -> tx.executeWithoutResult(s -> appender.appendOrderEvent(
                        order(orderId, 0), Event.CXL_REQUEST, command(orderId, "C-" + UUID.randomUUID()))));
        assertEquals(1, jdbc.queryForObject("select count(*) from order_events where order_id = ?", Integer.class, orderId));
    }

    @Test
    void sameCommandIdInAnotherMonthIsADuplicateCommand() {
        String commandId = "C-" + UUID.randomUUID();
        String orderId = seedEventInAugust(commandId);

        // A new version (2), but the command already applied in August.
        assertThrows(
                DuplicateCommandException.class,
                () -> tx.executeWithoutResult(s -> appender.appendOrderEvent(
                        order(orderId, 1), Event.CXL_REQUEST, command(orderId, commandId))));
        assertEquals(1, jdbc.queryForObject("select count(*) from order_events where order_id = ?", Integer.class, orderId));
    }

    @Test
    void aNewVersionAndCommandAreAppendedAndKeyed() {
        String orderId = seedEventInAugust("C-" + UUID.randomUUID());
        String commandId = "C-" + UUID.randomUUID();

        tx.executeWithoutResult(s -> appender.appendOrderEvent(order(orderId, 1), Event.CXL_REQUEST, command(orderId, commandId)));

        assertEquals(2, jdbc.queryForObject("select count(*) from order_events where order_id = ?", Integer.class, orderId));
        assertEquals(
                commandId,
                jdbc.queryForObject("select command_id from order_event_keys where order_id = ? and version = 2", String.class, orderId));
    }

    @Test
    void deletedEventsFreeTheirKeys() {
        String commandId = "C-" + UUID.randomUUID();
        String orderId = seedEventInAugust(commandId);
        jdbc.update("delete from order_events where order_id = ?", orderId);

        assertEquals(0, jdbc.queryForObject("select count(*) from order_event_keys where order_id = ?", Integer.class, orderId));
        // version 1 and the same command can be appended again
        tx.executeWithoutResult(s -> appender.appendOrderEvent(order(orderId, 0), Event.CXL_REQUEST, command(orderId, commandId)));
        assertEquals(1, jdbc.queryForObject("select count(*) from order_event_keys where order_id = ?", Integer.class, orderId));
    }
}
