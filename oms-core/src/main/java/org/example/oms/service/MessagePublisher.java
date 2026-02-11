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
            @Value("${kafka.enabled:false}") boolean kafkaEnabled) {
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
            } else {
                log.debug("Kafka is disabled, skipping message publish for order: {}", order.getOrderId());
            }

            orderOutboxRepository.deleteById(outboxId);
            log.debug("Deleted outbox entry: {}", outboxId);
        } catch (Exception e) {
            log.error("Error processing order event for outbox {}: {}", outboxId, e.getMessage(), e);
        }
    }

    private void publishToKafka(Order order) {
        OrderMessage message = orderMessageMapper.toOrderMessage(order);
        String key = order.getOrderId();

        kafkaTemplate.send(orderTopic, key, message)
                .whenComplete((result, ex) -> {
                    if (ex != null) {
                        log.error("Failed to publish order {} to Kafka: {}",
                                order.getOrderId(), ex.getMessage(), ex);
                    } else {
                        log.info("Published order {} to topic {} partition {} offset {}",
                                order.getOrderId(),
                                result.getRecordMetadata().topic(),
                                result.getRecordMetadata().partition(),
                                result.getRecordMetadata().offset());
                    }
                });
    }
}
