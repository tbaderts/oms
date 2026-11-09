package org.example.oms.mapper;

import org.example.oms.model.OutboxMessage;
import org.springframework.stereotype.Component;
import org.example.oms.service.WriterSchemaIds;
import org.springframework.beans.factory.annotation.Autowired;
import org.apache.avro.Schema;

/**
 * Builds the Avro record of an outbox row that carries its payload (SPEC-0047): PROJECTION rows,
 * and ORDER, EXECUTION and ORDER_EXECUTION rows staged before ORDER and EXECUTION rows became
 * pointers. Pointer rows are resolved from the event log by {@code OutboxPayloads}.
 */
@Component
public class OutboxRecordMapper {

    private final OrderMessageMapper orderMessageMapper;
    private final ExecutionMessageMapper executionMessageMapper;
    private final OrderExecutionMessageMapper orderExecutionMessageMapper;
    private final AvroPayloadCodec payloadCodec;
    private final WriterSchemaIds writerSchemaIds;

    @Autowired
    public OutboxRecordMapper(
            OrderMessageMapper orderMessageMapper,
            ExecutionMessageMapper executionMessageMapper,
            OrderExecutionMessageMapper orderExecutionMessageMapper,
            AvroPayloadCodec payloadCodec,
            WriterSchemaIds writerSchemaIds) {
        this.orderMessageMapper = orderMessageMapper;
        this.executionMessageMapper = executionMessageMapper;
        this.orderExecutionMessageMapper = orderExecutionMessageMapper;
        this.payloadCodec = payloadCodec;
        this.writerSchemaIds = writerSchemaIds;
    }

    /** Without a registry: payloads decode with the current class schema only. */
    public OutboxRecordMapper(
            OrderMessageMapper orderMessageMapper,
            ExecutionMessageMapper executionMessageMapper,
            OrderExecutionMessageMapper orderExecutionMessageMapper,
            AvroPayloadCodec payloadCodec) {
        this(orderMessageMapper, executionMessageMapper, orderExecutionMessageMapper, payloadCodec, null);
    }

    /**
     * @throws IllegalStateException if the row has no payload for its type; mapping failures are
     *     thrown too
     */
    public Object toRecord(OutboxMessage message) {
        Object payload =
                switch (message.getAggregateType()) {
                    case ORDER -> orderMessageMapper.toOrderMessage(
                            message.getOrderPayload(), message.getAggregateVersion());
                    case EXECUTION -> executionMessageMapper.toExecutionMessage(
                            message.getExecutionPayload(),
                            message.getOrderPayload(),
                            message.getAggregateVersion());
                    case ORDER_EXECUTION -> orderExecutionMessageMapper.toOrderExecutionMessage(
                            message.getExecutionPayload(),
                            message.getOrderPayload(),
                            message.getAggregateVersion(),
                            message.getCreatedAt());
                    case PROJECTION -> message.getPayload() == null
                            ? null
                            : payloadCodec.decode(message.getPayloadType(), message.getPayload(), writerSchemaOf(message));
                };

        if (payload == null) {
            throw new IllegalStateException(
                    "Outbox message " + message.getId() + " has no payload for aggregate type "
                            + message.getAggregateType());
        }
        return payload;
    }

    /** The schema a PROJECTION payload was encoded with, when the row recorded it (SPEC-0049). */
    private Schema writerSchemaOf(OutboxMessage message) {
        if (message.getPayloadSchemaId() == null || writerSchemaIds == null) {
            return null;
        }
        return writerSchemaIds.schemaById(message.getPayloadSchemaId());
    }
}
