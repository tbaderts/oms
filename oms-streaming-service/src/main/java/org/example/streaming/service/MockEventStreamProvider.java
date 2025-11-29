package org.example.streaming.service;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Predicate;

import org.example.streaming.model.ExecutionDto;
import org.example.streaming.model.ExecutionEvent;
import org.example.streaming.model.OrderDto;
import org.example.streaming.model.OrderEvent;
import org.example.streaming.model.StreamFilter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;

/**
 * Mock event stream provider for development and testing without Kafka.
 * 
 * <p>Generates simulated order and execution events when Kafka is disabled.
 * Useful for UI development and integration testing.
 * 
 * <p>Enable by setting: streaming.kafka.enabled=false
 */
@Service
@Slf4j
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "streaming.kafka", name = "enabled", havingValue = "false")
public class MockEventStreamProvider implements EventStreamProvider {

    private final FilterService filterService;

    private final Sinks.Many<OrderEvent> orderEventSink = Sinks.many()
            .multicast()
            .onBackpressureBuffer(1000);
    
    private final Sinks.Many<ExecutionEvent> executionEventSink = Sinks.many()
            .multicast()
            .onBackpressureBuffer(1000);

    private final ConcurrentHashMap<String, OrderDto> orderCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ExecutionDto> executionCache = new ConcurrentHashMap<>();

    private final AtomicLong sequenceNumber = new AtomicLong(0);
    private final Random random = new Random();
    
    private static final String[] SYMBOLS = {"AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "NVDA", "JPM"};
    private static final String[] SIDES = {"BUY", "SELL"};
    private static final String[] STATES = {"NEW", "LIVE", "FILLED", "PARTIALLY_FILLED"};
    private static final String[] ORD_TYPES = {"MARKET", "LIMIT", "STOP"};

    @PostConstruct
    public void startMockEventGeneration() {
        log.info("Starting mock event generation (Kafka disabled)");
        
        // Generate initial orders
        generateInitialOrders();
        
        // Generate periodic order updates
        Flux.interval(Duration.ofSeconds(2))
                .subscribe(tick -> generateRandomOrderEvent());
        
        // Generate periodic executions
        Flux.interval(Duration.ofSeconds(5))
                .subscribe(tick -> generateRandomExecutionEvent());
    }

    private void generateInitialOrders() {
        for (int i = 0; i < 10; i++) {
            OrderEvent event = createRandomOrderEvent("CREATE");
            orderCache.put(event.getOrderId(), event.getOrder());
            orderEventSink.tryEmitNext(event);
        }
        log.info("Generated {} initial mock orders", 10);
    }

    private void generateRandomOrderEvent() {
        String eventType = random.nextBoolean() ? "UPDATE" : "CREATE";
        OrderEvent event = createRandomOrderEvent(eventType);
        orderCache.put(event.getOrderId(), event.getOrder());
        orderEventSink.tryEmitNext(event);
        log.debug("Generated mock order event: orderId={}, type={}", 
                event.getOrderId(), event.getEventType());
    }

    private void generateRandomExecutionEvent() {
        ExecutionEvent event = createRandomExecutionEvent();
        executionCache.put(event.getExecId(), event.getExecution());
        executionEventSink.tryEmitNext(event);
        log.debug("Generated mock execution event: execId={}", event.getExecId());
    }

    private OrderEvent createRandomOrderEvent(String eventType) {
        String orderId = "ORD-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        BigDecimal orderQty = BigDecimal.valueOf(100 * (random.nextInt(10) + 1));
        BigDecimal cumQty = eventType.equals("CREATE") ? BigDecimal.ZERO : 
                orderQty.multiply(BigDecimal.valueOf(random.nextDouble()));
        
        OrderDto order = OrderDto.builder()
                .orderId(orderId)
                .clOrdId("CL-" + orderId)
                .symbol(SYMBOLS[random.nextInt(SYMBOLS.length)])
                .side(SIDES[random.nextInt(SIDES.length)])
                .ordType(ORD_TYPES[random.nextInt(ORD_TYPES.length)])
                .state(STATES[random.nextInt(STATES.length)])
                .orderQty(orderQty)
                .cumQty(cumQty)
                .leavesQty(orderQty.subtract(cumQty))
                .price(BigDecimal.valueOf(100 + random.nextDouble() * 200))
                .account("ACCT-001")
                .sendingTime(Instant.now())
                .transactTime(Instant.now())
                .sequenceNumber(sequenceNumber.incrementAndGet())
                .eventTime(Instant.now())
                .build();
        
        return OrderEvent.fromOrder(order, eventType);
    }

    private ExecutionEvent createRandomExecutionEvent() {
        String execId = "EXEC-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        String orderId = "ORD-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        
        ExecutionDto execution = ExecutionDto.builder()
                .execId(execId)
                .orderId(orderId)
                .lastQty(BigDecimal.valueOf(50 * (random.nextInt(5) + 1)))
                .lastPx(BigDecimal.valueOf(100 + random.nextDouble() * 200))
                .cumQty(BigDecimal.valueOf(100))
                .avgPx(BigDecimal.valueOf(150))
                .leavesQty(BigDecimal.valueOf(400))
                .execType("FILL")
                .transactTime(Instant.now())
                .sequenceNumber(sequenceNumber.incrementAndGet())
                .eventTime(Instant.now())
                .build();
        
        return ExecutionEvent.fromExecution(execution, "NEW");
    }

    @Override
    public Flux<OrderEvent> getOrderEventStream(StreamFilter filter) {
        // Create predicate from filter (if any) for filtering
        Predicate<OrderEvent> filterPredicate = filter != null && !filter.isEmpty() 
                ? filterService.createOrderEventPredicate(filter)
                : event -> true;
        
        Flux<OrderEvent> liveStream = orderEventSink.asFlux()
                .filter(filterPredicate);
        
        boolean includeSnapshot = filter != null && filter.isIncludeSnapshot();
        
        if (includeSnapshot) {
            Flux<OrderEvent> snapshotStream = Flux.fromIterable(orderCache.values())
                    .filter(order -> filterPredicate.test(OrderEvent.fromOrder(order, "MOCK")))
                    .map(order -> OrderEvent.fromOrder(order, "SNAPSHOT"));
            return snapshotStream.concatWith(liveStream);
        }
        
        return liveStream;
    }

    @Override
    public Flux<ExecutionEvent> getExecutionEventStream(boolean includeSnapshot) {
        Flux<ExecutionEvent> liveStream = executionEventSink.asFlux();
        
        if (includeSnapshot) {
            Flux<ExecutionEvent> snapshotStream = Flux.fromIterable(executionCache.values())
                    .map(exec -> ExecutionEvent.fromExecution(exec, "SNAPSHOT"));
            return snapshotStream.concatWith(liveStream);
        }
        
        return liveStream;
    }

    @Override
    public Flux<OrderDto> getCurrentOrders() {
        return Flux.fromIterable(orderCache.values());
    }

    @Override
    public Flux<ExecutionDto> getCurrentExecutions() {
        return Flux.fromIterable(executionCache.values());
    }

    @Override
    public int getOrderCacheSize() {
        return orderCache.size();
    }

    @Override
    public int getExecutionCacheSize() {
        return executionCache.size();
    }
}
