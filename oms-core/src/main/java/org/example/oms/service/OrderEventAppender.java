package org.example.oms.service;

import java.time.Instant;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.model.cmd.Command;
import org.example.oms.mapper.AvroPayloadCodec;
import org.example.oms.mapper.OrderMessageMapper;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.model.OutboxMessage;
import org.example.oms.projection.StagedMessage;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.repository.OutboxRepository;
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

    public OrderEventAppender(
            OrderEventRepository orderEventRepository,
            OutboxRepository outboxRepository,
            @Value("${kafka.order-topic:oms_orders}") String orderTopic,
            @Value("${kafka.execution-topic:oms_executions}") String executionTopic,
            AvroPayloadCodec payloadCodec) {
        this.orderEventRepository = orderEventRepository;
        this.outboxRepository = outboxRepository;
        this.orderTopic = orderTopic;
        this.executionTopic = executionTopic;
        this.payloadCodec = payloadCodec;
    }

    /**
     * Stages a projection's message for publication, in the caller's transaction (SPEC-0020). The
     * outbox stays written in this one place; the payload is the record's Avro encoding and its type
     * the record's schema name, so the publisher needs no column or case per message type.
     */
    public void stageMessage(StagedMessage message) {
        outboxRepository.save(
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
                        .resultingState(order.getState())
                        .orderSnapshot(order)
                        .timeStamp(Instant.now())
                        .build();
        try {
            // Flushed here so a concurrent writer surfaces now, as the conflict it is.
            orderEventRepository.saveAndFlush(appended);
        } catch (DataIntegrityViolationException e) {
            if (isVersionConflict(e)) {
                throw new OptimisticLockingFailureException(
                        "Order " + order.getOrderId() + " was modified concurrently (event version "
                                + version + " already exists)",
                        e);
            }
            throw e;
        }

        outboxRepository.save(
                OutboxMessage.builder()
                        .aggregateType(OutboxMessage.AggregateType.ORDER)
                        .aggregateId(partitionKey(order))
                        .topic(orderTopic)
                        .aggregateVersion(version)
                        .orderPayload(order)
                        .createdAt(Instant.now())
                        .attempts(0)
                        .build());

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
     * <p>The execution is staged under the order's partition key, not its execID, because the
     * aggregate id is the Kafka key: all fills of one order tree then land on one partition and are
     * consumed in order.
     */
    public long appendExecutionEvent(Order order, Execution execution, Event event, Command command) {
        long version = appendOrderEvent(order, event, command);

        outboxRepository.save(
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
                execution.getExecID(),
                order.getOrderId(),
                executionTopic);

        return version;
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
     * Whether the insert lost a race for the next version: two writers read the order at the same
     * version, and the unique {@code (order_id, version)} lets only the first commit. The loser's
     * whole command is rolled back and reported as a concurrent modification (409, or a Kafka
     * retry), as Hibernate's {@code @Version} check did before. Other violations, such as a repeated
     * {@code command_id}, keep their own meaning.
     */
    private static boolean isVersionConflict(DataIntegrityViolationException e) {
        for (Throwable cause = e; cause != null && cause.getCause() != cause; cause = cause.getCause()) {
            if (cause instanceof org.hibernate.exception.ConstraintViolationException violation
                    && violation.getConstraintName() != null) {
                return VERSION_CONSTRAINT.equalsIgnoreCase(violation.getConstraintName());
            }
        }
        // No constraint name reported: fall back to the driver's message, which names it on Postgres.
        String detail = e.getMostSpecificCause().getMessage();
        return detail != null && detail.contains(VERSION_CONSTRAINT);
    }

    private static final String VERSION_CONSTRAINT = "uq_order_events_order_id_version";
}
