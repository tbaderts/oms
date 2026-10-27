package org.example.simulator.engine;

import java.math.BigDecimal;

/**
 * The venue's verdict on a new order.
 *
 * @param accepted whether the venue takes the order at all
 * @param rejectReason why not, when {@code accepted} is false
 * @param marketable whether the order trades immediately at {@code fillPrice}
 * @param fillPrice the price marketable quantity executes at
 * @param ioc whether quantity that cannot trade immediately is cancelled instead of resting
 */
public record Evaluation(
        boolean accepted, String rejectReason, boolean marketable, BigDecimal fillPrice, boolean ioc) {

    static Evaluation reject(String reason) {
        return new Evaluation(false, reason, false, null, false);
    }

    static Evaluation accept(boolean marketable, BigDecimal fillPrice, boolean ioc) {
        return new Evaluation(true, null, marketable, fillPrice, ioc);
    }
}
