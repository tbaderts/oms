package org.example.simulator.engine;

import java.math.BigDecimal;
import java.util.Optional;

import org.example.simulator.config.SimulatorProperties.PriceCollar;

/**
 * The limit-price rules of a US equity venue (SPEC-0073), as pure functions.
 *
 * <ul>
 *   <li><b>Tick size</b>, Reg NMS Rule 612: a price of 1.00 or more is quoted in whole cents, a
 *       lower price in steps of 0.0001. Keyed on the limit price itself, as the rule is.
 *   <li><b>Collar</b>, after NYSE's Limit Order Price Protection: a buy priced more than the tier's
 *       percentage above the reference, or a sell more than it below, is rejected. The passive side
 *       (a buy below or a sell above the reference) is not collared; such an order simply rests.
 * </ul>
 */
public final class LimitPriceRules {

    private static final BigDecimal ONE_DOLLAR = BigDecimal.ONE;
    private static final BigDecimal CENT = new BigDecimal("0.01");
    private static final BigDecimal SUB_PENNY = new BigDecimal("0.0001");
    private static final BigDecimal HUNDRED = new BigDecimal("100");

    private LimitPriceRules() {}

    /** The minimum price increment for a limit at this price. */
    public static BigDecimal tickFor(BigDecimal price) {
        return price.compareTo(ONE_DOLLAR) >= 0 ? CENT : SUB_PENNY;
    }

    /** Why the price is not a whole number of ticks, or empty when it is. */
    public static Optional<String> tickViolation(BigDecimal price) {
        BigDecimal tick = tickFor(price);
        if (price.remainder(tick).signum() == 0) {
            return Optional.empty();
        }
        return Optional.of("Price " + plain(price) + " is not a multiple of tick " + tick.toPlainString());
    }

    /** The collar, in percent of the reference price, that applies at this reference price. */
    public static BigDecimal collarPercent(BigDecimal reference, PriceCollar collar) {
        return collar.tiers().stream()
                .filter(tier -> reference.compareTo(tier.maxReference()) <= 0)
                .findFirst()
                .map(PriceCollar.Tier::percent)
                .orElse(collar.defaultPercent());
    }

    /** Why the limit is priced too far through the reference, or empty when it is not. */
    public static Optional<String> collarViolation(boolean buy, BigDecimal price, BigDecimal reference, PriceCollar collar) {
        BigDecimal fraction = collarPercent(reference, collar).divide(HUNDRED);
        BigDecimal low = reference.multiply(BigDecimal.ONE.subtract(fraction));
        BigDecimal high = reference.multiply(BigDecimal.ONE.add(fraction));
        boolean outside = buy ? price.compareTo(high) > 0 : price.compareTo(low) < 0;
        if (!outside) {
            return Optional.empty();
        }
        return Optional.of("Price " + plain(price) + " outside collar " + plain(low) + "-" + plain(high));
    }

    private static String plain(BigDecimal value) {
        return value.stripTrailingZeros().toPlainString();
    }
}
