package org.example.common.model.mapper;

import org.example.common.model.Order;
import org.example.common.model.msg.CancelState;
import org.example.common.model.msg.ExecInst;
import org.example.common.model.msg.HandlInst;
import org.example.common.model.msg.OrdType;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.msg.PositionEffect;
import org.example.common.model.msg.PriceType;
import org.example.common.model.msg.SecurityIDSource;
import org.example.common.model.msg.Side;
import org.example.common.model.msg.State;
import org.example.common.model.msg.TimeInForce;
import org.springframework.stereotype.Component;

/**
 * Maps JPA Order entity to Avro OrderMessage for Kafka publishing.
 */
@Component
public class OrderMessageMapper {

    /**
     * Converts a JPA Order entity to an Avro OrderMessage.
     *
     * @param order the JPA order entity
     * @return the Avro OrderMessage
     */
    public OrderMessage toOrderMessage(Order order) {
        if (order == null) {
            return null;
        }

        return OrderMessage.newBuilder()
                .setOrderId(order.getOrderId())
                .setParentOrderId(order.getParentOrderId())
                .setRootOrderId(order.getRootOrderId() != null ? order.getRootOrderId() : order.getOrderId())
                .setSessionId(order.getSessionId())
                .setClOrdId(order.getClOrdId())
                .setSendingTime(order.getSendingTime())
                .setAccount(order.getAccount())
                .setOrigClOrdId(order.getOrigClOrdId())
                .setExecInst(mapExecInst(order.getExecInst()))
                .setHandlInst(mapHandlInst(order.getHandlInst()))
                .setSecurityIDSource(mapSecurityIdSource(order.getSecurityIdSource()))
                .setOrderQty(order.getOrderQty())
                .setCashOrderQty(order.getCashOrderQty())
                .setPositionEffect(mapPositionEffect(order.getPositionEffect()))
                .setSecurityDesc(order.getSecurityDesc())
                .setMaturityMonthYear(order.getMaturityMonthYear())
                .setStrikePrice(order.getStrikePrice())
                .setPriceType(mapPriceType(order.getPriceType()))
                .setPutOrCall(order.getPutOrCall())
                .setUnderlyingSecurityType(order.getUnderlyingSecurityType())
                .setOrdType(mapOrdType(order.getOrdType()))
                .setPrice(order.getPrice())
                .setStopPx(order.getStopPx())
                .setSecurityId(order.getSecurityId())
                .setSide(mapSide(order.getSide()))
                .setSymbol(order.getSymbol())
                .setTimeInForce(mapTimeInForce(order.getTimeInForce()))
                .setTransactTime(order.getTransactTime())
                .setExDestination(order.getExDestination())
                .setSettlCurrency(order.getSettlCurrency())
                .setExpireTime(order.getExpireTime())
                .setSecurityExchange(order.getSecurityExchange())
                .setText(order.getText())
                .setTifTimestamp(order.getTifTimestamp())
                .setState(mapState(order.getState()))
                .setCancelState(mapCancelState(order.getCancelState()))
                .setEventId(order.getId())  // Use the database ID as event ID
                .build();
    }

    private ExecInst mapExecInst(org.example.common.model.ExecInst value) {
        return value == null ? null : ExecInst.valueOf(value.name());
    }

    private HandlInst mapHandlInst(org.example.common.model.HandlInst value) {
        return value == null ? null : HandlInst.valueOf(value.name());
    }

    private SecurityIDSource mapSecurityIdSource(org.example.common.model.SecurityIdSource value) {
        return value == null ? null : SecurityIDSource.valueOf(value.name());
    }

    private PositionEffect mapPositionEffect(org.example.common.model.PositionEffect value) {
        return value == null ? null : PositionEffect.valueOf(value.name());
    }

    private PriceType mapPriceType(org.example.common.model.PriceType value) {
        return value == null ? null : PriceType.valueOf(value.name());
    }

    private OrdType mapOrdType(org.example.common.model.OrdType value) {
        return value == null ? null : OrdType.valueOf(value.name());
    }

    private Side mapSide(org.example.common.model.Side value) {
        return value == null ? null : Side.valueOf(value.name());
    }

    private TimeInForce mapTimeInForce(org.example.common.model.TimeInForce value) {
        return value == null ? null : TimeInForce.valueOf(value.name());
    }

    private State mapState(org.example.common.model.State value) {
        return value == null ? null : State.valueOf(value.name());
    }

    private CancelState mapCancelState(org.example.common.model.CancelState value) {
        return value == null ? null : CancelState.valueOf(value.name());
    }
}
