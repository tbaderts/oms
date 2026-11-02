package org.example.common.contracts.registry;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

import org.apache.avro.Schema;
import org.apache.avro.SchemaBuilder;
import org.example.common.contracts.CommandSchemaTest;
import org.example.common.model.msg.CommandHeader;
import org.example.common.model.msg.Execution;
import org.example.common.model.msg.ExecutionCreateCmd;
import org.example.common.model.msg.OrderAcceptCmd;
import org.example.common.model.msg.OrderMessage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import io.confluent.kafka.schemaregistry.avro.AvroSchema;
import io.confluent.kafka.schemaregistry.client.SchemaRegistryClient;
import io.confluent.kafka.schemaregistry.testutil.MockSchemaRegistry;
import io.confluent.kafka.serializers.KafkaAvroSerializer;
import io.confluent.kafka.serializers.subject.TopicRecordNameStrategy;

/**
 * SPEC-0025 AC-6: {@code registerSchemas} registers one subject per command record plus the event
 * subjects oms-core publishes, after the registry's compatibility check, and a serializer that may
 * not register finds every id it needs.
 */
class SchemaRegistrarTest {

    private static final Path AVRO_DIR = Path.of("src/main/avro");
    private static final String MSG = "org.example.common.model.msg.";

    private final String scope = "registrar-" + UUID.randomUUID();
    private final SchemaRegistryClient registry = MockSchemaRegistry.getClientForScope(scope);

    @AfterEach
    void dropScope() {
        MockSchemaRegistry.dropScope(scope);
    }

    @Test
    void registersEveryCommandAndEventSubject() throws Exception {
        SchemaRegistrar.register(registry, AVRO_DIR);

        Set<String> expected = new TreeSet<>(List.of("oms_orders-value", "oms_executions-value", "oms_order_executions-value"));
        for (String command : CommandSchemaTest.commandRecords()) {
            expected.add("commands-" + MSG + command);
        }
        assertEquals(expected, new TreeSet<>(registry.getAllSubjects()));
        assertEquals(16, expected.size());
    }

    @Test
    void serializerWithoutAutoRegisterFindsTheId() throws Exception {
        SchemaRegistrar.register(registry, AVRO_DIR);
        CommandHeader header = CommandHeader.newBuilder()
                .setCommandId("c-1").setSentAt(Instant.now()).setProducer("test").build();

        try (KafkaAvroSerializer commands = serializer(true); KafkaAvroSerializer events = serializer(false)) {
            commands.serialize("commands", new OrderAcceptCmd(header, "O-1"));
            commands.serialize("commands", new ExecutionCreateCmd(header,
                    Execution.newBuilder().setExecId("E-1").setOrderId("O-1").setLastQty(new BigDecimal("1.00000000")).build()));
            OrderMessage order = new OrderMessage();
            order.setOrderId("O-1");
            order.setRootOrderId("O-1");
            events.serialize("oms_orders", order);
            events.serialize("oms_executions", Execution.newBuilder().setExecId("E-1").build());
        }
    }

    @Test
    void incompatibleSubjectFailsAndRegistersNothing() throws Exception {
        String subject = "commands-" + MSG + "OrderAcceptCmd";
        // A released OrderAcceptCmd whose orderId is an int: the current string field cannot read it.
        Schema released = SchemaBuilder.record("OrderAcceptCmd").namespace("org.example.common.model.msg")
                .fields().requiredInt("orderId").endRecord();
        registry.register(subject, new AvroSchema(released));
        Map<String, List<Integer>> before = versions();

        IllegalStateException failure =
                assertThrows(IllegalStateException.class, () -> SchemaRegistrar.register(registry, AVRO_DIR));

        assertTrue(failure.getMessage().contains(subject), failure.getMessage());
        assertEquals(before, versions(), "no subject may gain a version");
    }

    private Map<String, List<Integer>> versions() throws Exception {
        Map<String, List<Integer>> versions = new HashMap<>();
        for (String subject : registry.getAllSubjects()) {
            versions.put(subject, registry.getAllVersions(subject));
        }
        return versions;
    }

    private KafkaAvroSerializer serializer(boolean recordNameStrategy) {
        Map<String, Object> config = new HashMap<>();
        config.put("schema.registry.url", "mock://" + scope);
        config.put("auto.register.schemas", false);
        if (recordNameStrategy) {
            config.put("value.subject.name.strategy", TopicRecordNameStrategy.class.getName());
        }
        KafkaAvroSerializer serializer = new KafkaAvroSerializer();
        serializer.configure(config, false);
        return serializer;
    }
}
