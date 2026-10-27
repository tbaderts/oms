package org.example.simulator.kafka;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.example.common.model.msg.CommandMessage;
import org.example.common.model.msg.Execution;
import org.example.common.model.msg.ExecutionCreateCmd;
import org.example.common.model.msg.OrderAcceptCmd;
import org.example.common.model.msg.OrderCancelCmd;
import org.example.common.model.msg.OrderCancelRejectCmd;
import org.example.common.model.msg.OrderRejectCmd;
import org.example.simulator.config.SimulatorProperties;
import org.example.simulator.engine.CommandSink;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Sends the venue's answers to oms-core as commands on the commands topic.
 *
 * <p>Every record is keyed by orderId, so all of one order's commands land on one partition and
 * oms-core applies them in the order they were sent: the ack always before the fills. Sends block
 * until the broker acknowledges them, which keeps that order even across retries.
 *
 * <p>Quantities and prices are set to scale 4, the scale of the Avro decimal fields; Avro rejects a
 * BigDecimal whose scale differs from the schema's.
 */
@Component
@Slf4j
public class CommandGateway implements CommandSink {

    static final String VERSION = "1.0.0";
    private static final int DECIMAL_SCALE = 4;
    private static final String EXEC_TYPE_TRADE = "F";
    private static final long SEND_TIMEOUT_SECONDS = 10;

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final SimulatorProperties properties;

    public CommandGateway(KafkaTemplate<String, Object> kafkaTemplate, SimulatorProperties properties) {
        this.kafkaTemplate = kafkaTemplate;
        this.properties = properties;
    }

    @Override
    public void accept(String orderId) {
        send(orderId, new OrderAcceptCmd("OrderAcceptCmd", VERSION, orderId));
    }

    @Override
    public void fill(
            String orderId,
            String execId,
            BigDecimal lastQty,
            BigDecimal lastPx,
            BigDecimal cumQty,
            BigDecimal leavesQty) {
        Execution execution =
                Execution.newBuilder()
                        .setExecId(execId)
                        .setOrderId(orderId)
                        .setLastQty(scaled(lastQty))
                        .setLastPx(scaled(lastPx))
                        .setCumQty(scaled(cumQty))
                        .setLeavesQty(scaled(leavesQty))
                        .setExecType(EXEC_TYPE_TRADE)
                        .setLastMkt(properties.lastMkt())
                        .setTransactTime(Instant.now())
                        .build();
        send(orderId, new ExecutionCreateCmd("ExecutionCreateCmd", VERSION, execution));
    }

    @Override
    public void reject(String orderId, String reason, String commandId) {
        send(orderId, new OrderRejectCmd("OrderRejectCmd", VERSION, orderId, reason, commandId));
    }

    @Override
    public void cancel(String orderId, String reason, String commandId) {
        send(orderId, new OrderCancelCmd("OrderCancelCmd", VERSION, orderId, reason, commandId));
    }

    @Override
    public void cancelReject(String orderId, String reason, String commandId) {
        send(orderId, new OrderCancelRejectCmd("OrderCancelRejectCmd", VERSION, orderId, reason, commandId));
    }

    private void send(String orderId, Object command) {
        try {
            kafkaTemplate
                    .send(properties.commandTopic(), orderId, new CommandMessage(command))
                    .get(SEND_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            log.debug("Sent {} for order {}", command.getClass().getSimpleName(), orderId);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted sending command for order " + orderId, e);
        } catch (ExecutionException | TimeoutException e) {
            throw new IllegalStateException(
                    "Failed to send " + command.getClass().getSimpleName() + " for order " + orderId, e);
        }
    }

    private static BigDecimal scaled(BigDecimal value) {
        return value == null ? null : value.setScale(DECIMAL_SCALE, RoundingMode.HALF_UP);
    }
}
