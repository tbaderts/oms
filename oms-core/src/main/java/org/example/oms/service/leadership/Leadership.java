package org.example.oms.service.leadership;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.DriverManager;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jdbc.autoconfigure.DataSourceProperties;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;

/**
 * Which of the instance-wide roles this instance holds (SPEC-0048).
 *
 * <p>Each role is a session-level PostgreSQL advisory lock taken on a connection of its own, opened
 * outside the connection pool: the pool keeps its full size, and nothing recycles the connection
 * behind the lock's back. If this instance stops or its session dies, PostgreSQL releases the lock
 * and another instance takes the role on its next attempt.
 *
 * <p>{@link #holds} is asked before doing the role's work. It answers from what this instance holds,
 * checks the session is still alive, and otherwise tries to take the lock. An instance therefore
 * never acts on a lock it lost.
 */
@Component
@Slf4j
public class Leadership implements SmartLifecycle {

    /** Opens the dedicated connection; a seam for tests. */
    @FunctionalInterface
    interface Connector {
        Connection open() throws SQLException;
    }

    private final Connector connector;
    private final Set<Role> held = EnumSet.noneOf(Role.class);
    private Connection connection;

    /**
     * Whether this instance may hold roles. Cleared when the context stops: at the start of a graceful
     * shutdown, so a successor takes over at once, and when a context is paused (Spring 7 pauses cached
     * test contexts), so a context that no longer drains does not keep the relay leadership.
     */
    private boolean running = true;

    @Autowired
    public Leadership(DataSourceProperties dataSource) {
        this(() -> DriverManager.getConnection(
                dataSource.determineUrl(),
                connectionProperties(dataSource.determineUsername(), dataSource.determinePassword())));
    }

    /**
     * The dedicated connection's settings. TCP keepalive lets a partitioned leader's dead session be
     * detected by the server in minutes (with {@code tcp_keepalives_idle} set there), releasing its
     * lock, instead of the OS default of hours. The socket timeout keeps a hung server from blocking
     * the leadership check.
     */
    static java.util.Properties connectionProperties(String user, String password) {
        java.util.Properties properties = new java.util.Properties();
        if (user != null) {
            properties.setProperty("user", user);
        }
        if (password != null) {
            properties.setProperty("password", password);
        }
        properties.setProperty("tcpKeepAlive", "true");
        properties.setProperty("socketTimeout", "30");
        return properties;
    }

    Leadership(Connector connector) {
        this.connector = connector;
    }

    /** Whether this instance holds the role now, taking it if no other instance does. */
    public synchronized boolean holds(Role role) {
        if (!running) {
            return false;
        }
        try {
            if (!sessionAlive()) {
                if (!held.isEmpty()) {
                    log.warn("Lost the session holding {}; no longer leader", held);
                }
                held.clear();
                // Closed first: an unanswering session left open would keep the lock while this
                // instance, on a new session, could not take it, and nobody would lead.
                closeQuietly();
                connection = connector.open();
            }
            if (held.contains(role)) {
                return true;
            }
            if (tryLock(role)) {
                held.add(role);
                log.info("This instance is now the {} leader", role);
                return true;
            }
            return false;
        } catch (SQLException e) {
            log.warn("Could not check {} leadership; acting as a follower: {}", role, e.getMessage());
            held.clear();
            closeQuietly();
            return false;
        }
    }

    @Override
    public synchronized void start() {
        running = true;
    }

    /** Gives up every role and takes none until started again. */
    @Override
    public synchronized void stop() {
        release();
        running = false;
    }

    @Override
    public synchronized boolean isRunning() {
        return running;
    }

    /** Stopped early in shutdown, before the relay and schedulers, so a successor takes over at once. */
    @Override
    public int getPhase() {
        return Integer.MAX_VALUE - 100;
    }

    /** What this instance holds, without trying to take anything; for health. */
    public synchronized Map<Role, Boolean> held() {
        Map<Role, Boolean> view = new EnumMap<>(Role.class);
        boolean alive = sessionAliveQuietly();
        for (Role role : Role.values()) {
            view.put(role, alive && held.contains(role));
        }
        return view;
    }

    /** Releases every role, so another instance takes over at once rather than at session loss. */
    @PreDestroy
    public synchronized void release() {
        if (connection != null && sessionAliveQuietly()) {
            for (Role role : held) {
                try (PreparedStatement statement = connection.prepareStatement("select pg_advisory_unlock(?)")) {
                    statement.setLong(1, role.getLockKey());
                    statement.execute();
                } catch (SQLException e) {
                    log.warn("Could not release {}: {}", role, e.getMessage());
                }
            }
        }
        held.clear();
        closeQuietly();
    }

    private boolean tryLock(Role role) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("select pg_try_advisory_lock(?)")) {
            statement.setLong(1, role.getLockKey());
            try (ResultSet result = statement.executeQuery()) {
                return result.next() && result.getBoolean(1);
            }
        }
    }

    private boolean sessionAlive() throws SQLException {
        return connection != null && !connection.isClosed() && connection.isValid(5);
    }

    private boolean sessionAliveQuietly() {
        try {
            return sessionAlive();
        } catch (SQLException e) {
            return false;
        }
    }

    private void closeQuietly() {
        if (connection != null) {
            try {
                connection.close();
            } catch (SQLException e) {
                log.debug("Closing the leadership connection failed: {}", e.getMessage());
            }
            connection = null;
        }
    }
}
