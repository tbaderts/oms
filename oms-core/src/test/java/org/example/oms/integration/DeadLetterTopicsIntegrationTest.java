package org.example.oms.integration;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.NewTopic;
import org.example.oms.kafka.errors.DeadLetterTopicProvisioner;
import org.example.oms.kafka.errors.DeadLetters;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** SPEC-0077 AC-8: oms-core's dead-letter topics exist at startup with their source's partitions. */
class DeadLetterTopicsIntegrationTest extends AbstractKafkaPostgresIntegrationTest {

    @Autowired DeadLetterTopicProvisioner provisioner;

    @Test
    void provisionedWithSourcePartitions() throws Exception {
        // The application's own: the command consumer's and the outbox topics'.
        assertThat(provisioner.topics()).containsKeys(
                "commands.oms-core.DLT", "orders.oms-core.DLT", "oms_executions.oms-core.DLT", "oms_order_executions.oms-core.DLT");
        for (var entry : provisioner.topics().entrySet()) {
            String source = entry.getKey().substring(0, entry.getKey().length() - ".oms-core.DLT".length());
            assertThat(partitions(entry.getKey())).as(entry.getKey()).isGreaterThanOrEqualTo(partitions(source));
        }

        // A fresh pair: created with the source's count; an existing smaller dead-letter topic is grown.
        String grown = "t-" + UUID.randomUUID();
        String created = "t-" + UUID.randomUUID();
        DeadLetters deadLetters = new DeadLetters("svc");
        try (Admin admin = Admin.create(adminConfig())) {
            admin.createTopics(List.of(
                            new NewTopic(grown, 4, (short) 1),
                            new NewTopic(created, 3, (short) 1),
                            new NewTopic(deadLetters.topicFor(grown), 1, (short) 1)))
                    .all().get(30, TimeUnit.SECONDS);
        }
        DeadLetterTopicProvisioner fresh =
                new DeadLetterTopicProvisioner(adminConfig(), List.of(grown, created), deadLetters, (short) 1, 30_000);

        assertThat(fresh.topics()).containsEntry(deadLetters.topicFor(grown), 4).containsEntry(deadLetters.topicFor(created), 3);
        assertThat(partitions(deadLetters.topicFor(grown))).isEqualTo(4);
        assertThat(partitions(deadLetters.topicFor(created))).isEqualTo(3);
    }

    /**
     * A cold start: a source that does not exist yet neither fails startup nor holds up the others, and
     * gets its dead-letter topic once it is created.
     */
    @Test
    void aSourceCreatedLaterIsProvisionedThen() throws Exception {
        String present = "t-" + UUID.randomUUID();
        String later = "t-later-" + UUID.randomUUID();
        DeadLetters deadLetters = new DeadLetters("svc");
        try (Admin admin = Admin.create(adminConfig())) {
            admin.createTopics(List.of(new NewTopic(present, 2, (short) 1))).all().get(30, TimeUnit.SECONDS);
        }

        try (DeadLetterTopicProvisioner provisioner = new DeadLetterTopicProvisioner(
                adminConfig(), List.of(present, later), deadLetters, (short) 1, 2_000, java.time.Duration.ofMillis(200))) {
            assertThat(provisioner.topics()).as("the existing source is not held up")
                    .containsOnlyKeys(deadLetters.topicFor(present));
            assertThat(provisioner.pending()).containsExactly(later);

            try (Admin admin = Admin.create(adminConfig())) {
                admin.createTopics(List.of(new NewTopic(later, 3, (short) 1))).all().get(30, TimeUnit.SECONDS);
            }
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
            while (!provisioner.pending().isEmpty()) {
                assertThat(System.nanoTime()).as("provisioned once the source exists").isLessThan(deadline);
                Thread.sleep(100);
            }
            assertThat(provisioner.topics()).containsEntry(deadLetters.topicFor(later), 3);
            assertThat(partitions(deadLetters.topicFor(later))).isEqualTo(3);
        }
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
