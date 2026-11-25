package org.example.simulator.engine;

import static org.example.simulator.engine.TestOrders.limit;
import static org.example.simulator.engine.TestOrders.market;
import static org.example.simulator.engine.TestOrders.order;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Map;

import org.example.common.model.msg.OrdType;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.msg.Side;
import org.example.common.model.msg.TimeInForce;
import org.example.simulator.config.SimulatorProperties;
import org.example.simulator.marketdata.ReferencePrices;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class OrderEvaluatorTest {

    private static final Map<String, BigDecimal> PRICES = Map.of(
            "AAPL", new BigDecimal("170.00"),
            "T20", new BigDecimal("20.00"),
            "T40", new BigDecimal("40.00"),
            "PENNY", new BigDecimal("0.50"));

    private final OrderEvaluator evaluator = evaluator(PRICES);

    private static OrderEvaluator evaluator(Map<String, BigDecimal> prices) {
        SimulatorProperties properties = TestProperties.of(prices, 1, Duration.ZERO, 100_000);
        return new OrderEvaluator(properties, ReferencePrices.fixed(prices));
    }

    /** A LIMIT order with the price exactly as given, at the wire's scale 8 (no rounding to cents). */
    private static OrderMessage limitAt(String symbol, Side side, String price) {
        OrderMessage order = order("O1", symbol, OrdType.LIMIT, side, "100", null, TimeInForce.DAY);
        order.setPrice(new BigDecimal(price).setScale(8));
        return order;
    }

    // SPEC-0073 AC-6
    @Test
    void subPennyLimitAboveOneDollar_rejected() {
        Evaluation evaluation = evaluator.evaluate(limitAt("AAPL", Side.BUY, "170.005"));

        assertFalse(evaluation.accepted());
        assertEquals("Price 170.005 is not a multiple of tick 0.01", evaluation.rejectReason());
    }

    // SPEC-0073 AC-6
    @Test
    void fourDecimalLimitBelowOneDollar_accepted_fiveDecimalsRejected() {
        assertTrue(evaluator.evaluate(limitAt("PENNY", Side.BUY, "0.1234")).accepted());

        Evaluation fiveDecimals = evaluator.evaluate(limitAt("PENNY", Side.BUY, "0.12345"));
        assertFalse(fiveDecimals.accepted());
        assertEquals("Price 0.12345 is not a multiple of tick 0.0001", fiveDecimals.rejectReason());
    }

    // SPEC-0073 AC-7: NYSE tiers, 10 % up to 25, 5 % up to 50, 3 % above.
    @ParameterizedTest
    @CsvSource({"T20, 22.00, 22.01, 18-22", "T40, 42.00, 42.01, 38-42", "AAPL, 175.10, 175.11, 164.9-175.1"})
    void buyCollar_perTier(String symbol, String accepted, String rejected, String collar) {
        Evaluation inside = evaluator.evaluate(limitAt(symbol, Side.BUY, accepted));
        assertTrue(inside.accepted(), inside.rejectReason());
        assertTrue(inside.marketable());

        Evaluation outside = evaluator.evaluate(limitAt(symbol, Side.BUY, rejected));
        assertFalse(outside.accepted());
        assertEquals("Price " + rejected + " outside collar " + collar, outside.rejectReason());
    }

    // SPEC-0073 AC-7
    @ParameterizedTest
    @CsvSource({"T20, 18.00, 17.99", "T40, 38.00, 37.99", "AAPL, 164.90, 164.89"})
    void sellCollar_perTier(String symbol, String accepted, String rejected) {
        for (Side side : new Side[] {Side.SELL, Side.SELL_SHORT}) {
            Evaluation inside = evaluator.evaluate(limitAt(symbol, side, accepted));
            assertTrue(inside.accepted(), inside.rejectReason());
            assertTrue(inside.marketable());

            Evaluation outside = evaluator.evaluate(limitAt(symbol, side, rejected));
            assertFalse(outside.accepted());
            assertTrue(outside.rejectReason().startsWith("Price " + rejected + " outside collar "), outside.rejectReason());
        }
    }

    // SPEC-0073 AC-7: the passive side is not collared, so the order rests.
    @Test
    void passiveBuyFarBelowReference_acceptedAndRests() {
        Evaluation evaluation = evaluator.evaluate(limitAt("AAPL", Side.BUY, "100.00"));

        assertTrue(evaluation.accepted(), evaluation.rejectReason());
        assertFalse(evaluation.marketable());
    }

    // SPEC-0073: the reference price comes from the injected source, not the static map.
    @Test
    void referencePriceComesFromTheSource() {
        SimulatorProperties properties = TestProperties.of(Map.of(), 1, Duration.ZERO, 100_000);
        OrderEvaluator fromProvider = new OrderEvaluator(
                properties, ReferencePrices.fixed(Map.of("GOOGL", new BigDecimal("141.80"))));

        Evaluation evaluation = fromProvider.evaluate(order("O1", "GOOGL", OrdType.MARKET, Side.BUY, "100", null, TimeInForce.DAY));

        assertTrue(evaluation.accepted());
        assertEquals(0, new BigDecimal("141.80").compareTo(evaluation.fillPrice()));
    }

    @Test
    void marketOrder_isMarketableAtReferencePrice() {
        Evaluation evaluation = evaluator.evaluate(market("O1", Side.BUY, "100"));

        assertTrue(evaluation.accepted());
        assertTrue(evaluation.marketable());
        assertEquals(0, new BigDecimal("170").compareTo(evaluation.fillPrice()));
        assertFalse(evaluation.ioc());
    }

    @Test
    void limitBuyAboveReference_isMarketableAtReferencePrice() {
        Evaluation evaluation = evaluator.evaluate(limit("O1", Side.BUY, "100", "172.00"));

        assertTrue(evaluation.accepted());
        assertTrue(evaluation.marketable());
        assertEquals(0, new BigDecimal("170").compareTo(evaluation.fillPrice()), "price improvement to the reference");
    }

    @Test
    void limitBuyBelowReference_rests() {
        Evaluation evaluation = evaluator.evaluate(limit("O1", Side.BUY, "100", "165.00"));

        assertTrue(evaluation.accepted());
        assertFalse(evaluation.marketable());
    }

    @Test
    void limitSellAtOrBelowReference_isMarketable_aboveRests() {
        assertTrue(evaluator.evaluate(limit("O1", Side.SELL, "100", "170.00")).marketable());
        assertTrue(evaluator.evaluate(limit("O1", Side.SELL_SHORT, "100", "168.00")).marketable());
        assertFalse(evaluator.evaluate(limit("O1", Side.SELL, "100", "175.00")).marketable());
    }

    @Test
    void immediateOrCancel_isFlagged() {
        OrderMessage ioc = order("O1", "AAPL", OrdType.LIMIT, Side.BUY, "100", "165.00", TimeInForce.IMMEDIATE_OR_CANCEL);

        assertTrue(evaluator.evaluate(ioc).ioc());
    }

    @Test
    void unknownSymbol_rejected() {
        Evaluation evaluation =
                evaluator.evaluate(order("O1", "ZZZZ", OrdType.MARKET, Side.BUY, "100", null, TimeInForce.DAY));

        assertFalse(evaluation.accepted());
        assertTrue(evaluation.rejectReason().contains("Unknown symbol ZZZZ"), evaluation.rejectReason());
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-5"})
    void zeroOrMissingQty_rejected(String qty) {
        assertFalse(evaluator.evaluate(market("O1", Side.BUY, qty)).accepted());

        Evaluation missing = evaluator.evaluate(market("O1", Side.BUY, null));
        assertFalse(missing.accepted());
        assertEquals("Invalid order quantity", missing.rejectReason());
    }

    @Test
    void unsupportedOrderTypeAndSide_rejected() {
        Evaluation stop =
                evaluator.evaluate(order("O1", "AAPL", OrdType.STOP, Side.BUY, "100", "170.00", TimeInForce.DAY));
        assertTrue(stop.rejectReason().contains("Unsupported order type STOP"), stop.rejectReason());

        Evaluation redeem = evaluator.evaluate(market("O1", Side.REDEEM, "100"));
        assertTrue(redeem.rejectReason().contains("Unsupported side REDEEM"), redeem.rejectReason());
    }

    @Test
    void limitWithoutPrice_rejected() {
        Evaluation evaluation = evaluator.evaluate(limit("O1", Side.BUY, "100", null));

        assertFalse(evaluation.accepted());
        assertEquals("Limit order without price", evaluation.rejectReason());
    }
}
