package org.example.simulator.engine;

import java.math.BigDecimal;

/**
 * Where the engine's answers go. Each method is one FIX message the venue sends back, translated
 * into the OMS command it maps to; {@code CommandGateway} implements it over Kafka.
 *
 * <p>The {@code commandId} on lifecycle answers is derived from the OMS event being answered, so a
 * replayed event produces the same id and oms-core refuses the answer as a duplicate. It is null
 * when the triggering message carried no event id.
 */
public interface CommandSink {

    /** ExecutionReport ExecType=0 (New): the order is on the book. */
    void accept(String orderId);

    /** ExecutionReport ExecType=F (Trade). */
    void fill(
            String orderId,
            String execId,
            BigDecimal lastQty,
            BigDecimal lastPx,
            BigDecimal cumQty,
            BigDecimal leavesQty);

    /** ExecutionReport ExecType=8 (Rejected). */
    void reject(String orderId, String reason, String commandId);

    /** ExecutionReport ExecType=4 (Canceled), solicited or unsolicited. */
    void cancel(String orderId, String reason, String commandId);

    /** OrderCancelReject (35=9). */
    void cancelReject(String orderId, String reason, String commandId);
}
