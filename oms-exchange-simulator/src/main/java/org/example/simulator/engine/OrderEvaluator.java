package org.example.simulator.engine;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.Set;

import org.example.common.model.msg.OrdType;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.msg.Side;
import org.example.common.model.msg.TimeInForce;
import org.example.simulator.config.SimulatorProperties;
import org.example.simulator.marketdata.ReferencePrices;
import org.springframework.stereotype.Component;

/**
 * Decides what the venue does with a new order: reject it, trade it now, or rest it.
 *
 * <p>Logic over the order, the configuration and the symbol's reference price (the price service or
 * the static fallback, SPEC-0073, SPEC-0079), so every economic rule is unit-testable. It never throws on bad data:
 * anything it cannot trade becomes a reject with a reason, because a real venue answers every order.
 *
 * <ul>
 *   <li>MARKET orders are always marketable.
 *   <li>A LIMIT buy is marketable when its price is at or above the reference price; a sell when at
 *       or below it.
 *   <li>Marketable quantity fills at the reference price (price improvement for limits).
 *   <li>A limit price that is not a whole number of ticks (Reg NMS Rule 612) is rejected.
 *   <li>A limit priced further through the reference than the collar is rejected, as NYSE's Limit
 *       Order Price Protection does; the passive side is not collared. See {@link LimitPriceRules}.
 * </ul>
 */
@Component
public class OrderEvaluator {

    private static final Set<OrdType> SUPPORTED_TYPES = Set.of(OrdType.MARKET, OrdType.LIMIT);
    private static final Set<Side> BUY_SIDES = Set.of(Side.BUY);
    private static final Set<Side> SELL_SIDES = Set.of(Side.SELL, Side.SELL_SHORT);
    private final SimulatorProperties properties;
    private final ReferencePrices referencePrices;

    public OrderEvaluator(SimulatorProperties properties, ReferencePrices referencePrices) {
        this.properties = properties;
        this.referencePrices = referencePrices;
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
        BigDecimal reference = referencePrices.referencePrice(order.getSymbol()).orElse(null);
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

        if (price.signum() <= 0) {
            return Evaluation.reject("Invalid limit price " + price.stripTrailingZeros().toPlainString());
        }
        Optional<String> violation = LimitPriceRules.tickViolation(price)
                .or(() -> LimitPriceRules.collarViolation(buy, price, reference, properties.priceCollar()));
        if (violation.isPresent()) {
            return Evaluation.reject(violation.get());
        }

        boolean marketable = buy ? price.compareTo(reference) >= 0 : price.compareTo(reference) <= 0;
        return Evaluation.accept(marketable, reference, ioc);
    }
}
