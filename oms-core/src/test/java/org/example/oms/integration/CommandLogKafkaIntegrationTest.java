package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.ByteArrayDeserializer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.example.common.model.CancelState;
import org.example.common.model.cmd.ExecutionCreateCmd;
import org.example.common.model.msg.Execution;
import org.example.common.model.msg.OrderCancelRejectCmd;
import org.example.common.model.msg.OrderCancelRequestCmd;
import org.example.oms.model.CommandLogEntry;
import org.example.oms.model.CommandOutcome;
import org.example.oms.model.CommandSource;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.repository.CommandLogRepository;
import org.example.oms.repository.OrderEventRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import io.micrometer.core.instrument.MeterRegistry;

/**
 * SPEC-0046 over Kafka: every command consumed is logged with its outcome and its producer; a
 * refusal (a duplicate included) is acknowledged, a failure is dead-lettered and logged failed, and
 * every fill stores its command.
 */
class CommandLogKafkaIntegrationTest extends AbstractFillFlowIntegrationTest {

    @Autowired CommandLogRepository commandLogRepository;
    @Autowired OrderEventRepository orderEventRepository;
    @Autowired MeterRegistry meterRegistry;

    /** AC-3: an accept from Kafka is logged with the header's commandId and producer. */
    @Test
    void kafkaAcceptIsLoggedWithProducer() throws Exception {
        String orderId = createLiveOrder();

        OrderEvent ack = events(orderId).stream().filter(e -> e.getEvent() == Event.ACK).findFirst().orElseThrow();
        CommandLogEntry entry = log(orderId).stream()
                .filter(e -> "OrderAcceptCmd".equals(e.getType()))
                .findFirst()
                .orElseThrow();
        assertEquals(CommandSource.KAFKA, entry.getSource());
        assertEquals(TestCommands.PRODUCER, entry.getPrincipal());
        assertEquals(CommandOutcome.APPLIED, entry.getOutcome());
        assertEquals(ack.getCommandId(), entry.getCommandId(), "the header's commandId");
        assertEquals(ack.getVersion(), entry.getEventVersion());
    }

    /** AC-3: a refused Kafka command is acknowledged (logged once, not retried) and logged refused. */
    @Test
    void refusedKafkaCommandIsAcknowledgedAndLogged() throws Exception {
        String orderId = createLiveOrder();
        String refusedId = "CR-REF-" + UUID.randomUUID();

        // No cancel is pending, so a cancel reject is refused; the request after it is the sentinel.
        send(orderId, new OrderCancelRejectCmd(TestCommands.header(refusedId), orderId, "Unknown order"));
        send(orderId, new OrderCancelRequestCmd(TestCommands.header(), orderId));
        awaitUntil(() -> orderRepository.findByOrderId(orderId).orElseThrow().getCancelState() == CancelState.PCXL,
                orderId + " cancel request after the refused reject");

        List<CommandLogEntry> refused = entries(orderId, refusedId);
        assertEquals(1, refused.size(), "one attempt: acknowledged, not retried");
        assertEquals(CommandOutcome.REFUSED, refused.getFirst().getOutcome());
        assertEquals("OrderCancelRejectCmd", refused.getFirst().getType());
        assertNull(refused.getFirst().getEventVersion());
    }

    /** AC-4: a fill for an order that does not exist fails, is dead-lettered and logged failed. */
    @Test
    void fillForUnknownOrderIsDeadLetteredAndLoggedFailed() throws Exception {
        String orderId = "ORD-MISSING-" + UUID.randomUUID();
        String commandId = "F-MISS-" + UUID.randomUUID();

        send(orderId, new org.example.common.model.msg.ExecutionCreateCmd(
                TestCommands.header(commandId), execution(orderId + "-E1", orderId, "10")));

        awaitUntil(() -> !entries(orderId, commandId).isEmpty(), commandId + " logged");
        CommandLogEntry failed = entries(orderId, commandId).getFirst();
        assertEquals(CommandOutcome.FAILED, failed.getOutcome());
        assertEquals(orderId, failed.getOrderId());
        assertTrue(failed.getReason().contains("Order not found"), failed.getReason());
        assertEquals(1, deadLetterCount(orderId, TIMEOUT), "dead-lettered once");
    }

    /** AC-6 over Kafka: a repeated fill commandId is acknowledged as a refusal; nothing is applied. */
    @Test
    void duplicateFillCommandIdOnKafkaIsAcknowledged() throws Exception {
        String orderId = createLiveOrder();
        String commandId = "F-K-" + UUID.randomUUID();
        double refusedBefore = consumed("ExecutionCreateCmd", "refused");

        send(orderId, fillCmd(commandId, orderId + "-E1", orderId));
        send(orderId, fillCmd(commandId, orderId + "-E2", orderId));
        send(orderId, fillCmd("F-SENTINEL-" + UUID.randomUUID(), orderId + "-E3", orderId));
        awaitUntil(() -> executionCount(orderId) == 2 && hasExecution(orderId, orderId + "-E3"),
                orderId + " sentinel fill applied");

        assertFalse(hasExecution(orderId, orderId + "-E2"), "the duplicate was not applied");
        assertEquals(refusedBefore + 1, consumed("ExecutionCreateCmd", "refused"));
        List<CommandLogEntry> entries = entries(orderId, commandId);
        assertEquals(List.of(CommandOutcome.APPLIED, CommandOutcome.REFUSED),
                entries.stream().map(CommandLogEntry::getOutcome).toList());
        assertTrue(entries.getLast().getReason().contains("Duplicate"), entries.getLast().getReason());
        // Nothing written for the duplicate: only E1 and E3 have fill events, and the outbox rows of a
        // fill are staged only with its event, in the same transaction.
        assertEquals(List.of(orderId + "-E1", orderId + "-E3"), events(orderId).stream()
                .filter(e -> e.getEvent() == Event.PARTIAL_FILL || e.getEvent() == Event.FILL)
                .map(OrderEvent::getExecId)
                .toList());
        assertEquals(0, deadLetterCount(orderId, Duration.ofSeconds(2)), "acknowledged, not dead-lettered");
    }

    /** AC-9: every fill event stores the command that reported it, over REST and over Kafka. */
    @Test
    void everyFillEventStoresItsCommand() throws Exception {
        String orderId = createLiveOrder();

        assertEquals(201, postFill(orderId + "-REST", orderId, "10", null));
        send(orderId, fillCmd("F-" + UUID.randomUUID(), orderId + "-KAFKA", orderId));
        awaitUntil(() -> executionCount(orderId) == 2, orderId + " two fills");

        List<OrderEvent> fills = events(orderId).stream()
                .filter(e -> e.getEvent() == Event.PARTIAL_FILL || e.getEvent() == Event.FILL)
                .toList();
        assertEquals(2, fills.size());
        for (OrderEvent fill : fills) {
            assertInstanceOf(ExecutionCreateCmd.class, fill.getTransaction(), "v" + fill.getVersion());
            assertEquals(fill.getExecId(), ((ExecutionCreateCmd) fill.getTransaction()).getExecution().getExecId());
        }
    }

    // --- helpers -------------------------------------------------------------------------------

    private static org.example.common.model.msg.ExecutionCreateCmd fillCmd(String commandId, String execId, String orderId) {
        return new org.example.common.model.msg.ExecutionCreateCmd(
                TestCommands.header(commandId), execution(execId, orderId, "10"));
    }

    private static Execution execution(String execId, String orderId, String lastQty) {
        return Execution.newBuilder()
                .setExecId(execId)
                .setOrderId(orderId)
                .setLastQty(new BigDecimal(lastQty).setScale(4, RoundingMode.HALF_UP))
                .setLastPx(new BigDecimal("170").setScale(4, RoundingMode.HALF_UP))
                .setExecType("F")
                .setLastMkt("XSIM")
                .setTransactTime(Instant.now())
                .build();
    }

    private List<OrderEvent> events(String orderId) {
        return orderEventRepository.findByOrderIdOrderByVersionAsc(orderId);
    }

    private List<CommandLogEntry> log(String orderId) {
        return commandLogRepository.findByOrderIdOrderByReceivedAtAscIdAsc(orderId);
    }

    private List<CommandLogEntry> entries(String orderId, String commandId) {
        return log(orderId).stream().filter(e -> commandId.equals(e.getCommandId())).toList();
    }

    private boolean hasExecution(String orderId, String execId) {
        return executionRepository.findByOrderIdAndExecId(orderId, execId).isPresent();
    }

    private double consumed(String type, String outcome) {
        var counter = meterRegistry.find("oms.commands.consumed").tag("type", type).tag("outcome", outcome).counter();
        return counter == null ? 0.0 : counter.count();
    }

    /** How many records are on commands.DLT under this key, after waiting up to {@code wait} for at least one. */
    private static int deadLetterCount(String key, Duration wait) {
        Map<String, Object> config = Map.of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers(),
                ConsumerConfig.GROUP_ID_CONFIG, "it-dlt-" + UUID.randomUUID(),
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest",
                ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
                ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, ByteArrayDeserializer.class);
        int count = 0;
        try (KafkaConsumer<String, byte[]> consumer = new KafkaConsumer<>(config)) {
            consumer.subscribe(List.of("commands.DLT"));
            long deadline = System.nanoTime() + wait.toNanos();
            while (count == 0 && System.nanoTime() < deadline) {
                for (ConsumerRecord<String, byte[]> record : consumer.poll(Duration.ofMillis(250))) {
                    if (key.equals(record.key())) {
                        count++;
                    }
                }
            }
            for (ConsumerRecord<String, byte[]> record : consumer.poll(Duration.ofSeconds(1))) {
                if (key.equals(record.key())) {
                    count++;
                }
            }
        }
        return count;
    }
}
