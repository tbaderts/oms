package org.example.simulator.kafka;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import org.example.common.model.msg.CommandHeader;
import org.example.simulator.engine.Cause;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Builds the header every command carries (SPEC-0025) from the OMS message being answered.
 *
 * <p>The lifecycle answers keep the deterministic id the engine derives from the event they answer,
 * so a replayed event yields a duplicate oms-core refuses. Accepts and fills have no such id and
 * get a fresh UUID.
 */
@Component
public class CommandHeaders {

    static final String VERSION = "1.0.0";

    private final String producer;

    public CommandHeaders(@Value("${spring.application.name}") String producer) {
        this.producer = producer;
    }

    /** @param commandId the answer's own id, or null to generate one */
    public CommandHeader build(Cause cause, String commandId) {
        return CommandHeader.newBuilder()
                .setCommandId(commandId != null ? commandId : UUID.randomUUID().toString())
                .setCorrelationId(cause.rootOrderId() != null ? cause.rootOrderId() : cause.orderId())
                .setCausationId(cause.eventId() == null ? null : cause.orderId() + ":" + cause.eventId())
                .setSentAt(Instant.now().truncatedTo(ChronoUnit.MICROS))
                .setProducer(producer)
                .setVersion(VERSION)
                .build();
    }
}
