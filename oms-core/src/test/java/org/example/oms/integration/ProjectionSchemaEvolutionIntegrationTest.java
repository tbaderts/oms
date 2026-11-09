package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Properties;
import java.util.UUID;

import org.apache.avro.Schema;
import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.example.common.model.msg.OrdType;
import org.example.common.model.msg.OrderExecution;
import org.example.common.model.msg.Side;
import org.example.common.model.msg.State;
import org.example.oms.mapper.AvroPayloadCodecTest;
import org.example.oms.model.OutboxMessage;
import org.example.oms.repository.OutboxRepository;
import org.example.oms.service.OutboxRelay;
import org.example.oms.service.WriterSchemaIds;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import io.confluent.kafka.schemaregistry.avro.AvroSchema;
import io.confluent.kafka.schemaregistry.testutil.MockSchemaRegistry;

/**
 * SPEC-0049 AC-8: a PROJECTION row records the registry id of the schema its payload was encoded
 * with, and the relay decodes it with that writer schema and the current class as reader. A row
 * staged with an older schema of the record (as if a deployment had changed it in between) is
 * published with its values and the new field's default, and is not failed.
 *
 * <p>Runs in a world of its own, so this context is the relay leader there.
 */
class ProjectionSchemaEvolutionIntegrationTest extends AbstractFillFlowIntegrationTest {

    private static final String ORDER_EXECUTIONS = "oms_order_executions";

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        isolate("schema", "commands-schema");
        registry.add("spring.kafka.consumer.group-id", () -> "oms-schema");
    }

    @Autowired WriterSchemaIds writerSchemaIds;
    @Autowired OutboxRepository outboxRepository;
    @Autowired OutboxRelay relay;
    @Autowired ConsumerFactory<Object, Object> consumerFactory;

    /** A fill's PROJECTION row records the id of the schema its payload was encoded with. */
    @Test
    void aStagedProjectionRowRecordsItsWriterSchemaId() throws Exception {
        Schema current = OrderExecution.getClassSchema();
        writerSchemaIds.idFor(ORDER_EXECUTIONS, current);
        awaitUntil(() -> writerSchemaIds.idFor(ORDER_EXECUTIONS, current) != null, "the schema id is known");
        Integer id = writerSchemaIds.idFor(ORDER_EXECUTIONS, current);

        String orderId = createLiveOrder();
        relay.stop();
        try {
            assertEquals(201, postFill(orderId + "-E1", orderId, "10", null));
            OutboxMessage projection = outboxRepository.findAll().stream()
                    .filter(row -> row.getAggregateType() == OutboxMessage.AggregateType.PROJECTION)
                    .filter(row -> orderId.equals(row.getOrderId()))
                    .findFirst()
                    .orElseThrow();
            assertEquals(id, projection.getPayloadSchemaId(), "the row carries the writer schema's registry id");
        } finally {
            relay.start();
        }
    }

    /** AC-8: a row encoded with an older registered schema still publishes, with the new field's default. */
    @Test
    void aRowStagedWithAnOlderSchemaStillPublishes() throws Exception {
        Schema older = AvroPayloadCodecTest.withoutField(OrderExecution.getClassSchema(), "tradeDate");
        int olderId = MockSchemaRegistry.getClientForScope("oms-it")
                .register(ORDER_EXECUTIONS + "-value", new AvroSchema(older));
        String orderId = "ORD-OLD-" + UUID.randomUUID();
        OrderExecution staged = OrderExecution.newBuilder()
                .setExecId(orderId + "-E1").setLastQty(new BigDecimal("40.0000")).setLastPx(new BigDecimal("170.0000"))
                .setExecType("F").setLastCapacity(null).setLastMkt("XNAS").setTransactTime(Instant.parse("2026-11-08T10:00:00Z"))
                .setOrderId(orderId).setRootOrderId(orderId).setParentOrderId(null).setLeg(null).setClOrdId("CL-OLD")
                .setSessionId("S-OLD").setAccount("ACC-OLD").setSide(Side.BUY).setSymbol("AAPL").setSecurityId(null)
                .setOrdType(OrdType.LIMIT).setPrice(new BigDecimal("170.0000")).setOrderQty(new BigDecimal("100.0000"))
                .setSettlCurrency("USD").setExDestination("XNAS").setCumQty(new BigDecimal("40.0000"))
                .setLeavesQty(new BigDecimal("60.0000")).setAvgPx(new BigDecimal("170.0000")).setState(State.LIVE)
                .setOrderVersion(3L).setTradeDate(LocalDate.of(2026, 11, 8))
                .build();

        try (Consumer<Object, Object> consumer = subscribed(ORDER_EXECUTIONS)) {
            OutboxMessage row = outboxRepository.save(OutboxMessage.builder()
                    .aggregateType(OutboxMessage.AggregateType.PROJECTION)
                    .aggregateId(orderId)
                    .orderId(orderId)
                    .topic(ORDER_EXECUTIONS)
                    .aggregateVersion(3)
                    .payloadType(OrderExecution.getClassSchema().getFullName())
                    .payload(AvroPayloadCodecTest.encodeWith(older, staged))
                    .payloadSchemaId(olderId)
                    .createdAt(Instant.now())
                    .attempts(0)
                    .build());

            OrderExecution published = awaitRecord(consumer, orderId);
            assertEquals(orderId + "-E1", published.getExecId());
            assertEquals(0, new BigDecimal("40").compareTo(published.getCumQty()));
            assertEquals(State.LIVE, published.getState());
            assertEquals(3L, published.getOrderVersion());
            assertNull(published.getTradeDate(), "the field the older schema lacks takes its default");
            awaitUntil(() -> outboxRepository.findById(row.getId()).isEmpty(), "the row was published, not failed");
        }
    }

    private Consumer<Object, Object> subscribed(String topic) {
        Properties properties = TestCommands.avroValues();
        properties.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "latest");
        Consumer<Object, Object> consumer = consumerFactory.createConsumer("it-" + UUID.randomUUID(), null, null, properties);
        consumer.subscribe(List.of(topic));
        long deadline = System.nanoTime() + TIMEOUT.toNanos();
        while (consumer.assignment().isEmpty() && System.nanoTime() < deadline) {
            consumer.poll(Duration.ofMillis(100));
        }
        return consumer;
    }

    private static OrderExecution awaitRecord(Consumer<Object, Object> consumer, String orderId) {
        long deadline = System.nanoTime() + TIMEOUT.toNanos();
        while (System.nanoTime() < deadline) {
            for (ConsumerRecord<Object, Object> record : consumer.poll(Duration.ofMillis(200))) {
                if (record.value() instanceof OrderExecution fill && orderId.equals(fill.getOrderId())) {
                    return fill;
                }
            }
        }
        throw new AssertionError("Nothing published for " + orderId + " within " + TIMEOUT);
    }

}
