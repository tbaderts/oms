package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.example.common.model.Execution;
import org.example.common.model.ExecutionStatus;
import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.cmd.Command;
import org.example.common.model.cmd.OrdType;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.model.cmd.OrderCancelCmd;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.Side;
import org.example.common.model.cmd.TimeInForce;
import org.example.common.model.msg.OrderExecution;
import org.example.common.state.StateTransitionException;
import org.example.oms.OmsApplication;
import org.example.oms.mapper.AvroPayloadCodec;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.model.OutboxMessage;
import org.example.oms.repository.ExecutionRepository;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.repository.OrderRepository;
import org.example.oms.repository.OutboxRepository;
import org.example.oms.service.OrderEventAppender;
import org.example.oms.service.OrderReplayService;
import org.example.oms.service.lifecycle.OrderLifecycleCommandProcessor;
import org.example.oms.service.command.OrderCreateCommandProcessor;
import org.example.oms.service.execution.ExecutionCommandProcessor;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * SPEC-0044: the execution lifecycle in the order event log. Every fill and every bust, correction or
 * whack is an order event naming its execution; the execution row carries its status and the
 * versions that applied and reversed it.
 *
 * <p>Kafka is off: what is staged stays in the outbox, where the tests read it.
 */
@SpringBootTest(classes = OmsApplication.class)
@Testcontainers
class ExecutionLifecycleIntegrationTest {

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

    @Autowired OrderCreateCommandProcessor orderCreateCommandProcessor;
    @Autowired OrderLifecycleCommandProcessor orderLifecycleCommandProcessor;
    @Autowired ExecutionCommandProcessor executionCommandProcessor;
    @Autowired OrderRepository orderRepository;
    @Autowired ExecutionRepository executionRepository;
    @Autowired OrderEventRepository orderEventRepository;
    @Autowired OutboxRepository outboxRepository;
    @Autowired TransactionTemplate transactionTemplate;
    @Autowired OrderEventAppender orderEventAppender;
    @Autowired AvroPayloadCodec payloadCodec;
    @Autowired OrderReplayService orderReplayService;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired WebApplicationContext webApplicationContext;

    /** AC-2: a fill names its execution on the event and links the execution to that event. */
    @Test
    void fillRecordsExecIdStatusVersionAndRoot() {
        String root = "ROOT-" + UUID.randomUUID();
        String orderId = liveOrder("100", root);
        String execId = orderId + "-EX-9";

        fill(orderId, execId, "40", "171.95");

        OrderEvent event = lastEvent(orderId);
        assertEquals(execId, event.getExecId());
        Execution execution = execution(orderId, execId);
        assertEquals(ExecutionStatus.APPLIED, execution.getStatus());
        assertEquals(event.getVersion(), execution.getOrderVersion());
        assertEquals(root, execution.getRootOrderId());
        assertNull(execution.getExecRefId());
        assertNull(execution.getBustedAtVersion());
    }

    /**
     * AC-1: the migration reads a fill's execId from {@code transaction -> 'execution' ->> 'execId'}.
     * This proves that path against a command the application itself stored (a REST fill), not a
     * hand-written row: the backfill statement, run again on that row, recovers its execId.
     */
    @Test
    void storedFillCommandMatchesTheBackfillPath() throws Exception {
        String orderId = liveOrder("100", null);
        String execId = orderId + "-REST";
        int status = MockMvcBuilders.webAppContextSetup(webApplicationContext).build()
                .perform(post("/api/command/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"ExecutionCreateCmd\",\"version\":\"1.0.0\",\"execution\":{"
                                + "\"execId\":\"" + execId + "\",\"orderId\":\"" + orderId + "\","
                                + "\"lastQty\":10,\"lastPx\":170,\"execType\":\"F\"}}"))
                .andReturn().getResponse().getStatus();
        assertEquals(201, status);
        long version = lastEvent(orderId).getVersion();

        jdbcTemplate.update("update order_events set exec_id = null where order_id = ? and version = ?", orderId, version);
        // Statement (1) of changeset 024-order-events-exec-id, limited to this order.
        jdbcTemplate.update(
                "UPDATE order_events SET exec_id = transaction -> 'execution' ->> 'execId'"
                        + " WHERE event IN ('PARTIAL_FILL', 'FILL')"
                        + " AND transaction -> 'execution' ->> 'execId' IS NOT NULL AND order_id = ?",
                orderId);

        assertEquals(
                execId,
                jdbcTemplate.queryForObject(
                        "select exec_id from order_events where order_id = ? and version = ?", String.class, orderId, version));
    }

    /**
     * AC-3: busting EX-1 of a filled order is one order event naming EX-1. EX-1 stops counting from
     * that version, and the order and a trade-cancel OrderExecution are staged under the order's key.
     */
    @Test
    void bustRecordsEventStatusAndStagesReversal() {
        String orderId = liveOrder("100", null);
        String ex1 = orderId + "-EX-1";
        String ex2 = orderId + "-EX-2";
        fill(orderId, ex1, "40", "171.95");
        fill(orderId, ex2, "60", "172.00");
        long ex2VersionBefore = execution(orderId, ex2).getOrderVersion();
        String commandId = "b-" + UUID.randomUUID();

        long version = reverse(orderId, ex1, Event.EXEC_BUST, State.LIVE, "60", "40", commandId);

        assertEquals(5L, version);
        OrderEvent event = lastEvent(orderId);
        assertEquals(5L, event.getVersion());
        assertEquals(Event.EXEC_BUST, event.getEvent());
        assertEquals(ex1, event.getExecId());
        assertEquals(State.LIVE, event.getResultingState());
        assertEquals(commandId, event.getCommandId(), "the caller's command is stored");
        assertEquals(commandId, event.getTransaction().getCommandId());
        assertEquals(0, new BigDecimal("60").compareTo(event.getOrderSnapshot().getCumQty()));

        Execution busted = execution(orderId, ex1);
        assertEquals(ExecutionStatus.BUSTED, busted.getStatus());
        assertEquals(5L, busted.getBustedAtVersion());
        assertEquals("F", busted.getExecType(), "the stored execution keeps what the venue sent");
        Execution untouched = execution(orderId, ex2);
        assertEquals(ExecutionStatus.APPLIED, untouched.getStatus());
        assertEquals(ex2VersionBefore, untouched.getOrderVersion());
        assertNull(untouched.getBustedAtVersion());

        OutboxMessage order = staged(orderId, 5L, OutboxMessage.AggregateType.ORDER);
        assertEquals("oms_orders", order.getTopic());
        OrderExecution record = stagedOrderExecution(orderId, 5L);
        assertEquals(ex1, record.getExecId());
        assertEquals("H", record.getExecType());
        assertEquals(5L, record.getOrderVersion());
        assertEquals(0, new BigDecimal("60").compareTo(record.getCumQty()));
        assertEquals(0, new BigDecimal("40").compareTo(record.getLeavesQty()));
        assertEquals(0, new BigDecimal("40").compareTo(record.getLastQty()), "the busted fill's quantity");
        assertEquals(orderId, record.getRootOrderId());
    }

    /** AC-4: a correction marks the execution CORRECTED from its version and stages a trade correct (G). */
    @Test
    void correctionMarksCorrectedAndStagesG() {
        String orderId = liveOrder("100", null);
        String ex1 = orderId + "-EX-1";
        fill(orderId, ex1, "40", "171.95");

        long version = reverse(orderId, ex1, Event.EXEC_CORRECT, State.LIVE, "0", "100", null);

        Execution corrected = execution(orderId, ex1);
        assertEquals(ExecutionStatus.CORRECTED, corrected.getStatus());
        assertEquals(version, corrected.getBustedAtVersion());
        assertEquals(Event.EXEC_CORRECT, lastEvent(orderId).getEvent());
        OrderExecution record = stagedOrderExecution(orderId, version);
        assertEquals("G", record.getExecType());
        assertEquals(ex1, record.getExecId());
    }

    /** AC-4: a whack is recorded like a bust: BUSTED, trade cancel (H). */
    @Test
    void whackMarksBustedAndStagesH() {
        String orderId = liveOrder("100", null);
        String ex1 = orderId + "-EX-1";
        fill(orderId, ex1, "40", "171.95");

        long version = reverse(orderId, ex1, Event.EXEC_WHACK, State.LIVE, "0", "100", null);

        Execution whacked = execution(orderId, ex1);
        assertEquals(ExecutionStatus.BUSTED, whacked.getStatus());
        assertEquals(version, whacked.getBustedAtVersion());
        assertEquals(Event.EXEC_WHACK, lastEvent(orderId).getEvent());
        assertEquals("H", stagedOrderExecution(orderId, version).getExecType());
    }

    /**
     * AC-5: a second bust of the same execution, or a bust of an execution the order does not have,
     * is refused, and after the rollback nothing was written.
     */
    @Test
    void bustOfBustedOrUnknownExecutionIsRefusedAndWritesNothing() {
        String orderId = liveOrder("100", null);
        String ex1 = orderId + "-EX-1";
        fill(orderId, ex1, "40", "171.95");
        reverse(orderId, ex1, Event.EXEC_BUST, State.LIVE, "0", "100", null);

        long events = orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).size();
        long outbox = outboxRepository.count();
        long txNr = orderRepository.findByOrderId(orderId).orElseThrow().getTxNr();

        StateTransitionException again = assertThrows(
                StateTransitionException.class,
                () -> reverse(orderId, ex1, Event.EXEC_BUST, State.LIVE, "0", "100", null));
        assertTrue(again.getMessage().contains("BUSTED"), again.getMessage());
        IllegalArgumentException unknown = assertThrows(
                IllegalArgumentException.class,
                () -> reverse(orderId, orderId + "-NOPE", Event.EXEC_BUST, State.LIVE, "0", "100", null));
        assertTrue(unknown.getMessage().contains(orderId + "-NOPE"), unknown.getMessage());

        assertEquals(events, orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).size());
        assertEquals(outbox, outboxRepository.count());
        assertEquals(txNr, orderRepository.findByOrderId(orderId).orElseThrow().getTxNr());
        assertEquals(ExecutionStatus.BUSTED, execution(orderId, ex1).getStatus());
    }

    /**
     * AC-6: two lifecycle events prepared from the same order version cannot both be appended. The
     * second loses the race on (order_id, version) and is rolled back.
     */
    @Test
    void concurrentLifecycleEventsFromSameVersionOneWins() {
        String orderId = liveOrder("100", null);
        String ex1 = orderId + "-EX-1";
        String ex2 = orderId + "-EX-2";
        fill(orderId, ex1, "40", "171.95");
        fill(orderId, ex2, "30", "172.00");
        Order first = orderRepository.findByOrderId(orderId).orElseThrow();
        Order second = orderRepository.findByOrderId(orderId).orElseThrow();
        assertEquals(first.getTxNr(), second.getTxNr(), "both prepared from the same version");

        reverseFrom(first, ex1, Event.EXEC_BUST, "30", "70");
        assertThrows(
                OptimisticLockingFailureException.class,
                () -> reverseFrom(second, ex2, Event.EXEC_BUST, "40", "60"));

        long lifecycleEvents = orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).stream()
                .filter(e -> e.getEvent() == Event.EXEC_BUST)
                .count();
        assertEquals(1, lifecycleEvents);
        assertEquals(ExecutionStatus.BUSTED, execution(orderId, ex1).getStatus());
        assertEquals(ExecutionStatus.APPLIED, execution(orderId, ex2).getStatus());
        assertEquals(0, new BigDecimal("30").compareTo(orderRepository.findByOrderId(orderId).orElseThrow().getCumQty()),
                "the winner's quantities stand");
    }

    /**
     * AC-8: a busted fill no longer counts towards the order's average price. The order's avgPx is
     * carried on each fill (executions.avg_px and the published OrderExecution), so it is read there.
     */
    @Test
    void bustedFillIsExcludedFromAvgPx() {
        String orderId = liveOrder("200", null);
        String ex1 = orderId + "-EX-1";
        fill(orderId, ex1, "40", "171.95");
        fill(orderId, orderId + "-EX-2", "60", "172.00");
        reverse(orderId, ex1, Event.EXEC_BUST, State.LIVE, "60", "140", null);

        String ex3 = orderId + "-EX-3";
        fill(orderId, ex3, "40", "173.00");

        BigDecimal expected = new BigDecimal("172.40000000");
        Execution third = execution(orderId, ex3);
        assertEquals(0, new BigDecimal("100").compareTo(third.getCumQty()));
        assertEquals(0, expected.compareTo(third.getAvgPx()), "(60 × 172.00 + 40 × 173.00) / 100, without EX-1: " + third.getAvgPx());
        OrderExecution published = stagedOrderExecution(orderId, lastEvent(orderId).getVersion());
        assertEquals(ex3, published.getExecId());
        assertEquals(0, expected.compareTo(published.getAvgPx()), "published avgPx " + published.getAvgPx());
    }

    /** AC-9: the executions in force at a version: applied at or before it, not reversed by then. */
    @Test
    void executionsAtReturnsExecutionsInForce() {
        String orderId = liveOrder("100", null);
        String ex1 = orderId + "-EX-1";
        String ex2 = orderId + "-EX-2";
        fill(orderId, ex1, "40", "171.95");
        fill(orderId, ex2, "60", "172.00");
        assertEquals(5L, reverse(orderId, ex1, Event.EXEC_BUST, State.LIVE, "60", "40", null));

        assertEquals(List.of(), execIds(orderReplayService.executionsAt(orderId, 2)));
        assertEquals(List.of(ex1, ex2), execIds(orderReplayService.executionsAt(orderId, 4)));
        assertEquals(List.of(ex2), execIds(orderReplayService.executionsAt(orderId, 5)));
    }

    // --- helpers -------------------------------------------------------------------------------

    static List<String> execIds(List<Execution> executions) {
        return executions.stream().map(Execution::getExecId).toList();
    }

    /** Like {@link #reverse}, from an order read earlier, outside the transaction. */
    long reverseFrom(Order snapshot, String execId, Event event, String cumQty, String leavesQty) {
        return transactionTemplate.execute(tx -> {
            Order saved = orderRepository.save(snapshot.toBuilder()
                    .cumQty(new BigDecimal(cumQty))
                    .leavesQty(new BigDecimal(leavesQty))
                    .build());
            return orderEventAppender.appendExecutionLifecycleEvent(saved, execId, event, null);
        });
    }

    /**
     * What SPEC-0030's bust pipeline will do once it exists: apply the quantities and state to the
     * order, save it, and record the lifecycle event, all in one transaction. The command is a stand-in
     * (the command API has no bust command until SPEC-0030); what matters is that it is stored.
     */
    long reverse(String orderId, String execId, Event event, State state, String cumQty, String leavesQty, String commandId) {
        return transactionTemplate.execute(tx -> {
            Order order = orderRepository.findByOrderId(orderId).orElseThrow();
            Order saved = orderRepository.save(order.toBuilder()
                    .state(state)
                    .cumQty(new BigDecimal(cumQty))
                    .leavesQty(new BigDecimal(leavesQty))
                    .build());
            Command command = commandId == null
                    ? null
                    : new OrderCancelCmd().type("OrderCancelCmd").orderId(orderId).commandId(commandId);
            return orderEventAppender.appendExecutionLifecycleEvent(saved, execId, event, command);
        });
    }

    OutboxMessage staged(String orderId, long version, OutboxMessage.AggregateType type) {
        return outboxRepository.findAll().stream()
                .filter(m -> orderId.equals(m.getAggregateId())
                        && m.getAggregateVersion() == version
                        && m.getAggregateType() == type)
                .collect(java.util.stream.Collectors.collectingAndThen(java.util.stream.Collectors.toList(), rows -> {
                    assertEquals(1, rows.size(), "one " + type + " row at v" + version);
                    return rows.getFirst();
                }));
    }

    OrderExecution stagedOrderExecution(String orderId, long version) {
        OutboxMessage row = staged(orderId, version, OutboxMessage.AggregateType.PROJECTION);
        assertEquals("oms_order_executions", row.getTopic());
        return (OrderExecution) payloadCodec.decode(row.getPayloadType(), row.getPayload());
    }

    /** Creates a limit BUY order (version 1) and accepts it (version 2). */
    String liveOrder(String orderQty, String rootOrderId) {
        var order = new org.example.common.model.cmd.Order()
                .clOrdId("CL-" + UUID.randomUUID())
                .sessionId("SES-LC")
                .account("ACC-LC")
                .symbol("AAPL")
                .side(Side.BUY)
                .ordType(OrdType.LIMIT)
                .price(new BigDecimal("175"))
                .orderQty(new BigDecimal(orderQty))
                .timeInForce(TimeInForce.DAY)
                .rootOrderId(rootOrderId)
                .parentOrderId(rootOrderId);
        var created = orderCreateCommandProcessor.process(
                new OrderCreateCmd().type("OrderCreateCmd").order(order), Instant.now());
        assertTrue(created.isSuccess(), created.getErrorMessage());
        String orderId = created.getOrderId();
        var accepted = orderLifecycleCommandProcessor.process(
                new OrderAcceptCmd(orderId, "OrderAcceptCmd"), Instant.now());
        assertTrue(accepted.isSuccess(), accepted.getErrorMessage());
        return orderId;
    }

    void fill(String orderId, String execId, String lastQty, String lastPx) {
        var result = TestCommands.applyFill(executionCommandProcessor, Execution.builder()
                .orderId(orderId)
                .execId(execId)
                .lastQty(new BigDecimal(lastQty))
                .lastPx(new BigDecimal(lastPx))
                .execType("F")
                .build());
        assertTrue(result.isSuccess(), () -> "fill " + execId + " failed: " + result.getTaskResults());
    }

    OrderEvent lastEvent(String orderId) {
        return orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).getLast();
    }

    Execution execution(String orderId, String execId) {
        return executionRepository.findAll().stream()
                .filter(e -> orderId.equals(e.getOrderId()) && execId.equals(e.getExecId()))
                .findFirst()
                .orElseThrow();
    }
}
