package org.example.oms.service;

import java.time.Instant;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.model.cmd.Command;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.model.OutboxMessage;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.repository.OutboxRepository;
import org.springframework.beans.factory.annotation.Value;
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

    public OrderEventAppender(
            OrderEventRepository orderEventRepository,
            OutboxRepository outboxRepository,
            @Value("${kafka.order-topic:oms_orders}") String orderTopic,
            @Value("${kafka.execution-topic:oms_executions}") String executionTopic) {
        this.orderEventRepository = orderEventRepository;
        this.outboxRepository = outboxRepository;
        this.orderTopic = orderTopic;
        this.executionTopic = executionTopic;
    }

    /**
     * Records an order state change and stages the resulting order for publication.
     *
     * @return the version assigned to the appended event
     */
    public long appendOrderEvent(Order order, Event event, Command command) {
        long version = nextVersion(order.getOrderId());

        orderEventRepository.save(
                OrderEvent.builder()
                        .orderId(order.getOrderId())
                        .version(version)
                        .event(event)
                        .transaction(command)
                        .resultingState(order.getState())
                        .orderSnapshot(order)
                        .timeStamp(Instant.now())
                        .build());

        outboxRepository.save(
                OutboxMessage.builder()
                        .aggregateType(OutboxMessage.AggregateType.ORDER)
                        .aggregateId(order.getOrderId())
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
     * order state read the orders topic, and neither has to infer one from the other.
     */
    public long appendExecutionEvent(Order order, Execution execution, Event event, Command command) {
        long version = appendOrderEvent(order, event, command);

        outboxRepository.save(
                OutboxMessage.builder()
                        .aggregateType(OutboxMessage.AggregateType.EXECUTION)
                        .aggregateId(execution.getExecID())
                        .topic(executionTopic)
                        .aggregateVersion(version)
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
     * Next sequence number for the order's stream.
     *
     * <p>A race here produces two events claiming the same version; the unique constraint on
     * {@code (order_id, version)} rejects the loser and its whole command is rolled back and
     * retried, which is the intended behaviour.
     */
    private long nextVersion(String orderId) {
        return orderEventRepository.findMaxVersionByOrderId(orderId).orElse(0L) + 1;
    }
}
