package org.example.simulator.kafka;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.apache.avro.specific.SpecificRecord;
import org.example.common.model.msg.Execution;
import org.example.common.model.msg.ExecutionCreateCmd;
import org.example.common.model.msg.OrderAcceptCmd;
import org.example.common.model.msg.OrderCancelCmd;
import org.example.common.model.msg.OrderCancelRejectCmd;
import org.example.common.model.msg.OrderRejectCmd;
import org.example.simulator.config.SimulatorProperties;
import org.example.simulator.engine.Cause;
import org.example.simulator.engine.CommandSink;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Sends the venue's answers to oms-core as commands on the commands topic: each the bare command
 * record, under its own Schema Registry subject, with the header built from the OMS message it
 * answers (SPEC-0025).
 *
 * <p>Every record is keyed by orderId, so all of one order's commands land on one partition and
 * oms-core applies them in the order they were sent: the ack always before the fills. Sends block
 * until the broker acknowledges them, which keeps that order even across retries.
 *
 * <p>Quantities and prices are set to scale 8, the scale of the Avro decimal fields (decimal(18,8),
 * SPEC-0039); Avro rejects a BigDecimal with more decimals than the schema.
 */
@Component
@Slf4j
public class CommandGateway implements CommandSink {

    private static final int DECIMAL_SCALE = 8; // decimal(18,8), the contract precision (SPEC-0039)
    private static final String EXEC_TYPE_TRADE = "F";
    private static final long SEND_TIMEOUT_SECONDS = 10;

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final SimulatorProperties properties;
    private final CommandHeaders headers;

    public CommandGateway(
            KafkaTemplate<String, Object> kafkaTemplate, SimulatorProperties properties, CommandHeaders headers) {
        this.kafkaTemplate = kafkaTemplate;
        this.properties = properties;
        this.headers = headers;
    }

    @Override
    public void accept(Cause cause, String orderId) {
        send(orderId, new OrderAcceptCmd(headers.build(cause, null), orderId));
    }

    @Override
    public void fill(
            Cause cause,
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
        send(orderId, new ExecutionCreateCmd(headers.build(cause, null), execution));
    }

    @Override
    public void reject(Cause cause, String orderId, String reason, String commandId) {
        send(orderId, new OrderRejectCmd(headers.build(cause, commandId), orderId, reason));
    }

    @Override
    public void cancel(Cause cause, String orderId, String reason, String commandId) {
        send(orderId, new OrderCancelCmd(headers.build(cause, commandId), orderId, reason));
    }

    @Override
    public void cancelReject(Cause cause, String orderId, String reason, String commandId) {
        send(orderId, new OrderCancelRejectCmd(headers.build(cause, commandId), orderId, reason));
    }

    private void send(String orderId, SpecificRecord command) {
        try {
            kafkaTemplate
                    .send(properties.commandTopic(), orderId, command)
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
