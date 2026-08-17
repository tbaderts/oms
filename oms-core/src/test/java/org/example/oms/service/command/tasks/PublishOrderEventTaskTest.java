package org.example.oms.service.command.tasks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.example.common.model.Order;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.Event;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.service.OrderEventAppender;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PublishOrderEventTaskTest {

    @Mock private OrderEventAppender orderEventAppender;

    @InjectMocks private PublishOrderEventTask task;

    @Test
    void execute_recordsNewOrderEventThroughTheSharedAppender() throws Exception {
        Order order = Order.builder().id(100L).orderId("ORD-100").build();
        OrderTaskContext context = new OrderTaskContext(order);
        OrderCreateCmd command = new OrderCreateCmd().type("OrderCreateCmd");
        context.setCommand(command);

        when(orderEventAppender.appendOrderEvent(order, Event.NEW_ORDER, command)).thenReturn(1L);

        TaskResult result = task.execute(context);

        verify(orderEventAppender).appendOrderEvent(order, Event.NEW_ORDER, command);
        assertEquals(TaskResult.Status.SUCCESS, result.getStatus());
        assertEquals(1L, context.get("eventVersion").orElseThrow());
    }

    @Test
    void execute_wrapsAppenderFailureSoThePipelineRollsBack() {
        Order order = Order.builder().id(101L).orderId("ORD-101").build();
        OrderTaskContext context = new OrderTaskContext(order);

        when(orderEventAppender.appendOrderEvent(eq(order), eq(Event.NEW_ORDER), any()))
                .thenThrow(new IllegalStateException("outbox unavailable"));

        org.junit.jupiter.api.Assertions.assertThrows(
                org.example.common.orchestration.TaskExecutionException.class,
                () -> task.execute(context));
    }
}
