package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.concurrent.TimeUnit;

import org.example.common.model.msg.CommandMessage;
import org.example.common.model.msg.OrderAcceptCmd;
import org.example.common.model.State;
import org.example.common.model.OrdType;
import org.example.common.model.Side;
import org.example.oms.repository.OrderRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;

class CommandListenerKafkaIntegrationTest extends AbstractKafkaPostgresIntegrationTest {

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private ProducerFactory<Object, Object> producerFactory;

    @BeforeEach
    void cleanDatabase() {
        orderRepository.deleteAll();

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
        OrderAcceptCmd command = new OrderAcceptCmd("OrderAcceptCmd", "1.0", orderId);
        CommandMessage message = new CommandMessage(command);

        DefaultKafkaProducerFactory<String, CommandMessage> pf =
            new DefaultKafkaProducerFactory<>(producerFactory.getConfigurationProperties());
        KafkaTemplate<String, CommandMessage> kafkaTemplate = new KafkaTemplate<>(pf);
        kafkaTemplate.send("commands", orderId, message).get(10, TimeUnit.SECONDS);

        assertTrue(
            waitForCondition(
                () -> orderRepository.findByOrderId(orderId)
                    .map(order -> order.getState() == State.LIVE)
                    .orElse(false),
                10_000),
            "Expected order to transition to LIVE after consuming Kafka OrderAcceptCmd");
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
