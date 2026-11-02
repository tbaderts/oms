package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import org.example.common.model.msg.CommandHeader;
import org.example.common.model.msg.OrderAcceptCmd;
import org.example.common.model.State;
import org.example.common.model.OrdType;
import org.example.common.model.Side;
import org.example.oms.repository.OrderRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;

class CommandListenerKafkaIntegrationTest extends AbstractKafkaPostgresIntegrationTest {

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private org.example.oms.repository.OrderEventRepository orderEventRepository;

    @Autowired
    private ProducerFactory<Object, Object> producerFactory;

    @BeforeEach
    void cleanDatabase() {
        orderRepository.deleteAll();
        // The order is recreated at version 0 for each test, so its earlier events go too (SPEC-0027:
        // the next event's version is taken from the order).
        orderEventRepository.deleteAll(orderEventRepository.findByOrderIdOrderByVersionAsc("ORD-KAFKA-ACCEPT-1"));

        orderRepository.save(org.example.common.model.Order.builder()
            .orderId("ORD-KAFKA-ACCEPT-1")
            .sessionId("SES-KAFKA-ACCEPT-1")
            .clOrdId("CL-KAFKA-ACCEPT-1")
            .account("ACC-KAFKA")
            .symbol("AAPL")
            .ordType(OrdType.LIMIT)
            .side(Side.BUY)
            .orderQty(new BigDecimal("10.0000"))
            .price(new BigDecimal("100.25"))
            .cumQty(BigDecimal.ZERO)
            .leavesQty(new BigDecimal("10.0000"))
            .state(State.UNACK)
            .build());
    }

    @Test
        void kafkaOrderAcceptCommand_isConsumedAndTransitionsOrderToLive() throws Exception {
        String orderId = "ORD-KAFKA-ACCEPT-1";
        OrderAcceptCmd command = new OrderAcceptCmd(TestCommands.header(), orderId);

        KafkaTemplate<String, Object> kafkaTemplate = TestCommands.commandTemplate(producerFactory);
        kafkaTemplate.send("commands", orderId, command).get(10, TimeUnit.SECONDS);

        assertTrue(
            waitForCondition(
                () -> orderRepository.findByOrderId(orderId)
                    .map(order -> order.getState() == State.LIVE)
                    .orElse(false),
                10_000),
            "Expected order to transition to LIVE after consuming Kafka OrderAcceptCmd");
    }

    /** SPEC-0025 AC-7: the printed log lines of a command's processing name its ids. */
    @Test
    @ExtendWith(OutputCaptureExtension.class)
    void logLinesCarryCommandAndCorrelationId(CapturedOutput output) throws Exception {
        String orderId = "ORD-KAFKA-ACCEPT-1";
        String commandId = "cmd-log-" + UUID.randomUUID();
        String correlationId = "corr-log-" + UUID.randomUUID();
        CommandHeader header = TestCommands.header(commandId);
        header.setCorrelationId(correlationId);

        TestCommands.commandTemplate(producerFactory)
            .send("commands", orderId, new OrderAcceptCmd(header, orderId))
            .get(10, TimeUnit.SECONDS);

        assertTrue(
            waitForCondition(
                () -> output.getOut().lines().anyMatch(line -> line.contains("Processed OrderAcceptCmd")
                    && line.contains(commandId) && line.contains(correlationId)),
                10_000),
            "Expected the processed line to name commandId and correlationId");
    }

    private boolean waitForCondition(Check check, long timeoutMillis) throws InterruptedException {
        long started = System.currentTimeMillis();
        while (System.currentTimeMillis() - started < timeoutMillis) {
            if (check.eval()) {
                return true;
            }
            Thread.sleep(200);
        }
        return false;
    }

    @FunctionalInterface
    private interface Check {
        boolean eval();
    }
}
