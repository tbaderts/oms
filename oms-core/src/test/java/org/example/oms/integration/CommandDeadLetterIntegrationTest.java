package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import org.apache.avro.Schema;
import org.apache.avro.SchemaBuilder;
import org.apache.avro.generic.GenericData;
import org.apache.avro.generic.GenericRecord;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.ByteArrayDeserializer;
import org.apache.kafka.common.serialization.ByteArraySerializer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.example.common.model.State;
import org.example.common.model.cmd.OrdType;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.Side;
import org.example.common.model.cmd.TimeInForce;
import org.example.common.model.msg.CommandHeader;
import org.example.common.model.msg.OrderAcceptCmd;
import org.example.common.model.msg.Quote;
import org.example.common.model.msg.QuoteCreateCmd;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;

import io.confluent.kafka.serializers.KafkaAvroSerializer;
import io.micrometer.core.instrument.MeterRegistry;
import io.confluent.kafka.serializers.subject.TopicRecordNameStrategy;

/**
 * SPEC-0025 AC-4: a command record that cannot be handled — a type without a handler, a type this
 * service has no class for, or bytes that are not Avro at all — goes to {@code commands.DLT} with
 * exactly the bytes it arrived with, and the commands behind it on the partition still apply.
 */
class CommandDeadLetterIntegrationTest extends AbstractFillFlowIntegrationTest {

    @Autowired MeterRegistry meterRegistry;

    @Test
    void unhandledUndecodableAndGarbageKeepTheirBytes() throws Exception {
        String orderId = createUnackOrder();

        byte[] unhandled;
        byte[] unknownType;
        byte[] accept;
        try (KafkaAvroSerializer serializer = commandSerializer()) {
            unhandled = serializer.serialize("commands", new QuoteCreateCmd(TestCommands.header(), new Quote()));
            unknownType = serializer.serialize("commands", futureCommand(orderId));
            accept = serializer.serialize("commands", new OrderAcceptCmd(TestCommands.header(), orderId));
        }
        byte[] garbage = {1, 2, 3, 4, 5};
        List<byte[]> dead = List.of(unhandled, unknownType, garbage);
        double quoteFailuresBefore = failed("QuoteCreateCmd");
        double undecodableBefore = failed("undecodable");

        KafkaTemplate<String, byte[]> raw = rawTemplate();
        for (byte[] value : dead) {
            raw.send("commands", orderId, value).get(10, TimeUnit.SECONDS);
        }
        raw.send("commands", orderId, accept).get(10, TimeUnit.SECONDS);

        awaitUntil(() -> state(orderId) == State.LIVE, orderId + " accepted after the dead letters");
        List<byte[]> deadLettered = deadLetters(orderId, dead.size());
        assertEquals(dead.size(), deadLettered.size(), "one dead letter per unhandleable record");
        for (int i = 0; i < dead.size(); i++) {
            assertArrayEquals(dead.get(i), deadLettered.get(i), "dead letter " + i + " is the original bytes");
        }
        // Each was attempted once: a retried record would count one failure per attempt.
        assertEquals(1.0, failed("QuoteCreateCmd") - quoteFailuresBefore, "QuoteCreateCmd attempts");
        assertEquals(2.0, failed("undecodable") - undecodableBefore, "FutureCmd and garbage attempts");
    }

    private double failed(String type) {
        var counter = meterRegistry.find("oms.commands.consumed").tag("type", type).tag("outcome", "failed").counter();
        return counter == null ? 0.0 : counter.count();
    }

    private String createUnackOrder() {
        var order = new org.example.common.model.cmd.Order()
                .clOrdId("CL-" + UUID.randomUUID())
                .sessionId("SES-DLT")
                .account("ACC-DLT")
                .symbol("AAPL")
                .side(Side.BUY)
                .ordType(OrdType.LIMIT)
                .price(new BigDecimal("170"))
                .orderQty(new BigDecimal("100"))
                .timeInForce(TimeInForce.DAY);
        var result = orderCreateCommandProcessor.process(new OrderCreateCmd().type("OrderCreateCmd").order(order), Instant.now());
        assertTrue(result.isSuccess(), result.getErrorMessage());
        return result.getOrderId();
    }

    /** A command type registered by some newer producer, with no class in this service. */
    private static GenericRecord futureCommand(String orderId) {
        Schema schema = SchemaBuilder.record("FutureCmd").namespace("org.example.common.model.msg")
                .fields()
                .name("header").type(CommandHeader.getClassSchema()).noDefault()
                .requiredString("orderId")
                .endRecord();
        // Generic data has no timestamp conversion: the header is generic too, sentAt in micros.
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

    /** The values on commands.DLT under this key, in order, once {@code expected} have arrived. */
    private static List<byte[]> deadLetters(String key, int expected) {
        Map<String, Object> config = Map.of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers(),
                ConsumerConfig.GROUP_ID_CONFIG, "it-dlt-" + UUID.randomUUID(),
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest",
                ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
                ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, ByteArrayDeserializer.class);
        List<byte[]> values = new ArrayList<>();
        try (KafkaConsumer<String, byte[]> consumer = new KafkaConsumer<>(config)) {
            consumer.subscribe(List.of("commands.DLT"));
            long deadline = System.nanoTime() + TIMEOUT.toNanos();
            while (values.size() < expected && System.nanoTime() < deadline) {
                for (ConsumerRecord<String, byte[]> record : consumer.poll(Duration.ofMillis(250))) {
                    if (key.equals(record.key())) {
                        values.add(record.value());
                    }
                }
            }
            // Anything more for this key would be a retried record dead-lettered twice.
            for (ConsumerRecord<String, byte[]> record : consumer.poll(Duration.ofSeconds(1))) {
                if (key.equals(record.key())) {
                    values.add(record.value());
                }
            }
        }
        return values;
    }
}
