package org.example.oms.kafka.errors;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * SPEC-0077 AC-9: every Kafka consumer and producer in oms-core follows the error policy, or is listed
 * as exempt with a reason. Adding a client without an entry here fails this test: wire it to the policy
 * (see {@code architecture/patterns/kafka-messaging.md}) and add it to {@link #CLIENTS}.
 */
class KafkaClientCoverageTest {

    static final Path SOURCES = Path.of("src/main/java");

    /** What marks a file as holding a Kafka client. */
    static final Pattern CLIENT = Pattern.compile(
            "@KafkaListener|KafkaTemplate<|KafkaReceiver|KafkaSender|new KafkaProducer|new KafkaConsumer|KafkaConsumer<"
                    + "|createConsumer\\(|createProducer\\(|ReactiveKafka");

    /** How a client is covered: a file and a snippet that must be in it, or an exemption. */
    record Coverage(String how, String proofFile, String proof) {
        static Coverage by(String how, String proofFile, String proof) {
            return new Coverage(how, proofFile, proof);
        }

        static Coverage exempt(String why) {
            return new Coverage("exempt: " + why, null, null);
        }
    }

    static final Map<String, Coverage> CLIENTS = Map.of(
            "org/example/oms/config/CommandListener.java", Coverage.by(
                    "consumer: the listener factory's error handler applies the policy",
                    "org/example/oms/config/KafkaConsumerConfig.java", "ErrorClassifier.isRetryable(failure)"),
            "org/example/oms/config/KafkaConsumerConfig.java", Coverage.by(
                    "the consumer policy itself, and the dead-letter template with the producer window",
                    "org/example/oms/config/KafkaConsumerConfig.java", "errorPolicy.producerTimeouts()"),
            "org/example/oms/config/KafkaProducerConfig.java", Coverage.by(
                    "producer: the client retries for the window",
                    "org/example/oms/config/KafkaProducerConfig.java", "errorPolicy.producerTimeouts()"),
            "org/example/oms/service/MessagePublisher.java", Coverage.by(
                    "producer: the outbox relay classifies, retries and dead-letters its failures; the dead "
                            + "letters go out through it too (DeadLetterSender), and a refused one parks the row",
                    "org/example/oms/service/OutboxRelay.java", "deadLetterPublisher.deadLetter("),
            "org/example/oms/admin/DeadLetterReader.java", Coverage.exempt(
                    "reads dead-letter topics for the admin API with assigned partitions and no commits"));

    static List<String> clientsIn(Path root) throws IOException {
        try (Stream<Path> files = Files.walk(root)) {
            return files.filter(p -> p.toString().endsWith(".java"))
                    .filter(p -> {
                        try {
                            return CLIENT.matcher(Files.readString(p)).find();
                        } catch (IOException e) {
                            throw new java.io.UncheckedIOException(e);
                        }
                    })
                    .map(p -> root.relativize(p).toString().replace('\\', '/'))
                    .sorted()
                    .toList();
        }
    }

    @Test
    void everyKafkaClientIsCoveredOrExempt() throws IOException {
        List<String> found = clientsIn(SOURCES);
        assertThat(found)
                .as("Kafka clients without an error-policy entry in KafkaClientCoverageTest.CLIENTS; wire them to the "
                        + "policy (kafka-messaging.md) and list them")
                .allMatch(CLIENTS::containsKey);
        assertThat(new TreeSet<>(CLIENTS.keySet())).as("entries for clients that no longer exist").isEqualTo(new TreeSet<>(found));

        CLIENTS.forEach((file, coverage) -> {
            if (coverage.proofFile() == null) {
                return;
            }
            try {
                assertThat(Files.readString(SOURCES.resolve(coverage.proofFile())))
                        .as(file + " is covered by " + coverage.how())
                        .contains(coverage.proof());
            } catch (IOException e) {
                throw new java.io.UncheckedIOException(e);
            }
        });
    }

    @Test
    void aNewClientIsReported(@TempDir Path root) throws IOException {
        Path file = root.resolve("org/example/oms/thing/NewListener.java");
        Files.createDirectories(file.getParent());
        Files.writeString(file, "class NewListener { @KafkaListener(topics = \"x\") void on(String s) {} }");
        Files.writeString(root.resolve("org/example/oms/thing/Plain.java"), "class Plain {}");

        assertThat(clientsIn(root)).containsExactly("org/example/oms/thing/NewListener.java");
        assertThat(CLIENTS).doesNotContainKey("org/example/oms/thing/NewListener.java");
    }
}
