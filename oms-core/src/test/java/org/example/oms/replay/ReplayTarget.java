package org.example.oms.replay;

import java.time.Instant;

import javax.sql.DataSource;

import org.example.oms.OmsApplication;
import org.example.oms.model.CommandSource;
import org.example.oms.service.command.CommandDispatcher;
import org.example.oms.service.command.CommandOrigin;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

/**
 * The application a replay runs in (SPEC-0024): a second oms-core context on a fresh database,
 * which Liquibase migrates on start-up.
 *
 * <p>It runs with {@code kafka.enabled=false}, the application's default, so it has no command
 * listener and no outbox relay: replay neither consumes commands nor publishes what it stages, and
 * competes with no other instance for leadership. The end-of-day job is off, so the scheduler adds
 * no commands of its own.
 */
public final class ReplayTarget implements AutoCloseable {

    /** The principal of every replayed command, so its command-log rows show it was a replay. */
    public static final String PRINCIPAL = "replay";

    private final ConfigurableApplicationContext context;

    private ReplayTarget(ConfigurableApplicationContext context) {
        this.context = context;
    }

    /** Starts the target on the given database, which should be empty. */
    public static ReplayTarget start(String jdbcUrl, String username, String password) {
        // As command-line arguments: they outrank application.yml, which names its own database.
        String[] arguments = {
            "--spring.datasource.url=" + jdbcUrl,
            "--spring.datasource.username=" + username,
            "--spring.datasource.password=" + password,
            "--spring.jpa.hibernate.ddl-auto=validate",
            "--kafka.enabled=false",
            "--oms.end-of-day.enabled=false",
            "--server.port=0"
        };
        return new ReplayTarget(new SpringApplicationBuilder(OmsApplication.class).run(arguments));
    }

    /**
     * Where a replayed command comes from. The command log's source enum is published in the query
     * API, so a replay is recorded as REST, the way the command API enters, with principal
     * {@value #PRINCIPAL}; those rows exist only in a replay target.
     */
    public static CommandOrigin origin(Instant receivedAt) {
        return new CommandOrigin(CommandSource.REST, PRINCIPAL, receivedAt);
    }

    public CommandDispatcher dispatcher() {
        return context.getBean(CommandDispatcher.class);
    }

    public DataSource dataSource() {
        return context.getBean(DataSource.class);
    }

    public ConfigurableApplicationContext context() {
        return context;
    }

    @Override
    public void close() {
        context.close();
    }
}
