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
import org.example.common.model.msg.OrderExecution;
import org.example.common.model.msg.OrderMessage;
import org.example.oms.mapper.AvroPayloadCodec;
import org.example.oms.mapper.ExecutionMessageMapper;
import org.example.oms.mapper.OrderExecutionMessageMapper;
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
    @Mock private OrderExecutionMessageMapper orderExecutionMessageMapper;
    private final AvroPayloadCodec payloadCodec = new AvroPayloadCodec();

    private MessagePublisher messagePublisher;

    @BeforeEach
    void setUp() {
        messagePublisher =
                new MessagePublisher(
                        kafkaTemplate,
                        orderMessageMapper,
                        executionMessageMapper,
                        orderExecutionMessageMapper,
                        payloadCodec,
                        10);
    }

    // SPEC-0020: a projection's message is decoded from the generic payload and sent with the row's key.
    @Test
    void publish_sendsProjectionPayload() throws Exception {
        OrderExecution record = OrderExecution.newBuilder()
                .setExecId("EX-9")
                .setOrderId("ORD-9")
                .setRootOrderId("ROOT-9")
                .setLastQty(new java.math.BigDecimal("6.5536"))
                .setOrderVersion(4L)
                .setTradeDate(java.time.LocalDate.of(2026, 10, 31))
                .build();
        OutboxMessage message =
                OutboxMessage.builder()
                        .id(5L)
                        .aggregateType(OutboxMessage.AggregateType.PROJECTION)
                        .aggregateId("ROOT-9")
                        .aggregateVersion(4L)
                        .topic("oms_order_executions")
                        .payloadType(OrderExecution.getClassSchema().getFullName())
                        .payload(payloadCodec.encode(record))
                        .createdAt(Instant.now())
                        .build();
        when(kafkaTemplate.send(eq("oms_order_executions"), eq("ROOT-9"), any()))
                .thenReturn(
                        CompletableFuture.completedFuture(
                                sendResult("oms_order_executions", "ROOT-9")));

        messagePublisher.publish(message);

        verify(kafkaTemplate).send("oms_order_executions", "ROOT-9", record);
    }

    // SPEC-0019 rows staged before SPEC-0020: the fill with its order, from the two payload columns.
    @Test
    void publish_stillSendsLegacyOrderExecutionRows() throws Exception {
        Instant stagedAt = Instant.parse("2026-10-31T09:00:00Z");
        Order order = Order.builder().orderId("ORD-1").rootOrderId("ROOT-1").build();
        Execution execution = Execution.builder().execID("EX-1").orderId("ORD-1").build();
        OutboxMessage message =
                OutboxMessage.builder()
                        .id(3L)
                        .aggregateType(OutboxMessage.AggregateType.ORDER_EXECUTION)
                        .aggregateId("ROOT-1")
                        .aggregateVersion(9L)
                        .topic("oms_order_executions")
                        .orderPayload(order)
                        .executionPayload(execution)
                        .createdAt(stagedAt)
                        .build();

        OrderExecution avro = org.mockito.Mockito.mock(OrderExecution.class);
        when(orderExecutionMessageMapper.toOrderExecutionMessage(execution, order, 9L, stagedAt))
                .thenReturn(avro);
        when(kafkaTemplate.send(eq("oms_order_executions"), eq("ROOT-1"), any()))
                .thenReturn(
                        CompletableFuture.completedFuture(
                                sendResult("oms_order_executions", "ROOT-1")));

        messagePublisher.publish(message);

        verify(kafkaTemplate).send("oms_order_executions", "ROOT-1", avro);
    }

    @Test
    void publish_refusesOrderExecutionWithoutPayload() {
        OutboxMessage message =
                OutboxMessage.builder()
                        .id(4L)
                        .aggregateType(OutboxMessage.AggregateType.ORDER_EXECUTION)
                        .aggregateId("ROOT-1")
                        .topic("oms_order_executions")
                        .createdAt(Instant.now())
                        .build();

        assertThrows(IllegalStateException.class, () -> messagePublisher.publish(message));
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
        when(executionMessageMapper.toExecutionMessage(execution, null, 0L)).thenReturn(avro);
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
