package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import org.apache.avro.Schema;
import org.apache.avro.SchemaBuilder;
import org.apache.avro.generic.GenericData;
import org.apache.avro.generic.GenericRecord;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.GroupListing;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.ByteArraySerializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.example.common.model.msg.CommandHeader;
import org.example.oms.admin.DeadLetterReader;
import org.example.oms.admin.DeadLetterReader.DeadLetterRecord;
import org.example.oms.admin.DeadLetterReader.DeadLetterTopic;
import org.example.oms.admin.DeadLetterReader.PayloadFormat;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import io.confluent.kafka.serializers.KafkaAvroSerializer;
import io.confluent.kafka.serializers.subject.TopicRecordNameStrategy;

/**
 * SPEC-0075 AC-6, AC-7, AC-8: dead-letter topics, read through the reader oms-core's operator API
 * uses. The class runs on its own command topic, so its dead-letter topic holds exactly the records
 * it produced: one per payload format.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DeadLetterReaderIntegrationTest extends AbstractKafkaPostgresIntegrationTest {

    private static final String COMMANDS = "commands-dlt_reader";
    private static final String DLT = COMMANDS + ".oms-core.DLT";

    @DynamicPropertySource
    static void world(DynamicPropertyRegistry registry) {
        isolate("dlt_reader", COMMANDS);
    }

    @Autowired DeadLetterReader reader;
    @Autowired ProducerFactory<String, Object> producerFactory;

    private final String key = "ORD-DLT-" + UUID.randomUUID();
    private final String text = "not a command, just text";
    private final byte[] binary = {1, 2, 3, 4, 5};
    /** Where each was produced on the command topic, in the order sent: partition@offset. */
    private final List<String> sent = new java.util.ArrayList<>();

    /** An unknown command type (Avro), text and raw bytes, sent to the command topic and dead-lettered. */
    @BeforeAll
    void produceDeadLetters() throws Exception {
        byte[] avro;
        try (KafkaAvroSerializer serializer = commandSerializer()) {
            avro = serializer.serialize(COMMANDS, futureCommand(key));
        }
        KafkaTemplate<String, byte[]> raw = rawTemplate();
        for (byte[] value : List.of(avro, text.getBytes(StandardCharsets.UTF_8), binary)) {
            var metadata = raw.send(COMMANDS, key, value).get(10, TimeUnit.SECONDS).getRecordMetadata();
            sent.add(metadata.partition() + "@" + metadata.offset());
        }
        AbstractFillFlowIntegrationTest.awaitUntil(() -> recordsOn(DLT) == 3, "three records on " + DLT);
    }

    private long recordsOn(String topic) {
        return reader.topics().stream().filter(t -> t.topic().equals(topic)).mapToLong(DeadLetterTopic::records).sum();
    }

    @Test
    void listsDeadLetterTopicsWithCounts() {
        List<DeadLetterTopic> topics = reader.topics();

        DeadLetterTopic ours = topics.stream().filter(t -> t.topic().equals(DLT)).findFirst().orElseThrow();
        assertEquals(3, ours.records());
        assertTrue(ours.partitions() >= 1);
        assertTrue(topics.stream().allMatch(t -> t.topic().endsWith(".DLT")), "only dead-letter topics: " + topics);
        assertFalse(topics.stream().anyMatch(t -> t.topic().equals(COMMANDS)));
    }

    @Test
    void readsRecordsWithFailureDetailsAndDecodedPayload() {
        List<DeadLetterRecord> records = reader.records(DLT, 50);

        assertEquals(3, records.size());
        // newest first: they were dead-lettered in the order sent
        assertEquals(List.of(PayloadFormat.BINARY, PayloadFormat.TEXT, PayloadFormat.AVRO),
                records.stream().map(DeadLetterRecord::payloadFormat).toList());
        for (int i = 1; i < records.size(); i++) {
            assertFalse(records.get(i).timestamp().isAfter(records.get(i - 1).timestamp()), "newest first");
        }

        DeadLetterRecord avro = records.get(2);
        assertEquals(DLT, avro.topic());
        assertEquals(key, avro.key());
        assertEquals(COMMANDS, avro.originalTopic());
        assertNotNull(avro.originalPartition());
        assertNotNull(avro.originalOffset());
        assertEquals(sent.get(0), avro.originalPartition() + "@" + avro.originalOffset(), "where the command was produced");
        assertEquals(sent.get(1), records.get(1).originalPartition() + "@" + records.get(1).originalOffset());
        assertEquals(sent.get(2), records.get(0).originalPartition() + "@" + records.get(0).originalOffset());
        assertNotNull(avro.originalTimestamp());
        assertNotNull(avro.exceptionClass(), "exception class from the DLT headers");
        assertTrue(avro.exceptionClass().contains("Exception"), avro.exceptionClass());
        assertFalse(avro.headers().getOrDefault("kafka_dlt-exception-fqcn", "").isBlank());
        assertFalse(avro.exceptionMessage().isBlank(), "exception message from the DLT headers");
        assertNotNull(avro.payload(), "decoded through the registry");
        assertEquals(key, avro.payload().get("orderId").asString());
        assertEquals("1.0.0", avro.payload().get("header").get("version").asString());
        assertTrue(avro.headers().containsKey("kafka_dlt-original-topic"), avro.headers().toString());

        assertEquals(text, records.get(1).payloadText());
        assertEquals("0102030405", records.get(0).payloadText());

        List<DeadLetterRecord> latestTwo = reader.records(DLT, 2);
        assertEquals(List.of(PayloadFormat.BINARY, PayloadFormat.TEXT),
                latestTwo.stream().map(DeadLetterRecord::payloadFormat).toList());
    }

    @Test
    void readingTwiceIsIdempotentAndCommitsNothing() throws Exception {
        Set<String> groupsBefore = consumerGroups();

        List<DeadLetterRecord> first = reader.records(DLT, 50);
        List<DeadLetterRecord> second = reader.records(DLT, 50);

        assertEquals(offsets(first), offsets(second), "the same records, nothing consumed away");
        assertEquals(groupsBefore, consumerGroups(), "no consumer group joined or committed");
    }

    @Test
    void unknownDeadLetterTopicIsNotFound() {
        assertThrows(NoSuchElementException.class, () -> reader.records("no-such-topic.DLT", 10));
    }

    private static List<String> offsets(List<DeadLetterRecord> records) {
        return records.stream().map(r -> r.partition() + "@" + r.offset()).toList();
    }

    private static Set<String> consumerGroups() throws Exception {
        try (Admin admin = Admin.create(Map.of(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers()))) {
            return admin.listGroups().all().get(10, TimeUnit.SECONDS).stream()
                    .map(GroupListing::groupId).collect(Collectors.toSet());
        }
    }

    /** A command type registered by some newer producer, with no class in this service: dead-lettered at once. */
    private static GenericRecord futureCommand(String orderId) {
        Schema schema = SchemaBuilder.record("FutureCmd").namespace("org.example.common.model.msg")
                .fields()
                .name("header").type(CommandHeader.getClassSchema()).noDefault()
                .requiredString("orderId")
                .endRecord();
        GenericRecord header = new GenericData.Record(CommandHeader.getClassSchema());
        header.put("commandId", UUID.randomUUID().toString());
        header.put("sentAt", Instant.now().toEpochMilli() * 1_000);
        header.put("producer", TestCommands.PRODUCER);
        header.put("version", "1.0.0");
        GenericRecord record = new GenericData.Record(schema);
        record.put("header", header);
        record.put("orderId", orderId);
        return record;
    }

    private KafkaAvroSerializer commandSerializer() {
        Map<String, Object> config = new HashMap<>(producerFactory.getConfigurationProperties());
        config.put("auto.register.schemas", true);
        config.put("value.subject.name.strategy", TopicRecordNameStrategy.class.getName());
        KafkaAvroSerializer serializer = new KafkaAvroSerializer();
        serializer.configure(config, false);
        return serializer;
    }

    private static KafkaTemplate<String, byte[]> rawTemplate() {
        Map<String, Object> config = Map.of(
                ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers(),
                ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class,
                ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, ByteArraySerializer.class);
        return new KafkaTemplate<>(new DefaultKafkaProducerFactory<>(config));
    }
}
