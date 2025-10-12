package org.example.oms.config;

import org.example.common.model.msg.CommandMessage;
import org.example.common.model.msg.QuoteRequestCreateCmd;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.messaging.Message;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
@ConditionalOnProperty(
        prefix = "kafka",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = false)
public class CommandListener {

    @KafkaListener(
            topics = "${kafka.command-topic}",
            containerFactory = "kafkaListenerContainerFactory",
            groupId = "${spring.kafka.consumer.group-id}")
    public void consume(Message<CommandMessage> message) {
        log.info("New message: {}", message.getPayload());
        Object command = message.getPayload().getCommand();
        if (command instanceof QuoteRequestCreateCmd quoteRequestCreateCmd) {
            log.info("Received QuoteRequestCreateCmd: {}", quoteRequestCreateCmd);
            // Process the QuoteRequestCreateCmd as needed
        } else {
            log.warn("Received unsupported command type: {}", command.getClass().getName());
        }
    }
}
