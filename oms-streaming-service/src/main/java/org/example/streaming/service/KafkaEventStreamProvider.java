package org.example.streaming.service;

import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Predicate;

import org.example.common.model.msg.Execution;
import org.example.common.model.msg.OrderMessage;
import org.example.streaming.client.OmsQueryClient;
import org.example.streaming.mapper.OrderMessageMapper;
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
import reactor.kafka.receiver.KafkaReceiver;

/**
 * Kafka-based event stream provider using Avro serialization.
 * 
 * <p>Consumes order and execution events from Kafka using Avro/Schema Registry
 * and provides them as reactive streams to RSocket clients.
 * 
 * <p>On subscription with snapshot=true, fetches initial data from OMS Core
 * Query API and merges it with the real-time Kafka stream.
 */
@Service
@Slf4j
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "streaming.kafka", name = "enabled", havingValue = "true", matchIfMissing = true)
public class KafkaEventStreamProvider implements EventStreamProvider {

    private final KafkaReceiver<String, OrderMessage> orderMessageReceiver;
    private final KafkaReceiver<String, Execution> executionReceiver;
    private final OmsQueryClient omsQueryClient;
    private final OrderMessageMapper orderMessageMapper;
    private final FilterService filterService;
    
    // Hot stream sinks for broadcasting events to multiple subscribers
    // Using replay().limit() to buffer recent events for subscribers joining during snapshot fetch
    private final Sinks.Many<OrderEvent> orderEventSink = Sinks.many()
            .replay()
            .limit(100);  // Buffer last 100 events for late subscribers
    
    private final Sinks.Many<ExecutionEvent> executionEventSink = Sinks.many()
            .replay()
            .limit(100);
    
    // In-memory state caches (updated from both REST snapshot and Kafka stream)
    private final ConcurrentHashMap<String, OrderDto> orderCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ExecutionDto> executionCache = new ConcurrentHashMap<>();

    @PostConstruct
    public void startConsuming() {
        log.info("Starting Kafka Avro event consumers");
        startOrderMessageConsumer();
        startExecutionConsumer();
    }

    private void startOrderMessageConsumer() {
        orderMessageReceiver.receive()
                .doOnNext(record -> {
                    OrderMessage msg = record.value();
                    log.info("Received OrderMessage from Kafka: orderId={}, state={}", 
                            msg.getOrderId(), msg.getState());
                    
                    // Convert Avro to streaming DTO
                    OrderDto orderDto = orderMessageMapper.toOrderDto(msg);
                    orderCache.put(msg.getOrderId(), orderDto);
                    
                    // Create and emit order event
                    OrderEvent event = orderMessageMapper.toOrderEvent(msg, "UPDATE");
                    Sinks.EmitResult result = orderEventSink.tryEmitNext(event);
                    log.info("Emitted order event to sink: orderId={}, result={}, subscribers={}", 
                            event.getOrderId(), result, orderEventSink.currentSubscriberCount());
                    
                    record.receiverOffset().acknowledge();
                })
                .doOnError(error -> log.error("Error consuming order messages", error))
                .retryWhen(reactor.util.retry.Retry.backoff(3, Duration.ofSeconds(1)))
                .subscribe();
    }

    private void startExecutionConsumer() {
        executionReceiver.receive()
                .doOnNext(record -> {
                    Execution exec = record.value();
                    log.debug("Received Execution from Kafka: execId={}, orderId={}", 
                            exec.getExecId(), exec.getOrderId());
                    
                    // Convert Avro Execution to streaming DTO
                    ExecutionDto execDto = toExecutionDto(exec);
                    if (exec.getExecId() != null) {
                        executionCache.put(exec.getExecId().toString(), execDto);
                    }
                    
                    // Create and emit execution event
                    ExecutionEvent event = ExecutionEvent.builder()
                            .eventType("NEW")
                            .execId(exec.getExecId() != null ? exec.getExecId().toString() : null)
                            .orderId(exec.getOrderId() != null ? exec.getOrderId().toString() : null)
                            .execution(execDto)
                            .timestamp(Instant.now())
                            .build();
                    
                    executionEventSink.tryEmitNext(event);
                    record.receiverOffset().acknowledge();
                })
                .doOnError(error -> log.error("Error consuming execution messages", error))
                .retryWhen(reactor.util.retry.Retry.backoff(3, Duration.ofSeconds(1)))
                .subscribe();
    }

    @Override
    public Flux<OrderEvent> getOrderEventStream(StreamFilter filter) {
        log.info("Creating order event stream with filter: {}", filter);
        
        // Create predicate from filter (if any) for filtering live stream
        Predicate<OrderEvent> filterPredicate = filter != null && !filter.isEmpty() 
                ? filterService.createOrderEventPredicate(filter)
                : event -> true;
        
        boolean includeSnapshot = filter != null && filter.isIncludeSnapshot();
        
        if (includeSnapshot) {
            // Track eventIds from snapshot for deduplication with live stream
            Set<Long> snapshotEventIds = ConcurrentHashMap.newKeySet();
            AtomicLong maxSnapshotEventId = new AtomicLong(0);
            AtomicBoolean snapshotComplete = new AtomicBoolean(false);
            
            // Fetch filtered snapshot from OMS Core Query API  
            Flux<OrderEvent> snapshotStream = (filter != null && !filter.isEmpty()
                    ? omsQueryClient.fetchOrdersWithFilter(filter)
                    : omsQueryClient.fetchAllOrders())
                    .map(this::convertQueryDtoToOrderDto)
                    .doOnNext(order -> {
                        orderCache.put(order.getOrderId(), order);
                        // Track eventId for deduplication
                        if (order.getEventId() != null) {
                            snapshotEventIds.add(order.getEventId());
                            maxSnapshotEventId.updateAndGet(max -> 
                                    Math.max(max, order.getEventId()));
                        }
                    })
                    .map(order -> OrderEvent.fromOrder(order, "SNAPSHOT"))
                    .doOnComplete(() -> {
                        snapshotComplete.set(true);
                        log.info("Snapshot stream completed with {} orders, maxEventId={}", 
                                snapshotEventIds.size(), maxSnapshotEventId.get());
                    })
                    .onErrorResume(e -> {
                        log.warn("Failed to fetch snapshot from OMS Core, using cache: {}", e.getMessage());
                        snapshotComplete.set(true);
                        // Fallback to cache if OMS Core is not available
                        return Flux.fromIterable(orderCache.values())
                                .filter(order -> filterPredicate.test(OrderEvent.fromOrder(order, "CACHE")))
                                .map(order -> OrderEvent.fromOrder(order, "SNAPSHOT"));
                    });
            
            // Filtered live stream from Kafka with deduplication
            // Buffer events during snapshot, then emit after snapshot completes
            Flux<OrderEvent> liveStream = orderEventSink.asFlux()
                    .doOnNext(event -> {
                        boolean matches = filterPredicate.test(event);
                        log.info("Live stream event: orderId={}, side={}, matches filter={}", 
                                event.getOrderId(), 
                                event.getOrder() != null ? event.getOrder().getSide() : "null",
                                matches);
                    })
                    .filter(filterPredicate)
                    .filter(event -> {
                        // Skip if we already sent this in snapshot
                        Long eventId = event.getEventId();
                        if (eventId != null && snapshotEventIds.contains(eventId)) {
                            log.debug("Skipping duplicate event from live stream: eventId={}", eventId);
                            return false;
                        }
                        return true;
                    });
            
            // Use merge to subscribe to both immediately, but delay live events until snapshot done
            // Snapshot events go first, then live events continue
            return Flux.merge(
                    snapshotStream,
                    liveStream.delaySubscription(snapshotStream.then())
            );
        }
        
        // No snapshot - just return filtered live stream
        Flux<OrderEvent> liveStream = orderEventSink.asFlux()
                .doOnNext(event -> {
                    boolean matches = filterPredicate.test(event);
                    log.info("Live stream event: orderId={}, side={}, matches filter={}", 
                            event.getOrderId(), 
                            event.getOrder() != null ? event.getOrder().getSide() : "null",
                            matches);
                })
                .filter(filterPredicate);
        
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

    /**
     * Converts OMS Query API OrderDto to streaming OrderDto.
     * 
     * <p>The Query API uses generated DTOs from OpenAPI, while the streaming
     * service uses its own DTO format optimized for RSocket streaming.
     * The Query API's 'id' field is mapped to 'eventId' for deduplication.
     */
    private OrderDto convertQueryDtoToOrderDto(org.example.common.model.query.OrderDto queryDto) {
        return OrderDto.builder()
                .eventId(queryDto.getId())  // Map database id to eventId for deduplication
                .orderId(queryDto.getOrderId())
                .parentOrderId(queryDto.getParentOrderId())
                .rootOrderId(queryDto.getRootOrderId())
                .clOrdId(queryDto.getClOrdId())
                .account(queryDto.getAccount())
                .symbol(queryDto.getSymbol())
                .side(queryDto.getSide() != null ? queryDto.getSide().getValue() : null)
                .ordType(queryDto.getOrdType() != null ? queryDto.getOrdType().getValue() : null)
                .state(queryDto.getState() != null ? queryDto.getState().getValue() : null)
                .cancelState(queryDto.getCancelState() != null ? queryDto.getCancelState().getValue() : null)
                .orderQty(queryDto.getOrderQty())
                .cumQty(queryDto.getCumQty())
                .leavesQty(queryDto.getLeavesQty())
                .price(queryDto.getPrice())
                .stopPx(queryDto.getStopPx())
                .timeInForce(queryDto.getTimeInForce())
                .securityId(queryDto.getSecurityId())
                .securityType(queryDto.getSecurityType())
                .exDestination(queryDto.getExDestination())
                .text(queryDto.getText())
                .sendingTime(queryDto.getSendingTime() != null ? queryDto.getSendingTime().toInstant() : null)
                .transactTime(queryDto.getTransactTime() != null ? queryDto.getTransactTime().toInstant() : null)
                .expireTime(queryDto.getExpireTime() != null ? queryDto.getExpireTime().toInstant() : null)
                .eventTime(Instant.now())
                .build();
    }

    /**
     * Converts Avro Execution to streaming ExecutionDto.
     */
    private ExecutionDto toExecutionDto(Execution exec) {
        return ExecutionDto.builder()
                .execId(exec.getExecId() != null ? exec.getExecId().toString() : null)
                .orderId(exec.getOrderId() != null ? exec.getOrderId().toString() : null)
                .eventTime(Instant.now())
                .build();
    }
}
