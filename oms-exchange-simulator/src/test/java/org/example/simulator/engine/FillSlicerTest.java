package org.example.simulator.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class FillSlicerTest {

    @Test
    void splitsIntoPositiveSlicesSummingToQty() {
        assertEquals(List.of(qty("33"), qty("33"), qty("34")), FillSlicer.slice(qty("100"), 3));
    }

    @Test
    void oneSlice_isTheWholeQuantity() {
        assertEquals(List.of(qty("100")), FillSlicer.slice(qty("100"), 1));
    }

    @Test
    void fewerUnitsThanSlices_reducesTheSliceCountRatherThanEmittingZeros() {
        assertEquals(List.of(qty("1"), qty("1")), FillSlicer.slice(qty("2"), 3));
    }

    @Test
    void fractionalQuantity_putsTheFractionInTheLastSlice() {
        assertEquals(List.of(qty("3"), qty("3"), qty("4.5")), FillSlicer.slice(qty("10.5"), 3));
    }

    @Test
    void lessThanOneUnit_isASingleSlice() {
        assertEquals(List.of(qty("0.5")), FillSlicer.slice(qty("0.5"), 4));
    }

    @Test
    void quantityBeyondIntRange_doesNotOverflow() {
        List<BigDecimal> result = FillSlicer.slice(qty("10000000000"), 4);

        assertEquals(4, result.size());
        assertEquals(0, qty("10000000000").compareTo(result.stream().reduce(BigDecimal.ZERO, BigDecimal::add)));
    }

    @ParameterizedTest
    @CsvSource({"100,3", "7,7", "250,4", "1,5", "99.75,10"})
    void invariants(String total, int slices) {
        List<BigDecimal> result = FillSlicer.slice(qty(total), slices);

        assertTrue(result.size() <= slices);
        assertTrue(result.stream().allMatch(slice -> slice.signum() > 0), "no zero slice: " + result);
        assertEquals(0, qty(total).compareTo(result.stream().reduce(BigDecimal.ZERO, BigDecimal::add)));
    }

    private static BigDecimal qty(String value) {
        return new BigDecimal(value).setScale(4);
    }
}
