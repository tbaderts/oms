package org.example.oms.service.command;

/** What became of one dispatched command (SPEC-0046). An exception is the third outcome: failed. */
public sealed interface CommandDispatch {

    /** The order the command was about, when known. */
    String orderId();

    /** The text the command API answers with. */
    String message();

    /**
     * The command changed the order.
     *
     * @param resultId what the command API reports as the id: the order, or the execId of a fill
     * @param eventVersion the version of the event it appended
     * @param created whether it created a resource (an order or an execution): 201 on REST
     */
    record Applied(String orderId, String resultId, Long eventVersion, String message, boolean created)
            implements CommandDispatch {}

    /**
     * The command was refused and changed nothing.
     *
     * @param reason why, as logged
     * @param duplicate refused because the order already applied its commandId
     * @param commandId the command's commandId, when it had one
     */
    record Refused(String orderId, String reason, boolean duplicate, String commandId, String message)
            implements CommandDispatch {}

    /** No processor handles this command type. */
    record Unsupported(String orderId, String type, String message) implements CommandDispatch {}
}
