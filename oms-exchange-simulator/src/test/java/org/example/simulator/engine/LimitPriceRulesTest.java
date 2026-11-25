package org.example.simulator.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import org.example.simulator.config.SimulatorProperties.PriceCollar;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** SPEC-0073 AC-6, AC-7: the venue's limit-price rules on their own. */
class LimitPriceRulesTest {

    private static final PriceCollar NYSE_TIERS = new PriceCollar(null, null);

    // AC-6: Reg NMS Rule 612, keyed on the limit price itself.
    @ParameterizedTest
    @CsvSource({"170.00, 0.01", "1.00, 0.01", "0.9999, 0.0001", "0.12, 0.0001"})
    void tickIsOneCentFromOneDollar_otherwiseHundredthOfACent(String price, String tick) {
        assertEquals(0, new BigDecimal(tick).compareTo(LimitPriceRules.tickFor(new BigDecimal(price))));
    }

    // AC-6
    @Test
    void tickViolation_namesPriceAndTick() {
        assertEquals(
                Optional.of("Price 170.005 is not a multiple of tick 0.01"),
                LimitPriceRules.tickViolation(new BigDecimal("170.00500000")));
        assertEquals(Optional.empty(), LimitPriceRules.tickViolation(new BigDecimal("170.01000000")));
        assertEquals(Optional.empty(), LimitPriceRules.tickViolation(new BigDecimal("0.12340000")));
        assertEquals(
                Optional.of("Price 0.12345 is not a multiple of tick 0.0001"),
                LimitPriceRules.tickViolation(new BigDecimal("0.12345000")));
    }

    // AC-7: the first tier whose max reference is at or above the reference applies.
    @ParameterizedTest
    @CsvSource({"20.00, 10", "25.00, 10", "25.01, 5", "40.00, 5", "50.00, 5", "50.01, 3", "170.00, 3"})
    void collarTiers(String reference, String percent) {
        assertEquals(0, new BigDecimal(percent).compareTo(LimitPriceRules.collarPercent(new BigDecimal(reference), NYSE_TIERS)));
    }

    @Test
    void configuredTiers_areUsedInAscendingOrder() {
        PriceCollar custom = new PriceCollar(
                List.of(new PriceCollar.Tier(new BigDecimal("100"), new BigDecimal("2")),
                        new PriceCollar.Tier(new BigDecimal("10"), new BigDecimal("20"))),
                new BigDecimal("1"));

        assertEquals(0, new BigDecimal("20").compareTo(LimitPriceRules.collarPercent(new BigDecimal("5"), custom)));
        assertEquals(0, new BigDecimal("2").compareTo(LimitPriceRules.collarPercent(new BigDecimal("50"), custom)));
        assertEquals(0, new BigDecimal("1").compareTo(LimitPriceRules.collarPercent(new BigDecimal("500"), custom)));
    }

    // AC-7: only the aggressive side is collared.
    @Test
    void collarViolation_buyAboveHighSellBelowLow() {
        BigDecimal reference = new BigDecimal("170.00");

        assertEquals(Optional.empty(), LimitPriceRules.collarViolation(true, new BigDecimal("175.10"), reference, NYSE_TIERS));
        assertEquals(
                Optional.of("Price 175.11 outside collar 164.9-175.1"),
                LimitPriceRules.collarViolation(true, new BigDecimal("175.11000000"), reference, NYSE_TIERS));
        assertEquals(Optional.empty(), LimitPriceRules.collarViolation(false, new BigDecimal("164.90"), reference, NYSE_TIERS));
        assertTrue(LimitPriceRules.collarViolation(false, new BigDecimal("164.89"), reference, NYSE_TIERS).isPresent());
        // Passive: a buy far below or a sell far above is not collared.
        assertEquals(Optional.empty(), LimitPriceRules.collarViolation(true, new BigDecimal("100.00"), reference, NYSE_TIERS));
        assertEquals(Optional.empty(), LimitPriceRules.collarViolation(false, new BigDecimal("300.00"), reference, NYSE_TIERS));
    }
}
