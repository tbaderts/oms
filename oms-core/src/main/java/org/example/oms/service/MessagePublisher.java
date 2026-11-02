package org.example.oms.service;

import java.util.concurrent.CompletableFuture;

import org.apache.kafka.clients.producer.RecordMetadata;
import org.example.common.model.msg.OrderMessage;
import org.example.oms.mapper.AvroPayloadCodec;
import org.example.oms.mapper.ExecutionMessageMapper;
import org.example.oms.mapper.OrderExecutionMessageMapper;
import org.example.oms.mapper.OrderMessageMapper;
import org.example.oms.model.OutboxMessage;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Component;

import io.micrometer.observation.annotation.Observed;
import lombok.extern.slf4j.Slf4j;

/**
 * Converts a staged outbox message to its Avro form and sends it to Kafka.
 *
 * <p>Deliberately has no transaction and no error handling of its own: it either hands the record to
 * the producer or fails, and {@link OutboxRelay} decides what a failure means. Keeping the decision in one place is
 * what stops a failed send from being quietly swallowed.
 */
@Component
@Slf4j
public class MessagePublisher {

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final OrderMessageMapper orderMessageMapper;
    private final ExecutionMessageMapper executionMessageMapper;
    private final OrderExecutionMessageMapper orderExecutionMessageMapper;
    private final AvroPayloadCodec payloadCodec;

    public MessagePublisher(
            KafkaTemplate<String, Object> kafkaTemplate,
            OrderMessageMapper orderMessageMapper,
            ExecutionMessageMapper executionMessageMapper,
            OrderExecutionMessageMapper orderExecutionMessageMapper,
            AvroPayloadCodec payloadCodec) {
        this.kafkaTemplate = kafkaTemplate;
        this.orderMessageMapper = orderMessageMapper;
        this.executionMessageMapper = executionMessageMapper;
        this.orderExecutionMessageMapper = orderExecutionMessageMapper;
        this.payloadCodec = payloadCodec;
    }

    /**
     * Sends one staged message without waiting for the broker (SPEC-0026): the returned future
     * completes with the acknowledgement, or exceptionally if the broker rejected the record. The
     * relay awaits it, so the sends of different aggregates are in flight together.
     *
     * <p>The record key is the message's aggregate id, the order's root order id (its own id when it
     * has no root), so every record of one order tree goes to the same partition of each topic.
     *
     * @throws IllegalStateException if the row has no payload for its type; mapping and
     *     serialization failures are thrown here too, before anything is sent
     */
    @Observed(name = "oms.message-publisher.publish")
    public CompletableFuture<SendResult<String, Object>> publishAsync(OutboxMessage message) {

        Object payload =
                switch (message.getAggregateType()) {
                    case ORDER -> toOrderMessage(message);
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
                            : payloadCodec.decode(message.getPayloadType(), message.getPayload());
                };

        if (payload == null) {
            throw new IllegalStateException(
                    "Outbox message " + message.getId() + " has no payload for aggregate type "
                            + message.getAggregateType());
        }

        return kafkaTemplate
                .send(message.getTopic(), message.getAggregateId(), payload)
                .whenComplete((result, failure) -> {
                    if (failure == null) {
                        RecordMetadata metadata = result.getRecordMetadata();
                        log.info(
                                "Published {} {} to {}-{} at offset {}",
                                message.getAggregateType(),
                                message.getAggregateId(),
                                metadata.topic(),
                                metadata.partition(),
                                metadata.offset());
                    }
                });
    }

    private OrderMessage toOrderMessage(OutboxMessage message) {
        return orderMessageMapper.toOrderMessage(
                message.getOrderPayload(), message.getAggregateVersion());
    }
}
