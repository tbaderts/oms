package org.example.oms.service.command;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.oms.repository.OrderRepository;
import org.example.oms.service.command.OrderAcceptCommandProcessor.OrderAcceptResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class OrderAcceptCommandProcessorTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private OrderAcceptCmd command;

    private OrderAcceptCommandProcessor processor;

    @BeforeEach
    void setUp() {
        processor = new OrderAcceptCommandProcessor(orderRepository);
    }

    @Test
    void process_whenOrderInUnackState_movesToLiveAndPersists() {
        Order order = Order.builder().orderId("ORD-1").state(State.UNACK).build();
        when(command.getOrderId()).thenReturn("ORD-1");
        when(orderRepository.findByOrderId("ORD-1")).thenReturn(Optional.of(order));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        OrderAcceptResult result = processor.process(command);

        assertTrue(result.isSuccess());
        assertEquals("ORD-1", result.getOrderId());

        ArgumentCaptor<Order> savedCaptor = ArgumentCaptor.forClass(Order.class);
        verify(orderRepository).save(savedCaptor.capture());
        assertEquals(State.LIVE, savedCaptor.getValue().getState());
    }

    @Test
    void process_whenOrderMissing_returnsFailure() {
        when(command.getOrderId()).thenReturn("ORD-404");
        when(orderRepository.findByOrderId("ORD-404")).thenReturn(Optional.empty());

        OrderAcceptResult result = processor.process(command);

        assertFalse(result.isSuccess());
        assertEquals("ORD-404", result.getOrderId());
        verify(orderRepository, never()).save(any(Order.class));
    }

    @Test
    void process_whenInvalidTransition_returnsFailure() {
        Order order = Order.builder().orderId("ORD-2").state(State.NEW).build();
        when(command.getOrderId()).thenReturn("ORD-2");
        when(orderRepository.findByOrderId("ORD-2")).thenReturn(Optional.of(order));

        OrderAcceptResult result = processor.process(command);

        assertFalse(result.isSuccess());
        assertTrue(result.getErrorMessage().contains("Invalid state transition"));
        verify(orderRepository, never()).save(any(Order.class));
    }
}
