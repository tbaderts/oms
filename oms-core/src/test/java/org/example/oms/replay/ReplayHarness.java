package org.example.oms.replay;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import javax.sql.DataSource;

import org.example.common.model.cmd.Command;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.oms.service.command.CommandDispatch;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Replays an event log's stored commands into a fresh database and compares the snapshots
 * (SPEC-0024).
 *
 * <p>The source is read with plain JDBC in event {@code id} order, and each row is decoded under the
 * upcasting rule ({@link StoredEventDecoder}). Since SPEC-0047 ids are drawn in blocks of 50 per
 * instance, so with several instances an order's later event can have a smaller id than an earlier
 * one. The events are therefore put in replay order: id order, except that an event is held back
 * until its order's previous version has been replayed (see {@link #inReplayOrder}). Where ids
 * already follow versions, that is plain id order. Each
 * command is re-executed through {@code CommandDispatcher}, the entry point REST, Kafka and the
 * scheduler use, so validation, the state machine, the task pipelines and the event append all
 * run. The replayed log is then read the same way and compared with {@link SnapshotDiff}.
 *
 * <p>Every recorded event is a command that was applied, since a refused command writes no event.
 * A replayed command that is refused or fails is therefore a regression, and is reported as one.
 */
public final class ReplayHarness {

    private static final Logger log = LoggerFactory.getLogger(ReplayHarness.class);

    private static final String SELECT_EVENTS = "select id, order_id, version, event, resulting_state, schema_version,"
            + " transaction::text, order_snapshot::text from order_events order by id";

    private static final StoredEventDecoder DECODER = new StoredEventDecoder();

    private ReplayHarness() {}

    /** Replays the source database's event log into the target and compares the two. */
    public static ReplayResult replay(DataSource source, ReplayTarget target) {
        OrderSnapshotHistory recorded = read(source);
        List<String> legacy = recorded.legacyOrderIds();
        if (!legacy.isEmpty()) {
            log.warn("Replaying {} order(s) whose events have no schema_version, read as version 1 under the"
                            + " upcasting rule: {}",
                    legacy.size(),
                    legacy);
        }

        List<String> notApplied = new ArrayList<>();
        for (StoredEvent event : recorded.events()) {
            String at = event.orderId() + " v" + event.version() + " (" + event.event() + ")";
            Command command = event.command();
            if (command == null) {
                notApplied.add(at + ": no command stored");
                continue;
            }
            pinOrderId(command, event.orderId());
            try {
                CommandDispatch outcome = target.dispatcher().dispatch(command, ReplayTarget.origin(Instant.now()));
                if (!(outcome instanceof CommandDispatch.Applied)) {
                    notApplied.add(at + ": " + outcome);
                }
            } catch (RuntimeException e) {
                notApplied.add(at + ": " + e);
            }
        }

        OrderSnapshotHistory replayed = read(target.dataSource());
        ReplayResult result = new ReplayResult(recorded, replayed, SnapshotDiff.compare(recorded, replayed), notApplied);
        result.lines().forEach(line -> log.info("{}", line));
        return result;
    }

    /** Reads every event of a database's log, in replay order (see {@link #inReplayOrder}). */
    public static OrderSnapshotHistory read(DataSource dataSource) {
        List<StoredEvent> events = new ArrayList<>();
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(SELECT_EVENTS);
                ResultSet rows = statement.executeQuery()) {
            while (rows.next()) {
                Integer schemaVersion = rows.getObject("schema_version", Integer.class);
                events.add(DECODER.decode(
                        rows.getLong("id"),
                        rows.getString("order_id"),
                        rows.getLong("version"),
                        rows.getString("event"),
                        rows.getString("resulting_state"),
                        schemaVersion,
                        rows.getString("transaction"),
                        rows.getString("order_snapshot")));
            }
        } catch (SQLException e) {
            throw new IllegalStateException("Could not read order_events", e);
        }
        return new OrderSnapshotHistory(inReplayOrder(events));
    }

    /**
     * Id order, except that an event waits until the previous version of its order is placed. Each
     * order's first event is its lowest version present. Deterministic, needs no clocks, and equal to
     * id order whenever ids already follow each order's versions (SPEC-0047).
     */
    static List<StoredEvent> inReplayOrder(List<StoredEvent> byId) {
        Map<String, Long> next = new HashMap<>();
        for (StoredEvent event : byId) {
            next.merge(event.orderId(), event.version(), Math::min);
        }
        Map<String, TreeMap<Long, StoredEvent>> held = new HashMap<>();
        List<StoredEvent> ordered = new ArrayList<>(byId.size());
        for (StoredEvent event : byId) {
            if (event.version() != next.get(event.orderId())) {
                held.computeIfAbsent(event.orderId(), k -> new TreeMap<>()).put(event.version(), event);
                continue;
            }
            Deque<StoredEvent> ready = new ArrayDeque<>();
            ready.add(event);
            while (!ready.isEmpty()) {
                StoredEvent placed = ready.poll();
                ordered.add(placed);
                long following = placed.version() + 1;
                next.put(placed.orderId(), following);
                TreeMap<Long, StoredEvent> waiting = held.get(placed.orderId());
                if (waiting != null && waiting.containsKey(following)) {
                    ready.add(waiting.remove(following));
                }
            }
        }
        // A gap in an order's versions leaves its later events held: keep them, in version order,
        // so the replay reports them rather than dropping them silently.
        held.values().forEach(waiting -> ordered.addAll(waiting.values()));
        return ordered;
    }

    /**
     * Gives a create the orderId the source assigned. The pipeline draws a random one only for an
     * order without one, so the replayed order keeps the recorded id and its events line up by
     * (orderId, version).
     */
    private static void pinOrderId(Command command, String orderId) {
        if (command instanceof OrderCreateCmd create && create.getOrder() != null) {
            create.getOrder().orderId(orderId);
        }
    }
}
