package org.example.oms.service.command;

import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Where the command being applied entered the OMS, for the code that records its event
 * (SPEC-0049). {@link CommandDispatcher#dispatch} binds the command's {@link CommandOrigin} for the
 * duration of the dispatch; {@code OrderEventAppender} reads it to record the event's principal and
 * source. Null when a processor is called without the dispatcher, as some tests do.
 *
 * <p>Bound like a transaction resource, on the dispatching thread. A dispatch nested in another
 * (a scheduler job dispatching per order inside its own transaction) binds its own origin and
 * restores the outer one when it returns.
 */
public final class CommandContext {

    private static final Object KEY = CommandContext.class;

    private CommandContext() {}

    /** Binds the origin and returns the one it replaces, to hand back to {@link #restore}. */
    static CommandOrigin bind(CommandOrigin origin) {
        CommandOrigin previous = (CommandOrigin) TransactionSynchronizationManager.unbindResourceIfPossible(KEY);
        if (origin != null) {
            TransactionSynchronizationManager.bindResource(KEY, origin);
        }
        return previous;
    }

    static void restore(CommandOrigin previous) {
        TransactionSynchronizationManager.unbindResourceIfPossible(KEY);
        if (previous != null) {
            TransactionSynchronizationManager.bindResource(KEY, previous);
        }
    }

    /** The origin of the command being dispatched on this thread, or null. */
    public static CommandOrigin current() {
        return (CommandOrigin) TransactionSynchronizationManager.getResource(KEY);
    }
}
