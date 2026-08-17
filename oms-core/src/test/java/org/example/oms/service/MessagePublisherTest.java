package org.example.oms.service;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;

import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.clients.producer.RecordMetadata;
import org.apache.kafka.common.TopicPartition;
import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.model.msg.OrderMessage;
import org.example.oms.mapper.ExecutionMessageMapper;
import org.example.oms.mapper.OrderMessageMapper;
import org.example.oms.model.OutboxMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;

@ExtendWith(MockitoExtension.class)
class MessagePublisherTest {

    @Mock private KafkaTemplate<String, Object> kafkaTemplate;
    @Mock private OrderMessageMapper orderMessageMapper;
    @Mock private ExecutionMessageMapper executionMessageMapper;

    private MessagePublisher messagePublisher;

    @BeforeEach
    void setUp() {
        messagePublisher =
                new MessagePublisher(
                        kafkaTemplate, orderMessageMapper, executionMessageMapper, 10);
    }

    @Test
    void publish_sendsOrderPayloadKeyedByOrderId() throws Exception {
        Order order = Order.builder().orderId("ORD-1").build();
        OutboxMessage message = orderOutbox(order);

        OrderMessage avro = org.mockito.Mockito.mock(OrderMessage.class);
        when(orderMessageMapper.toOrderMessage(order, 7L)).thenReturn(avro);
        when(kafkaTemplate.send(eq("oms_orders"), eq("ORD-1"), any()))
                .thenReturn(CompletableFuture.completedFuture(sendResult("oms_orders", "ORD-1")));

        messagePublisher.publish(message);

        verify(kafkaTemplate).send("oms_orders", "ORD-1", avro);
    }

    @Test
    void publish_sendsExecutionPayloadToExecutionTopic() throws Exception {
        Execution execution = Execution.builder().execID("EX-1").orderId("ORD-1").build();
        OutboxMessage message =
                OutboxMessage.builder()
                        .id(2L)
                        .aggregateType(OutboxMessage.AggregateType.EXECUTION)
                        .aggregateId("EX-1")
                        .topic("oms_executions")
                        .executionPayload(execution)
                        .createdAt(Instant.now())
                        .build();

        org.example.common.model.msg.Execution avro =
                org.example.common.model.msg.Execution.newBuilder()
                        .setExecId("EX-1")
                        .setOrderId("ORD-1")
                        .build();
        when(executionMessageMapper.toExecutionMessage(execution)).thenReturn(avro);
        when(kafkaTemplate.send(eq("oms_executions"), eq("EX-1"), any()))
                .thenReturn(
                        CompletableFuture.completedFuture(sendResult("oms_executions", "EX-1")));

        messagePublisher.publish(message);

        verify(kafkaTemplate).send("oms_executions", "EX-1", avro);
    }

    /**
     * The relay decides what a send failure means, so the publisher must not swallow it. Swallowing
     * here is what previously let a failed publish look like a successful one.
     */
    @Test
    void publish_propagatesSendFailure() {
        Order order = Order.builder().orderId("ORD-2").build();
        OutboxMessage message = orderOutbox(order);

        when(orderMessageMapper.toOrderMessage(order, 7L))
                .thenReturn(org.mockito.Mockito.mock(OrderMessage.class));

        CompletableFuture<SendResult<String, Object>> failed = new CompletableFuture<>();
        failed.completeExceptionally(new RuntimeException("Kafka unavailable"));
        when(kafkaTemplate.send(eq("oms_orders"), eq("ORD-2"), any())).thenReturn(failed);

        assertThrows(ExecutionException.class, () -> messagePublisher.publish(message));
    }

    private OutboxMessage orderOutbox(Order order) {
        return OutboxMessage.builder()
                .id(1L)
                .aggregateType(OutboxMessage.AggregateType.ORDER)
                .aggregateId(order.getOrderId())
                .aggregateVersion(7L)
                .topic("oms_orders")
                .orderPayload(order)
                .createdAt(Instant.now())
                .build();
    }

    private SendResult<String, Object> sendResult(String topic, String key) {
        RecordMetadata metadata = new RecordMetadata(new TopicPartition(topic, 0), 0L, 1, 0L, 0, 0);
        return new SendResult<>(new ProducerRecord<>(topic, key, null), metadata);
    }
}
