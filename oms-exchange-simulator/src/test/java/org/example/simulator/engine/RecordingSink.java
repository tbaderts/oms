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
            String commandId) {}

    private final List<Sent> sent = new ArrayList<>();

    @Override
    public synchronized void accept(String orderId) {
        sent.add(new Sent("ACCEPT", orderId, null, null, null, null, null));
    }

    @Override
    public synchronized void fill(
            String orderId,
            String execId,
            BigDecimal lastQty,
            BigDecimal lastPx,
            BigDecimal cumQty,
            BigDecimal leavesQty) {
        sent.add(new Sent("FILL", orderId, execId, lastQty, lastPx, null, null));
    }

    @Override
    public synchronized void reject(String orderId, String reason, String commandId) {
        sent.add(new Sent("REJECT", orderId, null, null, null, reason, commandId));
    }

    @Override
    public synchronized void cancel(String orderId, String reason, String commandId) {
        sent.add(new Sent("CANCEL", orderId, null, null, null, reason, commandId));
    }

    @Override
    public synchronized void cancelReject(String orderId, String reason, String commandId) {
        sent.add(new Sent("CANCEL_REJECT", orderId, null, null, null, reason, commandId));
    }

    public synchronized List<Sent> sent() {
        return List.copyOf(sent);
    }

    public synchronized List<String> types() {
        return sent.stream().map(Sent::type).toList();
    }
}
