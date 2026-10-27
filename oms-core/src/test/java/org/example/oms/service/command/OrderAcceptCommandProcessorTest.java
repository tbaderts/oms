package org.example.oms.service.command;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.oms.model.Event;
import org.example.oms.repository.OrderRepository;
import org.example.oms.service.OrderEventAppender;
import org.example.oms.service.command.OrderAcceptCommandProcessor.OrderAcceptResult;
import org.example.oms.service.sla.OrderSlaRecorder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

@ExtendWith(MockitoExtension.class)
class OrderAcceptCommandProcessorTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private OrderEventAppender orderEventAppender;

    @Mock
    private OrderAcceptCmd command;

    private OrderAcceptCommandProcessor processor;

    @BeforeEach
    void setUp() {
        processor =
                new OrderAcceptCommandProcessor(
                        orderRepository,
                        orderEventAppender,
                        new OrderSlaRecorder(new SimpleMeterRegistry(), Clock.systemUTC()));
    }

    @Test
    void process_whenOrderInUnackState_movesToLiveAndPersists() {
        Order order = Order.builder().orderId("ORD-1").state(State.UNACK).build();
        when(command.getOrderId()).thenReturn("ORD-1");
        when(orderRepository.findByOrderId("ORD-1")).thenReturn(Optional.of(order));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        OrderAcceptResult result = processor.process(command, Instant.now());

        assertTrue(result.isSuccess());
        assertEquals("ORD-1", result.getOrderId());

        ArgumentCaptor<Order> savedCaptor = ArgumentCaptor.forClass(Order.class);
        verify(orderRepository).save(savedCaptor.capture());
        assertEquals(State.LIVE, savedCaptor.getValue().getState());
    }

    /**
     * The accept path used to mutate the order and record nothing, so the transition to LIVE was
     * absent from the audit log and invisible to downstream consumers.
     */
    @Test
    void process_whenAccepted_recordsAckEventAgainstTheLiveOrder() {
        Order order = Order.builder().orderId("ORD-1").state(State.UNACK).build();
        when(command.getOrderId()).thenReturn("ORD-1");
        when(orderRepository.findByOrderId("ORD-1")).thenReturn(Optional.of(order));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        processor.process(command, Instant.now());

        ArgumentCaptor<Order> eventOrderCaptor = ArgumentCaptor.forClass(Order.class);
        verify(orderEventAppender)
                .appendOrderEvent(eventOrderCaptor.capture(), eq(Event.ACK), eq(command));
        assertEquals(State.LIVE, eventOrderCaptor.getValue().getState());
    }

    /**
     * The ack timestamp must be the one observed at the boundary, not one read from the clock after
     * the repository lookup — otherwise our own database time is folded into a number that is
     * supposed to describe how long the broker took.
     */
    @Test
    void process_whenAccepted_stampsTheMarketAckWithTheObservedIngressTime() {
        Instant observed = Instant.parse("2026-09-04T09:30:00.030000Z");
        Order order =
                Order.builder()
                        .orderId("ORD-1")
                        .state(State.UNACK)
                        .orderReceivedTime(Instant.parse("2026-09-04T09:30:00.000000Z"))
                        .marketSendTime(Instant.parse("2026-09-04T09:30:00.004000Z"))
                        .build();
        when(command.getOrderId()).thenReturn("ORD-1");
        when(orderRepository.findByOrderId("ORD-1")).thenReturn(Optional.of(order));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        processor.process(command, observed);

        ArgumentCaptor<Order> savedCaptor = ArgumentCaptor.forClass(Order.class);
        verify(orderRepository).save(savedCaptor.capture());
        assertEquals(observed, savedCaptor.getValue().getMarketAckTime());
    }

    @Test
    void process_whenRejected_recordsNoEvent() {
        Order order = Order.builder().orderId("ORD-2").state(State.NEW).build();
        when(command.getOrderId()).thenReturn("ORD-2");
        when(orderRepository.findByOrderId("ORD-2")).thenReturn(Optional.of(order));

        processor.process(command, Instant.now());

        verify(orderEventAppender, never()).appendOrderEvent(any(), any(), any());
    }

    @Test
    void process_whenOrderMissing_returnsFailure() {
        when(command.getOrderId()).thenReturn("ORD-404");
        when(orderRepository.findByOrderId("ORD-404")).thenReturn(Optional.empty());

        OrderAcceptResult result = processor.process(command, Instant.now());

        assertFalse(result.isSuccess());
        assertEquals("ORD-404", result.getOrderId());
        verify(orderRepository, never()).save(any(Order.class));
    }

    @Test
    void process_whenInvalidTransition_returnsFailure() {
        Order order = Order.builder().orderId("ORD-2").state(State.NEW).build();
        when(command.getOrderId()).thenReturn("ORD-2");
        when(orderRepository.findByOrderId("ORD-2")).thenReturn(Optional.of(order));

        OrderAcceptResult result = processor.process(command, Instant.now());

        assertFalse(result.isSuccess());
        assertTrue(result.getErrorMessage().contains("Invalid state transition"));
        verify(orderRepository, never()).save(any(Order.class));
    }
}
