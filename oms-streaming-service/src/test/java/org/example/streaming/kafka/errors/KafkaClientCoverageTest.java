package org.example.streaming.kafka.errors;

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
 * SPEC-0077 AC-9: every Kafka consumer and producer in oms-streaming-service follows the error policy, or is listed
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
            "org/example/streaming/config/KafkaConfig.java", Coverage.by(
                    "consumers: the receivers read bytes, so decoding happens per record under the policy",
                    "org/example/streaming/config/KafkaConfig.java", "ByteArrayDeserializer.class"),
            "org/example/streaming/service/KafkaEventStreamProvider.java", Coverage.by(
                    "consumers: every record goes through RecordErrorPolicy (window, classifier, dead letter)",
                    "org/example/streaming/service/KafkaEventStreamProvider.java", "errorPolicy.process(record"),
            "org/example/streaming/kafka/errors/ErrorPolicyConfig.java", Coverage.by(
                    "the dead-letter sender, with the producer window",
                    "org/example/streaming/kafka/errors/ErrorPolicyConfig.java", "errorPolicy.producerTimeouts()"),
            "org/example/streaming/kafka/errors/StreamingDeadLetterPublisher.java", Coverage.exempt(
                    "it writes the dead letters; a refused dead letter is counted and the record is not acknowledged"));

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
        Path file = root.resolve("org/example/streaming/thing/NewListener.java");
        Files.createDirectories(file.getParent());
        Files.writeString(file, "class NewListener { @KafkaListener(topics = \"x\") void on(String s) {} }");
        Files.writeString(root.resolve("org/example/streaming/thing/Plain.java"), "class Plain {}");

        assertThat(clientsIn(root)).containsExactly("org/example/streaming/thing/NewListener.java");
        assertThat(CLIENTS).doesNotContainKey("org/example/streaming/thing/NewListener.java");
    }
}
