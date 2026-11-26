package org.example.simulator.kafka.errors;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.NewPartitions;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.admin.TopicDescription;
import org.apache.kafka.common.errors.TopicExistsException;
import org.apache.kafka.common.errors.UnknownTopicOrPartitionException;

import lombok.extern.slf4j.Slf4j;

/**
 * Creates this service's dead-letter topics (SPEC-0077), so they exist, and are listed on the
 * dead-letter screen, before the first dead letter.
 *
 * <p>Each {@code <topic>.<service>.DLT} gets the partition count of its source topic: a consumer's
 * recoverer writes a dead letter to the same partition number it came from. A dead-letter topic that
 * exists with fewer partitions is grown (its order does not matter; nothing consumes it in order).
 *
 * <p>Each source topic is provisioned on its own. At startup a source that does not exist yet (on a
 * fresh stack oms-core creates its topics only after its migrations) is waited for briefly, then
 * retried in the background every {@code retryInterval} until it exists. Failures are logged, never
 * thrown: the service starts either way.
 */
@Slf4j
public class DeadLetterTopicProvisioner implements AutoCloseable {

    /** How long startup waits for a source topic created a moment ago. */
    static final long STARTUP_WAIT_MS = 5_000;

    private final Map<String, Object> adminConfig;
    private final DeadLetters deadLetters;
    private final short replicationFactor;
    private final long timeoutMs;
    private final Map<String, Integer> provisioned = new ConcurrentHashMap<>();
    private final Set<String> pending = ConcurrentHashMap.newKeySet();
    private final ScheduledExecutorService retries;

    public DeadLetterTopicProvisioner(
            Map<String, Object> adminConfig,
            List<String> sourceTopics,
            DeadLetters deadLetters,
            short replicationFactor,
            long timeoutMs) {
        this(adminConfig, sourceTopics, deadLetters, replicationFactor, timeoutMs, Duration.ofSeconds(10));
    }

    public DeadLetterTopicProvisioner(
            Map<String, Object> adminConfig,
            List<String> sourceTopics,
            DeadLetters deadLetters,
            short replicationFactor,
            long timeoutMs,
            Duration retryInterval) {
        this.adminConfig = adminConfig;
        this.deadLetters = deadLetters;
        this.replicationFactor = replicationFactor;
        this.timeoutMs = timeoutMs;
        this.pending.addAll(sourceTopics);
        attempt(Math.min(timeoutMs, STARTUP_WAIT_MS), true);
        if (pending.isEmpty()) {
            this.retries = null;
            return;
        }
        log.warn("Source topics {} do not exist yet or could not be read; their dead-letter topics are created "
                + "once they can be, retrying every {}", pending, retryInterval);
        this.retries = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "dead-letter-topic-provisioner");
            thread.setDaemon(true);
            return thread;
        });
        long interval = retryInterval.toMillis();
        retries.scheduleWithFixedDelay(this::retry, interval, interval, TimeUnit.MILLISECONDS);
    }

    /** Dead-letter topic → its partition count, as created or found so far. */
    public Map<String, Integer> topics() {
        return Map.copyOf(provisioned);
    }

    /** Source topics whose dead-letter topic is not provisioned yet. */
    public Set<String> pending() {
        return Set.copyOf(pending);
    }

    @Override
    public void close() {
        if (retries != null) {
            retries.shutdownNow();
        }
    }

    private void retry() {
        attempt(0, false);
        if (pending.isEmpty()) {
            retries.shutdown();
        }
    }

    /** Provisions every pending source that can be read, waiting up to {@code unknownWaitMs} for unknown ones. */
    private synchronized void attempt(long unknownWaitMs, boolean startup) {
        try (Admin admin = Admin.create(adminConfig)) {
            long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(unknownWaitMs);
            while (true) {
                for (String source : List.copyOf(pending)) {
                    provision(admin, source, startup);
                }
                if (pending.isEmpty() || System.nanoTime() > deadline) {
                    return;
                }
                Thread.sleep(100);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (RuntimeException e) {
            log.error("Could not reach Kafka to provision the dead-letter topics of {}: {}", pending, e.toString());
        }
    }

    private void provision(Admin admin, String source, boolean startup) throws InterruptedException {
        String dlt = deadLetters.topicFor(source);
        try {
            int partitions = describe(admin, source).partitions().size();
            try {
                admin.createTopics(List.of(new NewTopic(dlt, partitions, replicationFactor)))
                        .all().get(timeoutMs, TimeUnit.MILLISECONDS);
                log.info("Created dead-letter topic {} with {} partitions", dlt, partitions);
            } catch (ExecutionException e) {
                if (!(e.getCause() instanceof TopicExistsException)) {
                    throw e;
                }
            }
            int actual = waitForDescription(admin, dlt).partitions().size();
            if (actual < partitions) {
                admin.createPartitions(Map.of(dlt, NewPartitions.increaseTo(partitions)))
                        .all().get(timeoutMs, TimeUnit.MILLISECONDS);
                log.info("Grew dead-letter topic {} from {} to {} partitions", dlt, actual, partitions);
                actual = partitions;
            }
            provisioned.put(dlt, actual);
            pending.remove(source);
        } catch (ExecutionException e) {
            if (!(e.getCause() instanceof UnknownTopicOrPartitionException)) {
                logFailure(source, dlt, e.getCause(), startup);
            }
        } catch (InterruptedException e) {
            throw e;
        } catch (Exception e) {
            logFailure(source, dlt, e, startup);
        }
    }

    private static void logFailure(String source, String dlt, Throwable failure, boolean startup) {
        if (startup) {
            log.error("Could not provision dead-letter topic {} of {}: {}", dlt, source, failure.toString());
        } else {
            log.debug("Could not provision dead-letter topic {} of {} yet: {}", dlt, source, failure.toString());
        }
    }

    private TopicDescription describe(Admin admin, String topic) throws Exception {
        return admin.describeTopics(List.of(topic)).allTopicNames().get(timeoutMs, TimeUnit.MILLISECONDS).get(topic);
    }

    /** Describes a topic just created, which can be unknown to the broker that answers for a moment. */
    private TopicDescription waitForDescription(Admin admin, String topic) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        while (true) {
            try {
                return describe(admin, topic);
            } catch (ExecutionException e) {
                if (!(e.getCause() instanceof UnknownTopicOrPartitionException) || System.nanoTime() > deadline) {
                    throw e;
                }
                Thread.sleep(100);
            }
        }
    }
}
