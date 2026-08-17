package org.example.oms.service.command;

import java.time.Instant;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.state.OrderStateMachineConfig;
import org.example.common.state.StateMachine;
import org.example.oms.model.Event;
import org.example.oms.repository.OrderRepository;
import org.example.oms.service.OrderEventAppender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.micrometer.observation.annotation.Observed;
import lombok.Builder;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Moves an order to LIVE on market acknowledgement.
 *
 * <p>Like every other state-changing path, this records an event and stages the updated order for
 * publication. It previously did neither, so an order's transition to LIVE existed only as a
 * mutated row — absent from the audit log and invisible to every downstream consumer.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class OrderAcceptCommandProcessor {

    private final OrderRepository orderRepository;
    private final OrderEventAppender orderEventAppender;
    private final StateMachine<State> stateMachine = OrderStateMachineConfig.createStandard();

    @Transactional
    @Observed(name = "oms.order-accept-processor.process")
    public OrderAcceptResult process(OrderAcceptCmd command) {
        String orderId = command.getOrderId();

        if (orderId == null || orderId.isBlank()) {
            return failure(null, "orderId is required");
        }

        Order order = orderRepository.findByOrderId(orderId).orElse(null);
        if (order == null) {
            return failure(orderId, "Order not found: " + orderId);
        }

        State currentState = order.getState() != null ? order.getState() : State.NEW;
        if (!stateMachine.isValidTransition(currentState, State.LIVE)) {
            return failure(
                    orderId,
                    String.format(
                            "Invalid state transition from %s to LIVE for order %s",
                            currentState, orderId));
        }

        Order updatedOrder =
                orderRepository.save(
                        order.toBuilder().state(State.LIVE).transactTime(Instant.now()).build());

        long version = orderEventAppender.appendOrderEvent(updatedOrder, Event.ACK, command);

        log.info(
                "Order accepted and moved to LIVE: orderId={}, previousState={}, eventVersion={}",
                orderId,
                currentState,
                version);

        return OrderAcceptResult.builder().success(true).orderId(orderId).build();
    }

    private OrderAcceptResult failure(String orderId, String message) {
        log.warn("Order acceptance failed: {}", message);
        return OrderAcceptResult.builder()
                .success(false)
                .orderId(orderId)
                .errorMessage(message)
                .build();
    }

    @Builder
    @Getter
    public static class OrderAcceptResult {
        private final boolean success;
        private final String orderId;
        private final String errorMessage;
    }
}
