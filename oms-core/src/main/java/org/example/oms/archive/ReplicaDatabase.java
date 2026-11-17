package org.example.oms.archive;

import org.springframework.jdbc.core.JdbcTemplate;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

/**
 * The read-only connection to the archive replica (SPEC-0052), and the settings oms-core uses to
 * migrate it and subscribe it to the primary.
 *
 * <p>Deliberately not a {@code DataSource} or {@code JdbcTemplate} bean: either would make Spring
 * Boot's auto-configuration back off from the primary database. SPEC-0021's query service reuses
 * this connection.
 */
public class ReplicaDatabase implements AutoCloseable {

    private final ReplicaProperties properties;
    private final HikariDataSource pool;
    private final JdbcTemplate jdbc;

    public ReplicaDatabase(ReplicaProperties properties) {
        this.properties = properties;
        HikariConfig config = new HikariConfig();
        config.setPoolName("replica");
        config.setJdbcUrl(properties.url());
        config.setUsername(properties.username());
        config.setPassword(properties.password());
        config.setReadOnly(true);
        config.setMaximumPoolSize(4);
        config.setMinimumIdle(0);
        // Start without connecting: an unreachable replica must not stop oms-core (archiving refuses).
        config.setInitializationFailTimeout(-1);
        this.pool = new HikariDataSource(config);
        this.jdbc = new JdbcTemplate(pool);
    }

    /** Reads from the replica. Read-only: the replica is written only by replication. */
    public JdbcTemplate jdbc() {
        return jdbc;
    }

    public ReplicaProperties properties() {
        return properties;
    }

    @Override
    public void close() {
        pool.close();
    }

    /**
     * The {@code oms.replica.*} settings. The password and the primary's conninfo come from the
     * environment (P-16).
     *
     * @param primaryConninfo the libpq string the replica's subscription uses to reach the primary
     * @param subscription    the subscription's name on the replica (and its slot on the primary)
     */
    public record ReplicaProperties(
            String url, String username, String password, String primaryConninfo, String subscription) {}
}
