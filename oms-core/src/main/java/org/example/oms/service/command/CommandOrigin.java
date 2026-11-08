package org.example.oms.service.command;

import java.time.Instant;

import org.example.oms.model.CommandSource;

/**
 * Where and when a command entered the OMS, and who sent it (SPEC-0046).
 *
 * @param source the entry point
 * @param principal who sent it: the Kafka producer or the scheduler job; null on REST until
 *     authentication exists
 * @param receivedAt when it crossed the OMS boundary; also the SLA checkpoint
 */
public record CommandOrigin(CommandSource source, String principal, Instant receivedAt) {

    public static CommandOrigin rest(Instant receivedAt) {
        return new CommandOrigin(CommandSource.REST, null, receivedAt);
    }

    public static CommandOrigin kafka(String producer, Instant receivedAt) {
        return new CommandOrigin(CommandSource.KAFKA, producer, receivedAt);
    }

    public static CommandOrigin scheduler(String job, Instant receivedAt) {
        return new CommandOrigin(CommandSource.SCHEDULER, job, receivedAt);
    }
}
