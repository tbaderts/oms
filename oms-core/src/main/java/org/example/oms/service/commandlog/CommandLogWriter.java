package org.example.oms.service.commandlog;

import java.time.Instant;

import org.example.common.model.cmd.Command;
import org.example.oms.model.CommandLogEntry;
import org.example.oms.model.CommandOutcome;
import org.example.oms.repository.CommandLogRepository;
import org.example.oms.service.OrderEventAppender;
import org.example.oms.service.command.CommandOrigin;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;

/**
 * Writes the command log (SPEC-0046).
 *
 * <p>An applied command is logged in its own transaction, so the row exists exactly when the change
 * committed. A refused or failed command is logged in a new transaction, because the command's
 * transaction rolls back. Losing one of those audit rows must not turn the command's answer into
 * another one, so a failure to write them is logged and counted, never thrown.
 */
@Component
@Slf4j
public class CommandLogWriter {

    static final String WRITE_FAILURES = "oms.command_log.write_failures";

    private final CommandLogRepository repository;
    private final TransactionTemplate ownTransaction;
    private final Counter writeFailures;

    public CommandLogWriter(
            CommandLogRepository repository, PlatformTransactionManager transactionManager, MeterRegistry meterRegistry) {
        this.repository = repository;
        this.ownTransaction = new TransactionTemplate(transactionManager);
        this.ownTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.writeFailures = Counter.builder(WRITE_FAILURES)
                .description("Command log rows for refused or failed commands that could not be written")
                .register(meterRegistry);
    }

    /** Logs an applied command, in the command's transaction. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void applied(Command command, CommandOrigin origin, String orderId, Long eventVersion) {
        repository.save(entry(command, origin, orderId, CommandOutcome.APPLIED, null, eventVersion));
    }

    /** Logs a refused command in a transaction of its own; never throws. */
    public void refused(Command command, CommandOrigin origin, String orderId, String reason) {
        writeOnItsOwn(entry(command, origin, orderId, CommandOutcome.REFUSED, reason, null));
    }

    /** Logs a failed command in a transaction of its own; never throws. */
    public void failed(Command command, CommandOrigin origin, String orderId, String reason) {
        writeOnItsOwn(entry(command, origin, orderId, CommandOutcome.FAILED, reason, null));
    }

    private void writeOnItsOwn(CommandLogEntry entry) {
        try {
            ownTransaction.executeWithoutResult(status -> repository.save(entry));
        } catch (RuntimeException e) {
            writeFailures.increment();
            log.error(
                    "Could not log {} {} for order {} (commandId {})",
                    entry.getOutcome(),
                    entry.getType(),
                    entry.getOrderId(),
                    entry.getCommandId(),
                    e);
        }
    }

    private static CommandLogEntry entry(
            Command command, CommandOrigin origin, String orderId, CommandOutcome outcome, String reason, Long eventVersion) {
        return CommandLogEntry.builder()
                .commandId(OrderEventAppender.commandIdOf(command))
                .type(typeOf(command))
                .orderId(orderId)
                .receivedAt(origin.receivedAt() != null ? origin.receivedAt() : Instant.now())
                .source(origin.source())
                .principal(origin.principal())
                .outcome(outcome)
                .reason(truncate(reason))
                .eventVersion(eventVersion)
                .loggedAt(Instant.now())
                .build();
    }

    /** The command's declared type, or its class name when it was built without one. */
    public static String typeOf(Command command) {
        if (command == null) {
            return "unknown";
        }
        String type = command.getType();
        return type != null && !type.isBlank() ? type : command.getClass().getSimpleName();
    }

    private static String truncate(String reason) {
        if (reason == null || reason.length() <= CommandLogEntry.MAX_REASON_LENGTH) {
            return reason;
        }
        return reason.substring(0, CommandLogEntry.MAX_REASON_LENGTH);
    }
}
