package org.example.oms.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;

import org.example.common.model.Order;
import org.example.oms.model.OutboxMessage;
import org.example.oms.repository.OutboxRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

@ExtendWith(MockitoExtension.class)
class OutboxRelayTest {

    @Mock private OutboxRepository outboxRepository;
    @Mock private MessagePublisher messagePublisher;

    private OutboxRelay relay;

    @BeforeEach
    void setUp() {
        relay =
                new OutboxRelay(
                        outboxRepository, messagePublisher, new SimpleMeterRegistry(), 100, 3);
    }

    @Test
    void drain_publishesAndRemovesEachMessage() throws Exception {
        OutboxMessage first = message(1L);
        OutboxMessage second = message(2L);
        when(outboxRepository.claimPending(any(Integer.class), any())).thenReturn(List.of(first, second));

        relay.drain();

        verify(messagePublisher).publish(first);
        verify(messagePublisher).publish(second);
        verify(outboxRepository).delete(first);
        verify(outboxRepository).delete(second);
    }

    /**
     * A failed send must leave the row in place — losing it is exactly the failure mode the relay
     * exists to prevent.
     */
    @Test
    void drain_whenPublishFails_keepsTheMessageAndCountsTheAttempt() throws Exception {
        OutboxMessage message = message(1L);
        when(outboxRepository.claimPending(any(Integer.class), any())).thenReturn(List.of(message));
        doThrow(new IllegalStateException("broker down")).when(messagePublisher).publish(message);

        relay.drain();

        verify(outboxRepository, never()).delete(message);
        assertEquals(1, message.getAttempts());
        assertEquals("broker down", message.getLastError());
    }

    /**
     * Publishing later messages past a stuck one would put an order's transitions on its partition
     * out of order, which is the ordering guarantee the relay is supposed to provide.
     */
    @Test
    void drain_stopsAtTheFirstFailureToPreserveOrdering() throws Exception {
        OutboxMessage failing = message(1L);
        OutboxMessage behind = message(2L);
        when(outboxRepository.claimPending(any(Integer.class), any()))
                .thenReturn(List.of(failing, behind));
        doThrow(new IllegalStateException("broker down")).when(messagePublisher).publish(failing);

        relay.drain();

        verify(messagePublisher, never()).publish(behind);
        verify(outboxRepository, never()).delete(behind);
    }

    @Test
    void drain_whenNothingPending_doesNothing() throws Exception {
        when(outboxRepository.claimPending(any(Integer.class), any())).thenReturn(List.of());

        relay.drain();

        verify(messagePublisher, never()).publish(any());
    }

    private OutboxMessage message(long id) {
        return OutboxMessage.builder()
                .id(id)
                .aggregateType(OutboxMessage.AggregateType.ORDER)
                .aggregateId("ORD-" + id)
                .topic("oms_orders")
                .orderPayload(Order.builder().orderId("ORD-" + id).build())
                .createdAt(Instant.now())
                .attempts(0)
                .build();
    }
}
