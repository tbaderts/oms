package org.example.simulator.engine;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/** A {@link CommandSink} that records what the engine would have sent, in order. */
public class RecordingSink implements CommandSink {

    public record Sent(
            String type,
            String orderId,
            String execId,
            BigDecimal lastQty,
            BigDecimal lastPx,
            String text,
            String commandId,
            Cause cause) {}

    private final List<Sent> sent = new ArrayList<>();

    @Override
    public synchronized void accept(Cause cause, String orderId) {
        sent.add(new Sent("ACCEPT", orderId, null, null, null, null, null, cause));
    }

    @Override
    public synchronized void fill(
            Cause cause,
            String orderId,
            String execId,
            BigDecimal lastQty,
            BigDecimal lastPx,
            BigDecimal cumQty,
            BigDecimal leavesQty) {
        sent.add(new Sent("FILL", orderId, execId, lastQty, lastPx, null, null, cause));
    }

    @Override
    public synchronized void reject(Cause cause, String orderId, String reason, String commandId) {
        sent.add(new Sent("REJECT", orderId, null, null, null, reason, commandId, cause));
    }

    @Override
    public synchronized void cancel(Cause cause, String orderId, String reason, String commandId) {
        sent.add(new Sent("CANCEL", orderId, null, null, null, reason, commandId, cause));
    }

    @Override
    public synchronized void cancelReject(Cause cause, String orderId, String reason, String commandId) {
        sent.add(new Sent("CANCEL_REJECT", orderId, null, null, null, reason, commandId, cause));
    }

    public synchronized List<Sent> sent() {
        return List.copyOf(sent);
    }

    public synchronized List<String> types() {
        return sent.stream().map(Sent::type).toList();
    }
}
