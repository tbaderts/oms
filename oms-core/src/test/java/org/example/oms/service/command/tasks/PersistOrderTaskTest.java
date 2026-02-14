package org.example.oms.service.command.tasks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.example.common.model.Order;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.repository.OrderRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PersistOrderTaskTest {

    @Mock
    private OrderRepository orderRepository;

    @InjectMocks
    private PersistOrderTask task;

    @Test
    void execute_whenDuplicateSessionAndClOrdId_returnsFailure() throws Exception {
        Order order = Order.builder().sessionId("SESSION-1").clOrdId("CL-1").build();
        OrderTaskContext context = new OrderTaskContext(order);

        when(orderRepository.existsBySessionIdAndClOrdId("SESSION-1", "CL-1")).thenReturn(true);

        TaskResult result = task.execute(context);

        assertEquals(TaskResult.Status.FAILED, result.getStatus());
        assertEquals("Duplicate order for sessionId=SESSION-1 and clOrdId=CL-1", result.getMessage());
        verify(orderRepository, never()).save(order);
    }

    @Test
    void execute_whenNoDuplicate_persistsOrder() throws Exception {
        Order order = Order.builder().sessionId("SESSION-2").clOrdId("CL-2").orderId("ORD-2").build();
        Order saved = order.toBuilder().id(100L).build();
        OrderTaskContext context = new OrderTaskContext(order);

        when(orderRepository.existsBySessionIdAndClOrdId("SESSION-2", "CL-2")).thenReturn(false);
        when(orderRepository.save(order)).thenReturn(saved);

        TaskResult result = task.execute(context);

        assertEquals(TaskResult.Status.SUCCESS, result.getStatus());
        assertEquals(saved, context.getOrder());
        verify(orderRepository).save(order);
    }
}
