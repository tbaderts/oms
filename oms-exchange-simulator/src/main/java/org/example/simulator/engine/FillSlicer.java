package org.example.simulator.engine;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * Splits a quantity into the executions a venue reports for it.
 *
 * <p>The first slices are whole units of {@code floor(qty / n)} and the last takes the remainder,
 * so 100 in three slices is 33, 33, 34. No slice is ever zero: when there are fewer whole units than
 * slices, fewer slices are produced. All results carry scale 4, the OMS quantity scale.
 */
public final class FillSlicer {

    static final int QUANTITY_SCALE = 4;

    private FillSlicer() {}

    public static List<BigDecimal> slice(BigDecimal quantity, int slices) {
        if (quantity.signum() <= 0) {
            throw new IllegalArgumentException("quantity must be positive: " + quantity);
        }
        BigDecimal wholeUnits = quantity.setScale(0, RoundingMode.FLOOR);
        int count = wholeUnits.compareTo(BigDecimal.valueOf(slices)) >= 0 ? slices : Math.max(1, wholeUnits.intValue());
        BigDecimal each = quantity.divide(BigDecimal.valueOf(count), 0, RoundingMode.FLOOR);

        List<BigDecimal> result = new ArrayList<>(count);
        BigDecimal allocated = BigDecimal.ZERO;
        for (int i = 0; i < count - 1; i++) {
            result.add(each.setScale(QUANTITY_SCALE));
            allocated = allocated.add(each);
        }
        result.add(quantity.subtract(allocated).setScale(QUANTITY_SCALE, RoundingMode.HALF_UP));
        return result;
    }
}
