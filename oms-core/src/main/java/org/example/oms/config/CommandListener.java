package org.example.oms.config;

import java.time.Instant;

import org.apache.avro.Schema;
import org.apache.avro.specific.SpecificRecord;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.example.common.model.cmd.Command;
import org.example.common.model.cmd.ExecutionCreateCmd;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.model.cmd.OrderCancelCmd;
import org.example.common.model.cmd.OrderCancelRejectCmd;
import org.example.common.model.cmd.OrderCancelRequestCmd;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.OrderCloseCmd;
import org.example.common.model.cmd.OrderExpireCmd;
import org.example.common.model.cmd.OrderRejectCmd;
import org.example.common.model.msg.CommandHeader;
import org.example.oms.mapper.CommandHeaderMapper;
import org.example.oms.mapper.OrderMapper;
import org.example.oms.service.command.OrderAcceptCommandProcessor;
import org.example.oms.service.command.OrderCreateCommandProcessor;
import org.example.oms.service.execution.ExecutionCommandProcessor;
import org.example.oms.service.lifecycle.OrderLifecycleCommandProcessor;
import org.slf4j.MDC;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Consumes commands from Kafka.
 *
 * <p>Each value is a bare command record whose record name is its type and whose first field is
 * the shared {@code CommandHeader} (SPEC-0025). The value arrives as bytes and is decoded here, so
 * a record that cannot be handled reaches the dead-letter topic with its original bytes.
 *
 * <p>This listener deliberately does not catch exceptions. It used to catch {@code RuntimeException}
 * and return normally, which let the container commit the offset for a command that had failed — the
 * command was recorded as consumed and lost. Failing loudly hands the decision to the container's
 * error handler, which retries and then routes to the dead-letter topic.
 *
 * <p>Rejections that are not faults — a duplicate order, an invalid state transition — are reported
 * by the processors as unsuccessful results, not exceptions, and are logged and acknowledged here.
 * Retrying those would never succeed.
 *
 * @see KafkaConsumerConfig#commandErrorHandler
 */
@Component
@Slf4j
@RequiredArgsConstructor
@ConditionalOnProperty(
        prefix = "kafka",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = false)
public class CommandListener {

    private final OrderMapper orderMapper;
    private final CommandHeaderMapper commandHeaderMapper;
    private final CommandDecoder commandDecoder;
    private final OrderCreateCommandProcessor orderCreateCommandProcessor;
    private final OrderAcceptCommandProcessor orderAcceptCommandProcessor;
    private final ExecutionCommandProcessor executionCommandProcessor;
    private final OrderLifecycleCommandProcessor orderLifecycleCommandProcessor;
    private final MeterRegistry meterRegistry;

    static final String COMMANDS_CONSUMED = "oms.commands.consumed";
    static final String OUTCOME_APPLIED = "applied";
    static final String OUTCOME_REFUSED = "refused";
    static final String OUTCOME_FAILED = "failed";
    /** The type tag of a record that could not be decoded, so has no type. */
    static final String UNDECODABLE = "undecodable";
    static final String MDC_COMMAND_ID = "commandId";
    static final String MDC_CORRELATION_ID = "correlationId";

    @KafkaListener(
            topics = "${kafka.command-topic}",
            containerFactory = "kafkaListenerContainerFactory",
            groupId = "${spring.kafka.consumer.group-id}")
    public void consume(ConsumerRecord<String, byte[]> record) {
        // The SLA clock starts on delivery, which for a Kafka command is the boundary we control.
        // It therefore includes any consumer lag, which is the honest reading: an order sitting in a
        // partition is just as late as one sitting in our code.
        Instant receivedTime = Instant.now();
        SpecificRecord command;
        try {
            command = commandDecoder.decode(record.topic(), record.value());
        } catch (UndecodableCommandException e) {
            count(UNDECODABLE, OUTCOME_FAILED);
            throw e;
        }
        handle(command, receivedTime);
    }

    /**
     * Processes one decoded command record with its ids in the MDC, and counts the outcome:
     * applied, refused (an unsuccessful result, acknowledged) or failed (an exception, retried or
     * dead-lettered; counted per attempt).
     */
    void handle(SpecificRecord command, Instant receivedTime) {
        String type = command.getClass().getSimpleName();
        CommandHeader header = headerOf(command);
        if (header != null) {
            MDC.put(MDC_COMMAND_ID, header.getCommandId());
            MDC.put(MDC_CORRELATION_ID, header.getCorrelationId());
        }
        try {
            log.info("New command: {}", command);
            count(type, dispatch(command, receivedTime) ? OUTCOME_APPLIED : OUTCOME_REFUSED);
        } catch (RuntimeException e) {
            count(type, OUTCOME_FAILED);
            throw e;
        } finally {
            MDC.remove(MDC_COMMAND_ID);
            MDC.remove(MDC_CORRELATION_ID);
        }
    }

    /** @return whether the command was applied; false when its processor refused it */
    private boolean dispatch(SpecificRecord command, Instant receivedTime) {
        return switch (command) {
            case org.example.common.model.msg.OrderCreateCmd msgCmd ->
                    handleOrderCreate(msgCmd, receivedTime);
            case org.example.common.model.msg.ExecutionCreateCmd msgCmd -> handleExecutionCreate(msgCmd);
            case org.example.common.model.msg.OrderAcceptCmd msgCmd ->
                    handleOrderAccept(msgCmd, receivedTime);
            case org.example.common.model.msg.OrderRejectCmd msgCmd ->
                    handleLifecycle(
                            commandHeaderMapper.apply(
                                    msgCmd.getHeader(),
                                    new OrderRejectCmd().orderId(msgCmd.getOrderId()).text(msgCmd.getText())),
                            receivedTime);
            case org.example.common.model.msg.OrderCancelCmd msgCmd ->
                    handleLifecycle(
                            commandHeaderMapper.apply(
                                    msgCmd.getHeader(),
                                    new OrderCancelCmd().orderId(msgCmd.getOrderId()).text(msgCmd.getText())),
                            receivedTime);
            case org.example.common.model.msg.OrderCancelRequestCmd msgCmd ->
                    handleLifecycle(
                            commandHeaderMapper.apply(
                                    msgCmd.getHeader(), new OrderCancelRequestCmd().orderId(msgCmd.getOrderId())),
                            receivedTime);
            case org.example.common.model.msg.OrderCancelRejectCmd msgCmd ->
                    handleLifecycle(
                            commandHeaderMapper.apply(
                                    msgCmd.getHeader(),
                                    new OrderCancelRejectCmd().orderId(msgCmd.getOrderId()).text(msgCmd.getText())),
                            receivedTime);
            case org.example.common.model.msg.OrderExpireCmd msgCmd ->
                    handleLifecycle(
                            commandHeaderMapper.apply(
                                    msgCmd.getHeader(),
                                    new OrderExpireCmd().orderId(msgCmd.getOrderId()).text(msgCmd.getText())),
                            receivedTime);
            case org.example.common.model.msg.OrderCloseCmd msgCmd ->
                    handleLifecycle(
                            commandHeaderMapper.apply(
                                    msgCmd.getHeader(),
                                    new OrderCloseCmd().orderId(msgCmd.getOrderId()).text(msgCmd.getText())),
                            receivedTime);
            default ->
                    // A command type without a handler is a contract problem, not a transient fault.
                    // Throwing sends it to the DLT with its original bytes rather than dropping it.
                    throw new IllegalArgumentException(
                            "Unsupported command type: " + command.getClass().getName());
        };
    }

    /** Every command record starts with its header (SPEC-0025); null for any other record. */
    private static CommandHeader headerOf(SpecificRecord command) {
        Schema.Field field = command.getSchema().getField("header");
        return field != null && command.get(field.pos()) instanceof CommandHeader header ? header : null;
    }

    private void count(String type, String outcome) {
        meterRegistry.counter(COMMANDS_CONSUMED, "type", type, "outcome", outcome).increment();
    }

    private boolean handleOrderCreate(
            org.example.common.model.msg.OrderCreateCmd msgCmd, Instant receivedTime) {
        // Mapped explicitly: Jackson's convertValue fails on Avro records (getSchema()).
        OrderCreateCmd cmd =
                commandHeaderMapper.apply(
                        msgCmd.getHeader(), new OrderCreateCmd().order(orderMapper.toCmdOrder(msgCmd.getOrder())));
        var result = orderCreateCommandProcessor.process(cmd, receivedTime);

        if (result.isSuccess()) {
            log.info("Processed OrderCreateCmd from Kafka: orderId={}", result.getOrderId());
        } else {
            log.warn("OrderCreateCmd rejected: {}", result.getErrorMessage());
        }
        return result.isSuccess();
    }

    private boolean handleExecutionCreate(org.example.common.model.msg.ExecutionCreateCmd msgCmd) {
        // Mapped explicitly: Jackson's convertValue fails on Avro records (getSchema()).
        ExecutionCreateCmd cmd =
                commandHeaderMapper.apply(
                        msgCmd.getHeader(),
                        new ExecutionCreateCmd().execution(orderMapper.toCmdExecution(msgCmd.getExecution())));
        var execution = orderMapper.toExecution(cmd.getExecution());
        var result = executionCommandProcessor.process(execution, cmd);

        if (result.isSuccess()) {
            log.info(
                    "Processed ExecutionCreateCmd from Kafka: execId={}, orderId={}",
                    result.getExecution().getExecID(),
                    result.getOrder().getOrderId());
        } else {
            log.warn(
                    "ExecutionCreateCmd rejected: execId={}",
                    cmd.getExecution() != null ? cmd.getExecution().getExecId() : null);
        }
        return result.isSuccess();
    }

    private boolean handleOrderAccept(
            org.example.common.model.msg.OrderAcceptCmd msgCmd, Instant receivedTime) {
        OrderAcceptCmd cmd =
                commandHeaderMapper.apply(msgCmd.getHeader(), new OrderAcceptCmd().orderId(msgCmd.getOrderId()));
        var result = orderAcceptCommandProcessor.process(cmd, receivedTime);

        if (result.isSuccess()) {
            log.info("Processed OrderAcceptCmd from Kafka: orderId={}", result.getOrderId());
        } else {
            log.warn("OrderAcceptCmd rejected: {}", result.getErrorMessage());
        }
        return result.isSuccess();
    }

    private boolean handleLifecycle(Command cmd, Instant receivedTime) {
        var result = orderLifecycleCommandProcessor.process(cmd, receivedTime);

        if (result.isSuccess()) {
            log.info(
                    "Processed {} from Kafka: orderId={}",
                    cmd.getClass().getSimpleName(),
                    result.getOrderId());
        } else {
            // Refusals include redelivered duplicates; acknowledging them is what keeps the
            // command idempotent rather than endlessly retried.
            log.warn(
                    "{} refused: orderId={}, reason={}",
                    cmd.getClass().getSimpleName(),
                    result.getOrderId(),
                    result.getErrorMessage());
        }
        return result.isSuccess();
    }
}
