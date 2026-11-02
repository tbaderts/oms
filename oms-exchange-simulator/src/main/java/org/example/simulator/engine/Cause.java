package org.example.simulator.engine;

import org.example.common.model.msg.OrderMessage;

/**
 * The OMS message an answer responds to: which order tree it belongs to and which event of the
 * order caused it (SPEC-0025). The answer's command header is built from it.
 *
 * @param rootOrderId the order tree, or null if the message had none
 * @param orderId the order answered
 * @param eventId the event-log version of the message answered, or null if it carried none
 */
public record Cause(String rootOrderId, String orderId, Long eventId) {

    public static Cause of(OrderMessage message) {
        return new Cause(message.getRootOrderId(), message.getOrderId(), message.getEventId());
    }
}
