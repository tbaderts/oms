package org.example.simulator.engine;

import java.math.BigDecimal;

import org.example.common.model.msg.CancelState;

/**
 * The venue's view of one order. Only ever touched from the engine thread, so it needs no
 * synchronisation.
 */
final class SimOrder {

    final String orderId;
    BigDecimal cumQty = BigDecimal.ZERO;
    BigDecimal leavesQty = BigDecimal.ZERO;
    int fills;
    /** Nothing more will trade: filled, cancelled, rejected, or never accepted by this venue. */
    boolean done;
    /** The cancel state last seen from the OMS; a change into PCXL is a new cancel request. */
    CancelState lastCancelState;

    SimOrder(String orderId) {
        this.orderId = orderId;
    }

    boolean isOpen() {
        return !done && leavesQty.signum() > 0;
    }
}
