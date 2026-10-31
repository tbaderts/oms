package org.example.oms.projection;

import java.util.List;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.model.msg.OrderExecution;
import org.example.oms.mapper.OrderExecutionMessageMapper;
import org.example.oms.model.OrderExecutionView;
import org.example.oms.repository.OrderExecutionViewRepository;
import org.example.oms.service.OrderEventAppender;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * One row per applied fill with the order as of that fill, plus the OrderExecution message of the
 * same content (SPEC-0020; the message was introduced in SPEC-0019).
 *
 * <p>Both come from one {@link OrderExecution} record, built by the same mapper the topic always
 * used, so the row and the published record cannot disagree.
 */
@Component
public class OrderExecutionProjection implements Projection {

    static final String NAME = "order_execution_view";

    private final OrderExecutionViewRepository repository;
    private final OrderExecutionMessageMapper mapper;
    private final String topic;

    public OrderExecutionProjection(
            OrderExecutionViewRepository repository,
            OrderExecutionMessageMapper mapper,
            @Value("${kafka.order-execution-topic:oms_order_executions}") String topic) {
        this.repository = repository;
        this.mapper = mapper;
        this.topic = topic;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public List<StagedMessage> project(ProjectionContext context) {
        Order order = context.order();
        Execution execution = context.execution();
        OrderExecution record =
                mapper.toOrderExecutionMessage(execution, order, context.orderVersion(), context.stagedAt());

        OrderExecutionView row = repository
                .findByOrderIdAndExecId(record.getOrderId(), record.getExecId())
                .orElseGet(OrderExecutionView::new);
        apply(row, record, context);
        repository.save(row);

        return List.of(new StagedMessage(topic, OrderEventAppender.partitionKey(order), context.orderVersion(), record));
    }

    @Override
    public void clear() {
        repository.deleteAllInBatch();
    }

    private static void apply(OrderExecutionView row, OrderExecution record, ProjectionContext context) {
        row.setOrderId(record.getOrderId());
        row.setExecId(record.getExecId());
        row.setRootOrderId(record.getRootOrderId());
        row.setParentOrderId(record.getParentOrderId());
        row.setLeg(record.getLeg());
        row.setClOrdId(record.getClOrdId());
        row.setSessionId(record.getSessionId());
        row.setAccount(record.getAccount());
        row.setSide(record.getSide() != null ? record.getSide().name() : null);
        row.setSymbol(record.getSymbol());
        row.setSecurityId(record.getSecurityId());
        row.setOrdType(record.getOrdType() != null ? record.getOrdType().name() : null);
        row.setPrice(record.getPrice());
        row.setOrderQty(record.getOrderQty());
        row.setSettlCurrency(record.getSettlCurrency());
        row.setExDestination(record.getExDestination());
        row.setLastQty(record.getLastQty());
        row.setLastPx(record.getLastPx());
        row.setExecType(record.getExecType());
        row.setLastCapacity(record.getLastCapacity());
        row.setLastMkt(record.getLastMkt());
        row.setTransactTime(record.getTransactTime());
        row.setCumQty(record.getCumQty());
        row.setLeavesQty(record.getLeavesQty());
        row.setAvgPx(record.getAvgPx());
        row.setState(record.getState() != null ? record.getState().name() : null);
        row.setOrderVersion(record.getOrderVersion());
        row.setTradeDate(record.getTradeDate());
        row.setProjectedAt(context.stagedAt());
    }
}
