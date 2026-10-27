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
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class OrderEvaluatorTest {

    private final OrderEvaluator evaluator =
            new OrderEvaluator(
                    new SimulatorProperties(
                            Map.of("AAPL", new BigDecimal("170.00")),
                            new BigDecimal("10"),
                            1,
                            Duration.ZERO,
                            "XSIM",
                            "oms_orders",
                            "commands",
                            100_000));

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

    @Test
    void limitOutsidePriceBand_rejected() {
        Evaluation evaluation = evaluator.evaluate(limit("O1", Side.BUY, "100", "200.00"));

        assertFalse(evaluation.accepted());
        assertTrue(evaluation.rejectReason().contains("outside band"), evaluation.rejectReason());
        // Inside the band on the other side rests rather than rejects.
        assertTrue(evaluator.evaluate(limit("O1", Side.BUY, "100", "153.00")).accepted());
        assertFalse(evaluator.evaluate(limit("O1", Side.BUY, "100", "152.99")).accepted());
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
