package org.example.streaming.service;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Predicate;

import org.example.common.model.msg.Execution;
import org.example.common.model.msg.OrderMessage;
import org.example.streaming.client.OmsQueryClient;
import org.example.streaming.mapper.ExecutionMessageMapper;
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
import reactor.core.publisher.Sinks;
import reactor.kafka.receiver.KafkaReceiver;

/**
 * Streams orders and executions to RSocket clients without holding any of them (SPEC-0071).
 *
 * <ul>
 *   <li><b>Snapshot:</b> read from oms-core's query API at each subscription that asks for one:
 *       orders from {@code /api/query/search}, executions from {@code /api/query/executions/search}
 *       — what the database holds now. If oms-core cannot answer, the subscription ends with an
 *       error; there is no cached fallback.
 *   <li><b>Live:</b> {@code oms_orders} ({@code OrderMessage}) and {@code oms_executions}
 *       ({@code Execution}, the fill as the venue reported it).
 *   <li><b>Deduplication:</b> per subscription, against the versions its snapshot saw: a live event
 *       at or below them is already shown. A Kafka redelivery between snapshots is not filtered
 *       here; the client upserts rows by key.
 * </ul>
 */
@Service
@Slf4j
@ConditionalOnProperty(prefix = "streaming.kafka", name = "enabled", havingValue = "true", matchIfMissing = true)
public class KafkaEventStreamProvider implements EventStreamProvider {

    private final KafkaReceiver<String, OrderMessage> orderMessageReceiver;
    private final KafkaReceiver<String, Execution> executionReceiver;
    private final OmsQueryClient omsQueryClient;
    private final OrderMessageMapper orderMessageMapper;
    private final ExecutionMessageMapper executionMessageMapper;
    private final FilterService filterService;
    private final MeterRegistry meterRegistry;

    /**
     * The most live events held for one subscriber that is not requesting (SPEC-0057). Past it, that
     * subscriber's stream ends with an error rather than the server buffering without limit.
     */
    @Value("${streaming.subscriber.max-pending:10000}")
    private int maxPendingPerSubscriber = 10_000;

    // Hot sinks broadcasting live events to every subscriber; a new subscriber gets the last 100,
    // which covers events published while its snapshot was being read.
    private final Sinks.Many<OrderEvent> orderEventSink = Sinks.many().replay().limit(100);
    private final Sinks.Many<ExecutionEvent> executionEventSink = Sinks.many().replay().limit(100);

    private volatile Disposable orderConsumerDisposable;
    private volatile Disposable executionConsumerDisposable;

    public KafkaEventStreamProvider(
            KafkaReceiver<String, OrderMessage> orderMessageReceiver,
            KafkaReceiver<String, Execution> executionReceiver,
            OmsQueryClient omsQueryClient,
            OrderMessageMapper orderMessageMapper,
            ExecutionMessageMapper executionMessageMapper,
            FilterService filterService,
            MeterRegistry meterRegistry) {
        this.orderMessageReceiver = orderMessageReceiver;
        this.executionReceiver = executionReceiver;
        this.omsQueryClient = omsQueryClient;
        this.orderMessageMapper = orderMessageMapper;
        this.executionMessageMapper = executionMessageMapper;
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
        orderConsumerDisposable = consume("order", orderMessageReceiver.receive().doOnNext(record -> {
            OrderMessage msg = record.value();
            log.debug("Received OrderMessage: orderId={}, state={}", msg.getOrderId(), msg.getState());
            orderEventSink.tryEmitNext(orderMessageMapper.toOrderEvent(msg, "UPDATE"));
            record.receiverOffset().acknowledge();
        }));
        executionConsumerDisposable = consume("execution", executionReceiver.receive().doOnNext(record -> {
            Execution fill = record.value();
            log.debug("Received Execution: orderId={}, execId={}, orderVersion={}",
                    fill.getOrderId(), fill.getExecId(), fill.getOrderVersion());
            String eventType = fill.getExecType() != null ? fill.getExecType() : "NEW";
            executionEventSink.tryEmitNext(
                    ExecutionEvent.fromExecution(executionMessageMapper.toExecutionDto(fill), eventType));
            record.receiverOffset().acknowledge();
        }));
    }

    /** Subscribes a consumer, retrying with backoff after errors. */
    private Disposable consume(String name, Flux<?> records) {
        return records
                .doOnError(error -> log.error("Error consuming {} messages", name, error))
                .retryWhen(reactor.util.retry.Retry.backoff(Long.MAX_VALUE, Duration.ofSeconds(1))
                        .maxBackoff(Duration.ofMinutes(5))
                        .jitter(0.5)
                        .doBeforeRetry(signal -> log.warn("Retrying {} consumer after error (attempt {}): {}",
                                name, signal.totalRetries() + 1, signal.failure().getMessage())))
                .subscribe();
    }

    @PreDestroy
    public void shutdown() {
        log.info("Shutting down Kafka event consumers");
        for (Disposable consumer : new Disposable[] {orderConsumerDisposable, executionConsumerDisposable}) {
            if (consumer != null && !consumer.isDisposed()) {
                consumer.dispose();
            }
        }
        orderEventSink.tryEmitComplete();
        executionEventSink.tryEmitComplete();
    }

    @Override
    public Flux<OrderEvent> getOrderEventStream(StreamFilter filter) {
        log.info("Creating order event stream with filter: {}", filter);
        Predicate<OrderEvent> filterPredicate = filter != null && !filter.isEmpty()
                ? filterService.createOrderEventPredicate(filter)
                : event -> true;
        Flux<OrderEvent> liveStream = orderEventSink.asFlux().filter(filterPredicate);

        if (filter == null || !filter.isIncludeSnapshot()) {
            return boundedForSubscriber(liveStream, "orders.stream");
        }

        // Each order's event version in the snapshot. eventId is a per-order sequence: a live event at
        // or below the snapshot's version is already reflected in it, or older (SPEC-0018).
        Map<String, Long> snapshotVersions = new ConcurrentHashMap<>();
        int limit = filter.effectiveSnapshotLimit();
        OmsQueryClient.OrderSnapshot snapshot = omsQueryClient.fetchOrderSnapshot(filter, limit);
        Flux<OrderEvent> snapshotStream = snapshot.rows()
                .map(this::convertQueryDtoToOrderDto)
                .doOnNext(order -> {
                    if (order.getEventId() != null) {
                        snapshotVersions.put(order.getOrderId(), order.getEventId());
                    }
                })
                .map(order -> OrderEvent.fromOrder(order, "SNAPSHOT"))
                .concatWith(snapshot.matching().map(matching -> {
                    log.info("Order snapshot sent: limit={}, matching={}", limit, matching);
                    return OrderEvent.snapshotEnd(matching);
                }));
        Flux<OrderEvent> newLiveStream = liveStream.filter(event -> {
            Long seen = snapshotVersions.get(event.getOrderId());
            return seen == null || event.getEventId() == null || event.getEventId() > seen;
        });
        return snapshotStream.concatWith(boundedForSubscriber(newLiveStream, "orders.stream"));
    }

    @Override
    public Flux<ExecutionEvent> getExecutionEventStream(StreamFilter filter) {
        // The filter is applied here, not by the caller, so that it never drops the marker (SPEC-0057).
        Predicate<ExecutionEvent> filterPredicate = filterService.createExecutionEventPredicate(filter);
        Flux<ExecutionEvent> liveStream = executionEventSink.asFlux().filter(filterPredicate);

        if (filter == null || !filter.isIncludeSnapshot()) {
            return boundedForSubscriber(liveStream, "executions.stream");
        }

        // The version of every fill the snapshot showed: a live event at or below it is not new
        // (SPEC-0057 AC-8). The newest matching fills come from the execution search (SPEC-0071).
        Map<String, Long> snapshotVersions = new ConcurrentHashMap<>();
        int limit = filter.effectiveSnapshotLimit();
        OmsQueryClient.ExecutionSnapshot snapshot = omsQueryClient.fetchExecutionSnapshot(filter, limit);
        Flux<ExecutionEvent> snapshotStream = snapshot.rows()
                .doOnNext(exec -> snapshotVersions.put(executionKey(exec),
                        exec.getOrderVersion() != null ? exec.getOrderVersion() : Long.MAX_VALUE))
                .map(exec -> ExecutionEvent.fromExecution(exec, "SNAPSHOT"))
                .concatWith(snapshot.matching().map(matching -> {
                    log.info("Execution snapshot sent: limit={}, matching={}", limit, matching);
                    return ExecutionEvent.snapshotEnd(matching);
                }));
        Flux<ExecutionEvent> newLiveStream = liveStream.filter(event -> {
            ExecutionDto execution = event.getExecution();
            Long seen = execution != null ? snapshotVersions.get(executionKey(execution)) : null;
            Long version = execution != null ? execution.getOrderVersion() : null;
            return seen == null || (version != null && version > seen);
        });
        return snapshotStream.concatWith(boundedForSubscriber(newLiveStream, "executions.stream"));
    }

    /** execId is unique per order only, so a fill is identified by both. */
    private static String executionKey(ExecutionDto execution) {
        return execution.getOrderId() + "/" + execution.getExecId();
    }

    /**
     * Converts the query API's OrderDto to the streaming OrderDto. Its {@code eventVersion} becomes
     * {@code eventId}, the per-order sequence live order messages carry, so the two can be compared.
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
                .eventTime(java.time.Instant.now())
                .build();
    }
}
