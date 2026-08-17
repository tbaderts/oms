package org.example.oms.service;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.apache.kafka.clients.producer.RecordMetadata;
import org.example.common.model.msg.OrderMessage;
import org.example.oms.mapper.ExecutionMessageMapper;
import org.example.oms.mapper.OrderMessageMapper;
import org.example.oms.model.OutboxMessage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import io.micrometer.observation.annotation.Observed;
import lombok.extern.slf4j.Slf4j;

/**
 * Converts a staged outbox message to its Avro form and sends it to Kafka.
 *
 * <p>Deliberately has no transaction and no error handling of its own: it either publishes or
 * throws, and {@link OutboxRelay} decides what a failure means. Keeping the decision in one place is
 * what stops a failed send from being quietly swallowed.
 */
@Component
@Slf4j
public class MessagePublisher {

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final OrderMessageMapper orderMessageMapper;
    private final ExecutionMessageMapper executionMessageMapper;
    private final long sendTimeoutSeconds;

    public MessagePublisher(
            KafkaTemplate<String, Object> kafkaTemplate,
            OrderMessageMapper orderMessageMapper,
            ExecutionMessageMapper executionMessageMapper,
            @Value("${kafka.send-timeout-seconds:10}") long sendTimeoutSeconds) {
        this.kafkaTemplate = kafkaTemplate;
        this.orderMessageMapper = orderMessageMapper;
        this.executionMessageMapper = executionMessageMapper;
        this.sendTimeoutSeconds = sendTimeoutSeconds;
    }

    /**
     * Publishes one staged message, blocking until the broker acknowledges it.
     *
     * @throws ExecutionException if the broker rejected the record
     * @throws TimeoutException if the broker did not acknowledge in time
     */
    @Observed(name = "oms.message-publisher.publish")
    public void publish(OutboxMessage message)
            throws InterruptedException, ExecutionException, TimeoutException {

        Object payload =
                switch (message.getAggregateType()) {
                    case ORDER -> toOrderMessage(message);
                    case EXECUTION -> executionMessageMapper.toExecutionMessage(
                            message.getExecutionPayload());
                };

        if (payload == null) {
            throw new IllegalStateException(
                    "Outbox message " + message.getId() + " has no payload for aggregate type "
                            + message.getAggregateType());
        }

        var result =
                kafkaTemplate
                        .send(message.getTopic(), message.getAggregateId(), payload)
                        .get(sendTimeoutSeconds, TimeUnit.SECONDS);

        RecordMetadata metadata = result.getRecordMetadata();
        log.info(
                "Published {} {} to {}-{} at offset {}",
                message.getAggregateType(),
                message.getAggregateId(),
                metadata.topic(),
                metadata.partition(),
                metadata.offset());
    }

    private OrderMessage toOrderMessage(OutboxMessage message) {
        return orderMessageMapper.toOrderMessage(
                message.getOrderPayload(), message.getAggregateVersion());
    }
}
