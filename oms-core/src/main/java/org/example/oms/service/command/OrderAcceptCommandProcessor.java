package org.example.oms.service.command;

import java.time.Instant;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.state.OrderStateMachineConfig;
import org.example.common.state.StateMachine;
import org.example.oms.repository.OrderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.Builder;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
@RequiredArgsConstructor
public class OrderAcceptCommandProcessor {

    private final OrderRepository orderRepository;
    private final StateMachine<State> stateMachine = OrderStateMachineConfig.createStandard();

    @Transactional
    public OrderAcceptResult process(OrderAcceptCmd command) {
        String orderId = command.getOrderId();

        if (orderId == null || orderId.isBlank()) {
            return OrderAcceptResult.builder()
                    .success(false)
                    .orderId(null)
                    .errorMessage("orderId is required")
                    .build();
        }

        Order order = orderRepository.findByOrderId(orderId).orElse(null);
        if (order == null) {
            return OrderAcceptResult.builder()
                    .success(false)
                    .orderId(orderId)
                    .errorMessage("Order not found: " + orderId)
                    .build();
        }

        State currentState = order.getState() != null ? order.getState() : State.NEW;
        if (!stateMachine.isValidTransition(currentState, State.LIVE)) {
            return OrderAcceptResult.builder()
                    .success(false)
                    .orderId(orderId)
                    .errorMessage(
                            String.format(
                                    "Invalid state transition from %s to LIVE for order %s",
                                    currentState,
                                    orderId))
                    .build();
        }

        Order updatedOrder = order.toBuilder().state(State.LIVE).transactTime(Instant.now()).build();
        orderRepository.save(updatedOrder);

        log.info("Order accepted and moved to LIVE: orderId={}, previousState={}", orderId, currentState);

        return OrderAcceptResult.builder().success(true).orderId(orderId).build();
    }

    @Builder
    @Getter
    public static class OrderAcceptResult {
        private final boolean success;
        private final String orderId;
        private final String errorMessage;
    }
}
