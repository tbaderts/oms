package org.example.oms.service.reconciliation;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.atomic.AtomicInteger;

import org.example.common.model.Order;
import org.example.oms.model.OrderEvent;
import org.example.oms.repository.OrderRepository;
import org.example.oms.service.OrderChanges;
import org.example.oms.service.OrderReplayService;
import org.example.oms.service.command.LoadedOrders;
import org.example.oms.service.leadership.Leadership;
import org.example.oms.service.leadership.Role;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Checks at runtime that the event log agrees with the order state (SPEC-0049, policy P-05).
 *
 * <p>Every {@code oms.reconciliation.interval-ms} (default 5 minutes), on the scheduler leader only
 * (SPEC-0048), it samples the {@code oms.reconciliation.recent} orders with the newest events
 * (default 50) and {@code oms.reconciliation.random} orders from a random starting id (default 10).
 * For each it checks, in one read-only snapshot:
 * <ul>
 *   <li><b>consistency</b>: the {@code orders} row equals the latest event's snapshot
 *       ({@link OrderReplayService#replay}). Instants are compared to the microsecond, the
 *       precision Postgres stores, since a snapshot keeps the nanoseconds of the clock;</li>
 *   <li><b>contiguity</b>: the versions run from 1 with no gap.</li>
 * </ul>
 *
 * <p>The gauges {@code oms.event_log.inconsistent} and {@code oms.event_log.gaps} hold the counts
 * of the latest run; {@code oms.event_log.sampled} counts the orders checked. Each finding is logged
 * at WARN with the order id. It reports and never repairs.
 */
@Component
@Slf4j
public class EventLogReconciler {

    /** What one run found. */
    public record Result(int sampled, List<String> inconsistent, List<String> gaps) {}

    private final OrderRepository orderRepository;
    private final OrderReplayService orderReplayService;
    private final Leadership leadership;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate snapshot;
    private final boolean enabled;
    private final int recent;
    private final int random;
    private final AtomicInteger inconsistentGauge = new AtomicInteger();
    private final AtomicInteger gapsGauge = new AtomicInteger();
    private final Counter sampled;

    public EventLogReconciler(
            OrderRepository orderRepository,
            OrderReplayService orderReplayService,
            Leadership leadership,
            JdbcTemplate jdbc,
            PlatformTransactionManager transactionManager,
            MeterRegistry meterRegistry,
            @Value("${oms.reconciliation.enabled:true}") boolean enabled,
            @Value("${oms.reconciliation.recent:50}") int recent,
            @Value("${oms.reconciliation.random:10}") int random) {
        this.orderRepository = orderRepository;
        this.orderReplayService = orderReplayService;
        this.leadership = leadership;
        this.jdbc = jdbc;
        this.snapshot = new TransactionTemplate(transactionManager);
        this.snapshot.setReadOnly(true);
        this.snapshot.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        this.enabled = enabled;
        this.recent = recent;
        this.random = random;
        meterRegistry.gauge("oms.event_log.inconsistent", inconsistentGauge);
        meterRegistry.gauge("oms.event_log.gaps", gapsGauge);
        this.sampled = Counter.builder("oms.event_log.sampled")
                .description("Orders checked by the event-log reconciler on this instance")
                .register(meterRegistry);
    }

    @Scheduled(
            fixedDelayString = "${oms.reconciliation.interval-ms:300000}",
            initialDelayString = "${oms.reconciliation.initial-delay-ms:60000}")
    void scheduled() {
        if (!enabled || !leadership.holds(Role.SCHEDULER)) {
            return;
        }
        try {
            reconcile();
        } catch (RuntimeException e) {
            log.error("Event-log reconciliation failed: {}", e.toString(), e);
        }
    }

    /** One run: samples, checks, sets the gauges and returns what it found. */
    public Result reconcile() {
        Set<String> orderIds = new LinkedHashSet<>();
        // The newest events by time (idx_order_events_time_stamp), then their orders: a bounded read,
        // not an aggregate over the whole log. Twenty events per wanted order leaves room for orders
        // with several recent events.
        orderIds.addAll(jdbc.queryForList(
                "select order_id from (select order_id, time_stamp from order_events order by time_stamp desc limit ?) latest"
                        + " group by order_id order by max(time_stamp) desc limit ?",
                String.class, recent * 20, recent));
        orderIds.addAll(jdbc.queryForList(
                "select order_id from orders where id >= (select floor(random() * coalesce(max(id), 0)) from orders)"
                        + " order by id limit ?",
                String.class, random));

        List<String> inconsistent = new ArrayList<>();
        List<String> gaps = new ArrayList<>();
        for (String orderId : orderIds) {
            snapshot.executeWithoutResult(status -> check(orderId, inconsistent, gaps));
            sampled.increment();
        }
        inconsistentGauge.set(inconsistent.size());
        gapsGauge.set(gaps.size());
        log.info("Event-log reconciliation: {} orders sampled, {} inconsistent, {} with gaps",
                orderIds.size(), inconsistent.size(), gaps.size());
        return new Result(orderIds.size(), List.copyOf(inconsistent), List.copyOf(gaps));
    }

    private void check(String orderId, List<String> inconsistent, List<String> gaps) {
        Optional<Order> row = orderRepository.findByOrderId(orderId);
        Optional<Order> latest = orderReplayService.replay(orderId);
        if (row.isPresent()) {
            ObjectNode differences = latest
                    .map(snapshot -> OrderChanges.diff(micros(LoadedOrders.toJson(snapshot)), micros(LoadedOrders.toJson(row.get()))))
                    .orElse(null);
            if (differences == null) {
                inconsistent.add(orderId);
                log.warn("Event log inconsistent for order {}: the order has no events", orderId);
            } else if (!differences.isEmpty()) {
                inconsistent.add(orderId);
                log.warn("Event log inconsistent for order {}: the row differs from its latest event in {}",
                        orderId, differences);
            }
        }

        List<Long> versions = orderReplayService.history(orderId).stream().map(OrderEvent::getVersion).toList();
        if (!versions.isEmpty() && !orderReplayService.isContiguous(orderId)) {
            Set<Long> missing = new TreeSet<>();
            long highest = versions.stream().mapToLong(Long::longValue).max().orElse(0);
            for (long v = 1; v <= highest; v++) {
                if (!versions.contains(v)) {
                    missing.add(v);
                }
            }
            gaps.add(orderId);
            log.warn("Event log gap for order {}: missing versions {}", orderId, missing);
        }
    }

    /** The tree with every ISO instant rounded (half up) to the microsecond, as Postgres stores it. */
    static JsonNode micros(JsonNode node) {
        if (!(node instanceof ObjectNode object)) {
            return node;
        }
        ObjectNode copy = object.deepCopy();
        for (String name : new TreeSet<>(copy.propertyNames())) {
            JsonNode value = copy.get(name);
            if (value.isString() && value.asString().matches("\\d{4}-\\d{2}-\\d{2}T.*Z")) {
                try {
                    copy.put(name, Instant.parse(value.asString()).plusNanos(500).truncatedTo(ChronoUnit.MICROS).toString());
                } catch (java.time.format.DateTimeParseException e) {
                    // Not an instant after all: compare as it is.
                }
            }
        }
        return copy;
    }
}
