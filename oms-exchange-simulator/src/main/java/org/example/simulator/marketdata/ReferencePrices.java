package org.example.simulator.marketdata;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;

/**
 * Where the venue's reference price for a symbol comes from: the price marketable orders fill at
 * and limit prices are collared around (SPEC-0073).
 */
@FunctionalInterface
public interface ReferencePrices {

    /** The reference price, or empty when the symbol is unknown to the venue. */
    Optional<BigDecimal> referencePrice(String symbol);

    /** Fixed prices, for tests. */
    static ReferencePrices fixed(Map<String, BigDecimal> prices) {
        return symbol -> Optional.ofNullable(prices.get(symbol));
    }
}
