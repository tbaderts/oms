package org.example.streaming.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Duration;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.example.common.model.msg.OrderExecution;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.msg.Side;
import org.example.common.model.msg.State;
import org.example.streaming.client.OmsQueryClient;
import org.example.streaming.mapper.OrderExecutionMapper;
import org.example.streaming.mapper.OrderMessageMapper;
import org.example.streaming.model.OrderDto;
import org.example.streaming.model.OrderEvent;
import org.example.streaming.model.StreamFilter;
import org.example.streaming.model.StreamRequest;
import org.example.streaming.model.StreamRequest.StreamType;
import org.example.streaming.service.FilterService;
import org.example.streaming.service.KafkaEventStreamProvider;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.test.util.ReflectionTestUtils;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;
import reactor.kafka.receiver.KafkaReceiver;
import reactor.kafka.receiver.ReceiverOffset;
import reactor.kafka.receiver.ReceiverRecord;
import reactor.test.StepVerifier;

/**
 * SPEC-0019 AC-8 (review finding 15). A fill on the blotter stream used to be an event with ids only,
 * shown as an empty row. It now carries the order as of that fill, taken from the OrderExecution
 * record. Drives the real provider and controller; only the Kafka receivers are mocked.
 */
class TradeBlotterExecutionStreamTest {

    @ParameterizedTest
    @EnumSource(value = StreamType.class, names = {"EXECUTIONS", "ALL"})
    void executionsAndAllStreams_carryOrderFields(StreamType streamType) {
        Sinks.Many<ReceiverRecord<String, OrderExecution>> fills = Sinks.many().unicast().onBackpressureBuffer();
        KafkaEventStreamProvider provider = startProvider(fills);
        TradeBlotterController controller = new TradeBlotterController(provider, new FilterService());
        OrderExecution fill = fill();

        try {
            StepVerifier.create(controller.streamBlotter(StreamRequest.builder()
                            .blotterId("b-1")
                            .streamType(streamType)
                            .filter(StreamFilter.liveOnly())
                            .build()))
                    .then(() -> fills.tryEmitNext(new ReceiverRecord<>(
                            new ConsumerRecord<>("oms_order_executions", 0, 0L, "ORD-1", fill),
                            mock(ReceiverOffset.class))))
                    .assertNext(event -> assertCarriesOrder(event, fill))
                    .thenCancel()
                    .verify(Duration.ofSeconds(5));
        } finally {
            provider.shutdown();
        }
    }

    private static void assertCarriesOrder(OrderEvent event, OrderExecution fill) {
        assertEquals("EXECUTION_F", event.getEventType());
        assertEquals("ORD-1", event.getOrderId());
        OrderDto order = event.getOrder();
        assertNotNull(order, "the fill's event carries its order");
        assertEquals(fill.getOrderId(), order.getOrderId());
        assertEquals(fill.getSymbol(), order.getSymbol());
        assertEquals(fill.getSide().name(), order.getSide());
        assertEquals(fill.getAccount(), order.getAccount());
        assertEquals(0, fill.getOrderQty().compareTo(order.getOrderQty()));
        assertEquals(0, fill.getCumQty().compareTo(order.getCumQty()));
        assertEquals(0, fill.getLeavesQty().compareTo(order.getLeavesQty()));
        assertEquals(fill.getState().name(), order.getState());
    }

    private static OrderExecution fill() {
        OrderExecution fill = new OrderExecution();
        fill.setExecId("EX-1");
        fill.setExecType("F");
        fill.setLastQty(new BigDecimal("40.0000"));
        fill.setLastPx(new BigDecimal("101.0000"));
        fill.setOrderId("ORD-1");
        fill.setRootOrderId("ORD-1");
        fill.setAccount("ACCT-1");
        fill.setSymbol("AAPL");
        fill.setSide(Side.BUY);
        fill.setOrderQty(new BigDecimal("100.0000"));
        fill.setCumQty(new BigDecimal("40.0000"));
        fill.setLeavesQty(new BigDecimal("60.0000"));
        fill.setState(State.LIVE);
        fill.setOrderVersion(3L);
        return fill;
    }

    private static KafkaEventStreamProvider startProvider(Sinks.Many<ReceiverRecord<String, OrderExecution>> fills) {
        @SuppressWarnings("unchecked")
        KafkaReceiver<String, OrderMessage> orderReceiver = mock(KafkaReceiver.class);
        @SuppressWarnings("unchecked")
        KafkaReceiver<String, OrderExecution> orderExecutionReceiver = mock(KafkaReceiver.class);
        when(orderReceiver.receive()).thenReturn(Flux.never());
        when(orderExecutionReceiver.receive()).thenReturn(fills.asFlux());
        OmsQueryClient queryClient = mock(OmsQueryClient.class);
        when(queryClient.fetchAllOrders()).thenReturn(Flux.empty());

        KafkaEventStreamProvider provider = new KafkaEventStreamProvider(
                orderReceiver,
                orderExecutionReceiver,
                queryClient,
                new OrderMessageMapper(),
                new OrderExecutionMapper(),
                new FilterService());
        // @Value is not applied outside Spring; at 0 every cache put would be evicted at once.
        ReflectionTestUtils.setField(provider, "maxCacheSize", 100);
        provider.startConsuming();
        return provider;
    }
}
