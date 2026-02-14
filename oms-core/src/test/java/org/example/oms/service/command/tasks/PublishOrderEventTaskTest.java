package org.example.oms.service.command.tasks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.example.common.model.Order;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.model.OrderOutbox;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.model.ProcessingEvent;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.repository.OrderOutboxRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

@ExtendWith(MockitoExtension.class)
class PublishOrderEventTaskTest {

    @Mock
    private OrderOutboxRepository orderOutboxRepository;

    @Mock
    private OrderEventRepository orderEventRepository;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @InjectMocks
    private PublishOrderEventTask task;

    @Test
    void execute_persistsOrderEventAndOutbox_andPublishesProcessingEvent() throws Exception {
        Order order = Order.builder().id(100L).orderId("ORD-100").build();
        OrderTaskContext context = new OrderTaskContext(order);
        context.setCommand(new OrderCreateCmd().type("OrderCreateCmd"));

        OrderOutbox savedOutbox = OrderOutbox.builder().id(200L).order(order).build();
        when(orderOutboxRepository.save(any(OrderOutbox.class))).thenReturn(savedOutbox);

        TaskResult result = task.execute(context);

        ArgumentCaptor<OrderEvent> orderEventCaptor = ArgumentCaptor.forClass(OrderEvent.class);
        verify(orderEventRepository).save(orderEventCaptor.capture());
        OrderEvent persistedEvent = orderEventCaptor.getValue();
        assertEquals("ORD-100", persistedEvent.getOrderId());
        assertEquals(Event.NEW_ORDER, persistedEvent.getEvent());

        verify(orderOutboxRepository).save(any(OrderOutbox.class));

        ArgumentCaptor<ProcessingEvent> processingEventCaptor =
                ArgumentCaptor.forClass(ProcessingEvent.class);
        verify(eventPublisher).publishEvent(processingEventCaptor.capture());
        assertEquals(200L, processingEventCaptor.getValue().getOrderOutbox().getId());

        assertEquals(TaskResult.Status.SUCCESS, result.getStatus());
    }
}