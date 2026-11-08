package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.NewTopic;
import org.example.oms.config.KafkaTopicProvisioner;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.listener.ConcurrentMessageListenerContainer;
import org.springframework.kafka.listener.MessageListenerContainer;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

/**
 * SPEC-0048 AC-5: oms-core declares its topics with their partition counts, never resizes one that
 * exists with fewer, and runs one command consumer per partition of the command topic.
 */
class KafkaTopicProvisionerIntegrationTest extends AbstractKafkaPostgresIntegrationTest {

    @Autowired KafkaTopicProvisioner provisioner;
    @Autowired KafkaListenerEndpointRegistry listeners;

    @Test
    void createsMissingTopicsAndSetsListenerConcurrency() throws Exception {
        String prefix = "t-" + UUID.randomUUID();
        List<String> topics = List.of(prefix + "-commands", prefix + "-orders", prefix + "-executions", prefix + "-order-executions");

        KafkaTopicProvisioner created = new KafkaTopicProvisioner(adminConfig(), topics, topics.getFirst(), 6, (short) 1, 30_000);

        for (String topic : topics) {
            assertEquals(6, partitions(topic), topic);
        }
        assertEquals(6, created.commandPartitions());

        // The application's own listener runs one consumer per partition of its command topic.
        MessageListenerContainer container = listeners.getListenerContainers().stream()
                .filter(c -> List.of(c.getContainerProperties().getTopics()).contains("commands"))
                .findFirst()
                .orElseThrow();
        assertEquals(provisioner.commandPartitions(), ((ConcurrentMessageListenerContainer<?, ?>) container).getConcurrency());
        assertEquals(partitions("commands"), provisioner.commandPartitions(), "the command topic's actual partition count");
    }

    @Test
    void leavesASmallerExistingTopicAloneAndWarns() throws Exception {
        String topic = "t-" + UUID.randomUUID() + "-commands";
        try (Admin admin = Admin.create(adminConfig())) {
            admin.createTopics(List.of(new NewTopic(topic, 2, (short) 1))).all().get(30, TimeUnit.SECONDS);
        }
        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        Logger logger = (Logger) LoggerFactory.getLogger(KafkaTopicProvisioner.class);
        logger.addAppender(logs);
        KafkaTopicProvisioner provisioned;
        try {
            provisioned = new KafkaTopicProvisioner(adminConfig(), List.of(topic), topic, 6, (short) 1, 30_000);
        } finally {
            logger.detachAppender(logs);
        }

        assertEquals(2, partitions(topic), "an existing topic is never resized");
        assertEquals(2, provisioned.commandPartitions(), "concurrency follows the actual partitions");
        assertTrue(logs.list.stream().anyMatch(e -> e.getLevel().toString().equals("WARN")
                        && e.getFormattedMessage().contains(topic)
                        && e.getFormattedMessage().contains("has 2 partitions")
                        && e.getFormattedMessage().contains("configured 6")),
                "a warning names the topic and both counts: " + logs.list);
    }

    /**
     * Instances starting together race to create the same missing topics. The ones that lose see
     * TopicExistsException, which is not a failure: they describe the topic like any existing one.
     */
    @Test
    void instancesStartingTogetherAllProvisionWithoutError() throws Exception {
        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        Logger logger = (Logger) LoggerFactory.getLogger(KafkaTopicProvisioner.class);
        logger.addAppender(logs);
        try {
            for (int round = 0; round < 5; round++) {
                String prefix = "t-" + UUID.randomUUID();
                List<String> topics = List.of(prefix + "-commands", prefix + "-orders");
                CountDownLatch go = new CountDownLatch(1);
                List<CompletableFuture<KafkaTopicProvisioner>> instances = new java.util.ArrayList<>();
                for (int i = 0; i < 4; i++) {
                    instances.add(CompletableFuture.supplyAsync(() -> {
                        try {
                            go.await();
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                        }
                        return new KafkaTopicProvisioner(adminConfig(), topics, topics.getFirst(), 3, (short) 1, 30_000);
                    }));
                }
                go.countDown();
                for (var instance : instances) {
                    assertEquals(3, instance.get(60, TimeUnit.SECONDS).commandPartitions());
                }
            }
        } finally {
            logger.detachAppender(logs);
        }
        assertTrue(logs.list.stream().noneMatch(e -> e.getLevel().toString().equals("ERROR")),
                "losing the race to create a topic is not an error: " + logs.list);
    }

    private static Map<String, Object> adminConfig() {
        return Map.of(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers());
    }

    private static int partitions(String topic) throws Exception {
        try (Admin admin = Admin.create(adminConfig())) {
            return admin.describeTopics(List.of(topic)).allTopicNames().get(30, TimeUnit.SECONDS).get(topic).partitions().size();
        }
    }
}
