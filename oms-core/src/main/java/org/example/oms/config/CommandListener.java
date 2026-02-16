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
            log.warn("Received CommandMessage with null command payload");
            return;
        }

        try {
            if (command instanceof org.example.common.model.msg.OrderCreateCmd msgOrderCreateCmd) {
                OrderCreateCmd orderCreateCmd =
                        objectMapper.convertValue(msgOrderCreateCmd, OrderCreateCmd.class);
                var result = orderCreateCommandProcessor.process(orderCreateCmd);
                if (result.isSuccess()) {
                    log.info("Processed OrderCreateCmd from Kafka: orderId={}", result.getOrderId());
                } else {
                    log.warn(
                            "OrderCreateCmd processing failed from Kafka: {}",
                            result.getErrorMessage());
                }
                return;
            }

            if (command instanceof org.example.common.model.msg.ExecutionCreateCmd msgExecutionCreateCmd) {
                ExecutionCreateCmd executionCreateCmd =
                    objectMapper.convertValue(msgExecutionCreateCmd, ExecutionCreateCmd.class);
                var execution = orderMapper.toExecution(executionCreateCmd.getExecution());
                var result = executionCommandProcessor.process(execution);
                if (result.isSuccess()) {
                    log.info(
                            "Processed ExecutionCreateCmd from Kafka: execId={}, orderId={}",
                            result.getExecution().getExecID(),
                            result.getOrder().getOrderId());
                } else {
                    log.warn("ExecutionCreateCmd processing failed from Kafka");
                }
                return;
            }

            if (command instanceof org.example.common.model.msg.OrderAcceptCmd msgOrderAcceptCmd) {
                OrderAcceptCmd orderAcceptCmd =
                        new OrderAcceptCmd(msgOrderAcceptCmd.getOrderId(), msgOrderAcceptCmd.getType());
                var result = orderAcceptCommandProcessor.process(orderAcceptCmd);
                if (result.isSuccess()) {
                    log.info("Processed OrderAcceptCmd from Kafka: orderId={}", result.getOrderId());
                } else {
                    log.warn(
                            "OrderAcceptCmd processing failed from Kafka: {}",
                            result.getErrorMessage());
                }
                return;
            }
        } catch (RuntimeException ex) {
            log.error(
                    "Failed to process command from Kafka: type={}, error={}",
                    command.getClass().getSimpleName(),
                    ex.getMessage(),
                    ex);
            return;
        }

        log.warn("Received unsupported command type: {}", command.getClass().getName());
    }
}
