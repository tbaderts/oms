package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.cmd.OrdType;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.Side;
import org.example.common.model.cmd.TimeInForce;
import org.example.common.model.msg.CommandMessage;
import org.example.common.model.msg.Execution;
import org.example.common.model.msg.ExecutionCreateCmd;
import org.example.common.model.msg.OrderAcceptCmd;
import org.example.oms.repository.ExecutionRepository;
import org.example.oms.repository.OrderRepository;
import org.example.oms.service.command.OrderCreateCommandProcessor;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * Order and fill helpers for the projection tests (SPEC-0020): create a live order, apply fills over
 * REST or Kafka, wait for them.
 */
abstract class AbstractFillFlowIntegrationTest extends AbstractKafkaPostgresIntegrationTest {

    static final Duration TIMEOUT = Duration.ofSeconds(15);

    @Autowired OrderCreateCommandProcessor orderCreateCommandProcessor;
    @Autowired OrderRepository orderRepository;
    @Autowired ExecutionRepository executionRepository;
    @Autowired ProducerFactory<Object, Object> producerFactory;
    @Autowired WebApplicationContext webApplicationContext;

    private KafkaTemplate<String, CommandMessage> commands;

    @BeforeEach
    void setUpCommands() {
        commands = new KafkaTemplate<>(new DefaultKafkaProducerFactory<>(producerFactory.getConfigurationProperties()));
    }

    String createLiveOrder() throws Exception {
        return createLiveOrder(null, "ACC-PRJ");
    }

    /** Creates a limit order for 100 (optionally under a root) and waits until it is LIVE. */
    String createLiveOrder(String rootOrderId, String account) throws Exception {
        var order = new org.example.common.model.cmd.Order()
                .clOrdId("CL-" + UUID.randomUUID())
                .sessionId("SES-PRJ")
                .account(account)
                .symbol("AAPL")
                .side(Side.BUY)
                .ordType(OrdType.LIMIT)
                .price(new BigDecimal("170"))
                .orderQty(new BigDecimal("100"))
                .timeInForce(TimeInForce.DAY)
                .rootOrderId(rootOrderId)
                .parentOrderId(rootOrderId);
        var result = orderCreateCommandProcessor.process(new OrderCreateCmd().type("OrderCreateCmd").order(order), Instant.now());
        assertTrue(result.isSuccess(), result.getErrorMessage());
        String orderId = result.getOrderId();
        send(orderId, new OrderAcceptCmd("OrderAcceptCmd", "1.0.0", orderId));
        awaitUntil(() -> state(orderId) == State.LIVE, orderId + " LIVE");
        return orderId;
    }

    /** Posts a fill over REST and returns the HTTP status. */
    int postFill(String execId, String orderId, String lastQty, String transactTime) throws Exception {
        return mockMvc()
                .perform(post("/api/command/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"ExecutionCreateCmd\",\"version\":\"1.0.0\",\"execution\":{"
                                + "\"execId\":\"" + execId + "\",\"orderId\":\"" + orderId + "\","
                                + "\"lastQty\":" + lastQty + ",\"lastPx\":170,"
                                + "\"execType\":\"F\",\"lastMkt\":\"XSIM\""
                                + (transactTime != null ? ",\"transactTime\":\"" + transactTime + "\"" : "")
                                + "}}"))
                .andReturn()
                .getResponse()
                .getStatus();
    }

    static ExecutionCreateCmd fill(String execId, String orderId, String lastQty) {
        var execution = Execution.newBuilder()
                .setExecId(execId)
                .setOrderId(orderId)
                .setLastQty(new BigDecimal(lastQty).setScale(4, RoundingMode.HALF_UP))
                .setLastPx(new BigDecimal("170").setScale(4, RoundingMode.HALF_UP))
                .setExecType("F")
                .setLastMkt("XSIM")
                .setTransactTime(Instant.now())
                .build();
        return new ExecutionCreateCmd("ExecutionCreateCmd", "1.0.0", execution);
    }

    void send(String key, Object command) throws Exception {
        commands.send("commands", key, new CommandMessage(command)).get(10, TimeUnit.SECONDS);
    }

    long executionCount(String orderId) {
        return executionRepository.findAll().stream().filter(e -> orderId.equals(e.getOrderId())).count();
    }

    State state(String orderId) {
        return orderRepository.findByOrderId(orderId).map(Order::getState).orElse(null);
    }

    MockMvc mockMvc() {
        return MockMvcBuilders.webAppContextSetup(webApplicationContext).build();
    }

    static void awaitUntil(BooleanSupplier condition, String description) throws InterruptedException {
        long deadline = System.nanoTime() + TIMEOUT.toNanos();
        while (System.nanoTime() < deadline) {
            if (condition.getAsBoolean()) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("Timed out after " + TIMEOUT + " waiting for: " + description);
    }
}
