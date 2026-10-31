package org.example.streaming.service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Predicate;

import org.example.common.model.msg.OrderExecution;
import org.example.common.model.msg.OrderMessage;
import org.example.streaming.client.OmsQueryClient;
import org.example.streaming.mapper.OrderExecutionMapper;
import org.example.streaming.mapper.OrderMessageMapper;
import org.example.streaming.model.ExecutionDto;
import org.example.streaming.model.ExecutionEvent;
import org.example.streaming.model.OrderDto;
import org.example.streaming.model.OrderEvent;
import org.example.streaming.model.StreamFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import reactor.core.Disposable;
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
@ConditionalOnProperty(prefix = "streaming.kafka", name = "enabled", havingValue = "true", matchIfMissing = true)
public class KafkaEventStreamProvider implements EventStreamProvider {

    private static final String[] TERMINAL_STATES = {"FILLED", "CXL", "REJ", "CLOSED", "EXP"};

    private final KafkaReceiver<String, OrderMessage> orderMessageReceiver;
    private final KafkaReceiver<String, OrderExecution> orderExecutionReceiver;
    private final OmsQueryClient omsQueryClient;
    private final OrderMessageMapper orderMessageMapper;
    private final OrderExecutionMapper orderExecutionMapper;
    private final FilterService filterService;

    @Value("${streaming.buffer.max-size:10000}")
    private int maxCacheSize;

    // Hot stream sinks for broadcasting events to multiple subscribers
    private final Sinks.Many<OrderEvent> orderEventSink = Sinks.many()
            .replay()
            .limit(100);

    private final Sinks.Many<ExecutionEvent> executionEventSink = Sinks.many()
            .replay()
            .limit(100);

    // Bounded in-memory state caches (updated from both REST snapshot and Kafka stream)
    private final ConcurrentHashMap<String, OrderDto> orderCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ExecutionDto> executionCache = new ConcurrentHashMap<>();

    // Disposables for graceful shutdown
    private volatile Disposable orderConsumerDisposable;
    private volatile Disposable executionConsumerDisposable;

    public KafkaEventStreamProvider(
            KafkaReceiver<String, OrderMessage> orderMessageReceiver,
            KafkaReceiver<String, OrderExecution> orderExecutionReceiver,
            OmsQueryClient omsQueryClient,
            OrderMessageMapper orderMessageMapper,
            OrderExecutionMapper orderExecutionMapper,
            FilterService filterService) {
        this.orderMessageReceiver = orderMessageReceiver;
        this.orderExecutionReceiver = orderExecutionReceiver;
        this.omsQueryClient = omsQueryClient;
        this.orderMessageMapper = orderMessageMapper;
        this.orderExecutionMapper = orderExecutionMapper;
        this.filterService = filterService;
    }

    @PostConstruct
    public void startConsuming() {
        log.info("Starting Kafka Avro event consumers");
        startOrderMessageConsumer();
        startExecutionConsumer();
    }

    @PreDestroy
    public void shutdown() {
        log.info("Shutting down Kafka event consumers");
        if (orderConsumerDisposable != null && !orderConsumerDisposable.isDisposed()) {
            orderConsumerDisposable.dispose();
        }
        if (executionConsumerDisposable != null && !executionConsumerDisposable.isDisposed()) {
            executionConsumerDisposable.dispose();
        }
        orderEventSink.tryEmitComplete();
        executionEventSink.tryEmitComplete();
    }

    private void startOrderMessageConsumer() {
        orderConsumerDisposable = orderMessageReceiver.receive()
                .doOnNext(record -> {
                    OrderMessage msg = record.value();
                    log.debug("Received OrderMessage from Kafka: orderId={}, state={}",
                            msg.getOrderId(), msg.getState());

                    // Convert Avro to streaming DTO
                    OrderDto orderDto = orderMessageMapper.toOrderDto(msg);
                    orderCache.put(msg.getOrderId(), orderDto);
                    evictTerminalOrders();

                    // Create and emit order event
                    OrderEvent event = orderMessageMapper.toOrderEvent(msg, "UPDATE");
                    Sinks.EmitResult result = orderEventSink.tryEmitNext(event);
                    log.debug("Emitted order event to sink: orderId={}, result={}, subscribers={}",
                            event.getOrderId(), result, orderEventSink.currentSubscriberCount());

                    record.receiverOffset().acknowledge();
                })
                .doOnError(error -> log.error("Error consuming order messages", error))
                .retryWhen(reactor.util.retry.Retry.backoff(Long.MAX_VALUE, Duration.ofSeconds(1))
                        .maxBackoff(Duration.ofMinutes(5))
                        .jitter(0.5)
                        .doBeforeRetry(signal -> log.warn("Retrying order consumer after error (attempt {}): {}",
                                signal.totalRetries() + 1, signal.failure().getMessage())))
                .subscribe();
    }

    private void startExecutionConsumer() {
        executionConsumerDisposable = orderExecutionReceiver.receive()
                .doOnNext(record -> {
                    OrderExecution fill = record.value();
                    log.debug("Received OrderExecution from Kafka: execId={}, orderId={}, orderVersion={}",
                            fill.getExecId(), fill.getOrderId(), fill.getOrderVersion());

                    if (isRedelivery(fill)) {
                        // The relay publishes at least once; the same fill carries the same
                        // (orderId, execId, orderVersion) every time and has already been shown.
                        log.debug("Skipping redelivered fill: orderId={}, execId={}, orderVersion={}",
                                fill.getOrderId(), fill.getExecId(), fill.getOrderVersion());
                        record.receiverOffset().acknowledge();
                        return;
                    }

                    ExecutionDto execDto = orderExecutionMapper.toExecutionDto(fill);
                    if (fill.getExecId() != null) {
                        executionCache.put(executionKey(fill), execDto);
                        evictOldExecutions();
                    }

                    String eventType = fill.getExecType() != null ? fill.getExecType() : "NEW";
                    executionEventSink.tryEmitNext(ExecutionEvent.fromExecution(execDto, eventType));
                    record.receiverOffset().acknowledge();
                })
                .doOnError(error -> log.error("Error consuming execution messages", error))
                .retryWhen(reactor.util.retry.Retry.backoff(Long.MAX_VALUE, Duration.ofSeconds(1))
                        .maxBackoff(Duration.ofMinutes(5))
                        .jitter(0.5)
                        .doBeforeRetry(signal -> log.warn("Retrying execution consumer after error (attempt {}): {}",
                                signal.totalRetries() + 1, signal.failure().getMessage())))
                .subscribe();
    }

    /**
     * Evict orders in terminal states when cache exceeds max size.
     */
    private void evictTerminalOrders() {
        if (orderCache.size() > maxCacheSize) {
            List<String> terminalKeys = orderCache.entrySet().stream()
                    .filter(e -> isTerminalState(e.getValue().getState()))
                    .map(ConcurrentHashMap.Entry::getKey)
                    .toList();
            int evicted = 0;
            for (String key : terminalKeys) {
                orderCache.remove(key);
                evicted++;
                if (orderCache.size() <= maxCacheSize * 0.8) break;
            }
            if (evicted > 0) {
                log.info("Evicted {} terminal-state orders from cache, size now: {}", evicted, orderCache.size());
            }
        }
    }

    /**
     * True when this fill was already emitted: the cache holds its (orderId, execId) at the same or a
     * higher orderVersion. A later version of the same execId (a future bust or correction) still passes. A
     * redelivery that arrives after its entry was evicted is emitted again; the cache holds far more
     * fills than a redelivery window.
     */
    private boolean isRedelivery(OrderExecution fill) {
        if (fill.getExecId() == null || fill.getOrderVersion() == null) {
            return false;
        }
        ExecutionDto seen = executionCache.get(executionKey(fill));
        return seen != null
                && seen.getOrderVersion() != null
                && seen.getOrderVersion() >= fill.getOrderVersion();
    }

    /** execId is unique per order only, so the cache is keyed by both. */
    private static String executionKey(OrderExecution fill) {
        return fill.getOrderId() + "/" + fill.getExecId();
    }

    /**
     * Evict oldest executions when cache exceeds max size.
     */
    private void evictOldExecutions() {
        if (executionCache.size() > maxCacheSize) {
            List<String> oldestKeys = executionCache.entrySet().stream()
                    .sorted((a, b) -> {
                        Instant aTime = a.getValue().getEventTime();
                        Instant bTime = b.getValue().getEventTime();
                        if (aTime == null && bTime == null) return 0;
                        if (aTime == null) return -1;
                        if (bTime == null) return 1;
                        return aTime.compareTo(bTime);
                    })
                    .limit(executionCache.size() - (int)(maxCacheSize * 0.8))
                    .map(ConcurrentHashMap.Entry::getKey)
                    .toList();
            for (String key : oldestKeys) {
                executionCache.remove(key);
            }
            log.info("Evicted {} old executions from cache, size now: {}", oldestKeys.size(), executionCache.size());
        }
    }

    private boolean isTerminalState(String state) {
        if (state == null) return false;
        for (String terminal : TERMINAL_STATES) {
            if (terminal.equals(state)) return true;
        }
        return false;
    }

    @Override
    public Flux<OrderEvent> getOrderEventStream(StreamFilter filter) {
        log.info("Creating order event stream with filter: {}, isEmpty: {}, includeSnapshot: {}", 
                filter, filter != null ? filter.isEmpty() : "null", filter != null ? filter.isIncludeSnapshot() : "null");
        
        // Create predicate from filter (if any) for filtering live stream
        Predicate<OrderEvent> filterPredicate = filter != null && !filter.isEmpty() 
                ? filterService.createOrderEventPredicate(filter)
                : event -> true;
        
        boolean includeSnapshot = filter != null && filter.isIncludeSnapshot();
        
        if (includeSnapshot) {
            // Each order's event version in the snapshot. eventId is a per-order sequence, so it is
            // only comparable within one order: a live event at or below the snapshot's version is
            // already reflected in it, or older, and would roll the subscriber's view back.
            Map<String, Long> snapshotVersions = new ConcurrentHashMap<>();
            AtomicBoolean snapshotComplete = new AtomicBoolean(false);
            
            // Fetch filtered snapshot from OMS Core Query API  
            Flux<OrderEvent> snapshotStream = (filter != null && !filter.isEmpty()
                    ? omsQueryClient.fetchOrdersWithFilter(filter)
                    : omsQueryClient.fetchAllOrders())
                    .map(this::convertQueryDtoToOrderDto)
                    .doOnNext(order -> {
                        orderCache.put(order.getOrderId(), order);
                        if (order.getEventId() != null) {
                            snapshotVersions.put(order.getOrderId(), order.getEventId());
                        }
                    })
                    .map(order -> OrderEvent.fromOrder(order, "SNAPSHOT"))
                    .doOnComplete(() -> {
                        snapshotComplete.set(true);
                        log.info("Snapshot stream completed with {} versioned orders",
                                snapshotVersions.size());
                    })
                    .onErrorResume(e -> {
                        log.warn("Failed to fetch snapshot from OMS Core, using cache: {}", e.getMessage());
                        snapshotComplete.set(true);
                        // Fallback to cache if OMS Core is not available
                        return Flux.fromIterable(orderCache.values())
                                .filter(order -> filterPredicate.test(OrderEvent.fromOrder(order, "CACHE")))
                                .map(order -> OrderEvent.fromOrder(order, "SNAPSHOT"));
                    })
                    .cache(); // FIX: cache the cold Flux to prevent double subscription
            
            // Filtered live stream from Kafka with deduplication
            Flux<OrderEvent> liveStream = orderEventSink.asFlux()
                    .doOnNext(event -> {
                        boolean matches = filterPredicate.test(event);
                        log.trace("Live stream event: orderId={}, side={}, matches filter={}",
                                event.getOrderId(),
                                event.getOrder() != null ? event.getOrder().getSide() : "null",
                                matches);
                    })
                    .filter(filterPredicate)
                    .filter(event -> {
                        // Skip if the snapshot already holds this version of the order, or a newer one
                        Long eventId = event.getEventId();
                        Long snapshotVersion = snapshotVersions.get(event.getOrderId());
                        if (eventId != null && snapshotVersion != null && eventId <= snapshotVersion) {
                            log.debug("Skipping live event already covered by the snapshot: orderId={}, eventId={}, snapshotVersion={}",
                                    event.getOrderId(), eventId, snapshotVersion);
                            return false;
                        }
                        return true;
                    });

            // FIX: Use concatWith instead of Flux.merge + delaySubscription to avoid double
            // subscription on the cold snapshot flux. The snapshot is cached above.
            return snapshotStream.concatWith(liveStream);
        }

        // No snapshot - just return filtered live stream
        Flux<OrderEvent> liveStream = orderEventSink.asFlux()
                .doOnNext(event -> {
                    boolean matches = filterPredicate.test(event);
                    log.trace("Live stream event: orderId={}, side={}, matches filter={}",
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
     * The Query API's 'eventVersion' is mapped to 'eventId', the same per-order sequence that live
     * order messages carry, so the two can be deduplicated against each other.
     */
    private OrderDto convertQueryDtoToOrderDto(org.example.common.model.query.OrderDto queryDto) {
        return OrderDto.builder()
                .eventId(queryDto.getEventVersion())
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
                .timeInForce(queryDto.getTimeInForce() != null ? queryDto.getTimeInForce().getValue() : null)
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
}
