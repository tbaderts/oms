package org.example.streaming.mapper;

import java.math.BigDecimal;
import java.time.Instant;

import org.example.common.model.msg.OrderMessage;
import org.example.streaming.model.OrderDto;
import org.example.streaming.model.OrderEvent;
import org.springframework.stereotype.Component;

/**
 * Mapper to convert Avro {@link OrderMessage} to streaming DTOs.
 * 
 * <p>Handles conversion between Avro-generated types and the streaming service's
 * internal DTO format used for RSocket streaming to the UI.
 */
@Component
public class OrderMessageMapper {

    /**
     * Converts an Avro OrderMessage to OrderDto.
     * 
     * @param msg the Avro OrderMessage from Kafka
     * @return the streaming OrderDto
     */
    public OrderDto toOrderDto(OrderMessage msg) {
        if (msg == null) {
            return null;
        }
        
        return OrderDto.builder()
                .orderId(msg.getOrderId())
                .parentOrderId(msg.getParentOrderId())
                .rootOrderId(msg.getRootOrderId())
                .clOrdId(msg.getClOrdId())
                .account(msg.getAccount())
                .symbol(msg.getSymbol())
                .side(msg.getSide() != null ? msg.getSide().name() : null)
                .ordType(msg.getOrdType() != null ? msg.getOrdType().name() : null)
                .state(msg.getState() != null ? msg.getState().name() : null)
                .cancelState(msg.getCancelState() != null ? msg.getCancelState().name() : null)
                .orderQty(toBigDecimal(msg.getOrderQty()))
                .price(toBigDecimal(msg.getPrice()))
                .stopPx(toBigDecimal(msg.getStopPx()))
                .timeInForce(msg.getTimeInForce() != null ? msg.getTimeInForce().name() : null)
                .securityId(msg.getSecurityId())
                .securityType(msg.getSecurityDesc())
                .exDestination(msg.getExDestination())
                .text(msg.getText())
                .sendingTime(msg.getSendingTime())
                .transactTime(msg.getTransactTime())
                .expireTime(msg.getExpireTime())
                .sequenceNumber(msg.getEventId())
                .eventTime(Instant.now())
                .build();
    }

    /**
     * Creates an OrderEvent from an OrderMessage.
     * 
     * @param msg the Avro OrderMessage
     * @param eventType the event type (UPDATE, CREATE, etc.)
     * @return an OrderEvent wrapping the converted DTO
     */
    public OrderEvent toOrderEvent(OrderMessage msg, String eventType) {
        OrderDto dto = toOrderDto(msg);
        return OrderEvent.builder()
                .eventType(eventType)
                .orderId(msg.getOrderId())
                .order(dto)
                .sequenceNumber(msg.getEventId())
                .timestamp(Instant.now())
                .build();
    }

    private BigDecimal toBigDecimal(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof BigDecimal) {
            return (BigDecimal) value;
        }
        return new BigDecimal(value.toString());
    }
}
