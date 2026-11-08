package org.example.oms.service;

import java.time.Instant;

import org.example.common.model.Execution;
import org.example.common.model.ExecutionStatus;
import org.example.common.model.Order;
import org.example.common.model.cmd.Command;
import org.example.common.model.msg.OrderExecution;
import org.example.common.state.ExecutionStatusMachineConfig;
import org.example.common.state.StateMachine;
import org.example.common.state.StateTransitionException;
import org.example.oms.mapper.AvroPayloadCodec;
import org.example.oms.mapper.OrderExecutionMessageMapper;
import org.example.oms.mapper.OrderMessageMapper;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.model.OrderEventSchemaVersion;
import org.example.oms.model.OutboxMessage;
import org.example.oms.projection.StagedMessage;
import org.example.oms.repository.ExecutionRepository;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.repository.OutboxRepository;
import org.example.oms.service.metrics.OrderFlowMetrics;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * The single place a state change is recorded and staged for publication.
 *
 * <p>Every path that changes an order — create, accept, execute — calls this, so the event log and
 * the outbox cannot drift apart from the order table. Both writes happen inside the caller's
 * transaction, which is what makes the outbox atomic with the state change; the actual Kafka send
 * is left to {@link OutboxRelay}.
 *
 * <p>Before this existed, only the create path wrote an event row and only the create path wrote an
 * outbox row, so an order's log recorded its birth and nothing afterwards.
 */
@Component
@Slf4j
public class OrderEventAppender {

    private final OrderEventRepository orderEventRepository;
    private final OutboxRepository outboxRepository;
    private final String orderTopic;
    private final String executionTopic;
    private final AvroPayloadCodec payloadCodec;
    private final OrderFlowMetrics orderFlowMetrics;
    private final ExecutionRepository executionRepository;
    private final OrderExecutionMessageMapper orderExecutionMessageMapper;
    private final String orderExecutionTopic;
    private final StateMachine<ExecutionStatus> executionStatuses = ExecutionStatusMachineConfig.create();
    private final OutboxNudge outboxNudge;

    public OrderEventAppender(
            OrderEventRepository orderEventRepository,
            OutboxRepository outboxRepository,
            @Value("${kafka.order-topic:oms_orders}") String orderTopic,
            @Value("${kafka.execution-topic:oms_executions}") String executionTopic,
            AvroPayloadCodec payloadCodec,
            OrderFlowMetrics orderFlowMetrics,
            ExecutionRepository executionRepository,
            OrderExecutionMessageMapper orderExecutionMessageMapper,
            @Value("${kafka.order-execution-topic:oms_order_executions}") String orderExecutionTopic,
            OutboxNudge outboxNudge) {
        this.orderEventRepository = orderEventRepository;
        this.outboxRepository = outboxRepository;
        this.orderTopic = orderTopic;
        this.executionTopic = executionTopic;
        this.payloadCodec = payloadCodec;
        this.orderFlowMetrics = orderFlowMetrics;
        this.executionRepository = executionRepository;
        this.orderExecutionMessageMapper = orderExecutionMessageMapper;
        this.orderExecutionTopic = orderExecutionTopic;
        this.outboxNudge = outboxNudge;
    }

    /**
     * Stages a projection's message for publication, in the caller's transaction (SPEC-0020). The
     * outbox stays written in this one place; the payload is the record's Avro encoding and its type
     * the record's schema name, so the publisher needs no column or case per message type.
     */
    public void stageMessage(StagedMessage message) {
        stage(
                OutboxMessage.builder()
                        .aggregateType(OutboxMessage.AggregateType.PROJECTION)
                        .aggregateId(message.key())
                        .topic(message.topic())
                        .aggregateVersion(message.version())
                        .payloadType(message.payload().getSchema().getFullName())
                        .payload(payloadCodec.encode(message.payload()))
                        .createdAt(Instant.now())
                        .attempts(0)
                        .build());
    }

    /**
     * Records an order state change and stages the resulting order for publication.
     *
     * @return the version assigned to the appended event
     */
    public long appendOrderEvent(Order order, Event event, Command command) {
        return appendOrderEvent(order, event, command, null);
    }

    /**
     * Records an order state change about one execution, or about none when {@code execId} is null,
     * and stages the resulting order for publication (SPEC-0044).
     */
    private long appendOrderEvent(Order order, Event event, Command command, String execId) {
        // The order's version is the version of its latest event (SPEC-0027): the next one is taken
        // from the order and set on it, so the row, the snapshot and the message all carry it.
        long version = order.getTxNr() + 1;
        order.setTxNr(version);

        OrderEvent appended =
                OrderEvent.builder()
                        .orderId(order.getOrderId())
                        .version(version)
                        .event(event)
                        .transaction(command)
                        .commandId(commandIdOf(command))
                        .execId(execId)
                        .resultingState(order.getState())
                        .orderSnapshot(order)
                        .schemaVersion(OrderEventSchemaVersion.CURRENT)
                        .timeStamp(Instant.now())
                        .build();
        try {
            // Flushed here so a concurrent writer surfaces now, as the conflict it is.
            orderEventRepository.saveAndFlush(appended);
        } catch (DataIntegrityViolationException e) {
            if (violates(e, VERSION_CONSTRAINT)) {
                throw new OptimisticLockingFailureException(
                        "Order " + order.getOrderId() + " was modified concurrently (event version "
                                + version + " already exists)",
                        e);
            }
            if (violates(e, COMMAND_ID_CONSTRAINT)) {
                throw new DuplicateCommandException(order.getOrderId(), commandIdOf(command), e);
            }
            throw e;
        }

        stage(
                OutboxMessage.builder()
                        .aggregateType(OutboxMessage.AggregateType.ORDER)
                        .aggregateId(partitionKey(order))
                        .topic(orderTopic)
                        .aggregateVersion(version)
                        .orderPayload(order)
                        .createdAt(Instant.now())
                        .attempts(0)
                        .build());

        // Counted once the transaction commits (SPEC-0038).
        orderFlowMetrics.recordEvent(event);

        log.debug(
                "Appended {} v{} for order {} and staged it for {}",
                event,
                version,
                order.getOrderId(),
                orderTopic);

        return version;
    }

    /**
     * Records a fill and stages both the execution and the order it changed.
     *
     * <p>Both are published: consumers tracking fills read the executions topic, consumers tracking
     * order state read the orders topic. The fill with its order (the order-executions topic) is
     * staged afterwards by the order-execution projection, through {@link #stageMessage}.
     *
     * <p>The execution is staged under the order's partition key, not its execId, because the
     * aggregate id is the Kafka key: all fills of one order tree then land on one partition and are
     * consumed in order.
     */
    public long appendExecutionEvent(Order order, Execution execution, Event event, Command command) {
        long version = appendOrderEvent(order, event, command, execution.getExecId());
        // The execution row points at the event that applied it, and carries the Kafka key (SPEC-0044).
        execution.recordApplied(version, partitionKey(order));
        orderFlowMetrics.recordFill(order.getSide(), execution.getLastQty());

        stage(
                OutboxMessage.builder()
                        .aggregateType(OutboxMessage.AggregateType.EXECUTION)
                        .aggregateId(partitionKey(order))
                        .topic(executionTopic)
                        .aggregateVersion(version)
                        .orderPayload(order)
                        .executionPayload(execution)
                        .createdAt(Instant.now())
                        .attempts(0)
                        .build());

        log.debug(
                "Staged execution {} for order {} to {}",
                execution.getExecId(),
                order.getOrderId(),
                executionTopic);

        return version;
    }

    /**
     * Records a bust, correction or whack of one of the order's executions (SPEC-0044): one order
     * event naming the execution, the execution's new status, and the order and an OrderExecution
     * record with ExecType H (trade cancel) or G (trade correct) staged under the order's key, so
     * consumers see the reversal after the fill it reverses, on the same partition.
     *
     * <p>The caller has already applied the quantity and state change to the order and saved it. The
     * execution is looked up and its status transition checked before anything is written, so a
     * refusal writes nothing.
     *
     * @return the version assigned to the appended event
     * @throws IllegalArgumentException if the event is not an execution lifecycle event, or the order
     *     has no execution with this execId
     * @throws StateTransitionException if the execution's status does not allow the event, such as a
     *     second bust of the same execution
     */
    public long appendExecutionLifecycleEvent(Order order, String execId, Event event, Command command) {
        ExecutionLifecycleEffect effect = ExecutionLifecycleEffect.of(event);
        Execution execution = executionRepository
                .findByOrderIdAndExecId(order.getOrderId(), execId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "No execution " + execId + " on order " + order.getOrderId()));
        ExecutionStatus from = execution.getStatus();
        if (!executionStatuses.isValidTransition(from, effect.getResultingStatus())) {
            throw new StateTransitionException(
                    from,
                    effect.getResultingStatus(),
                    String.format(
                            "%s not allowed for execution %s of order %s in status %s",
                            event, execId, order.getOrderId(), from));
        }

        long version = appendOrderEvent(order, event, command, execId);
        execution.recordReversal(effect.getResultingStatus(), version);

        // A copy with the reversal's ExecType: the stored execution keeps what the venue reported.
        OrderExecution record = orderExecutionMessageMapper.toOrderExecutionMessage(
                execution.toBuilder().execType(effect.getExecType()).build(), order, version, Instant.now());
        stageMessage(new StagedMessage(orderExecutionTopic, partitionKey(order), version, record));

        log.info(
                "Recorded {} v{} - orderId={}, execId={}, status {} -> {}",
                event,
                version,
                order.getOrderId(),
                execId,
                from,
                effect.getResultingStatus());

        return version;
    }

    /**
     * Stages a row in the caller's transaction, and asks the relay to drain once it commits
     * (SPEC-0048), so publication does not wait for the relay's poll.
     */
    private void stage(OutboxMessage message) {
        outboxRepository.save(message);
        outboxNudge.afterCommit();
    }

    /**
     * The Kafka key of every message staged for the order: its root order id, or its own id when it
     * has none. Every record of one order tree then lands on one partition of each topic and is
     * consumed in commit order. Today every order is its own root, so the key is the order id.
     */
    public static String partitionKey(Order order) {
        return OrderMessageMapper.rootOrderIdOf(order);
    }

    /**
     * The command's commandId, or null when it has none. Every command may carry one (SPEC-0025: the
     * Kafka header always does), and it is stored for each; only the lifecycle pipeline refuses a
     * repeated one, through {@code DeduplicateCommandTask}.
     */
    public static String commandIdOf(Command command) {
        return command == null ? null : command.getCommandId();
    }

    /**
     * Whether the insert violated the given unique constraint of {@code order_events}.
     *
     * <ul>
     *   <li>{@code (order_id, version)}: the insert lost a race for the next version. The loser's
     *       whole command is rolled back and reported as a concurrent modification (409, or a Kafka
     *       retry), as Hibernate's {@code @Version} check did before.
     *   <li>{@code (order_id, command_id)}: the command was already applied to the order, and two
     *       deliveries raced past the dedup lookup. Reported as the same duplicate-command refusal the
     *       lookup gives (SPEC-0046).
     * </ul>
     */
    private static boolean violates(DataIntegrityViolationException e, String constraint) {
        for (Throwable cause = e; cause != null && cause.getCause() != cause; cause = cause.getCause()) {
            if (cause instanceof org.hibernate.exception.ConstraintViolationException violation
                    && violation.getConstraintName() != null) {
                return constraint.equalsIgnoreCase(violation.getConstraintName());
            }
        }
        // No constraint name reported: fall back to the driver's message, which names it on Postgres.
        String detail = e.getMostSpecificCause().getMessage();
        return detail != null && detail.contains(constraint);
    }

    private static final String VERSION_CONSTRAINT = "uq_order_events_order_id_version";
    private static final String COMMAND_ID_CONSTRAINT = "uq_order_events_order_id_command_id";
}
