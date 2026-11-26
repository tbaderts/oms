package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.stream.Collectors;

import org.example.common.model.msg.OrdType;
import org.example.common.model.msg.OrderExecution;
import org.example.common.model.msg.Side;
import org.example.common.model.msg.State;
import org.example.oms.admin.OutboxInspector;
import org.example.oms.admin.OutboxInspector.Entry;
import org.example.oms.admin.OutboxInspector.OutboxState;
import org.example.oms.mapper.AvroPayloadCodec;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import io.micrometer.core.instrument.MeterRegistry;

/**
 * SPEC-0075 AC-1, AC-2, AC-3, AC-5: the outbox's messages and their states, as the relay sees them.
 *
 * <p>The relay publishes or exhausts any pending row it can claim, so pending rows only ever exist
 * inside a transaction that is rolled back: the relay never sees them. Stuck rows and the rows held
 * behind them are left alone by the relay, so they can be committed, which lets the summary be
 * compared with the gauges (which read in their own transactions).
 */
class OutboxInspectorIntegrationTest extends AbstractKafkaPostgresIntegrationTest {

    @DynamicPropertySource
    static void world(DynamicPropertyRegistry registry) {
        isolate("outbox_inspector", "commands-outbox_inspector");
    }

    /** kafka.outbox.max-attempts, the default; a planted row with this many attempts is parked (SPEC-0077). */
    private static final int MAX = 50;

    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired OutboxInspector inspector;
    @Autowired MeterRegistry meters;
    @Autowired AvroPayloadCodec codec;

    @AfterEach
    void removeCommittedRows() {
        jdbc.update("delete from outbox where topic like 'oi-%'");
    }

    /** Runs the block in a transaction that is rolled back: its rows are never seen by the relay. */
    private void rolledBack(Consumer<Void> block) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            block.accept(null);
            status.setRollbackOnly();
        });
    }

    private long row(String topic, String key, int attempts, Instant createdAt, Map<String, Object> extra) {
        return jdbc.queryForObject(
                "insert into outbox (id, aggregate_type, aggregate_id, topic, aggregate_version, created_at, attempts, "
                        + "order_id, exec_id, last_error, payload_type, payload, parked_at) "
                        + "values (nextval('outbox_seq'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id",
                Long.class,
                extra.getOrDefault("type", "ORDER"), key, topic, extra.getOrDefault("version", 1L),
                Timestamp.from(createdAt), attempts, extra.get("orderId"), extra.get("execId"), extra.get("lastError"),
                extra.get("payloadType"), extra.get("payload"), attempts >= MAX ? Timestamp.from(Instant.now()) : null);
    }

    private long row(String topic, String key, int attempts) {
        return row(topic, key, attempts, Instant.now(), Map.of("orderId", key));
    }

    private Map<Long, Entry> byId(List<Entry> entries) {
        return entries.stream().collect(Collectors.toMap(Entry::id, e -> e));
    }

    @Test
    void derivesStuckHeldAndPendingLikeTheRelay() {
        rolledBack(ignored -> {
            long stuck = row("oi-orders", "K1", MAX, Instant.now().minusSeconds(60),
                    Map.of("orderId", "ORD-K1", "lastError", "RecordTooLargeException: too big", "version", 3L));
            long held = row("oi-orders", "K1", 0, Instant.now(), Map.of("orderId", "ORD-K1", "version", 4L));
            long pending = row("oi-orders", "K2", 3, Instant.now(), Map.of("orderId", "ORD-K2", "execId", "EX-9", "type", "EXECUTION"));
            long otherTopic = row("oi-executions", "K1", 0); // same key, other topic: not held

            Map<Long, Entry> entries = byId(inspector.page(null, 0, 200).content());

            assertEquals(OutboxState.STUCK, entries.get(stuck).state());
            assertEquals(OutboxState.HELD, entries.get(held).state());
            assertEquals(OutboxState.PENDING, entries.get(pending).state());
            assertEquals(OutboxState.PENDING, entries.get(otherTopic).state());

            Entry s = entries.get(stuck);
            assertEquals("oi-orders", s.topic());
            assertEquals("K1", s.key());
            assertEquals("ORD-K1", s.orderId());
            assertEquals("ORDER", s.aggregateType());
            assertEquals(3L, s.aggregateVersion());
            assertEquals(MAX, s.attempts());
            assertEquals(MAX, s.maxAttempts());
            assertEquals("RecordTooLargeException: too big", s.lastError());
            assertNotNull(s.createdAt());
            Entry p = entries.get(pending);
            assertEquals("EX-9", p.execId());
            assertEquals("EXECUTION", p.aggregateType());
            assertEquals(3, p.attempts());
        });
    }

    @Test
    void filtersByStateOldestFirstAndPages() {
        rolledBack(ignored -> {
            long s1 = row("oi-orders", "A", MAX);
            long s2 = row("oi-orders", "B", MAX + 2);
            long s3 = row("oi-orders", "C", MAX);
            row("oi-orders", "D", 0);

            OutboxInspector.Page first = inspector.page(OutboxState.STUCK, 0, 2);
            OutboxInspector.Page second = inspector.page(OutboxState.STUCK, 1, 2);

            assertEquals(3, first.total());
            assertEquals(List.of(s1, s2), first.content().stream().map(Entry::id).toList());
            assertEquals(List.of(s3), second.content().stream().map(Entry::id).toList());
            assertTrue(inspector.page(OutboxState.HELD, 0, 50).content().isEmpty());
            assertEquals(1, inspector.page(OutboxState.PENDING, 0, 50).total());
            assertEquals(4, inspector.page(null, 0, 50).total());
        });
    }

    @Test
    void summaryCountsStatesAndMatchesTheGauges() {
        // committed: a stuck row and two rows held behind it; the relay leaves all three alone
        row("oi-orders", "S", MAX, Instant.now().minusSeconds(7200), Map.of("orderId", "ORD-S"));
        row("oi-orders", "S", 0, Instant.now().minusSeconds(3600), Map.of("orderId", "ORD-S", "version", 2L));
        row("oi-orders", "S", 0, Instant.now().minusSeconds(60), Map.of("orderId", "ORD-S", "version", 3L));

        OutboxInspector.Summary summary = inspector.summary();
        double stuckGauge = meters.get("oms.outbox.stuck").gauge().value();
        double ageGauge = meters.get("oms.outbox.oldest.age").gauge().value();

        assertEquals(1, summary.stuck());
        assertEquals(2, summary.held());
        assertEquals(0, summary.pending());
        assertEquals(MAX, summary.maxAttempts());
        assertEquals((long) stuckGauge, summary.stuck(), "stuck as the oms.outbox.stuck gauge");
        // the oldest waiting row is the first held one (stuck rows are not waiting), as the gauge says
        assertNotNull(summary.oldestWaitingAgeSeconds());
        assertTrue(Math.abs(summary.oldestWaitingAgeSeconds() - ageGauge) <= 2,
                "age " + summary.oldestWaitingAgeSeconds() + " as the oms.outbox.oldest.age gauge " + ageGauge);
        assertTrue(Math.abs(summary.oldestWaitingAgeSeconds() - 3600) <= 5);

        rolledBack(ignored -> {
            row("oi-orders", "P", 0);
            assertEquals(1, inspector.summary().pending());
        });
    }

    @Test
    void summaryOfAnEmptyOutbox() {
        OutboxInspector.Summary summary = inspector.summary();

        assertEquals(0, summary.pending() + summary.stuck() + summary.held());
        assertNull(summary.oldestWaitingCreatedAt());
        assertNull(summary.oldestWaitingAgeSeconds());
    }

    @Test
    void detailDecodesAPayloadAndShowsAPointer() {
        OrderExecution record = OrderExecution.newBuilder()
                .setExecId("EX-1").setLastQty(new BigDecimal("10.0000")).setLastPx(new BigDecimal("101.5000"))
                .setExecType("F").setLastCapacity(null).setLastMkt("XNAS").setTransactTime(Instant.parse("2026-11-25T09:00:00Z"))
                .setOrderId("ORD-1").setRootOrderId("ORD-1").setParentOrderId(null).setLeg("CLI").setClOrdId("CL-1")
                .setSessionId("S-1").setAccount("ACC-1").setSide(Side.BUY).setSymbol("AAPL").setSecurityId(null)
                .setOrdType(OrdType.LIMIT).setPrice(new BigDecimal("102.0000")).setOrderQty(new BigDecimal("100.0000"))
                .setSettlCurrency("USD").setExDestination("XNAS").setCumQty(new BigDecimal("10.0000"))
                .setLeavesQty(new BigDecimal("90.0000")).setAvgPx(new BigDecimal("101.5000")).setState(State.LIVE)
                .setOrderVersion(3L).setTradeDate(LocalDate.of(2026, 11, 25))
                .build();

        rolledBack(ignored -> {
            long projection = row("oi-order-executions", "ORD-1", MAX, Instant.now(), Map.of(
                    "type", "PROJECTION", "orderId", "ORD-1",
                    "payloadType", OrderExecution.getClassSchema().getFullName(), "payload", codec.encode(record)));
            long pointer = row("oi-orders", "ORD-2", MAX, Instant.now(), Map.of("orderId", "ORD-2", "version", 5L));

            OutboxInspector.Detail withPayload = inspector.get(projection).orElseThrow();
            assertEquals(OutboxState.STUCK, withPayload.entry().state());
            assertEquals("PROJECTION", withPayload.entry().aggregateType());
            assertEquals(OrderExecution.getClassSchema().getFullName(), withPayload.entry().payloadType());
            assertNotNull(withPayload.payload(), "decoded payload");
            assertEquals("EX-1", withPayload.payload().get("execId").asString());
            assertEquals(0, new BigDecimal("101.5").compareTo(withPayload.payload().get("lastPx").decimalValue()));
            assertNull(withPayload.payloadError());

            OutboxInspector.Detail asPointer = inspector.get(pointer).orElseThrow();
            assertNull(asPointer.payload(), "a pointer carries no payload");
            assertNull(asPointer.payloadError());
            assertEquals("ORD-2", asPointer.entry().orderId());
            assertEquals(5L, asPointer.entry().aggregateVersion());
        });
    }

    @Test
    void unknownIdIsEmpty() {
        assertTrue(inspector.get(-42L).isEmpty());
    }
}
