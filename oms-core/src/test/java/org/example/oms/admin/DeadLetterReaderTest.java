package org.example.oms.admin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.header.Header;
import org.apache.kafka.common.header.internals.RecordHeader;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.support.KafkaHeaders;

/**
 * SPEC-0075 AC-9: reading dead letters never hangs on a broker in trouble, and only dead-letter
 * topics can be read.
 */
class DeadLetterReaderTest {

    /** Nothing listens on port 1: every Kafka call times out. */
    private final DeadLetterReader unreachable = new DeadLetterReader("127.0.0.1:1", "", true);

    @Test
    void unreachableBrokerFailsWithinTheBound() {
        DeadLetterUnavailableException topics = assertTimeoutPreemptively(Duration.ofSeconds(10),
                () -> assertThrows(DeadLetterUnavailableException.class, unreachable::topics));
        assertTrue(topics.getMessage().contains("127.0.0.1:1"), topics.getMessage());

        assertTimeoutPreemptively(Duration.ofSeconds(10),
                () -> assertThrows(DeadLetterUnavailableException.class, () -> unreachable.records("commands.DLT", 10)));
    }

    @Test
    void onlyDeadLetterTopicsCanBeRead() {
        // refused before any connection is attempted
        assertThrows(IllegalArgumentException.class, () -> unreachable.records("commands", 10));
        assertThrows(IllegalArgumentException.class, () -> unreachable.records("orders.DLT.x", 10));
    }

    @Test
    void limitIsBounded() {
        assertThrows(IllegalArgumentException.class, () -> unreachable.records("commands.DLT", 0));
        assertThrows(IllegalArgumentException.class, () -> unreachable.records("commands.DLT", 501));
    }

    // --- decoding one record (DeadLetterReader.Decoder) ---

    private static final byte[] FRAMED_UNKNOWN_SCHEMA = {0, 0, 0, 0, 99, 2, 65};

    private static DeadLetterReader.DeadLetterRecord decode(byte[] value, long deadline, Header... headers) {
        ConsumerRecord<byte[], byte[]> record = new ConsumerRecord<>("commands.DLT", 2, 17L, "ORD-1".getBytes(StandardCharsets.UTF_8), value);
        for (Header header : headers) {
            record.headers().add(header);
        }
        DeadLetterReader.Decoder decoder = new DeadLetterReader.Decoder("mock://decoder-test", deadline);
        try {
            return decoder.record(record);
        } finally {
            decoder.close();
        }
    }

    private static long later() {
        return System.nanoTime() + Duration.ofSeconds(30).toNanos();
    }

    @Test
    void anEmptyValueIsEmpty() {
        DeadLetterReader.DeadLetterRecord record = decode(null, later());

        assertEquals(DeadLetterReader.PayloadFormat.EMPTY, record.payloadFormat());
        assertNull(record.payload());
        assertNull(record.payloadText());
        assertEquals("ORD-1", record.key());
    }

    @Test
    void anUndecodableAvroValueFallsBackToHexWithTheReason() {
        DeadLetterReader.DeadLetterRecord record = decode(FRAMED_UNKNOWN_SCHEMA, later());

        assertEquals(DeadLetterReader.PayloadFormat.BINARY, record.payloadFormat());
        assertEquals("00000000630241", record.payloadText());
        assertNotNull(record.payloadError(), "why it could not be decoded");
    }

    @Test
    void decodingStopsWhenTheRequestsTimeIsSpent() {
        DeadLetterReader.DeadLetterRecord record = decode(FRAMED_UNKNOWN_SCHEMA, System.nanoTime() - 1);

        assertEquals(DeadLetterReader.PayloadFormat.BINARY, record.payloadFormat());
        assertTrue(record.payloadError().contains("time budget"), record.payloadError());
    }

    @Test
    void theRegistryClientIsBounded() {
        Map<String, Object> config = DeadLetterReader.Decoder.registryConfig("http://registry:8081");

        assertEquals(2000, config.get("http.connect.timeout.ms"));
        assertEquals(2000, config.get("http.read.timeout.ms"));
        assertEquals(false, config.get("specific.avro.reader"));
    }

    @Test
    void decodesSpringsDeadLetterHeaders() {
        DeadLetterReader.DeadLetterRecord record = decode("text".getBytes(StandardCharsets.UTF_8), later(),
                new RecordHeader(KafkaHeaders.DLT_ORIGINAL_TOPIC, "commands".getBytes(StandardCharsets.UTF_8)),
                new RecordHeader(KafkaHeaders.DLT_ORIGINAL_PARTITION, ByteBuffer.allocate(4).putInt(1).array()),
                new RecordHeader(KafkaHeaders.DLT_ORIGINAL_OFFSET, ByteBuffer.allocate(8).putLong(41L).array()),
                new RecordHeader(KafkaHeaders.DLT_ORIGINAL_TIMESTAMP, ByteBuffer.allocate(8).putLong(1_764_061_200_000L).array()),
                new RecordHeader(KafkaHeaders.DLT_EXCEPTION_FQCN, "org.example.Boom".getBytes(StandardCharsets.UTF_8)),
                new RecordHeader(KafkaHeaders.DLT_EXCEPTION_MESSAGE, "boom".getBytes(StandardCharsets.UTF_8)),
                new RecordHeader("odd", new byte[] {1, 2, 3}));

        assertEquals("commands", record.originalTopic());
        assertEquals(1, record.originalPartition());
        assertEquals(41L, record.originalOffset());
        assertEquals(Instant.ofEpochMilli(1_764_061_200_000L), record.originalTimestamp());
        assertEquals("org.example.Boom", record.exceptionClass());
        assertEquals("boom", record.exceptionMessage());
        assertEquals("1", record.headers().get(KafkaHeaders.DLT_ORIGINAL_PARTITION));
        assertEquals("41", record.headers().get(KafkaHeaders.DLT_ORIGINAL_OFFSET));
        assertEquals("010203", record.headers().get("odd"), "a header that is not text shows as hex");
        assertEquals(DeadLetterReader.PayloadFormat.TEXT, record.payloadFormat());
    }

    @Test
    void disabledKafkaIsUnavailable() {
        DeadLetterReader disabled = new DeadLetterReader("localhost:9092", "", false);

        DeadLetterUnavailableException e = assertThrows(DeadLetterUnavailableException.class, disabled::topics);
        assertTrue(e.getMessage().contains("kafka.enabled"), e.getMessage());
    }
}
