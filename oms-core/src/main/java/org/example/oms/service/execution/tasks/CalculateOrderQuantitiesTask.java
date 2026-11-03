package org.example.oms.service.execution.tasks;

import java.math.BigDecimal;
import java.math.RoundingMode;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.orchestration.Task;
import org.example.common.orchestration.TaskExecutionException;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.repository.ExecutionRepository;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Task that calculates order quantities based on execution data.
 *
 * <p>Calculations performed:
 *
 * <ul>
 *   <li>cumQty = previous cumQty + execution.lastQty
 *   <li>leavesQty = orderQty - cumQty
 *   <li>avgPx = (sum of lastQty × lastPx over the applied fills + this fill's) / cumQty
 * </ul>
 *
 * <p>The calculated values are stored in the typed context fields for subsequent tasks to use.
 */
@Component
@Slf4j
public class CalculateOrderQuantitiesTask implements Task<OrderTaskContext> {

    /**
     * decimal(18,8), the precision of every quantity in the OMS (SPEC-0039). Sums and differences of
     * inputs at this scale never need rounding, so any rounding would be a bug: UNNECESSARY makes it
     * fail instead of silently changing a quantity.
     */
    private static final int QUANTITY_SCALE = 8;

    /**
     * Same decimal(18,8) as quantities, but an average is a quotient and generally needs rounding:
     * HALF_EVEN, so rounding errors do not drift in one direction (SPEC-0041).
     */
    private static final int PRICE_SCALE = 8;

    private final ExecutionRepository executionRepository;

    public CalculateOrderQuantitiesTask(ExecutionRepository executionRepository) {
        this.executionRepository = executionRepository;
    }

    @Override
    public TaskResult execute(OrderTaskContext context) throws TaskExecutionException {
        log.debug("Calculating order quantities for context: {}", context.getContextId());

        Order order = context.getOrder();
        Execution execution = context.getExecution();

        BigDecimal previousCumQty =
                order.getCumQty() != null ? order.getCumQty() : BigDecimal.ZERO;
        BigDecimal orderQty = order.getOrderQty();
        BigDecimal lastQty = execution.getLastQty();

        BigDecimal newCumQty = previousCumQty.add(lastQty);

        if (newCumQty.compareTo(orderQty) > 0) {
            return TaskResult.failed(
                    getName(),
                    String.format(
                            "Execution would cause cumQty (%s) to exceed orderQty (%s)",
                            newCumQty, orderQty));
        }

        BigDecimal newLeavesQty = orderQty.subtract(newCumQty);

        context.setCalculatedCumQty(newCumQty.setScale(QUANTITY_SCALE, RoundingMode.UNNECESSARY));
        context.setCalculatedLeavesQty(newLeavesQty.setScale(QUANTITY_SCALE, RoundingMode.UNNECESSARY));

        // Summed from the stored fills rather than carried as a running average, so it stays exact
        // and also covers orders whose earlier fills were recorded before avgPx was computed.
        BigDecimal notional =
                executionRepository
                        .sumNotionalByOrderId(order.getOrderId())
                        .add(lastQty.multiply(execution.getLastPx()));
        BigDecimal newAvgPx = notional.divide(newCumQty, PRICE_SCALE, RoundingMode.HALF_EVEN);
        context.setCalculatedAvgPx(newAvgPx);

        log.info(
                "Quantity calculations completed - orderId={}, previousCumQty={}, lastQty={}, "
                        + "newCumQty={}, newLeavesQty={}, avgPx={}",
                order.getOrderId(),
                previousCumQty,
                lastQty,
                newCumQty,
                newLeavesQty,
                newAvgPx);

        return TaskResult.success(getName(), "Order quantities calculated successfully");
    }

    @Override
    public int getOrder() {
        return 200;
    }
}
