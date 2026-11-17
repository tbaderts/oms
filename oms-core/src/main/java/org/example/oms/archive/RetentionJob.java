package org.example.oms.archive;

import java.time.Clock;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import org.example.oms.service.leadership.Leadership;
import org.example.oms.service.leadership.Role;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;

/**
 * Archives closed orders past the retention period (SPEC-0052).
 *
 * <p>Every {@code oms.retention.interval-ms} (default 10 minutes), on the scheduler leader only
 * (SPEC-0048), it takes up to {@code oms.retention.batch-size} orders that are CLOSED, whose CLOSE
 * event is older than {@code oms.retention.closed-order-days}, and that have no pending outbox row.
 * For each:
 * <ol>
 *   <li>the archive replica must hold its complete history, row for row ({@link ReplicaVerifier});</li>
 *   <li>the {@link ArchivePreconditions} must not refuse it;</li>
 *   <li>then, in one transaction that locks the order and re-checks it is still CLOSED at the version
 *       verified, its rows are deleted from every history table. The replica does not replicate
 *       deletes, so it keeps them.</li>
 * </ol>
 * A failed order keeps every row, is counted in {@code oms.retention.failures} with its reason, logged
 * at WARN with its id, and retried on the next run. Without a replica nothing is archived.
 */
@Component
@Slf4j
public class RetentionJob {

    /** What happened to one order. */
    public enum Outcome { ARCHIVED, REPLICA_MISMATCH, REPLICA_UNREACHABLE, PRECONDITION, CHANGED, ERROR }

    /** The tables an archived order's rows are deleted from, most dependent first. */
    private static final List<String> DELETE_ORDER =
            List.of("order_execution_projection", "command_log", "executions", "order_event_keys", "order_events", "orders");

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final Leadership leadership;
    private final Optional<ReplicaVerifier> verifier;
    private final ArchivePreconditions preconditions;
    private final MeterRegistry meters;
    private final Clock clock;
    private final boolean enabled;
    private final int retentionDays;
    private final int batchSize;
    private final Counter archived;
    private final AtomicInteger eligible = new AtomicInteger();
    private boolean reportedNoReplica;

    @Autowired
    public RetentionJob(
            JdbcTemplate jdbc,
            PlatformTransactionManager transactionManager,
            Leadership leadership,
            Optional<ReplicaDatabase> replica,
            ArchivePreconditions preconditions,
            MeterRegistry meters,
            Clock clock,
            @Value("${oms.retention.enabled:true}") boolean enabled,
            @Value("${oms.retention.closed-order-days:90}") int retentionDays,
            @Value("${oms.retention.batch-size:200}") int batchSize) {
        this(jdbc, transactionManager, leadership, replica.map(r -> new ReplicaVerifier(jdbc, r.jdbc())),
                preconditions, meters, clock, enabled, retentionDays, batchSize, true);
    }

    /** With an explicit verifier: tests use it to point at an unreachable replica. */
    public RetentionJob(
            JdbcTemplate jdbc,
            PlatformTransactionManager transactionManager,
            Leadership leadership,
            Optional<ReplicaVerifier> verifier,
            ArchivePreconditions preconditions,
            MeterRegistry meters,
            Clock clock,
            boolean enabled,
            int retentionDays,
            int batchSize,
            boolean registerGauge) {
        this.jdbc = jdbc;
        this.tx = new TransactionTemplate(transactionManager);
        this.leadership = leadership;
        this.verifier = verifier;
        this.preconditions = preconditions;
        this.meters = meters;
        this.clock = clock;
        this.enabled = enabled;
        this.retentionDays = retentionDays;
        this.batchSize = batchSize;
        this.archived = Counter.builder("oms.retention.archived")
                .description("Closed orders archived: verified on the replica, then deleted here")
                .register(meters);
        if (registerGauge) {
            meters.gauge("oms.retention.eligible", eligible);
        }
    }

    @Scheduled(
            fixedDelayString = "${oms.retention.interval-ms:600000}",
            initialDelayString = "${oms.retention.initial-delay-ms:120000}")
    void scheduled() {
        if (!enabled || !leadership.holds(Role.SCHEDULER)) {
            return;
        }
        if (verifier.isEmpty()) {
            if (!reportedNoReplica) {
                log.info("[retention] archiving is off: no archive replica (oms.replica.enabled=false)");
                reportedNoReplica = true;
            }
            return;
        }
        try {
            run();
        } catch (RuntimeException e) {
            log.error("Retention run failed: {}", e.toString(), e);
        }
    }

    /** One run: the outcome per eligible order, in the order they were taken. */
    public Map<String, Outcome> run() {
        Map<String, Outcome> outcomes = new LinkedHashMap<>();
        if (verifier.isEmpty()) {
            return outcomes;
        }
        Instant cutoff = clock.instant().minusSeconds(86_400L * retentionDays);
        List<String> orderIds = jdbc.queryForList(
                "select o.order_id from orders o"
                        + " where o.state = 'CLOSED'"
                        + " and exists (select 1 from order_events e where e.order_id = o.order_id and e.event = 'CLOSE' and e.time_stamp < ?)"
                        + " and not exists (select 1 from outbox x where x.order_id = o.order_id)"
                        + " order by o.id limit ?",
                String.class, Timestamp.from(cutoff), batchSize);
        eligible.set(orderIds.size());
        for (String orderId : orderIds) {
            outcomes.put(orderId, archive(orderId));
        }
        return outcomes;
    }

    private Outcome archive(String orderId) {
        Long version = jdbc.queryForObject("select tx_nr from orders where order_id = ?", Long.class, orderId);
        try {
            ReplicaVerifier.Result result = verifier.orElseThrow().verify(orderId);
            if (result instanceof ReplicaVerifier.Mismatch m) {
                return fail(orderId, Outcome.REPLICA_MISMATCH,
                        "replica-mismatch on " + m.table() + " (primary " + m.primary() + ", replica " + m.replica() + ")");
            }
        } catch (ReplicaVerifier.ReplicaUnreachableException e) {
            return fail(orderId, Outcome.REPLICA_UNREACHABLE, "replica-unreachable: " + e.getMessage());
        }
        Optional<String> refused = preconditions.refuse(orderId);
        if (refused.isPresent()) {
            return fail(orderId, Outcome.PRECONDITION, "precondition: " + refused.get());
        }
        try {
            Boolean deleted = tx.execute(s -> {
                Map<String, Object> locked = jdbc.queryForMap(
                        "select state, tx_nr from orders where order_id = ? for update", orderId);
                if (!"CLOSED".equals(locked.get("state")) || !version.equals(((Number) locked.get("tx_nr")).longValue())) {
                    return false;
                }
                for (String table : DELETE_ORDER) {
                    jdbc.update("delete from " + table + " where order_id = ?", orderId);
                }
                return true;
            });
            if (!Boolean.TRUE.equals(deleted)) {
                return fail(orderId, Outcome.CHANGED, "changed: the order is no longer CLOSED at the version verified");
            }
        } catch (RuntimeException e) {
            return fail(orderId, Outcome.ERROR, "error: " + e);
        }
        archived.increment();
        log.info("[retention] archived order {} (version {})", orderId, version);
        return Outcome.ARCHIVED;
    }

    private Outcome fail(String orderId, Outcome outcome, String reason) {
        meters.counter("oms.retention.failures", "reason", outcome.name().toLowerCase().replace('_', '-')).increment();
        log.warn("[retention] order {} not archived: {}", orderId, reason);
        return outcome;
    }
}
