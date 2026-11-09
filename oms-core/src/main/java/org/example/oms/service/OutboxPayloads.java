package org.example.oms.service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.example.common.model.Execution;
import org.example.oms.mapper.ExecutionMessageMapper;
import org.example.oms.mapper.OrderMessageMapper;
import org.example.oms.mapper.OutboxRecordMapper;
import org.example.oms.model.OrderEvent;
import org.example.oms.model.OutboxMessage;
import org.example.oms.repository.ExecutionRepository;
import org.example.oms.repository.OrderEventRepository;
import org.springframework.stereotype.Component;

/**
 * Turns claimed outbox rows into the records to publish (SPEC-0047).
 *
 * <p>ORDER and EXECUTION rows staged since SPEC-0047 are pointers: they name the order, the version
 * and, for EXECUTION, the execution, and carry no payload. Their record is built here from what the
 * state change stored: the order's snapshot in {@code order_events}, read by {@code (order_id, version)},
 * and the execution in {@code executions}, read by {@code (order_id, execid)}. The snapshot is so
 * written once per change instead of three times.
 *
 * <p>Rows that carry payloads (PROJECTION rows, and ORDER and EXECUTION rows staged before
 * SPEC-0047) are mapped from their payloads by {@link OutboxRecordMapper}, as before.
 *
 * <p>The relay calls this on its drain thread, in the claiming transaction, before any send. A
 * pointer whose target is missing is a definitive failure: the target was committed in the same
 * transaction as the row, so it cannot be a race.
 */
@Component
public class OutboxPayloads {

    /** A row's record, or why it has none. */
    public record Resolution(Object record, RuntimeException failure) {

        static Resolution of(Object record) {
            return new Resolution(record, null);
        }

        static Resolution failed(RuntimeException failure) {
            return new Resolution(null, failure);
        }
    }

    private final OrderEventRepository orderEventRepository;
    private final ExecutionRepository executionRepository;
    private final OrderMessageMapper orderMessageMapper;
    private final ExecutionMessageMapper executionMessageMapper;
    private final OutboxRecordMapper outboxRecordMapper;

    public OutboxPayloads(
            OrderEventRepository orderEventRepository,
            ExecutionRepository executionRepository,
            OrderMessageMapper orderMessageMapper,
            ExecutionMessageMapper executionMessageMapper,
            OutboxRecordMapper outboxRecordMapper) {
        this.orderEventRepository = orderEventRepository;
        this.executionRepository = executionRepository;
        this.orderMessageMapper = orderMessageMapper;
        this.executionMessageMapper = executionMessageMapper;
        this.outboxRecordMapper = outboxRecordMapper;
    }

    /** Resolves each row; a row whose record cannot be built gets the failure instead. */
    public Map<OutboxMessage, Resolution> resolve(List<OutboxMessage> rows) {
        Map<OutboxMessage, Resolution> resolved = new HashMap<>();
        for (OutboxMessage row : rows) {
            try {
                resolved.put(row, Resolution.of(recordOf(row)));
            } catch (RuntimeException e) {
                resolved.put(row, Resolution.failed(e));
            }
        }
        return resolved;
    }

    private Object recordOf(OutboxMessage row) {
        if (isPointer(row)) {
            return switch (row.getAggregateType()) {
                case ORDER -> orderMessageMapper.toOrderMessage(snapshotOf(row), row.getAggregateVersion());
                case EXECUTION -> executionMessageMapper.toExecutionMessageUnderRoot(
                        executionOf(row), row.getAggregateId(), row.getAggregateVersion());
                default -> throw new IllegalStateException("Outbox row " + row.getId() + " of type "
                        + row.getAggregateType() + " cannot be a pointer");
            };
        }
        return outboxRecordMapper.toRecord(row);
    }

    /** A pointer names its order and carries no payload; every other row carries its payload. */
    static boolean isPointer(OutboxMessage row) {
        if (row.getOrderId() == null) {
            return false;
        }
        return switch (row.getAggregateType()) {
            case ORDER -> row.getOrderPayload() == null;
            case EXECUTION -> row.getExecutionPayload() == null;
            default -> false;
        };
    }

    private org.example.common.model.Order snapshotOf(OutboxMessage row) {
        OrderEvent event = orderEventRepository
                .findByOrderIdAndVersion(row.getOrderId(), row.getAggregateVersion())
                .orElseThrow(() -> new IllegalStateException(String.format(
                        "Outbox row %d: no order_events row for order %s version %d",
                        row.getId(), row.getOrderId(), row.getAggregateVersion())));
        if (event.getOrderSnapshot() == null) {
            throw new IllegalStateException(String.format(
                    "Outbox row %d: order_events row for order %s version %d has no snapshot",
                    row.getId(), row.getOrderId(), row.getAggregateVersion()));
        }
        return event.getOrderSnapshot();
    }

    private Execution executionOf(OutboxMessage row) {
        return executionRepository
                .findByOrderIdAndExecId(row.getOrderId(), row.getExecId())
                .orElseThrow(() -> new IllegalStateException(String.format(
                        "Outbox row %d: no execution %s for order %s version %d",
                        row.getId(), row.getExecId(), row.getOrderId(), row.getAggregateVersion())));
    }
}
