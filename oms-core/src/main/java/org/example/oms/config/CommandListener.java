package org.example.oms.config;

import org.example.common.model.cmd.ExecutionCreateCmd;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.msg.CommandMessage;
import org.example.oms.mapper.OrderMapper;
import org.example.oms.service.command.OrderAcceptCommandProcessor;
import org.example.oms.service.command.OrderCreateCommandProcessor;
import org.example.oms.service.execution.ExecutionCommandProcessor;
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

    @KafkaListener(
            topics = "${kafka.command-topic}",
            containerFactory = "kafkaListenerContainerFactory",
            groupId = "${spring.kafka.consumer.group-id}")
    public void consume(Message<CommandMessage> message) {
        log.info("New message: {}", message.getPayload());
        Object command = message.getPayload().getCommand();

        if (command == null) {
            // Nothing to retry and nothing to process; acknowledge and move on.
            log.warn("Received CommandMessage with null command payload");
            return;
        }

        switch (command) {
            case org.example.common.model.msg.OrderCreateCmd msgCmd -> handleOrderCreate(msgCmd);
            case org.example.common.model.msg.ExecutionCreateCmd msgCmd -> handleExecutionCreate(msgCmd);
            case org.example.common.model.msg.OrderAcceptCmd msgCmd -> handleOrderAccept(msgCmd);
            default ->
                    // An unknown command type is a contract problem, not a transient fault. Throwing
                    // sends it to the DLT rather than dropping it, which is what happened before.
                    throw new IllegalArgumentException(
                            "Unsupported command type: " + command.getClass().getName());
        }
    }

    private void handleOrderCreate(org.example.common.model.msg.OrderCreateCmd msgCmd) {
        OrderCreateCmd cmd = objectMapper.convertValue(msgCmd, OrderCreateCmd.class);
        var result = orderCreateCommandProcessor.process(cmd);

        if (result.isSuccess()) {
            log.info("Processed OrderCreateCmd from Kafka: orderId={}", result.getOrderId());
        } else {
            log.warn("OrderCreateCmd rejected: {}", result.getErrorMessage());
        }
    }

    private void handleExecutionCreate(org.example.common.model.msg.ExecutionCreateCmd msgCmd) {
        ExecutionCreateCmd cmd = objectMapper.convertValue(msgCmd, ExecutionCreateCmd.class);
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

    private void handleOrderAccept(org.example.common.model.msg.OrderAcceptCmd msgCmd) {
        OrderAcceptCmd cmd = new OrderAcceptCmd(msgCmd.getOrderId(), msgCmd.getType());
        var result = orderAcceptCommandProcessor.process(cmd);

        if (result.isSuccess()) {
            log.info("Processed OrderAcceptCmd from Kafka: orderId={}", result.getOrderId());
        } else {
            log.warn("OrderAcceptCmd rejected: {}", result.getErrorMessage());
        }
    }
}
