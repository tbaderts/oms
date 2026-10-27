package org.example.oms.config;

import java.time.Instant;

import org.example.common.model.cmd.Command;
import org.example.common.model.cmd.ExecutionCreateCmd;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.model.cmd.OrderCancelCmd;
import org.example.common.model.cmd.OrderCancelRejectCmd;
import org.example.common.model.cmd.OrderCancelRequestCmd;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.OrderRejectCmd;
import org.example.common.model.msg.CommandMessage;
import org.example.oms.mapper.OrderMapper;
import org.example.oms.service.command.OrderAcceptCommandProcessor;
import org.example.oms.service.command.OrderCreateCommandProcessor;
import org.example.oms.service.execution.ExecutionCommandProcessor;
import org.example.oms.service.lifecycle.OrderLifecycleCommandProcessor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.messaging.Message;
import org.springframework.stereotype.Component;

import tools.jackson.databind.ObjectMapper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Consumes commands from Kafka.
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

    private final ObjectMapper objectMapper;
    private final OrderMapper orderMapper;
    private final OrderCreateCommandProcessor orderCreateCommandProcessor;
    private final OrderAcceptCommandProcessor orderAcceptCommandProcessor;
    private final ExecutionCommandProcessor executionCommandProcessor;
    private final OrderLifecycleCommandProcessor orderLifecycleCommandProcessor;

    @KafkaListener(
            topics = "${kafka.command-topic}",
            containerFactory = "kafkaListenerContainerFactory",
            groupId = "${spring.kafka.consumer.group-id}")
    public void consume(Message<CommandMessage> message) {
        // The SLA clock starts on delivery, which for a Kafka command is the boundary we control.
        // It therefore includes any consumer lag, which is the honest reading: an order sitting in a
        // partition is just as late as one sitting in our code.
        Instant receivedTime = Instant.now();
        log.info("New message: {}", message.getPayload());
        Object command = message.getPayload().getCommand();

        if (command == null) {
            // Nothing to retry and nothing to process; acknowledge and move on.
            log.warn("Received CommandMessage with null command payload");
            return;
        }

        switch (command) {
            case org.example.common.model.msg.OrderCreateCmd msgCmd ->
                    handleOrderCreate(msgCmd, receivedTime);
            case org.example.common.model.msg.ExecutionCreateCmd msgCmd -> handleExecutionCreate(msgCmd);
            case org.example.common.model.msg.OrderAcceptCmd msgCmd ->
                    handleOrderAccept(msgCmd, receivedTime);
            case org.example.common.model.msg.OrderRejectCmd msgCmd ->
                    handleLifecycle(
                            new OrderRejectCmd(msgCmd.getOrderId(), msgCmd.getType())
                                    .version(msgCmd.getVersion())
                                    .commandId(msgCmd.getCommandId())
                                    .text(msgCmd.getText()),
                            receivedTime);
            case org.example.common.model.msg.OrderCancelCmd msgCmd ->
                    handleLifecycle(
                            new OrderCancelCmd(msgCmd.getOrderId(), msgCmd.getType())
                                    .version(msgCmd.getVersion())
                                    .commandId(msgCmd.getCommandId())
                                    .text(msgCmd.getText()),
                            receivedTime);
            case org.example.common.model.msg.OrderCancelRequestCmd msgCmd ->
                    handleLifecycle(
                            new OrderCancelRequestCmd(msgCmd.getOrderId(), msgCmd.getType())
                                    .version(msgCmd.getVersion())
                                    .commandId(msgCmd.getCommandId()),
                            receivedTime);
            case org.example.common.model.msg.OrderCancelRejectCmd msgCmd ->
                    handleLifecycle(
                            new OrderCancelRejectCmd(msgCmd.getOrderId(), msgCmd.getType())
                                    .version(msgCmd.getVersion())
                                    .commandId(msgCmd.getCommandId())
                                    .text(msgCmd.getText()),
                            receivedTime);
            default ->
                    // An unknown command type is a contract problem, not a transient fault. Throwing
                    // sends it to the DLT rather than dropping it, which is what happened before.
                    throw new IllegalArgumentException(
                            "Unsupported command type: " + command.getClass().getName());
        }
    }

    private void handleOrderCreate(
            org.example.common.model.msg.OrderCreateCmd msgCmd, Instant receivedTime) {
        OrderCreateCmd cmd = objectMapper.convertValue(msgCmd, OrderCreateCmd.class);
        var result = orderCreateCommandProcessor.process(cmd, receivedTime);

        if (result.isSuccess()) {
            log.info("Processed OrderCreateCmd from Kafka: orderId={}", result.getOrderId());
        } else {
            log.warn("OrderCreateCmd rejected: {}", result.getErrorMessage());
        }
    }

    private void handleExecutionCreate(org.example.common.model.msg.ExecutionCreateCmd msgCmd) {
        // Mapped explicitly: Jackson's convertValue fails on Avro records (getSchema()).
        ExecutionCreateCmd cmd =
                new ExecutionCreateCmd()
                        .type(msgCmd.getType())
                        .version(msgCmd.getVersion())
                        .execution(orderMapper.toCmdExecution(msgCmd.getExecution()));
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
    }

    private void handleOrderAccept(
            org.example.common.model.msg.OrderAcceptCmd msgCmd, Instant receivedTime) {
        OrderAcceptCmd cmd = new OrderAcceptCmd(msgCmd.getOrderId(), msgCmd.getType());
        var result = orderAcceptCommandProcessor.process(cmd, receivedTime);

        if (result.isSuccess()) {
            log.info("Processed OrderAcceptCmd from Kafka: orderId={}", result.getOrderId());
        } else {
            log.warn("OrderAcceptCmd rejected: {}", result.getErrorMessage());
        }
    }

    private void handleLifecycle(Command cmd, Instant receivedTime) {
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
    }
}
