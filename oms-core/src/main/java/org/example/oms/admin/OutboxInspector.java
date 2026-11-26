package org.example.oms.admin;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.apache.avro.generic.IndexedRecord;
import org.example.oms.mapper.OutboxRecordMapper;
import org.example.oms.model.OutboxMessage;
import org.example.oms.repository.OutboxRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.JsonNode;

/**
 * The outbox as an operator sees it (SPEC-0075): what waits to be published, and in which state.
 *
 * <p>The states are the relay's own ({@code OutboxRepository.claimPending}), derived on every read and
 * never stored: a message is STUCK once it is parked (SPEC-0077: dead-lettered, or refused by its
 * dead-letter topic); HELD when, not stuck itself, its aggregate (same topic and key) has a stuck
 * message, so the relay keeps it back to preserve order; PENDING otherwise (being sent or retried). Reads take no locks, so they never hold up the relay, and change
 * nothing.
 */
@Service
@Transactional(readOnly = true)
public class OutboxInspector {

    /** Where an outbox message stands. */
    public enum OutboxState { PENDING, STUCK, HELD }

    /** Counts by state, and the oldest message still to be published (pending or held). */
    public record Summary(long pending, long stuck, long held, int maxAttempts,
            Instant oldestWaitingCreatedAt, Long oldestWaitingAgeSeconds) {}

    /** One message, as listed. {@code key} is the Kafka key (the outbox's aggregate id). */
    public record Entry(long id, OutboxState state, String aggregateType, String topic, String key,
            String orderId, String execId, long aggregateVersion, String payloadType,
            Instant createdAt, int attempts, int maxAttempts, String lastError) {}

    /** A page of messages, and how many match in all. */
    public record Page(List<Entry> content, long total) {}

    /**
     * One message with its payload decoded to JSON; {@code payload} is null for a pointer message,
     * which carries none, and {@code payloadError} says why a payload could not be decoded.
     */
    public record Detail(Entry entry, JsonNode payload, Integer payloadSchemaId, String payloadError) {}

    /** The state of row {@code o}, with the relay's predicates. */
    private static final String STATE = """
            CASE WHEN o.parked_at IS NOT NULL THEN 'STUCK'
                 WHEN EXISTS (SELECT 1 FROM outbox s
                              WHERE s.topic = o.topic AND s.aggregate_id = o.aggregate_id
                                AND s.parked_at IS NOT NULL) THEN 'HELD'
                 ELSE 'PENDING' END""";

    private static final String ROWS = """
            SELECT o.id, o.aggregate_type, o.topic, o.aggregate_id, o.order_id, o.exec_id,
                   o.aggregate_version, o.payload_type, o.payload_schema_id, o.created_at, o.attempts,
                   o.last_error, %s AS state
            FROM outbox o""".formatted(STATE);

    private final JdbcTemplate jdbc;
    private final OutboxRepository outboxRepository;
    private final OutboxRecordMapper outboxRecordMapper;
    private final Clock clock;
    private final int maxAttempts;

    public OutboxInspector(
            JdbcTemplate jdbc,
            OutboxRepository outboxRepository,
            OutboxRecordMapper outboxRecordMapper,
            Clock clock,
            @Value("${kafka.outbox.max-attempts:50}") int maxAttempts) {
        this.jdbc = jdbc;
        this.outboxRepository = outboxRepository;
        this.outboxRecordMapper = outboxRecordMapper;
        this.clock = clock;
        this.maxAttempts = maxAttempts;
    }

    public Summary summary() {
        return jdbc.queryForObject("""
                SELECT count(*) FILTER (WHERE state = 'PENDING') AS pending,
                       count(*) FILTER (WHERE state = 'STUCK') AS stuck,
                       count(*) FILTER (WHERE state = 'HELD') AS held,
                       min(created_at) FILTER (WHERE state <> 'STUCK') AS oldest
                FROM (%s) x""".formatted(ROWS),
                (rs, i) -> {
                    Timestamp oldest = rs.getTimestamp("oldest");
                    Instant oldestAt = oldest == null ? null : oldest.toInstant();
                    Long age = oldestAt == null ? null : Math.max(0, Duration.between(oldestAt, clock.instant()).getSeconds());
                    return new Summary(rs.getLong("pending"), rs.getLong("stuck"), rs.getLong("held"), maxAttempts, oldestAt, age);
                });
    }

    /**
     * The messages, oldest (lowest id) first, of one state or of all when {@code state} is null.
     *
     * @throws IllegalArgumentException for a negative page or a size outside 1..200
     */
    public Page page(OutboxState state, int page, int size) {
        if (page < 0 || size < 1 || size > 200) {
            throw new IllegalArgumentException("page must be >= 0 and size between 1 and 200");
        }
        String filter = state == null ? "" : " WHERE x.state = ?";
        List<Object> args = new ArrayList<>();
        if (state != null) {
            args.add(state.name());
        }
        long total = jdbc.queryForObject("SELECT count(*) FROM (" + ROWS + ") x" + filter, Long.class, args.toArray());
        args.add(size);
        args.add((long) page * size);
        List<Entry> content = jdbc.query(
                "SELECT * FROM (" + ROWS + ") x" + filter + " ORDER BY x.id LIMIT ? OFFSET ?", this::entry, args.toArray());
        return new Page(content, total);
    }

    /** One message with its payload, or empty when there is none with that id (published meanwhile). */
    public Optional<Detail> get(long id) {
        List<Row> rows = jdbc.query(
                "SELECT * FROM (" + ROWS + ") x WHERE x.id = ?",
                (rs, i) -> new Row(entry(rs, i), (Integer) rs.getObject("payload_schema_id")),
                id);
        if (rows.isEmpty()) {
            return Optional.empty();
        }
        Row row = rows.get(0);
        OutboxMessage message = outboxRepository.findById(id).orElse(null);
        if (message == null) {
            // published between the two reads: answer as gone, not as a pointer message
            return Optional.empty();
        }
        if (!carriesPayload(message)) {
            return Optional.of(new Detail(row.entry(), null, row.payloadSchemaId(), null));
        }
        try {
            Object record = outboxRecordMapper.toRecord(message);
            JsonNode payload = record instanceof IndexedRecord indexed ? AvroJson.toJson(indexed) : null;
            return Optional.of(new Detail(row.entry(), payload, row.payloadSchemaId(), null));
        } catch (RuntimeException e) {
            return Optional.of(new Detail(row.entry(), null, row.payloadSchemaId(), String.valueOf(e.getMessage())));
        }
    }

    private record Row(Entry entry, Integer payloadSchemaId) {}

    /** Whether the row carries its record (projection and legacy rows), unlike a pointer row. */
    private static boolean carriesPayload(OutboxMessage message) {
        return message.getPayload() != null || message.getOrderPayload() != null || message.getExecutionPayload() != null;
    }

    private Entry entry(ResultSet rs, int rowNum) throws SQLException {
        return new Entry(
                rs.getLong("id"),
                OutboxState.valueOf(rs.getString("state")),
                rs.getString("aggregate_type"),
                rs.getString("topic"),
                rs.getString("aggregate_id"),
                rs.getString("order_id"),
                rs.getString("exec_id"),
                rs.getLong("aggregate_version"),
                rs.getString("payload_type"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getInt("attempts"),
                maxAttempts,
                rs.getString("last_error"));
    }
}
