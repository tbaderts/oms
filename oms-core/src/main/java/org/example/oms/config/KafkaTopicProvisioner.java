package org.example.oms.config;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.admin.TopicDescription;
import org.apache.kafka.common.errors.TopicExistsException;
import org.apache.kafka.common.errors.UnknownTopicOrPartitionException;

import lombok.extern.slf4j.Slf4j;

/**
 * Declares oms-core's topics (SPEC-0048): creates those that are missing with the configured
 * partition count, and reports the command topic's actual partition count, which the command
 * listener uses as its concurrency.
 *
 * <p>An existing topic with fewer partitions is never resized. Adding partitions moves keys to other
 * partitions, so records of one order already on the topic could be consumed out of order with the
 * new ones. Resizing is an operator step (drain, resize, restart); this only warns.
 *
 * <p>Kafka's own {@code NewTopic} beans are not used for this: {@code KafkaAdmin} raises the
 * partition count of existing topics, which is exactly what must not happen here.
 */
@Slf4j
public class KafkaTopicProvisioner {

    private final int commandPartitions;

    public KafkaTopicProvisioner(
            Map<String, Object> adminConfig,
            List<String> topics,
            String commandTopic,
            int partitions,
            short replicationFactor,
            long timeoutMs) {
        this.commandPartitions = provision(adminConfig, topics, commandTopic, partitions, replicationFactor, timeoutMs);
    }

    /** The command topic's partition count: one listener consumer per partition. */
    public int commandPartitions() {
        return commandPartitions;
    }

    /**
     * Describes the topics, waiting while one is still being created: a topic that another instance
     * has just created can be unknown to the broker that answers for a moment.
     */
    private static Map<String, TopicDescription> describe(Admin admin, List<String> topics, long timeoutMs)
            throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        while (true) {
            try {
                return admin.describeTopics(topics).allTopicNames().get(timeoutMs, TimeUnit.MILLISECONDS);
            } catch (ExecutionException e) {
                if (!(e.getCause() instanceof UnknownTopicOrPartitionException) || System.nanoTime() > deadline) {
                    throw e;
                }
                Thread.sleep(100);
            }
        }
    }

    private static int provision(
            Map<String, Object> adminConfig,
            List<String> topics,
            String commandTopic,
            int partitions,
            short replicationFactor,
            long timeoutMs) {
        try (Admin admin = Admin.create(adminConfig)) {
            Set<String> existing = admin.listTopics().names().get(timeoutMs, TimeUnit.MILLISECONDS);
            List<NewTopic> missing = new ArrayList<>();
            for (String topic : topics) {
                if (!existing.contains(topic)) {
                    missing.add(new NewTopic(topic, partitions, replicationFactor));
                }
            }
            if (!missing.isEmpty()) {
                for (var creation : admin.createTopics(missing).values().values()) {
                    try {
                        creation.get(timeoutMs, TimeUnit.MILLISECONDS);
                    } catch (ExecutionException e) {
                        // Another instance starting at the same time created it first: fine, it is
                        // described below like any existing topic.
                        if (!(e.getCause() instanceof TopicExistsException)) {
                            throw e;
                        }
                    }
                }
                log.info("Created topics {} with {} partitions", missing.stream().map(NewTopic::name).toList(), partitions);
            }

            Map<String, TopicDescription> described = describe(admin, topics, timeoutMs);
            described.forEach((topic, description) -> {
                int actual = description.partitions().size();
                if (actual < partitions) {
                    log.warn(
                            "Topic {} has {} partitions, fewer than the configured {}. It is left as it is: adding "
                                    + "partitions would move keys and break per-order ordering for records already on it. "
                                    + "Resize it as an operator step (drain, resize, restart).",
                            topic,
                            actual,
                            partitions);
                }
            });
            return described.get(commandTopic).partitions().size();
        } catch (Exception e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.error(
                    "Could not provision topics {}; the command listener runs {} consumers as configured: {}",
                    topics,
                    partitions,
                    e.getMessage());
            return partitions;
        }
    }
}
