package org.example.simulator.engine;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Set;

import org.example.common.model.msg.OrdType;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.msg.Side;
import org.example.common.model.msg.TimeInForce;
import org.example.simulator.config.SimulatorProperties;
import org.springframework.stereotype.Component;

/**
 * Decides what the venue does with a new order: reject it, trade it now, or rest it.
 *
 * <p>Pure logic over the order and the configuration, so every economic rule is unit-testable. It
 * never throws on bad data: anything it cannot trade becomes a reject with a reason, because a real
 * venue answers every order.
 *
 * <ul>
 *   <li>MARKET orders are always marketable.
 *   <li>A LIMIT buy is marketable when its price is at or above the reference price; a sell when at
 *       or below it.
 *   <li>Marketable quantity fills at the reference price (price improvement for limits).
 *   <li>A limit price outside the reference ± {@code priceBandPercent} is rejected, as venues do
 *       with fat-finger price collars.
 * </ul>
 */
@Component
public class OrderEvaluator {

    private static final Set<OrdType> SUPPORTED_TYPES = Set.of(OrdType.MARKET, OrdType.LIMIT);
    private static final Set<Side> BUY_SIDES = Set.of(Side.BUY);
    private static final Set<Side> SELL_SIDES = Set.of(Side.SELL, Side.SELL_SHORT);
    private static final BigDecimal HUNDRED = new BigDecimal("100");

    private final SimulatorProperties properties;

    public OrderEvaluator(SimulatorProperties properties) {
        this.properties = properties;
    }

    public Evaluation evaluate(OrderMessage order) {
        BigDecimal qty = order.getOrderQty();
        if (qty == null || qty.signum() <= 0) {
            return Evaluation.reject("Invalid order quantity");
        }
        if (!SUPPORTED_TYPES.contains(order.getOrdType())) {
            return Evaluation.reject("Unsupported order type " + order.getOrdType());
        }
        Side side = order.getSide();
        boolean buy = BUY_SIDES.contains(side);
        if (!buy && !SELL_SIDES.contains(side)) {
            return Evaluation.reject("Unsupported side " + side);
        }
        BigDecimal reference = properties.referencePrices().get(order.getSymbol());
        if (reference == null) {
            return Evaluation.reject("Unknown symbol " + order.getSymbol());
        }

        boolean ioc = order.getTimeInForce() == TimeInForce.IMMEDIATE_OR_CANCEL;

        if (order.getOrdType() == OrdType.MARKET) {
            return Evaluation.accept(true, reference, ioc);
        }

        BigDecimal price = order.getPrice();
        if (price == null) {
            return Evaluation.reject("Limit order without price");
        }

        BigDecimal band = reference.multiply(properties.priceBandPercent()).divide(HUNDRED, 4, RoundingMode.HALF_UP);
        BigDecimal low = reference.subtract(band);
        BigDecimal high = reference.add(band);
        if (price.compareTo(low) < 0 || price.compareTo(high) > 0) {
            return Evaluation.reject(
                    "Price " + price.toPlainString() + " outside band "
                            + low.stripTrailingZeros().toPlainString() + "-"
                            + high.stripTrailingZeros().toPlainString());
        }

        boolean marketable = buy ? price.compareTo(reference) >= 0 : price.compareTo(reference) <= 0;
        return Evaluation.accept(marketable, reference, ioc);
    }
}
