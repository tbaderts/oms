package org.example.oms.service.execution.tasks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.util.ArrayList;
import java.util.List;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.model.msg.OrderExecution;
import org.example.common.orchestration.TaskExecutionException;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.projection.Projection;
import org.example.oms.projection.ProjectionContext;
import org.example.oms.projection.StagedMessage;
import org.example.oms.service.OrderEventAppender;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

/** SPEC-0020: every projection runs for the fill, in a stable order, and a failure fails the task. */
class ProjectTaskTest {

    private final OrderEventAppender appender = mock(OrderEventAppender.class);

    @Test
    void runsEveryProjectionInNameOrderAndStagesTheirMessages() throws Exception {
        List<String> seen = new ArrayList<>();
        StagedMessage fromA = message("a");
        StagedMessage fromB = message("b");
        ProjectTask task = new ProjectTask(
                List.of(projection("b_view", fromB, seen), projection("a_view", fromA, seen)), appender);
        OrderTaskContext context = context();

        assertTrue(task.execute(context).isSuccess());

        assertEquals(List.of("a_view v7", "b_view v7"), seen, "projected in name order with the event version");
        InOrder staging = inOrder(appender);
        staging.verify(appender).stageMessage(fromA);
        staging.verify(appender).stageMessage(fromB);
    }

    @Test
    void aFailingProjectionFailsTheTask() {
        Projection failing = new Projection() {
            @Override public String name() { return "failing_view"; }
            @Override public List<StagedMessage> project(ProjectionContext context) { throw new IllegalStateException("boom"); }
            @Override public void clear() { }
        };
        ProjectTask task = new ProjectTask(List.of(failing), appender);

        TaskExecutionException e = assertThrows(TaskExecutionException.class, () -> task.execute(context()));
        assertTrue(e.getMessage().contains("failing_view"), e.getMessage());
        verify(appender, never()).stageMessage(any());
    }

    @Test
    void runsAfterThePublishTask() {
        assertTrue(new ProjectTask(List.of(), appender).getOrder()
                > new PublishExecutionEventTask(appender).getOrder());
    }

    private static OrderTaskContext context() {
        OrderTaskContext context = new OrderTaskContext(Order.builder().orderId("ORD-1").build());
        context.setExecution(Execution.builder().orderId("ORD-1").execID("EX-1").build());
        context.put("eventVersion", 7L);
        return context;
    }

    private static StagedMessage message(String key) {
        return new StagedMessage("oms_order_executions", key, 7L, new OrderExecution());
    }

    private static Projection projection(String name, StagedMessage message, List<String> seen) {
        return new Projection() {
            @Override public String name() { return name; }
            @Override public List<StagedMessage> project(ProjectionContext context) {
                assertSame("ORD-1", context.order().getOrderId());
                seen.add(name + " v" + context.orderVersion());
                return List.of(message);
            }
            @Override public void clear() { }
        };
    }
}
