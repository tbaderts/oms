package org.example.oms.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.concurrent.CompletableFuture;

import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.clients.producer.RecordMetadata;
import org.apache.kafka.common.TopicPartition;
import org.example.common.model.Order;
import org.example.common.model.msg.OrderMessage;
import org.example.oms.mapper.OrderMessageMapper;
import org.example.oms.model.OrderOutbox;
import org.example.oms.model.ProcessingEvent;
import org.example.oms.repository.OrderOutboxRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.support.SendResult;
import org.springframework.kafka.core.KafkaTemplate;

@ExtendWith(MockitoExtension.class)
class MessagePublisherTest {

    @Mock
    private OrderOutboxRepository orderOutboxRepository;

    @Mock
    private KafkaTemplate<String, OrderMessage> kafkaTemplate;

    @Mock
    private OrderMessageMapper orderMessageMapper;

    private MessagePublisher messagePublisher;

    @BeforeEach
    void setUp() {
        messagePublisher =
                new MessagePublisher(
                        orderOutboxRepository,
                        kafkaTemplate,
                        orderMessageMapper,
                        "orders",
                        true);
    }

    @Test
    void handleOrderEvent_whenPublishSucceeds_deletesOutboxEntry() {
        Order order = Order.builder().orderId("ORD-1").build();
        OrderOutbox outbox = OrderOutbox.builder().id(10L).order(order).build();
        ProcessingEvent event = ProcessingEvent.builder().orderOutbox(outbox).build();

        when(orderMessageMapper.toOrderMessage(order)).thenReturn(null);

        RecordMetadata metadata =
                new RecordMetadata(new TopicPartition("orders", 0), 0, 1, 0L, 0L, 0, 0);
        SendResult<String, OrderMessage> sendResult =
                new SendResult<>(new ProducerRecord<>("orders", "ORD-1", null), metadata);

        when(kafkaTemplate.send(eq("orders"), eq("ORD-1"), any()))
                .thenReturn(CompletableFuture.completedFuture(sendResult));

        messagePublisher.handleOrderEvent(event);

        verify(orderOutboxRepository).deleteById(10L);
    }

    @Test
    void handleOrderEvent_whenPublishFails_keepsOutboxEntry() {
        Order order = Order.builder().orderId("ORD-2").build();
        OrderOutbox outbox = OrderOutbox.builder().id(11L).order(order).build();
        ProcessingEvent event = ProcessingEvent.builder().orderOutbox(outbox).build();

        when(orderMessageMapper.toOrderMessage(order)).thenReturn(null);

        CompletableFuture<SendResult<String, OrderMessage>> failed = new CompletableFuture<>();
        failed.completeExceptionally(new RuntimeException("Kafka unavailable"));

        when(kafkaTemplate.send(eq("orders"), eq("ORD-2"), any())).thenReturn(failed);

        messagePublisher.handleOrderEvent(event);

        verify(orderOutboxRepository, never()).deleteById(11L);
    }
}
