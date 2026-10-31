package org.example.oms.projection;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.example.common.model.Execution;
import org.example.common.model.cmd.ExecutionCreateCmd;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.repository.ExecutionRepository;
import org.example.oms.repository.OrderEventRepository;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import jakarta.persistence.EntityManager;
import lombok.extern.slf4j.Slf4j;

/**
 * Rebuilds a projection from the event log (SPEC-0020): empties its table and re-runs it for every
 * applied fill, from the fill event's order snapshot and the matching {@code executions} row.
 *
 * <p>Runs in one transaction that locks the projection's table, so fills arriving meanwhile wait
 * for the rebuild instead of interleaving with it. It stages and publishes nothing: the messages a
 * projection returns are discarded.
 *
 * <p>A fill event is matched to its execution by the execId in its stored command. A REST fill
 * recorded before SPEC-0018 has no stored command; it is matched by position instead, the k-th fill
 * event of an order to the k-th execution of that order, since both are written in the same
 * transaction in the same order.
 */
@Service
@Slf4j
public class ProjectionRebuilder {

    private static final Set<Event> FILL_EVENTS = Set.of(Event.PARTIAL_FILL, Event.FILL);

    private final Map<String, Projection> projections;
    private final OrderEventRepository orderEventRepository;
    private final ExecutionRepository executionRepository;
    private final EntityManager entityManager;
    private final MeterRegistry meterRegistry;

    public ProjectionRebuilder(
            List<Projection> projections,
            OrderEventRepository orderEventRepository,
            ExecutionRepository executionRepository,
            EntityManager entityManager,
            MeterRegistry meterRegistry) {
        this.projections = projections.stream().collect(Collectors.toMap(Projection::name, p -> p));
        this.orderEventRepository = orderEventRepository;
        this.executionRepository = executionRepository;
        this.entityManager = entityManager;
        this.meterRegistry = meterRegistry;
    }

    public boolean exists(String name) {
        return projections.containsKey(name);
    }

    /**
     * @return the number of rows written
     * @throws IllegalArgumentException for an unknown projection
     * @throws IllegalStateException when a fill event has no matching execution (nothing is changed)
     */
    @Transactional
    public int rebuild(String name) {
        Projection projection = projections.get(name);
        if (projection == null) {
            throw new IllegalArgumentException("Unknown projection: " + name);
        }
        log.info("Rebuilding projection {}", name);
        Timer.Sample sample = Timer.start(meterRegistry);

        // The name comes from a registered bean, never from the request, so it is safe in SQL.
        entityManager.createNativeQuery("LOCK TABLE " + projection.name() + " IN EXCLUSIVE MODE").executeUpdate();
        projection.clear();

        Map<String, List<OrderEvent>> fillEventsByOrder = orderEventRepository
                .findAll(Sort.by("orderId", "version"))
                .stream()
                .filter(e -> FILL_EVENTS.contains(e.getEvent()))
                .collect(Collectors.groupingBy(OrderEvent::getOrderId, LinkedHashMap::new, Collectors.toList()));
        Map<String, List<Execution>> executionsByOrder = executionRepository
                .findAll(Sort.by("id"))
                .stream()
                .collect(Collectors.groupingBy(Execution::getOrderId));

        int rows = 0;
        for (Map.Entry<String, List<OrderEvent>> order : fillEventsByOrder.entrySet()) {
            List<Execution> executions = executionsByOrder.getOrDefault(order.getKey(), List.of());
            List<OrderEvent> fills = order.getValue();
            for (int k = 0; k < fills.size(); k++) {
                OrderEvent fill = fills.get(k);
                Execution execution = match(fill, k, executions);
                projection.project(new ProjectionContext(
                        fill.getOrderSnapshot(), execution, fill.getVersion(), fill.getTransaction(), fill.getTimeStamp()));
                rows++;
            }
        }

        long nanos = sample.stop(meterRegistry.timer("oms.projection.rebuild", "projection", name));
        log.info("Rebuilt projection {}: {} rows from {} orders in {} ms", name, rows, fillEventsByOrder.size(), nanos / 1_000_000);
        return rows;
    }

    private static Execution match(OrderEvent fill, int position, List<Execution> executions) {
        Optional<String> execId = execIdOf(fill);
        Optional<Execution> match = execId.isPresent()
                ? executions.stream().filter(e -> execId.get().equals(e.getExecID())).findFirst()
                : position < executions.size() ? Optional.of(executions.get(position)) : Optional.empty();
        return match.orElseThrow(() -> new IllegalStateException(String.format(
                "No execution for fill event v%d of order %s (execId %s)",
                fill.getVersion(), fill.getOrderId(), execId.orElse("not stored"))));
    }

    private static Optional<String> execIdOf(OrderEvent fill) {
        if (fill.getTransaction() instanceof ExecutionCreateCmd cmd && cmd.getExecution() != null) {
            return Optional.ofNullable(cmd.getExecution().getExecId());
        }
        return Optional.empty();
    }
}
