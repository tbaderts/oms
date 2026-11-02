package org.example.oms.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.repository.OrderEventRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class OrderReplayServiceTest {

    @Mock private OrderEventRepository orderEventRepository;
    @InjectMocks private OrderReplayService orderReplayService;

    /**
     * SPEC-0027 AC-6: the replayed order's version is the event's. Snapshots written before the
     * order version and the event version were unified carry Hibernate's old counter instead.
     */
    @Test
    void replaySetsTheVersionFromTheEvent() {
        Order legacySnapshot = Order.builder().orderId("ORD-1").state(State.LIVE).txNr(1L).build();
        when(orderEventRepository.findFirstByOrderIdAndVersionLessThanEqualOrderByVersionDesc("ORD-1", Long.MAX_VALUE))
                .thenReturn(Optional.of(OrderEvent.builder()
                        .orderId("ORD-1")
                        .version(2L)
                        .event(Event.ACK)
                        .orderSnapshot(legacySnapshot)
                        .build()));

        Order replayed = orderReplayService.replay("ORD-1").orElseThrow();

        assertEquals(2L, replayed.getTxNr());
        assertEquals(State.LIVE, replayed.getState());
    }
}
