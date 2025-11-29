package org.example.oms.service.infra;

import org.example.common.model.Order;
import org.example.common.model.mapper.OrderMessageMapper;
import org.example.common.model.msg.OrderMessage;
import org.example.oms.model.ProcessingEvent;
import org.example.oms.service.infra.repository.OrderOutboxRepository;
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

    @Value("${kafka.order-topic:orders}")
    private String orderTopic;

    @Value("${kafka.enabled:false}")
    private boolean kafkaEnabled;

    public MessagePublisher(
            OrderOutboxRepository orderOutboxRepository,
            KafkaTemplate<String, OrderMessage> kafkaTemplate,
            OrderMessageMapper orderMessageMapper) {
        this.orderOutboxRepository = orderOutboxRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.orderMessageMapper = orderMessageMapper;
    }

    /**
     * This event listener will only be triggered after the transaction in EventProducerImpl has
     * successfully committed.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @Observed(name = "oms.message-publisher.handle-order-event")
    public void handleOrderEvent(ProcessingEvent event) {
        log.info("Processing order event after transaction commit: {}", event);

        try {
            Order order = event.getOrderOutbox().getOrder();
            log.info("Processing event for order: {}", order.getOrderId());

            if (kafkaEnabled) {
                publishToKafka(order);
            } else {
                log.debug("Kafka is disabled, skipping message publish for order: {}", order.getOrderId());
            }
        } catch (Exception e) {
            log.error("Error processing order event: {}", e.getMessage(), e);
        }
    }

    /**
     * Publishes the order to Kafka as an Avro OrderMessage.
     */
    private void publishToKafka(Order order) {
        try {
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
        } catch (Exception e) {
            log.error("Error publishing order {} to Kafka: {}", order.getOrderId(), e.getMessage(), e);
        }
    }
}
