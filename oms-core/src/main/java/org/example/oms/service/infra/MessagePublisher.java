package org.example.oms.service.infra;

import org.example.oms.model.ProcessingEvent;
import org.example.oms.service.infra.repository.OrderOutboxRepository;
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

    public MessagePublisher(OrderOutboxRepository orderOutboxRepository) {
        this.orderOutboxRepository = orderOutboxRepository;
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
            Long orderId = event.getOrderOutbox().getOrder().getId();
            log.info("Successfully processed event for order: {}", orderId);
        } catch (Exception e) {
            log.error("Error processing order event: {}", e.getMessage(), e);
        }
    }
}
