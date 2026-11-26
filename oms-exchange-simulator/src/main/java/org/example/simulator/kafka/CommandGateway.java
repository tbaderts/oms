package org.example.simulator.kafka;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutionException;

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
import org.example.simulator.engine.Instrument;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Sends the venue's answers to oms-core as commands on the commands topic: each the bare command
 * record, under its own Schema Registry subject, with the header built from the OMS message it
 * answers (SPEC-0025).
 *
 * <p>Every record is keyed by orderId, so all of one order's commands land on one partition and
 * oms-core applies them in the order they were sent: the ack always before the fills. The idempotent
 * producer keeps that order across its own retries.
 *
 * <p>Sends are asynchronous (SPEC-0077): the producer retries a retriable error for the error policy's
 * window ({@code delivery.timeout.ms}) without holding up the engine's single thread. A send that still
 * fails, or fails with an error that cannot succeed on a retry, is dead-lettered by
 * {@link CommandDeadLetterPublisher}. The gateway never throws.
 *
 * <p>Quantities and prices are set to scale 8, the scale of the Avro decimal fields (decimal(18,8),
 * SPEC-0039); Avro rejects a BigDecimal with more decimals than the schema.
 */
@Component
@Slf4j
public class CommandGateway implements CommandSink {

    private static final int DECIMAL_SCALE = 8; // decimal(18,8), the contract precision (SPEC-0039)
    private static final String EXEC_TYPE_TRADE = "F";
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final SimulatorProperties properties;
    private final CommandHeaders headers;
    private final CommandDeadLetterPublisher deadLetters;

    public CommandGateway(
            KafkaTemplate<String, Object> kafkaTemplate,
            SimulatorProperties properties,
            CommandHeaders headers,
            CommandDeadLetterPublisher deadLetters) {
        this.kafkaTemplate = kafkaTemplate;
        this.properties = properties;
        this.headers = headers;
        this.deadLetters = deadLetters;
    }

    @Override
    public void accept(Cause cause, String orderId) {
        send(orderId, new OrderAcceptCmd(headers.build(cause, null), orderId));
    }

    @Override
    public void fill(
            Cause cause,
            String orderId,
            Instrument instrument,
            String execId,
            BigDecimal lastQty,
            BigDecimal lastPx,
            BigDecimal cumQty,
            BigDecimal leavesQty) {
        Execution execution =
                Execution.newBuilder()
                        .setExecId(execId)
                        .setOrderId(orderId)
                        .setSymbol(instrument.symbol())
                        .setSecurityId(instrument.securityId())
                        .setSecurityIdSource(instrument.securityIdSource())
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

    /** Hands the command to the producer; its outcome is handled when the send settles. */
    CompletableFuture<Void> send(String orderId, SpecificRecord command) {
        String topic = properties.commandTopic();
        CompletableFuture<?> sent;
        try {
            sent = kafkaTemplate.send(topic, orderId, command);
        } catch (RuntimeException e) {
            sent = CompletableFuture.failedFuture(e);
        }
        // Off the producer's network thread, which completes the future: serializing and sending a dead
        // letter can block (registry, metadata) and would stall every other send meanwhile.
        return sent.handle((result, failure) -> failure)
                .thenComposeAsync(failure -> {
                    if (failure == null) {
                        log.debug("Sent {} for order {}", command.getClass().getSimpleName(), orderId);
                        return CompletableFuture.completedFuture(null);
                    }
                    return deadLetters.deadLetter(topic, orderId, command, unwrap(failure));
                }, AFTER_SEND);
    }

    /** Where a send's outcome is handled: one virtual thread each, never the producer's own thread. */
    private static final java.util.concurrent.Executor AFTER_SEND = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor();

    private static Throwable unwrap(Throwable failure) {
        Throwable cause = failure;
        while ((cause instanceof CompletionException || cause instanceof ExecutionException
                        || cause instanceof org.springframework.kafka.KafkaException)
                && cause.getCause() != null) {
            cause = cause.getCause();
        }
        return cause;
    }

    private static BigDecimal scaled(BigDecimal value) {
        return value == null ? null : value.setScale(DECIMAL_SCALE, RoundingMode.HALF_UP);
    }
}
