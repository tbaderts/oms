package org.example.oms.service;

import org.example.common.model.Order;
import org.example.common.model.msg.OrderMessage;
import org.example.oms.mapper.OrderMessageMapper;
import org.example.oms.model.ProcessingEvent;
import org.example.oms.repository.OrderOutboxRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import io.micrometer.observation.annotation.Observed;
import lombok.extern.slf4j.Slf4j;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Publishes order events to Kafka using the transactional outbox pattern. Listens for ProcessingEvent
 * after transaction commit and publishes order messages to the configured Kafka topic.
 *
 * <p>Implementation details:
 * <ul>
 *   <li>Uses @TransactionalEventListener with AFTER_COMMIT phase for guaranteed delivery</li>
 *   <li>Publishes OrderMessage (Avro) to Kafka with orderId as key</li>
 *   <li>Deletes outbox entry after successful publish</li>
 *   <li>Runs in REQUIRES_NEW transaction to avoid rollback issues</li>
 * </ul>
 *
 * @see <a href="file:///oms-knowledge-base/oms-framework/oms-state-store.md">State Store - Transactional Outbox Pattern</a>
 * @see <a href="file:///oms-knowledge-base/oms-concepts/streaming-architecture.md">Streaming Architecture - Event Publishing</a>
 */
@Component
@Slf4j
public class MessagePublisher {

    private final OrderOutboxRepository orderOutboxRepository;
    private final KafkaTemplate<String, OrderMessage> kafkaTemplate;
    private final OrderMessageMapper orderMessageMapper;
    private final String orderTopic;
    private final boolean kafkaEnabled;

    public MessagePublisher(
            OrderOutboxRepository orderOutboxRepository,
            KafkaTemplate<String, OrderMessage> kafkaTemplate,
            OrderMessageMapper orderMessageMapper,
            @Value("${kafka.order-topic:orders}") String orderTopic,
            @Value("${kafka.enabled:true}") boolean kafkaEnabled) {
        this.orderOutboxRepository = orderOutboxRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.orderMessageMapper = orderMessageMapper;
        this.orderTopic = orderTopic;
        this.kafkaEnabled = kafkaEnabled;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @Observed(name = "oms.message-publisher.handle-order-event")
    public void handleOrderEvent(ProcessingEvent event) {
        log.info("Processing order event after transaction commit: {}", event);
        Long outboxId = event.getOrderOutbox().getId();

        try {
            Order order = event.getOrderOutbox().getOrder();
            log.info("Processing event for order: {}", order.getOrderId());

            if (kafkaEnabled) {
                publishToKafka(order);
                orderOutboxRepository.deleteById(outboxId);
                log.debug("Deleted outbox entry: {}", outboxId);
            } else {
                log.warn(
                        "Kafka is disabled, keeping outbox entry {} for order {}",
                        outboxId,
                        order.getOrderId());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("Interrupted while processing order event for outbox {}", outboxId, e);
        } catch (Exception e) {
            log.error("Error processing order event for outbox {}: {}", outboxId, e.getMessage(), e);
        }
    }

    private void publishToKafka(Order order)
            throws InterruptedException, ExecutionException, TimeoutException {
        OrderMessage message = orderMessageMapper.toOrderMessage(order);
        String key = order.getOrderId();

        var result = kafkaTemplate.send(orderTopic, key, message).get(10, TimeUnit.SECONDS);
        log.info("Published order {} to topic {} partition {} offset {}",
                order.getOrderId(),
                result.getRecordMetadata().topic(),
                result.getRecordMetadata().partition(),
                result.getRecordMetadata().offset());
    }
}
