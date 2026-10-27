package org.example.simulator.kafka;

import org.example.common.model.msg.OrderMessage;
import org.example.simulator.engine.ExchangeEngine;
import org.slf4j.MDC;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Feeds the OMS's order stream to the engine. Every order update arrives here; the engine decides
 * which ones are orders or cancel requests addressed to the venue.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class OrderMessageListener {

    private final ExchangeEngine engine;

    @KafkaListener(topics = "${simulator.order-topic}")
    public void onOrder(OrderMessage message) {
        MDC.put("orderId", message.getOrderId());
        try {
            log.debug(
                    "Received order {}: state={}, cancelState={}",
                    message.getOrderId(),
                    message.getState(),
                    message.getCancelState());
            engine.onOrderMessage(message);
        } finally {
            MDC.remove("orderId");
        }
    }
}
