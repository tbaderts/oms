package org.example.simulator.engine;

import org.example.common.model.msg.OrderMessage;
import org.example.common.model.msg.SecurityIDSource;

/**
 * The FIX Instrument block a venue echoes on every execution report: Symbol (55), SecurityID (48)
 * and SecurityIDSource (22), as the order named them (SPEC-0069).
 */
public record Instrument(String symbol, String securityId, SecurityIDSource securityIdSource) {

    /** The instrument the order names. */
    static Instrument of(OrderMessage order) {
        return new Instrument(order.getSymbol(), order.getSecurityId(), order.getSecurityIDSource());
    }
}
