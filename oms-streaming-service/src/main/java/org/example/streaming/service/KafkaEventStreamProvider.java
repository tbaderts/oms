package org.example.streaming.service;

import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
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
import io.micrometer.core.instrument.MeterRegistry;
import reactor.core.Disposable;
import reactor.core.publisher.BufferOverflowStrategy;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Sinks;
import reactor.core.scheduler.Schedulers;
import reactor.kafka.receiver.KafkaReceiver;
import reactor.util.retry.Retry;

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
    private final MeterRegistry meterRegistry;

    @Value("${streaming.buffer.max-size:10000}")
    private int maxCacheSize;

    /**
     * The most live events held for one subscriber that is not requesting (SPEC-0057). Past it, that
     * subscriber's stream ends with an error rather than the server buffering without limit.
     */
    @Value("${streaming.subscriber.max-pending:10000}")
    private int maxPendingPerSubscriber = 10_000;

    /**
     * How many stored fills to load into the execution cache at startup (SPEC-0067), at most the
     * cache size. 5,000 is the most the query API returns in one request; 0 turns the load off.
     */
    @Value("${streaming.executions.warm-up-size:5000}")
    private int warmUpSize;

    /** The first wait before retrying a failed load; it doubles up to a minute (SPEC-0067). */
    private Duration warmUpBackoff = Duration.ofSeconds(2);

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
    private volatile Disposable executionWarmUpDisposable;

    public KafkaEventStreamProvider(
            KafkaReceiver<String, OrderMessage> orderMessageReceiver,
            KafkaReceiver<String, OrderExecution> orderExecutionReceiver,
            OmsQueryClient omsQueryClient,
            OrderMessageMapper orderMessageMapper,
            OrderExecutionMapper orderExecutionMapper,
            FilterService filterService,
            MeterRegistry meterRegistry) {
        this.orderMessageReceiver = orderMessageReceiver;
        this.orderExecutionReceiver = orderExecutionReceiver;
        this.omsQueryClient = omsQueryClient;
        this.orderMessageMapper = orderMessageMapper;
        this.orderExecutionMapper = orderExecutionMapper;
        this.filterService = filterService;
        this.meterRegistry = meterRegistry;
    }

    /**
     * Bounds what one slow subscriber can make the server hold (SPEC-0057): the client requests in
     * batches, and live events it has not requested wait here, up to {@link #maxPendingPerSubscriber}.
     * Past that its stream ends with an error; the snapshot part is pulled on demand and not buffered.
     */
    private <T> Flux<T> boundedForSubscriber(Flux<T> live, String route) {
        return live.onBackpressureBuffer(maxPendingPerSubscriber, overflowing -> {
            log.warn("Subscriber on {} is not keeping up: more than {} events pending, ending its stream",
                    route, maxPendingPerSubscriber);
            meterRegistry.counter("oms.streaming.subscriber.overflow", "route", route).increment();
        }, BufferOverflowStrategy.ERROR);
    }

    @PostConstruct
    public void startConsuming() {
        log.info("Starting Kafka Avro event consumers");
        startOrderMessageConsumer();
        startExecutionConsumer();
        warmUpExecutions();
    }

    /**
     * Loads the newest stored fills into the execution cache (SPEC-0067). The Kafka consumer resumes
     * from its committed offset after a restart, so without this the cache, and every executions
     * snapshot, would start empty. Stored fills are not emitted as live events. Runs off the startup
     * thread and retries with backoff until oms-core answers.
     */
    private void warmUpExecutions() {
        int limit = Math.min(warmUpSize, maxCacheSize);
        if (limit <= 0) {
            return;
        }
        executionWarmUpDisposable = Flux.defer(() -> omsQueryClient.fetchRecentExecutions(limit))
                .collectList()
                .retryWhen(Retry.backoff(Long.MAX_VALUE, warmUpBackoff)
                        .maxBackoff(Duration.ofMinutes(1))
                        .doBeforeRetry(signal -> log.warn(
                                "Could not load stored fills from OMS Core (attempt {}), retrying: {}",
                                signal.totalRetries() + 1, signal.failure().getMessage())))
                .subscribeOn(Schedulers.boundedElastic())
                .subscribe(fills -> {
                    fills.forEach(this::putIfNewer);
                    evictOldExecutions();
                    log.info("Warmed execution cache: {} stored fills, cache size {}", fills.size(), executionCache.size());
                }, error -> log.error("Loading stored fills from OMS Core stopped", error));
    }

    /** Caches a stored fill unless the cache already holds that fill at the same or a later version. */
    private void putIfNewer(ExecutionDto fill) {
        if (fill == null || fill.getOrderId() == null || fill.getExecId() == null) {
            return;
        }
        executionCache.merge(executionKey(fill), fill, (cached, stored) ->
                cached.getOrderVersion() != null && stored.getOrderVersion() != null
                        && stored.getOrderVersion() > cached.getOrderVersion() ? stored : cached);
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
        if (executionWarmUpDisposable != null && !executionWarmUpDisposable.isDisposed()) {
            executionWarmUpDisposable.dispose();
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

                    ExecutionDto execDto = orderExecutionMapper.toExecutionDto(fill);
                    if (!cacheUnlessSeen(fill, execDto)) {
                        // The relay publishes at least once, and the startup load (SPEC-0067) may
                        // already hold the fill; the same (orderId, execId, orderVersion) has been
                        // shown or stored, so it is not a new live event.
                        log.debug("Skipping redelivered fill: orderId={}, execId={}, orderVersion={}",
                                fill.getOrderId(), fill.getExecId(), fill.getOrderVersion());
                        record.receiverOffset().acknowledge();
                        return;
                    }
                    if (fill.getExecId() != null) {
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
     * Caches a live fill and says whether it is new; false means a redelivery: the cache already holds
     * its (orderId, execId) at the same or a higher orderVersion, from Kafka or from the startup load.
     * The check and the write are one atomic step (SPEC-0067), so the startup load running on another
     * thread cannot let the same fill through twice. A later version of the same execId (a future bust
     * or correction) still passes. A redelivery that arrives after its entry was evicted is emitted
     * again; the cache holds far more fills than a redelivery window. A fill without execId is not
     * cached and always passes.
     */
    private boolean cacheUnlessSeen(OrderExecution fill, ExecutionDto execDto) {
        if (fill.getExecId() == null) {
            return true;
        }
        boolean[] admitted = {false};
        executionCache.compute(executionKey(fill), (key, seen) -> {
            boolean redelivery = seen != null
                    && seen.getOrderVersion() != null
                    && fill.getOrderVersion() != null
                    && seen.getOrderVersion() >= fill.getOrderVersion();
            admitted[0] = !redelivery;
            return redelivery ? seen : execDto;
        });
        return admitted[0];
    }

    /** execId is unique per order only, so the cache is keyed by both. */
    private static String executionKey(OrderExecution fill) {
        return fill.getOrderId() + "/" + fill.getExecId();
    }

    private static String executionKey(ExecutionDto execution) {
        return execution.getOrderId() + "/" + execution.getExecId();
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

            // The newest orders matching the filter, at most the client's limit, then a marker with
            // how many matched (SPEC-0057).
            int limit = filter.effectiveSnapshotLimit();
            OmsQueryClient.OrderSnapshot snapshot = omsQueryClient.fetchOrderSnapshot(filter, limit);
            Flux<OrderEvent> snapshotStream = snapshot.rows()
                    .map(this::convertQueryDtoToOrderDto)
                    .doOnNext(order -> {
                        orderCache.put(order.getOrderId(), order);
                        if (order.getEventId() != null) {
                            snapshotVersions.put(order.getOrderId(), order.getEventId());
                        }
                    })
                    .map(order -> OrderEvent.fromOrder(order, "SNAPSHOT"))
                    .concatWith(snapshot.matching().map(matching -> {
                        log.info("Order snapshot sent: limit={}, matching={}, versioned={}",
                                limit, matching, snapshotVersions.size());
                        return OrderEvent.snapshotEnd(matching);
                    }))
                    .onErrorResume(e -> {
                        log.warn("Failed to fetch snapshot from OMS Core, using cache: {}", e.getMessage());
                        // Fallback to cache if OMS Core is not available
                        return cachedOrderSnapshot(filterPredicate, limit);
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
            return snapshotStream.concatWith(boundedForSubscriber(liveStream, "orders.stream"));
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

        return boundedForSubscriber(liveStream, "orders.stream");
    }

    /**
     * The snapshot from the order cache when oms-core cannot be reached: the newest matching orders by
     * {@code transactTime}, at most {@code limit}, then the marker with the matching count (SPEC-0057).
     */
    private Flux<OrderEvent> cachedOrderSnapshot(Predicate<OrderEvent> filterPredicate, int limit) {
        List<OrderDto> matching = orderCache.values().stream()
                .filter(order -> filterPredicate.test(OrderEvent.fromOrder(order, "CACHE")))
                .sorted(Comparator.comparing(OrderDto::getTransactTime,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        return Flux.fromIterable(matching)
                .take(limit)
                .map(order -> OrderEvent.fromOrder(order, "SNAPSHOT"))
                .concatWith(Mono.fromSupplier(() -> OrderEvent.snapshotEnd(matching.size())));
    }

    @Override
    public Flux<ExecutionEvent> getExecutionEventStream(StreamFilter filter) {
        // The filter is applied here, not by the caller, so that it never drops the marker (SPEC-0057).
        Predicate<ExecutionEvent> filterPredicate = filterService.createExecutionEventPredicate(filter);
        Flux<ExecutionEvent> liveStream = executionEventSink.asFlux().filter(filterPredicate);

        if (filter != null && filter.isIncludeSnapshot()) {
            int limit = filter.effectiveSnapshotLimit();
            // The version of every matching fill the snapshot accounted for, sent or beyond the limit.
            // The live sink replays its last events to a new subscriber; a fill at or below the
            // version the snapshot saw is not new and must not count as a new row (SPEC-0057 AC-8).
            Map<String, Long> snapshotVersions = new ConcurrentHashMap<>();
            Flux<ExecutionEvent> snapshotStream = Flux.defer(() -> {
                List<ExecutionDto> matching = executionCache.values().stream()
                        .filter(exec -> filterPredicate.test(ExecutionEvent.fromExecution(exec, "CACHE")))
                        .sorted(Comparator.comparing(KafkaEventStreamProvider::executionTime,
                                Comparator.nullsLast(Comparator.reverseOrder())))
                        .toList();
                matching.forEach(exec -> snapshotVersions.put(executionKey(exec),
                        exec.getOrderVersion() != null ? exec.getOrderVersion() : Long.MAX_VALUE));
                log.info("Execution snapshot: limit={}, matching={}", limit, matching.size());
                return Flux.fromIterable(matching)
                        .take(limit)
                        .map(exec -> ExecutionEvent.fromExecution(exec, "SNAPSHOT"))
                        .concatWith(Mono.fromSupplier(() -> ExecutionEvent.snapshotEnd(matching.size())));
            });
            Flux<ExecutionEvent> newLiveStream = liveStream.filter(event -> {
                Long seen = event.getExecution() != null ? snapshotVersions.get(executionKey(event.getExecution())) : null;
                Long version = event.getExecution() != null ? event.getExecution().getOrderVersion() : null;
                return seen == null || (version != null && version > seen);
            });
            return snapshotStream.concatWith(boundedForSubscriber(newLiveStream, "executions.stream"));
        }

        return boundedForSubscriber(liveStream, "executions.stream");
    }

    /** When a fill happened: its transactTime, or when the streaming service received it. */
    private static Instant executionTime(ExecutionDto execution) {
        return execution.getTransactTime() != null ? execution.getTransactTime() : execution.getEventTime();
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
