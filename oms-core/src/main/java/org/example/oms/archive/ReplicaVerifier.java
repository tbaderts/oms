package org.example.oms.archive;

import java.util.List;

import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Whether the archive replica holds an order's complete history, exactly as the primary does
 * (SPEC-0052). For each order-history table it compares the order's row count and a checksum of the
 * rows' content, computed the same way on both databases. Both run the same changelog, so the
 * column order, and with it each row's JSON text, matches.
 */
public class ReplicaVerifier {

    /** The order-history tables and the key that orders an order's rows in each. */
    static final List<String[]> TABLES = List.of(
            new String[] {"orders", "id"},
            new String[] {"order_events", "id"},
            new String[] {"order_event_keys", "version"},
            new String[] {"executions", "id"},
            new String[] {"command_log", "id"},
            new String[] {"order_execution_projection", "id"});

    /** One table's summary of an order's rows. */
    public record Summary(long rows, String checksum) {
        @Override
        public String toString() {
            return rows + "/" + (checksum.length() > 8 ? checksum.substring(0, 8) + "…" : checksum);
        }
    }

    /** The outcome of a verification. */
    public sealed interface Result permits Match, Mismatch {}

    public record Match() implements Result {}

    /** The first table whose summaries differ. */
    public record Mismatch(String table, Summary primary, Summary replica) implements Result {}

    /** The replica could not be read. */
    public static class ReplicaUnreachableException extends RuntimeException {
        ReplicaUnreachableException(Throwable cause) {
            super("the replica could not be read: " + cause.getMessage(), cause);
        }
    }

    private final JdbcTemplate primary;
    private final JdbcTemplate replica;

    public ReplicaVerifier(JdbcTemplate primary, JdbcTemplate replica) {
        this.primary = primary;
        this.replica = replica;
    }

    /**
     * Compares the order's rows in every history table.
     *
     * @throws ReplicaUnreachableException when the replica cannot be read
     */
    public Result verify(String orderId) {
        for (String[] table : TABLES) {
            Summary onPrimary = summary(primary, table[0], table[1], orderId);
            Summary onReplica;
            try {
                onReplica = summary(replica, table[0], table[1], orderId);
            } catch (DataAccessException e) {
                throw new ReplicaUnreachableException(e.getMostSpecificCause());
            }
            if (!onPrimary.equals(onReplica)) {
                return new Mismatch(table[0], onPrimary, onReplica);
            }
        }
        return new Match();
    }

    private static Summary summary(JdbcTemplate db, String table, String key, String orderId) {
        return db.queryForObject(
                "select count(*), coalesce(md5(string_agg(md5(row_to_json(t)::text), ',' order by " + key + ")), '')"
                        + " from " + table + " t where order_id = ?",
                (rs, n) -> new Summary(rs.getLong(1), rs.getString(2)),
                orderId);
    }
}
