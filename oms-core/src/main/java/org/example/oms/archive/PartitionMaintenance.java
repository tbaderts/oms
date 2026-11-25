package org.example.oms.archive;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.example.oms.service.leadership.Leadership;
import org.example.oms.service.leadership.Role;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;

/**
 * Keeps {@code order_events}' monthly partitions in shape (SPEC-0052).
 *
 * <p>Every {@code oms.partitions.interval-ms} (default one hour), on the scheduler leader only
 * (SPEC-0048):
 * <ul>
 *   <li><b>ahead</b>: the current month's partition and the next {@code oms.partitions.months-ahead}
 *       (default 2) exist, so an event never lands in the default partition for want of its month.
 *       A month cannot be created once rows for it are in the default partition; staying ahead
 *       prevents that, and a failure is logged at ERROR with the month;</li>
 *   <li><b>behind</b>: a monthly partition that ended before the retention period
 *       ({@code oms.retention.closed-order-days}) and before the current month, and that archiving
 *       has emptied, is detached and dropped. One that still holds a row, a retained order's
 *       event, stays. The default partition is never dropped. DDL is not replicated, so the archive
 *       replica keeps the rows these partitions held.</li>
 * </ul>
 * Months are UTC, as in changelog 017.
 */
@Component
@Slf4j
public class PartitionMaintenance {

    private static final Pattern MONTHLY = Pattern.compile("order_events_p(\\d{4})(\\d{2})");
    private static final DateTimeFormatter SUFFIX = DateTimeFormatter.ofPattern("yyyyMM");

    private final JdbcTemplate jdbc;
    private final Leadership leadership;
    private final Clock clock;
    private final boolean enabled;
    private final int monthsAhead;
    private final int retentionDays;
    private final Counter dropped;

    @Autowired
    public PartitionMaintenance(
            JdbcTemplate jdbc,
            Leadership leadership,
            MeterRegistry meterRegistry,
            Clock clock,
            @Value("${oms.partitions.enabled:true}") boolean enabled,
            @Value("${oms.partitions.months-ahead:2}") int monthsAhead,
            @Value("${oms.retention.closed-order-days:30}") int retentionDays) {
        this.jdbc = jdbc;
        this.leadership = leadership;
        this.clock = clock;
        this.enabled = enabled;
        this.monthsAhead = monthsAhead;
        this.retentionDays = retentionDays;
        this.dropped = Counter.builder("oms.retention.partitions_dropped")
                .description("Monthly order_events partitions detached and dropped after archiving emptied them")
                .register(meterRegistry);
    }

    @Scheduled(
            fixedDelayString = "${oms.partitions.interval-ms:3600000}",
            initialDelayString = "${oms.partitions.initial-delay-ms:30000}")
    void scheduled() {
        if (!enabled || !leadership.holds(Role.SCHEDULER)) {
            return;
        }
        try {
            ensureAhead();
            dropEmptyPast();
        } catch (RuntimeException e) {
            log.error("Partition maintenance failed: {}", e.toString(), e);
        }
    }

    /** Creates the current month's partition and the next {@code monthsAhead}, where missing. */
    public void ensureAhead() {
        YearMonth current = YearMonth.now(clock.withZone(ZoneOffset.UTC));
        for (int i = 0; i <= monthsAhead; i++) {
            YearMonth month = current.plusMonths(i);
            String name = "order_events_p" + month.format(SUFFIX);
            try {
                jdbc.execute("CREATE TABLE IF NOT EXISTS " + name + " PARTITION OF order_events FOR VALUES FROM ('"
                        + start(month) + "') TO ('" + start(month.plusMonths(1)) + "')");
            } catch (DataAccessException e) {
                log.error("[partitions] could not create {} for {}: {}", name, month, e.getMostSpecificCause().getMessage());
            }
        }
    }

    /**
     * Detaches and drops monthly partitions that ended before the retention period and before the
     * current month, and that are empty.
     *
     * @return the names of the partitions dropped
     */
    public List<String> dropEmptyPast() {
        Instant now = clock.instant();
        Instant retentionStart = now.minusSeconds(86_400L * retentionDays);
        Instant currentMonth = start(YearMonth.now(clock.withZone(ZoneOffset.UTC)));
        List<String> result = new ArrayList<>();
        for (String name : jdbc.queryForList(
                "select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid"
                        + " where i.inhparent = 'order_events'::regclass order by c.relname",
                String.class)) {
            Matcher m = MONTHLY.matcher(name);
            if (!m.matches()) {
                continue; // the default partition, or anything not ours
            }
            YearMonth month = YearMonth.of(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)));
            Instant end = start(month.plusMonths(1));
            if (end.isAfter(retentionStart) || end.isAfter(currentMonth)) {
                continue;
            }
            Boolean empty = jdbc.queryForObject("select not exists (select 1 from " + name + ")", Boolean.class);
            if (!Boolean.TRUE.equals(empty)) {
                continue;
            }
            if (!detachAndDrop(name)) {
                // every other drop waits on the same lock: stop, so a run blocks appends once, briefly
                break;
            }
            dropped.increment();
            result.add(name);
            log.info("[partitions] dropped {}: emptied by archiving", name);
        }
        return result;
    }

    /**
     * Detaches and drops one partition in a transaction of its own. DETACH takes an exclusive lock on
     * {@code order_events}; behind a long transaction it would queue every event append behind it, so
     * it gives up after {@link #LOCK_TIMEOUT} and the next run tries again.
     *
     * @return whether the partition was dropped
     */
    private boolean detachAndDrop(String name) {
        try {
            jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Void>) connection -> {
                boolean autoCommit = connection.getAutoCommit();
                connection.setAutoCommit(false);
                try (java.sql.Statement statement = connection.createStatement()) {
                    statement.execute("SET LOCAL lock_timeout = '" + LOCK_TIMEOUT + "'");
                    statement.execute("ALTER TABLE order_events DETACH PARTITION " + name);
                    statement.execute("DROP TABLE " + name);
                    connection.commit();
                } catch (java.sql.SQLException e) {
                    connection.rollback();
                    throw e;
                } finally {
                    connection.setAutoCommit(autoCommit);
                }
                return null;
            });
            return true;
        } catch (org.springframework.dao.DataAccessException e) {
            log.warn("[partitions] {} not dropped, retried next run: {}", name, e.getMostSpecificCause().getMessage());
            return false;
        }
    }

    /** How long a partition drop waits for its lock on {@code order_events}. */
    static final String LOCK_TIMEOUT = "5s";

    private static Instant start(YearMonth month) {
        return LocalDate.of(month.getYear(), month.getMonth(), 1).atStartOfDay(ZoneOffset.UTC).toInstant();
    }
}
