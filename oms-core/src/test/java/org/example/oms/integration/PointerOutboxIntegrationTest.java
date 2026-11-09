package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.util.UUID;
import java.util.function.Predicate;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.model.msg.OrderMessage;
import org.apache.avro.specific.SpecificRecord;
import org.example.oms.mapper.AvroPayloadCodec;
import org.example.oms.mapper.ExecutionMessageMapper;
import org.example.oms.mapper.OrderMessageMapper;
import org.example.oms.model.OutboxMessage;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.repository.OutboxRepository;
import org.example.oms.model.OrderEvent;
import org.example.oms.service.OrderEventAppender;
import org.example.oms.service.OutboxPayloads;
import org.example.oms.service.OutboxRelay;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * SPEC-0047: ORDER and EXECUTION outbox rows are pointers, and the relay reads their records back at
 * publish time. Rows staged before the change still publish from their payloads, and a pointer whose
 * target is missing fails loudly and holds its aggregate.
 *
 * <p>Runs in a world of its own (database, command topic, consumer group), so this context is the
 * relay leader there.
 */
class PointerOutboxIntegrationTest extends AbstractFillFlowIntegrationTest {

    private static final String ORDERS = "orders";
    private static final String EXECUTIONS = "oms_executions";

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        isolate("pointer", "commands-pointer");
        registry.add("spring.kafka.consumer.group-id", () -> "oms-pointer");
    }

    @Autowired OutboxRepository outboxRepository;
    @Autowired OrderEventRepository orderEventRepository;
    @Autowired OrderMessageMapper orderMessageMapper;
    @Autowired ExecutionMessageMapper executionMessageMapper;
    @Autowired ConsumerFactory<Object, Object> consumerFactory;
    @Autowired AvroPayloadCodec payloadCodec;
    @Autowired OutboxRelay relay;
    @Autowired OutboxPayloads outboxPayloads;
    @Value("${kafka.outbox.max-attempts}") int maxAttempts;

    private final List<String> plantedKeys = new ArrayList<>();

    @AfterEach
    void removePlantedRows() {
        // One bulk delete: deleting a held row first would release the rows behind it to the relay,
        // which could then delete them under a row-by-row cleanup.
        outboxRepository.deleteAllByIdInBatch(outboxRepository.findAll().stream()
                .filter(row -> plantedKeys.contains(row.getAggregateId()))
                .map(OutboxMessage::getId)
                .toList());
    }

    /**
     * AC-1: a fill stages its ORDER and EXECUTION rows as pointers (order id, version and, for
     * EXECUTION, the exec id; no payload), and the order's JSON snapshot is written once, in
     * order_events. The relay is paused so the rows can be read before they are published.
     */
    @Test
    void aFillStagesPointerRowsAndOneSnapshot() throws Exception {
        String orderId = createLiveOrder();
        awaitUntil(() -> rowsOf(orderId).isEmpty(), "the order published");
        relay.stop();
        try {
            assertEquals(201, postFill(orderId + "-E1", orderId, "10", null));
            long version = orderRepository.findByOrderId(orderId).orElseThrow().getTxNr();

            List<OutboxMessage> staged = rowsOf(orderId).stream().filter(row -> row.getAggregateVersion() == version).toList();
            OutboxMessage order = only(staged, OutboxMessage.AggregateType.ORDER);
            OutboxMessage execution = only(staged, OutboxMessage.AggregateType.EXECUTION);
            assertEquals(orderId, order.getOrderId());
            assertEquals(null, order.getOrderPayload(), "the ORDER row carries no order payload");
            assertEquals(orderId, execution.getOrderId());
            assertEquals(orderId + "-E1", execution.getExecId());
            assertEquals(null, execution.getOrderPayload(), "the EXECUTION row carries no order payload");
            assertEquals(null, execution.getExecutionPayload(), "the EXECUTION row carries no execution payload");
            assertTrue(staged.stream().allMatch(row -> row.getOrderPayload() == null && row.getExecutionPayload() == null),
                    "no row of the fill carries the order as JSON: " + staged);

            List<OrderEvent> events = orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).stream()
                    .filter(e -> e.getVersion() == version).toList();
            assertEquals(1, events.size(), "one event for the change");
            assertTrue(events.getFirst().getOrderSnapshot() != null, "its snapshot is the one copy of the order");
        } finally {
            relay.start();
        }
    }

    /**
     * AC-2: the records a fill's pointer rows resolve to are equal, field by field, to the records
     * the same rows in the pre-change form (the order and the execution as payloads) resolve to, with
     * the same key and version.
     */
    @Test
    void pointerRowsPublishTheSameRecordsAsPayloadRows() throws Exception {
        String orderId = createLiveOrder();
        awaitUntil(() -> rowsOf(orderId).isEmpty(), "the order published");
        relay.stop();
        try {
            assertEquals(201, postFill(orderId + "-E1", orderId, "10", null));
            Order order = orderRepository.findByOrderId(orderId).orElseThrow();
            long version = order.getTxNr();
            List<OutboxMessage> pointers = rowsOf(orderId).stream()
                    .filter(row -> row.getAggregateVersion() == version)
                    .filter(row -> row.getAggregateType() != OutboxMessage.AggregateType.PROJECTION)
                    .toList();
            assertEquals(2, pointers.size(), "ORDER and EXECUTION: " + pointers);

            Execution execution = executionRepository.findByOrderIdAndExecId(orderId, orderId + "-E1").orElseThrow();
            for (OutboxMessage pointer : pointers) {
                OutboxMessage payloadForm = OutboxMessage.builder()
                        .aggregateType(pointer.getAggregateType())
                        .aggregateId(pointer.getAggregateId())
                        .topic(pointer.getTopic())
                        .aggregateVersion(pointer.getAggregateVersion())
                        // The order entity as saved by the fill: what the code before SPEC-0047 staged.
                        .orderPayload(order)
                        .executionPayload(pointer.getAggregateType() == OutboxMessage.AggregateType.EXECUTION ? execution : null)
                        .createdAt(Instant.now())
                        .attempts(0)
                        .build();
                var resolved = outboxPayloads.resolve(List.of(pointer, payloadForm));
                assertEquals(null, resolved.get(pointer).failure(), "the pointer resolves");
                assertEquals(resolved.get(payloadForm).record(), resolved.get(pointer).record(),
                        pointer.getAggregateType() + " record equals the pre-change record");
                assertEquals(OrderEventAppender.partitionKey(order), pointer.getAggregateId(), "same key");
            }
        } finally {
            relay.start();
        }
    }

    /**
     * AC-3: ORDER and EXECUTION rows in the form staged before SPEC-0047 (payloads, no order id)
     * publish exactly the records their payloads map to.
     */
    @Test
    void legacyPayloadRowsStillPublish() throws Exception {
        String orderId = createLiveOrder();
        assertEquals(201, postFill(orderId + "-E1", orderId, "10", null));
        awaitUntil(() -> rowsOf(orderId).isEmpty(), "the fill published");
        Order order = orderRepository.findByOrderId(orderId).orElseThrow();
        Execution execution = executionRepository.findByOrderIdAndExecId(orderId, orderId + "-E1").orElseThrow();
        String key = OrderEventAppender.partitionKey(order);

        try (Consumer<Object, Object> orders = subscribed(ORDERS); Consumer<Object, Object> executions = subscribed(EXECUTIONS)) {
            outboxRepository.save(legacy(OutboxMessage.AggregateType.ORDER, key, ORDERS, 701)
                    .orderPayload(order).build());
            outboxRepository.save(legacy(OutboxMessage.AggregateType.EXECUTION, key, EXECUTIONS, 702)
                    .orderPayload(order).executionPayload(execution).build());

            Object orderRecord = awaitRecord(orders, r -> r instanceof OrderMessage m
                    && orderId.equals(m.getOrderId()) && m.getEventId() == 701);
            Object executionRecord = awaitRecord(executions, r -> r instanceof org.example.common.model.msg.Execution e
                    && orderId.equals(e.getOrderId()) && e.getOrderVersion() == 702);

            assertEquals(wire(orderMessageMapper.toOrderMessage(order, 701)), orderRecord, "the ORDER payload row publishes as before");
            assertEquals(wire(executionMessageMapper.toExecutionMessage(execution, order, 702)), executionRecord,
                    "the EXECUTION payload row publishes as before");
        }
    }

    /**
     * AC-4: a pointer row whose event or execution cannot be read fails with an error naming the
     * order and the version, counts its attempts until its aggregate is held, and nothing behind it
     * is published. The ORDER pointer names a missing event; the EXECUTION pointer, on its own
     * topic and so its own aggregate, names a missing execution.
     */
    @Test
    void aPointerWithNoTargetFailsAndHoldsItsAggregate() throws Exception {
        String orderId = createLiveOrder();
        awaitUntil(() -> rowsOf(orderId).isEmpty(), "the order published");
        Order order = orderRepository.findByOrderId(orderId).orElseThrow();
        String key = OrderEventAppender.partitionKey(order);
        long missing = 9_001;

        try (Consumer<Object, Object> orders = subscribed(ORDERS)) {
            OutboxMessage broken = outboxRepository.save(OutboxMessage.builder()
                    .aggregateType(OutboxMessage.AggregateType.ORDER)
                    .aggregateId(key)
                    .orderId(orderId)
                    .topic(ORDERS)
                    .aggregateVersion(missing)
                    .createdAt(Instant.now())
                    .attempts(0)
                    .build());
            plantedKeys.add(key);
            outboxRepository.save(legacy(OutboxMessage.AggregateType.ORDER, key, ORDERS, missing + 1)
                    .orderPayload(order).build());
            OutboxMessage brokenExecution = outboxRepository.save(OutboxMessage.builder()
                    .aggregateType(OutboxMessage.AggregateType.EXECUTION)
                    .aggregateId(key)
                    .orderId(orderId)
                    .execId("NO-SUCH-EXEC")
                    .topic(EXECUTIONS)
                    .aggregateVersion(missing)
                    .createdAt(Instant.now())
                    .attempts(0)
                    .build());

            awaitUntil(() -> outboxRepository.findById(broken.getId()).orElseThrow().getAttempts() >= maxAttempts,
                    "the broken pointer used up its attempts");
            OutboxMessage failed = outboxRepository.findById(broken.getId()).orElseThrow();
            assertTrue(failed.getLastError().contains(orderId) && failed.getLastError().contains("version " + missing),
                    "the error names the order and the version: " + failed.getLastError());
            awaitUntil(() -> outboxRepository.findById(brokenExecution.getId()).orElseThrow().getAttempts() >= maxAttempts,
                    "the broken EXECUTION pointer used up its attempts");
            String executionError = outboxRepository.findById(brokenExecution.getId()).orElseThrow().getLastError();
            assertTrue(executionError.contains("NO-SUCH-EXEC") && executionError.contains(orderId)
                            && executionError.contains("version " + missing),
                    "the error names the execution, the order and the version: " + executionError);

            Thread.sleep(1_000); // further polls: the row behind it must stay held
            OutboxMessage behind = rowsOf(key).stream()
                    .filter(row -> row.getAggregateVersion() == missing + 1).findFirst().orElseThrow();
            assertEquals(0, behind.getAttempts(), "the row behind the broken pointer was never attempted");
            assertTrue(records(orders, Duration.ofSeconds(2)).stream().noneMatch(r -> r instanceof OrderMessage m
                            && orderId.equals(m.getOrderId()) && m.getEventId() >= missing),
                    "nothing at or behind the broken pointer was published");
        }
    }

    // --- helpers -------------------------------------------------------------------------------

    /** The record as a consumer receives it: Avro keeps timestamps to the millisecond. */
    Object wire(SpecificRecord record) {
        return payloadCodec.decode(record.getSchema().getFullName(), payloadCodec.encode(record));
    }

    private OutboxMessage.OutboxMessageBuilder<?, ?> legacy(
            OutboxMessage.AggregateType type, String key, String topic, long version) {
        plantedKeys.add(key);
        return OutboxMessage.builder()
                .aggregateType(type)
                .aggregateId(key)
                .topic(topic)
                .aggregateVersion(version)
                .createdAt(Instant.now())
                .attempts(0);
    }

    private static OutboxMessage only(List<OutboxMessage> rows, OutboxMessage.AggregateType type) {
        List<OutboxMessage> ofType = rows.stream().filter(row -> row.getAggregateType() == type).toList();
        assertEquals(1, ofType.size(), "one " + type + " row: " + rows);
        return ofType.getFirst();
    }

    private List<OutboxMessage> rowsOf(String key) {
        return outboxRepository.findAll().stream().filter(row -> key.equals(row.getAggregateId())).toList();
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

    private static Object awaitRecord(Consumer<Object, Object> consumer, Predicate<Object> wanted) {
        long deadline = System.nanoTime() + TIMEOUT.toNanos();
        while (System.nanoTime() < deadline) {
            for (ConsumerRecord<Object, Object> record : consumer.poll(Duration.ofMillis(200))) {
                if (wanted.test(record.value())) {
                    return record.value();
                }
            }
        }
        throw new AssertionError("No matching record within " + TIMEOUT);
    }

    private static List<Object> records(Consumer<Object, Object> consumer, Duration within) {
        List<Object> values = new ArrayList<>();
        long deadline = System.nanoTime() + within.toNanos();
        while (System.nanoTime() < deadline) {
            consumer.poll(Duration.ofMillis(200)).forEach(r -> values.add(r.value()));
        }
        return values;
    }
}
