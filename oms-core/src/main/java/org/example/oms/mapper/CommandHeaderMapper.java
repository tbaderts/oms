package org.example.oms.mapper;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import org.example.common.model.cmd.Command;
import org.example.common.model.msg.CommandHeader;
import org.springframework.stereotype.Component;

/**
 * Copies a Kafka command's header onto the command model (SPEC-0025), so the event log stores the
 * same identity, causality and send time for a command whether it came over Kafka or REST.
 *
 * <p>The command record carries no type field: its record name is the type, and the model class has
 * the same simple name, so the discriminator is taken from the model.
 */
@Component
public class CommandHeaderMapper {

    public <C extends Command> C apply(CommandHeader header, C command) {
        command.setType(command.getClass().getSimpleName());
        command.setVersion(header.getVersion());
        command.setCommandId(header.getCommandId());
        command.setCorrelationId(header.getCorrelationId());
        command.setCausationId(header.getCausationId());
        command.setExpectedVersion(header.getExpectedVersion());
        command.setSentAt(OffsetDateTime.ofInstant(header.getSentAt(), ZoneOffset.UTC));
        return command;
    }
}
