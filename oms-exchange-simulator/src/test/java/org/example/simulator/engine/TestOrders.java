package org.example.simulator.engine;

import java.math.BigDecimal;
import java.math.RoundingMode;

import org.example.common.model.msg.CancelState;
import org.example.common.model.msg.OrdType;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.msg.Side;
import org.example.common.model.msg.State;
import org.example.common.model.msg.TimeInForce;

/** Builds the {@link OrderMessage}s oms-core publishes, for simulator tests. */
public final class TestOrders {

    private TestOrders() {}

    public static OrderMessage market(String orderId, Side side, String qty) {
        return order(orderId, "AAPL", OrdType.MARKET, side, qty, null, TimeInForce.DAY);
    }

    public static OrderMessage limit(String orderId, Side side, String qty, String price) {
        return order(orderId, "AAPL", OrdType.LIMIT, side, qty, price, TimeInForce.DAY);
    }

    public static OrderMessage order(
            String orderId, String symbol, OrdType ordType, Side side, String qty, String price, TimeInForce tif) {
        OrderMessage message = new OrderMessage();
        message.setOrderId(orderId);
        message.setRootOrderId(orderId);
        message.setSymbol(symbol);
        message.setOrdType(ordType);
        message.setSide(side);
        message.setOrderQty(qty != null ? new BigDecimal(qty).setScale(2, RoundingMode.HALF_UP) : null);
        message.setPrice(price != null ? new BigDecimal(price).setScale(2, RoundingMode.HALF_UP) : null);
        message.setTimeInForce(tif);
        message.setState(State.UNACK);
        message.setEventId(1L);
        message.setCumQty(BigDecimal.ZERO.setScale(4));
        message.setLeavesQty(message.getOrderQty() != null ? message.getOrderQty().setScale(4) : null);
        return message;
    }

    /** The same order as oms-core republishes it after a change. */
    public static OrderMessage update(OrderMessage original, State state, CancelState cancelState) {
        OrderMessage copy = OrderMessage.newBuilder(original).build();
        copy.setState(state);
        copy.setCancelState(cancelState);
        copy.setEventId(original.getEventId() == null ? null : original.getEventId() + 1);
        return copy;
    }
}
