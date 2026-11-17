package org.example.oms.archive;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;

import liquibase.Scope;
import liquibase.command.CommandScope;
import liquibase.resource.ClassLoaderResourceAccessor;
import lombok.extern.slf4j.Slf4j;

/**
 * Prepares the archive replica at start-up (SPEC-0052), after the primary is migrated:
 * <ol>
 *   <li>migrates it with the primary's own changelog, in context {@code replica}, so its schema is the
 *       primary's (DDL is not replicated) without the changesets that only belong on the primary,
 *       such as the publication;</li>
 *   <li>subscribes it to the primary's {@code oms_history} publication, once. The initial copy brings
 *       existing history over; from then on inserts and updates follow, deletes do not.</li>
 * </ol>
 * A replica that cannot be reached is logged and does not stop oms-core: archiving then refuses,
 * because it cannot verify the replica holds an order.
 */
@Slf4j
@Order(Ordered.HIGHEST_PRECEDENCE)
public class ReplicaSchema implements ApplicationRunner {

    static final String CHANGELOG = "db/changelog/db.changelog-master.yaml";
    private static final Pattern IDENTIFIER = Pattern.compile("[a-z_][a-z0-9_]{0,62}");

    private final ReplicaDatabase replica;

    public ReplicaSchema(ReplicaDatabase replica) {
        this.replica = replica;
    }

    @Override
    public void run(ApplicationArguments args) {
        ReplicaDatabase.ReplicaProperties p = replica.properties();
        try {
            migrate(p);
            subscribe(p);
            log.info("[replica] subscription {} active", p.subscription());
        } catch (Exception e) {
            log.warn("[replica] not ready, archiving will refuse until it is: {}", e.toString());
        }
    }

    private static void migrate(ReplicaDatabase.ReplicaProperties p) throws Exception {
        Scope.child(
                Map.of(Scope.Attr.resourceAccessor.name(), new ClassLoaderResourceAccessor()),
                () -> new CommandScope("update")
                        .addArgumentValue("changelogFile", CHANGELOG)
                        .addArgumentValue("url", p.url())
                        .addArgumentValue("username", p.username())
                        .addArgumentValue("password", p.password())
                        .addArgumentValue("contexts", "replica")
                        .execute());
    }

    private static void subscribe(ReplicaDatabase.ReplicaProperties p) throws SQLException {
        if (!IDENTIFIER.matcher(p.subscription()).matches()) {
            throw new IllegalArgumentException("oms.replica.subscription must be a lower-case identifier: " + p.subscription());
        }
        // CREATE SUBSCRIPTION cannot run in a transaction block: a plain autocommit connection.
        try (Connection connection = DriverManager.getConnection(p.url(), p.username(), p.password())) {
            try (PreparedStatement exists = connection.prepareStatement("select 1 from pg_subscription where subname = ?")) {
                exists.setString(1, p.subscription());
                try (ResultSet rs = exists.executeQuery()) {
                    if (rs.next()) {
                        return;
                    }
                }
            }
            try (Statement statement = connection.createStatement()) {
                statement.execute("CREATE SUBSCRIPTION " + p.subscription()
                        + " CONNECTION '" + p.primaryConninfo().replace("'", "''") + "'"
                        + " PUBLICATION oms_history WITH (copy_data = true)");
            }
        }
    }
}
