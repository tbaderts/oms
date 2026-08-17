package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.List;

import org.example.common.model.Execution;
import org.example.common.model.OrdType;
import org.example.common.model.Order;
import org.example.common.model.Side;
import org.example.common.model.State;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.oms.OmsApplication;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.model.OutboxMessage;
import org.example.oms.repository.ExecutionRepository;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.repository.OrderRepository;
import org.example.oms.repository.OutboxRepository;
import org.example.oms.service.OrderReplayService;
import org.example.oms.service.command.OrderAcceptCommandProcessor;
import org.example.oms.service.execution.ExecutionCommandProcessor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Limit;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Covers the invariants the event log is supposed to provide but previously did not: that every
 * state-changing path records an event, that the log is sequenced and replayable, that a redelivered
 * fill is rejected, and that a failed pipeline leaves nothing behind.
 */
@SpringBootTest(classes = OmsApplication.class)
@Testcontainers
class EventSourcingIntegrationTest {

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
        // Kafka off: the outbox rows must be staged regardless, and stay staged until a relay runs.
        registry.add("kafka.enabled", () -> "false");
    }

    private static final String ORDER_ID = "ORD-ES-1";

    @Autowired private OrderRepository orderRepository;
    @Autowired private ExecutionRepository executionRepository;
    @Autowired private OrderEventRepository orderEventRepository;
    @Autowired private OutboxRepository outboxRepository;
    @Autowired private OrderAcceptCommandProcessor orderAcceptCommandProcessor;
    @Autowired private ExecutionCommandProcessor executionCommandProcessor;
    @Autowired private OrderReplayService orderReplayService;
    @Autowired private TransactionTemplate transactionTemplate;

    @BeforeEach
    void setUp() {
        outboxRepository.deleteAll();
        orderEventRepository.deleteAll();
        executionRepository.deleteAll();
        orderRepository.deleteAll();

        orderRepository.save(
                Order.builder()
                        .orderId(ORDER_ID)
                        .sessionId("SES-ES-1")
                        .clOrdId("CL-ES-1")
                        .account("ACC-ES")
                        .symbol("AAPL")
                        .ordType(OrdType.LIMIT)
                        .side(Side.BUY)
                        .orderQty(new BigDecimal("10.0000"))
                        .price(new BigDecimal("100.00"))
                        .cumQty(BigDecimal.ZERO)
                        .leavesQty(new BigDecimal("10.0000"))
                        .state(State.UNACK)
                        .build());
    }

    @Test
    void acceptAndFill_appendSequencedEventsAndStageOutboxMessages() {
        accept();

        executionCommandProcessor.process(execution("EX-1", "4.0000"));
        executionCommandProcessor.process(execution("EX-2", "6.0000"));

        List<OrderEvent> history = orderReplayService.history(ORDER_ID);
        assertEquals(
                List.of(Event.ACK, Event.PARTIAL_FILL, Event.FILL),
                history.stream().map(OrderEvent::getEvent).toList(),
                "every state-changing path must record an event");
        assertEquals(List.of(1L, 2L, 3L), history.stream().map(OrderEvent::getVersion).toList());
        assertTrue(orderReplayService.isContiguous(ORDER_ID));

        assertEquals(
                List.of(State.LIVE, State.LIVE, State.FILLED),
                history.stream().map(OrderEvent::getResultingState).toList());

        // One order message per event, plus one execution message per fill.
        assertEquals(5, outboxRepository.count());

        // Each staged order message must carry a distinct eventId, otherwise consumers cannot tell
        // two updates apart or spot a redelivery.
        List<Long> orderMessageVersions =
                outboxRepository.findAll().stream()
                        .filter(m -> m.getAggregateType() == OutboxMessage.AggregateType.ORDER)
                        .map(OutboxMessage::getAggregateVersion)
                        .sorted()
                        .toList();
        assertEquals(List.of(1L, 2L, 3L), orderMessageVersions);
    }

    @Test
    void replay_reconstructsTheOrderAtEachVersion() {
        accept();
        executionCommandProcessor.process(execution("EX-1", "4.0000"));

        Order atAck = orderReplayService.replayAt(ORDER_ID, 1).orElseThrow();
        assertEquals(State.LIVE, atAck.getState());
        assertEquals(0, BigDecimal.ZERO.compareTo(atAck.getCumQty()));

        Order latest = orderReplayService.replay(ORDER_ID).orElseThrow();
        assertEquals(State.LIVE, latest.getState());
        assertEquals(0, new BigDecimal("4.0000").compareTo(latest.getCumQty()));

        // Replay must agree with the live row, otherwise some path mutated the order silently.
        Order live = orderRepository.findByOrderId(ORDER_ID).orElseThrow();
        assertEquals(live.getState(), latest.getState());
        assertEquals(0, live.getCumQty().compareTo(latest.getCumQty()));
    }

    /**
     * At-least-once delivery means the same fill can arrive twice. Applying it twice would
     * double-count cumQty and could drive the order to FILLED on half its real volume.
     */
    @Test
    void duplicateExecution_isRejectedAndChangesNothing() {
        accept();
        assertTrue(executionCommandProcessor.process(execution("EX-DUP", "4.0000")).isSuccess());

        long eventsBefore = orderEventRepository.count();
        long outboxBefore = outboxRepository.count();

        assertFalse(executionCommandProcessor.process(execution("EX-DUP", "4.0000")).isSuccess());

        assertEquals(1L, executionRepository.count());
        assertEquals(eventsBefore, orderEventRepository.count());
        assertEquals(outboxBefore, outboxRepository.count());

        Order order = orderRepository.findByOrderId(ORDER_ID).orElseThrow();
        assertEquals(0, new BigDecimal("4.0000").compareTo(order.getCumQty()));
    }

    /**
     * The orchestrator turns task failures into results rather than exceptions, so without an
     * explicit rollback the transaction would commit whatever earlier tasks wrote while the caller
     * was told the command failed.
     */
    @Test
    void failedPipeline_leavesNoPartialWrites() {
        accept();

        // Overfilling fails at CalculateOrderQuantitiesTask, after the order was already loaded and
        // before persistence — nothing from this command may survive.
        var result = executionCommandProcessor.process(execution("EX-TOO-BIG", "999.0000"));

        assertFalse(result.isSuccess());
        assertEquals(0L, executionRepository.count());

        Order order = orderRepository.findByOrderId(ORDER_ID).orElseThrow();
        assertEquals(State.LIVE, order.getState());
        assertEquals(0, BigDecimal.ZERO.compareTo(order.getCumQty()));
    }

    /**
     * The relay's claim query is the most critical piece of the outbox and is not exercised by the
     * relay itself here (it is disabled without Kafka), so drive it directly: a pessimistic lock with
     * SKIP_LOCKED plus a Limit parameter is exactly the kind of query that compiles fine and fails at
     * runtime.
     */
    @Test
    void claimPending_returnsMessagesInIdOrderAndRespectsTheLimit() {
        accept();
        executionCommandProcessor.process(execution("EX-C1", "1.0000"));

        transactionTemplate.executeWithoutResult(status -> {
            List<OutboxMessage> all = outboxRepository.claimPending(10, Limit.of(100));
            assertEquals(3, all.size());
            assertEquals(
                    all.stream().map(OutboxMessage::getId).sorted().toList(),
                    all.stream().map(OutboxMessage::getId).toList(),
                    "messages must come back in id order, which is commit order");

            List<OutboxMessage> firstOnly = outboxRepository.claimPending(10, Limit.of(1));
            assertEquals(1, firstOnly.size());
            assertEquals(all.get(0).getId(), firstOnly.get(0).getId());
        });
    }

    /**
     * A fill must reach downstream complete. The order message previously carried no fill progress
     * at all, so a consumer's live update blanked out the quantities it had loaded from the snapshot
     * API, and the execution message carried nothing but two identifiers.
     */
    @Test
    void stagedMessages_carryTheFillAndTheResultingPosition() {
        accept();
        executionCommandProcessor.process(execution("EX-Q1", "4.0000"));

        OutboxMessage orderMessage =
                outboxRepository.findAll().stream()
                        .filter(m -> m.getAggregateType() == OutboxMessage.AggregateType.ORDER)
                        .max(java.util.Comparator.comparing(OutboxMessage::getId))
                        .orElseThrow();
        assertEquals(
                0,
                new BigDecimal("4.0000").compareTo(orderMessage.getOrderPayload().getCumQty()));
        assertEquals(
                0,
                new BigDecimal("6.0000").compareTo(orderMessage.getOrderPayload().getLeavesQty()));

        OutboxMessage executionMessage =
                outboxRepository.findAll().stream()
                        .filter(m -> m.getAggregateType() == OutboxMessage.AggregateType.EXECUTION)
                        .findFirst()
                        .orElseThrow();
        Execution staged = executionMessage.getExecutionPayload();
        assertEquals("EX-Q1", staged.getExecID());
        assertEquals(0, new BigDecimal("4.0000").compareTo(staged.getLastQty()));
        assertEquals(0, new BigDecimal("4.0000").compareTo(staged.getCumQty()));
        assertEquals(0, new BigDecimal("6.0000").compareTo(staged.getLeavesQty()));

        // The persisted execution row carries the resulting position too, the way a FIX
        // ExecutionReport does — so the audit record stands on its own.
        Execution persisted = executionRepository.findAll().get(0);
        assertEquals(0, new BigDecimal("4.0000").compareTo(persisted.getCumQty()));
        assertEquals(0, new BigDecimal("6.0000").compareTo(persisted.getLeavesQty()));
    }

    /** Messages that exhausted their retry budget must drop out of the claim set. */
    @Test
    void claimPending_skipsMessagesThatExhaustedTheirRetries() {
        accept();

        Long exhaustedId = transactionTemplate.execute(status -> {
            OutboxMessage staged = outboxRepository.claimPending(10, Limit.of(1)).get(0);
            staged.setAttempts(10);
            return outboxRepository.saveAndFlush(staged).getId();
        });

        transactionTemplate.executeWithoutResult(status -> {
            assertTrue(
                    outboxRepository.claimPending(10, Limit.of(100)).stream()
                            .noneMatch(m -> m.getId().equals(exhaustedId)));
            assertEquals(1, outboxRepository.countByAttemptsGreaterThanEqual(10));
        });
    }

    /** tx_nr is the per-order sequence published to Kafka as eventId; it must actually advance. */
    @Test
    void orderVersionAdvancesOnEveryUpdate() {
        long initial = orderRepository.findByOrderId(ORDER_ID).orElseThrow().getTxNr();

        accept();
        long afterAccept = orderRepository.findByOrderId(ORDER_ID).orElseThrow().getTxNr();
        assertTrue(afterAccept > initial, "accept must bump the version");

        executionCommandProcessor.process(execution("EX-V", "1.0000"));
        long afterFill = orderRepository.findByOrderId(ORDER_ID).orElseThrow().getTxNr();
        assertTrue(afterFill > afterAccept, "fill must bump the version");
    }

    private void accept() {
        var result =
                orderAcceptCommandProcessor.process(new OrderAcceptCmd(ORDER_ID, "OrderAcceptCmd"));
        assertTrue(result.isSuccess(), () -> "accept failed: " + result.getErrorMessage());
    }

    private Execution execution(String execId, String lastQty) {
        return Execution.builder()
                .orderId(ORDER_ID)
                .execID(execId)
                .lastQty(new BigDecimal(lastQty))
                .lastPx(new BigDecimal("100.00"))
                .build();
    }
}
