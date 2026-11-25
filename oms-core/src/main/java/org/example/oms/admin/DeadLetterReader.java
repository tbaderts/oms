package org.example.oms.admin;

import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.stream.Collectors;

import org.apache.avro.generic.IndexedRecord;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.admin.TopicDescription;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.KafkaException;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.errors.UnknownTopicOrPartitionException;
import org.apache.kafka.common.header.Header;
import org.apache.kafka.common.serialization.ByteArrayDeserializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.stereotype.Service;

import io.confluent.kafka.serializers.KafkaAvroDeserializer;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;

/**
 * Reads dead-letter topics for operators, without consuming them (SPEC-0075).
 *
 * <p>oms-core's command listener routes a command it could not process to {@code <topic>.DLT}
 * ({@code KafkaConsumerConfig}), with the original bytes and Spring Kafka's headers naming the
 * exception and where the record came from. This reader lists every topic ending in {@code .DLT} with
 * its record count, and returns a topic's latest records with those details and the value decoded:
 * Avro through the schema registry, else text, else hex.
 *
 * <p>Reading has no side effects: a short-lived consumer is assigned the partitions, seeks back from
 * their end offsets and is closed, with no consumer group, so no offset is committed and no group is
 * joined. Every Kafka call is bounded ({@link #DEADLINE}), so a broker in trouble yields
 * {@link DeadLetterUnavailableException} rather than a hung request.
 */
@Service
@Slf4j
public class DeadLetterReader {

    /** The suffix Spring's dead-letter recoverer, and oms-core, use. */
    public static final String SUFFIX = ".DLT";

    /** How long one request may spend on Kafka in all. */
    static final Duration DEADLINE = Duration.ofSeconds(8);

    private static final int MAX_LIMIT = 500;
    private static final int MAX_HEADER_LENGTH = 2000;

    /** How a record's value was decoded. */
    public enum PayloadFormat { AVRO, TEXT, BINARY, EMPTY }

    /** A dead-letter topic and how many records it holds (end minus start offset, over its partitions). */
    public record DeadLetterTopic(String topic, int partitions, long records) {}

    /** One dead-letter record, with the failure Spring Kafka recorded in its headers. */
    public record DeadLetterRecord(
            String topic, int partition, long offset, Instant timestamp, String key,
            String originalTopic, Integer originalPartition, Long originalOffset, Instant originalTimestamp,
            String exceptionClass, String exceptionMessage, String causeClass,
            PayloadFormat payloadFormat, JsonNode payload, String payloadText, String payloadError,
            Map<String, String> headers) {}

    private final String bootstrapServers;
    private final String registryUrl;
    private final boolean enabled;

    public DeadLetterReader(
            @Value("${spring.kafka.bootstrap-servers}") String bootstrapServers,
            @Value("${spring.kafka.consumer.properties.schema.registry.url:}") String registryUrl,
            @Value("${kafka.enabled:false}") boolean enabled) {
        this.bootstrapServers = bootstrapServers;
        this.registryUrl = registryUrl;
        this.enabled = enabled;
    }

    /** Every topic ending in {@code .DLT}, by name, with its record count. */
    public List<DeadLetterTopic> topics() {
        ensureEnabled();
        long deadline = System.nanoTime() + DEADLINE.toNanos();
        try (Admin admin = admin()) {
            Set<String> names = admin.listTopics().names().get(remaining(deadline), TimeUnit.MILLISECONDS).stream()
                    .filter(name -> name.endsWith(SUFFIX))
                    .collect(Collectors.toSet());
            if (names.isEmpty()) {
                return List.of();
            }
            Map<String, TopicDescription> descriptions =
                    admin.describeTopics(names).allTopicNames().get(remaining(deadline), TimeUnit.MILLISECONDS);
            List<TopicPartition> partitions = descriptions.values().stream()
                    .flatMap(d -> d.partitions().stream().map(p -> new TopicPartition(d.name(), p.partition())))
                    .toList();
            Map<TopicPartition, Long> earliest = offsets(admin, partitions, OffsetSpec.earliest(), deadline);
            Map<TopicPartition, Long> latest = offsets(admin, partitions, OffsetSpec.latest(), deadline);
            return descriptions.values().stream()
                    .sorted(Comparator.comparing(TopicDescription::name))
                    .map(d -> new DeadLetterTopic(d.name(), d.partitions().size(), d.partitions().stream()
                            .map(p -> new TopicPartition(d.name(), p.partition()))
                            .mapToLong(tp -> latest.getOrDefault(tp, 0L) - earliest.getOrDefault(tp, 0L))
                            .sum()))
                    .toList();
        } catch (ExecutionException | TimeoutException | KafkaException e) {
            throw unavailable("list dead-letter topics", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw unavailable("list dead-letter topics", e);
        }
    }

    /**
     * The latest {@code limit} records of {@code topic}, newest first.
     *
     * @throws IllegalArgumentException for a topic not ending in {@code .DLT} or a limit outside 1..500
     * @throws NoSuchElementException for a topic that does not exist
     */
    public List<DeadLetterRecord> records(String topic, int limit) {
        if (topic == null || !topic.endsWith(SUFFIX) || topic.length() == SUFFIX.length()) {
            throw new IllegalArgumentException("Not a dead-letter topic (must end in " + SUFFIX + "): " + topic);
        }
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new IllegalArgumentException("limit must be between 1 and " + MAX_LIMIT);
        }
        ensureEnabled();
        long deadline = System.nanoTime() + DEADLINE.toNanos();
        List<TopicPartition> partitions;
        Map<TopicPartition, Long> earliest;
        Map<TopicPartition, Long> latest;
        try (Admin admin = admin()) {
            TopicDescription description;
            try {
                description = admin.describeTopics(List.of(topic)).allTopicNames()
                        .get(remaining(deadline), TimeUnit.MILLISECONDS).get(topic);
            } catch (ExecutionException e) {
                if (e.getCause() instanceof UnknownTopicOrPartitionException) {
                    throw new AdminNotFoundException("No such dead-letter topic: " + topic);
                }
                throw e;
            }
            partitions = description.partitions().stream().map(p -> new TopicPartition(topic, p.partition())).toList();
            earliest = offsets(admin, partitions, OffsetSpec.earliest(), deadline);
            latest = offsets(admin, partitions, OffsetSpec.latest(), deadline);
        } catch (ExecutionException | TimeoutException | KafkaException e) {
            throw unavailable("read " + topic, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw unavailable("read " + topic, e);
        }
        List<ConsumerRecord<byte[], byte[]>> read = read(partitions, earliest, latest, limit, deadline, topic);
        Decoder decoder = new Decoder(registryUrl, deadline);
        try {
            return read.stream()
                    .sorted(Comparator.comparing((ConsumerRecord<byte[], byte[]> r) -> r.timestamp())
                            .thenComparing(ConsumerRecord::partition)
                            .thenComparing(ConsumerRecord::offset)
                            .reversed())
                    .limit(limit)
                    .map(decoder::record)
                    .toList();
        } finally {
            decoder.close();
        }
    }

    /** The last {@code limit} records of each partition, read up to the end offsets taken before. */
    private List<ConsumerRecord<byte[], byte[]>> read(
            List<TopicPartition> partitions, Map<TopicPartition, Long> earliest, Map<TopicPartition, Long> latest,
            int limit, long deadline, String topic) {
        List<TopicPartition> nonEmpty = partitions.stream().filter(tp -> latest.get(tp) > earliest.get(tp)).toList();
        if (nonEmpty.isEmpty()) {
            return List.of();
        }
        List<ConsumerRecord<byte[], byte[]>> records = new ArrayList<>();
        try (KafkaConsumer<byte[], byte[]> consumer = new KafkaConsumer<>(consumerConfig())) {
            consumer.assign(nonEmpty);
            for (TopicPartition tp : nonEmpty) {
                consumer.seek(tp, Math.max(earliest.get(tp), latest.get(tp) - limit));
            }
            while (nonEmpty.stream().anyMatch(tp -> consumer.position(tp, remainingDuration(deadline)) < latest.get(tp))) {
                if (System.nanoTime() > deadline) {
                    throw new DeadLetterUnavailableException(
                            "Timed out after " + DEADLINE.toSeconds() + " s reading " + topic + " from " + bootstrapServers);
                }
                for (ConsumerRecord<byte[], byte[]> record : consumer.poll(Duration.ofMillis(200))) {
                    TopicPartition tp = new TopicPartition(record.topic(), record.partition());
                    if (record.offset() < latest.get(tp)) {
                        records.add(record);
                    }
                }
            }
        } catch (KafkaException e) {
            throw unavailable("read " + topic, e);
        }
        return records;
    }

    private static Map<TopicPartition, Long> offsets(Admin admin, List<TopicPartition> partitions, OffsetSpec spec, long deadline)
            throws InterruptedException, ExecutionException, TimeoutException {
        Map<TopicPartition, OffsetSpec> request = new HashMap<>();
        partitions.forEach(tp -> request.put(tp, spec));
        Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> result =
                admin.listOffsets(request).all().get(remaining(deadline), TimeUnit.MILLISECONDS);
        Map<TopicPartition, Long> offsets = new HashMap<>();
        result.forEach((tp, info) -> offsets.put(tp, info.offset()));
        return offsets;
    }

    private Admin admin() {
        return Admin.create(Map.of(
                AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers,
                AdminClientConfig.CLIENT_ID_CONFIG, "oms-dead-letter-reader",
                AdminClientConfig.REQUEST_TIMEOUT_MS_CONFIG, 5000,
                AdminClientConfig.DEFAULT_API_TIMEOUT_MS_CONFIG, (int) DEADLINE.toMillis()));
    }

    /** No group id: the consumer is assigned partitions, joins no group and commits nothing. */
    private Map<String, Object> consumerConfig() {
        Map<String, Object> config = new HashMap<>();
        config.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        config.put(ConsumerConfig.CLIENT_ID_CONFIG, "oms-dead-letter-reader");
        config.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
        config.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, ByteArrayDeserializer.class);
        config.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, ByteArrayDeserializer.class);
        config.put(ConsumerConfig.REQUEST_TIMEOUT_MS_CONFIG, 5000);
        config.put(ConsumerConfig.DEFAULT_API_TIMEOUT_MS_CONFIG, (int) DEADLINE.toMillis());
        config.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, MAX_LIMIT);
        return config;
    }

    private void ensureEnabled() {
        if (!enabled) {
            throw new DeadLetterUnavailableException("Kafka is disabled in this oms-core (kafka.enabled=false)");
        }
    }

    private DeadLetterUnavailableException unavailable(String what, Exception e) {
        Throwable cause = e instanceof ExecutionException && e.getCause() != null ? e.getCause() : e;
        String message = "Could not " + what + " on " + bootstrapServers + ": "
                + cause.getClass().getSimpleName() + (cause.getMessage() == null ? "" : " " + cause.getMessage());
        log.warn("[dead-letters] {}", message);
        return new DeadLetterUnavailableException(message, cause);
    }

    private static long remaining(long deadline) throws TimeoutException {
        long millis = TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime());
        if (millis <= 0) {
            throw new TimeoutException("deadline of " + DEADLINE.toSeconds() + " s passed");
        }
        return millis;
    }

    private static Duration remainingDuration(long deadline) {
        return Duration.ofNanos(Math.max(1_000_000L, deadline - System.nanoTime()));
    }

    /**
     * Decodes values and headers; holds the Avro deserializer for one request. Registry lookups are
     * bounded twice: the client's own connect and read timeouts, and the request's deadline, after which
     * values are no longer decoded but shown as hex with the reason.
     */
    static final class Decoder {

        private static final Set<String> INT_HEADERS = Set.of(KafkaHeaders.DLT_ORIGINAL_PARTITION);
        private static final Set<String> LONG_HEADERS = Set.of(
                KafkaHeaders.DLT_ORIGINAL_OFFSET, KafkaHeaders.DLT_ORIGINAL_TIMESTAMP);

        /** The registry client's connect and read timeouts, so a silent registry cannot hold a request. */
        static final int REGISTRY_TIMEOUT_MS = 2000;

        private final KafkaAvroDeserializer avro;
        private final long deadline;

        Decoder(String registryUrl, long deadline) {
            this.deadline = deadline;
            if (registryUrl == null || registryUrl.isBlank()) {
                avro = null;
            } else {
                avro = new KafkaAvroDeserializer();
                avro.configure(registryConfig(registryUrl), false);
            }
        }

        /** The deserializer's settings: generic records, and a bounded registry client. */
        static Map<String, Object> registryConfig(String registryUrl) {
            return Map.of(
                    "schema.registry.url", registryUrl,
                    "specific.avro.reader", false,
                    "http.connect.timeout.ms", REGISTRY_TIMEOUT_MS,
                    "http.read.timeout.ms", REGISTRY_TIMEOUT_MS);
        }

        void close() {
            if (avro != null) {
                avro.close();
            }
        }

        DeadLetterRecord record(ConsumerRecord<byte[], byte[]> record) {
            Map<String, String> headers = new LinkedHashMap<>();
            for (Header header : record.headers()) {
                headers.put(header.key(), headerText(header.key(), header.value()));
            }
            String originalTopic = headers.get(KafkaHeaders.DLT_ORIGINAL_TOPIC);
            Long originalTimestamp = longHeader(record, KafkaHeaders.DLT_ORIGINAL_TIMESTAMP);

            byte[] value = record.value();
            PayloadFormat format;
            JsonNode payload = null;
            String text = null;
            String error = null;
            if (value == null || value.length == 0) {
                format = PayloadFormat.EMPTY;
            } else if (value[0] == 0 && value.length > 5 && avro != null && System.nanoTime() > deadline) {
                format = PayloadFormat.BINARY;
                text = HexFormat.of().formatHex(value);
                error = "Not decoded: the request's time budget of " + DEADLINE.toSeconds() + " s was spent";
            } else if (value[0] == 0 && value.length > 5 && avro != null) {
                try {
                    Object decoded = avro.deserialize(originalTopic != null ? originalTopic : record.topic(), value);
                    payload = decoded instanceof IndexedRecord indexed
                            ? AvroJson.toJson(indexed)
                            : JsonNodeFactory.instance.stringNode(String.valueOf(decoded));
                    format = PayloadFormat.AVRO;
                } catch (RuntimeException e) {
                    format = PayloadFormat.BINARY;
                    text = HexFormat.of().formatHex(value);
                    error = e.getMessage();
                }
            } else {
                String utf8 = printableUtf8(value);
                if (utf8 != null) {
                    format = PayloadFormat.TEXT;
                    text = utf8;
                } else {
                    format = PayloadFormat.BINARY;
                    text = HexFormat.of().formatHex(value);
                }
            }
            return new DeadLetterRecord(
                    record.topic(), record.partition(), record.offset(), Instant.ofEpochMilli(record.timestamp()),
                    record.key() == null ? null : new String(record.key(), StandardCharsets.UTF_8),
                    originalTopic,
                    intHeader(record, KafkaHeaders.DLT_ORIGINAL_PARTITION),
                    longHeader(record, KafkaHeaders.DLT_ORIGINAL_OFFSET),
                    originalTimestamp == null ? null : Instant.ofEpochMilli(originalTimestamp),
                    headers.get(KafkaHeaders.DLT_EXCEPTION_FQCN),
                    headers.get(KafkaHeaders.DLT_EXCEPTION_MESSAGE),
                    headers.get(KafkaHeaders.DLT_EXCEPTION_CAUSE_FQCN),
                    format, payload, text, error, headers);
        }

        private static Integer intHeader(ConsumerRecord<byte[], byte[]> record, String key) {
            Header header = record.headers().lastHeader(key);
            return header == null || header.value() == null || header.value().length != 4
                    ? null : ByteBuffer.wrap(header.value()).getInt();
        }

        private static Long longHeader(ConsumerRecord<byte[], byte[]> record, String key) {
            Header header = record.headers().lastHeader(key);
            return header == null || header.value() == null || header.value().length != 8
                    ? null : ByteBuffer.wrap(header.value()).getLong();
        }

        private static String headerText(String key, byte[] value) {
            if (value == null) {
                return null;
            }
            if (INT_HEADERS.contains(key) && value.length == 4) {
                return String.valueOf(ByteBuffer.wrap(value).getInt());
            }
            if (LONG_HEADERS.contains(key) && value.length == 8) {
                return String.valueOf(ByteBuffer.wrap(value).getLong());
            }
            String text = printableUtf8(value);
            String shown = text != null ? text : HexFormat.of().formatHex(value);
            return shown.length() > MAX_HEADER_LENGTH ? shown.substring(0, MAX_HEADER_LENGTH) + "…" : shown;
        }

        /** The bytes as text, when they are valid UTF-8 without control characters other than whitespace. */
        private static String printableUtf8(byte[] value) {
            try {
                CharBuffer chars = StandardCharsets.UTF_8.newDecoder()
                        .onMalformedInput(CodingErrorAction.REPORT)
                        .onUnmappableCharacter(CodingErrorAction.REPORT)
                        .decode(ByteBuffer.wrap(value));
                for (int i = 0; i < chars.length(); i++) {
                    char c = chars.charAt(i);
                    if (Character.isISOControl(c) && c != '\n' && c != '\r' && c != '\t') {
                        return null;
                    }
                }
                return chars.toString();
            } catch (CharacterCodingException e) {
                return null;
            }
        }
    }
}
