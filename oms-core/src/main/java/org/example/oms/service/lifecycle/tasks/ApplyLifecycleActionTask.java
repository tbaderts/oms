package org.example.oms.service.lifecycle.tasks;

import java.math.BigDecimal;
import java.time.Instant;

import org.example.common.model.Order;
import org.example.common.orchestration.Task;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.service.lifecycle.LifecycleAction;
import org.example.oms.service.sla.OrderSlaRecorder;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Applies a validated lifecycle action to the order: state, cancel state, open quantity and the
 * venue's reject reason. Executed quantity and the client's text are never touched; a cancelled order
 * keeps what it filled. An acknowledgement also stamps the market-ack SLA with the time the command
 * crossed the OMS boundary (SPEC-0046).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ApplyLifecycleActionTask implements Task<OrderTaskContext> {

    private final OrderSlaRecorder slaRecorder;

    /** Context key carrying the reason from the command, if any. */
    public static final String REASON = "reason";

    /** Width of {@code orders.reject_reason}. */
    static final int MAX_REASON_LENGTH = 255;

    @Override
    public TaskResult execute(OrderTaskContext context) {
        LifecycleAction action = context.getLifecycleAction();
        Order order = context.getOrder();

        Order.OrderBuilder<?, ?> builder = order.toBuilder().transactTime(Instant.now());

        if (action.getTargetState() != null) {
            builder.state(action.getTargetState());
        }
        if (action.getResultingCancelState() != null) {
            builder.cancelState(action.getResultingCancelState());
        }
        if (action.isClosesOpenQuantity()) {
            builder.leavesQty(BigDecimal.ZERO);
        }
        switch (action.getReasonEffect()) {
            // A refusal without a reason still replaces an older one: the field is the latest refusal.
            case SET ->
                    builder.rejectReason(
                            context.<String>get(REASON)
                                    .filter(reason -> !reason.isBlank())
                                    .map(ApplyLifecycleActionTask::truncate)
                                    .orElse(null));
            case CLEAR -> builder.rejectReason(null);
            case NONE -> {}
        }

        Order updated = builder.build();
        if (action == LifecycleAction.ACCEPT) {
            // The ingress time, not now: reading the clock here would fold our own processing time
            // into a latency that describes the market.
            updated = slaRecorder.stampMarketAck(updated, context.getReceivedTime());
        }
        context.setOrder(updated);
        context.setTargetState(updated.getState());
        context.setEvent(action.getEvent());

        log.info(
                "Applied {} to order {}: state {} -> {}, cancelState {} -> {}, rejectReason={}",
                action,
                order.getOrderId(),
                order.getState(),
                updated.getState(),
                order.getCancelState(),
                updated.getCancelState(),
                updated.getRejectReason());

        return TaskResult.success(getName(), action + " applied to order " + order.getOrderId());
    }

    private static String truncate(String reason) {
        return reason.length() <= MAX_REASON_LENGTH ? reason : reason.substring(0, MAX_REASON_LENGTH);
    }

    @Override
    public int getOrder() {
        return 300;
    }
}
