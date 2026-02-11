package org.example.oms.service.command.tasks;

import java.math.BigDecimal;

import org.example.common.model.OrdType;
import org.example.common.model.Order;
import org.example.common.orchestration.Task;
import org.example.common.orchestration.TaskExecutionException;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Task that validates order fields and business rules before order creation. This task ensures the
 * order meets all required validation criteria.
 *
 * <p>Validation rules:
 *
 * <ul>
 *   <li>Required fields: symbol, side, orderQty, ordType, account, clOrdId
 *   <li>Order quantity must be positive
 *   <li>Limit orders must have a price
 *   <li>Symbol must not be empty
 * </ul>
 */
@Component
@Slf4j
public class ValidateOrderTask implements Task<OrderTaskContext> {

    @Override
    public TaskResult execute(OrderTaskContext context) throws TaskExecutionException {
        log.debug("Validating order for context: {}", context.getContextId());

        Order order = context.getOrder();
        if (order == null) {
            context.markValidationFailed("Order is null");
            return TaskResult.failed(getName(), "Order is null");
        }

        // Validate required fields
        if (order.getSymbol() == null || order.getSymbol().isBlank()) {
            context.markValidationFailed("Symbol is required");
            return TaskResult.failed(getName(), "Symbol is required");
        }

        if (order.getSide() == null) {
            context.markValidationFailed("Side is required");
            return TaskResult.failed(getName(), "Side is required");
        }

        if (order.getAccount() == null || order.getAccount().isBlank()) {
            context.markValidationFailed("Account is required");
            return TaskResult.failed(getName(), "Account is required");
        }

        if (order.getClOrdId() == null || order.getClOrdId().isBlank()) {
            context.markValidationFailed("ClOrdId is required");
            return TaskResult.failed(getName(), "ClOrdId is required");
        }

        if (order.getOrdType() == null) {
            context.markValidationFailed("Order type is required");
            return TaskResult.failed(getName(), "Order type is required");
        }

        // Validate order quantity
        if (order.getOrderQty() == null || order.getOrderQty().compareTo(BigDecimal.ZERO) <= 0) {
            context.markValidationFailed("Order quantity must be positive");
            return TaskResult.failed(getName(), "Order quantity must be positive");
        }

        // Validate limit order has price
        if (OrdType.LIMIT == order.getOrdType() && order.getPrice() == null) {
            context.markValidationFailed("Limit orders must have a price");
            return TaskResult.failed(getName(), "Limit orders must have a price");
        }

        // Validate stop orders have stop price
        if ((OrdType.STOP == order.getOrdType() || OrdType.STOP_LIMIT == order.getOrdType())
                && order.getStopPx() == null) {
            context.markValidationFailed("Stop orders must have a stop price");
            return TaskResult.failed(getName(), "Stop orders must have a stop price");
        }

        log.info(
                "Order validation passed for symbol: {}, side: {}, qty: {}",
                order.getSymbol(),
                order.getSide(),
                order.getOrderQty());

        return TaskResult.success(getName(), "Order validation passed");
    }

    @Override
    public int getOrder() {
        return 100; // Execute early in the pipeline
    }
}
