package org.example.common.contracts.registry;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.apache.avro.Schema;

import io.confluent.kafka.schemaregistry.avro.AvroSchema;
import io.confluent.kafka.schemaregistry.client.CachedSchemaRegistryClient;
import io.confluent.kafka.schemaregistry.client.SchemaRegistryClient;
import io.confluent.kafka.schemaregistry.client.rest.exceptions.RestClientException;

/**
 * Registers the schemas the services write, so they can run with {@code auto.register.schemas=false}
 * (SPEC-0025).
 *
 * <p>Subjects:
 * <ul>
 *   <li>{@code commands-<full name>} for every command record ({@code *Cmd.avsc}), the subject
 *       {@code TopicRecordNameStrategy} gives on the {@code commands} topic;</li>
 *   <li>the three event subjects oms-core publishes with {@code TopicNameStrategy}.</li>
 * </ul>
 *
 * <p>Every subject is checked for compatibility before any is registered, so a failed run leaves
 * the registry as it was. The schema registered is the generated class's, not the {@code .avsc}
 * text: the generator adds properties (such as {@code avro.java.string}) to the class schema, and a
 * serializer that may not register looks up exactly that schema.
 */
public final class SchemaRegistrar {

    static final String COMMAND_TOPIC = "commands";
    static final String MSG = "org.example.common.model.msg.";

    /** Event subject → record, as oms-core's outbox publishes them. */
    static final Map<String, String> EVENT_SUBJECTS = Map.of(
            "oms_orders-value", "OrderMessage",
            "oms_executions-value", "Execution",
            "oms_order_executions-value", "OrderExecution");

    /** Registry errors meaning the subject or its versions do not exist yet: nothing to be incompatible with. */
    private static final List<Integer> NOT_FOUND = List.of(40401, 40402);

    private SchemaRegistrar() {}

    /** {@code args}: the registry URL and the Avro source directory. */
    public static void main(String[] args) throws Exception {
        if (args.length != 2) {
            throw new IllegalArgumentException("usage: SchemaRegistrar <registry url> <avro source dir>");
        }
        SchemaRegistryClient client = new CachedSchemaRegistryClient(args[0], 100);
        Map<String, Integer> ids = register(client, Path.of(args[1]));
        ids.forEach((subject, id) -> System.out.println("registered " + subject + " (id " + id + ")"));
    }

    /**
     * Checks every subject, then registers them all.
     *
     * @return subject → schema id
     * @throws IllegalStateException naming every incompatible subject; nothing is registered then
     */
    public static Map<String, Integer> register(SchemaRegistryClient client, Path avroDir)
            throws IOException, RestClientException {
        Map<String, AvroSchema> subjects = subjects(avroDir);

        List<String> incompatible = new ArrayList<>();
        for (Map.Entry<String, AvroSchema> subject : subjects.entrySet()) {
            if (!isCompatible(client, subject.getKey(), subject.getValue())) {
                incompatible.add(subject.getKey());
            }
        }
        if (!incompatible.isEmpty()) {
            throw new IllegalStateException(
                    "Incompatible with the registered schema, nothing registered: " + incompatible);
        }

        Map<String, Integer> ids = new LinkedHashMap<>();
        for (Map.Entry<String, AvroSchema> subject : subjects.entrySet()) {
            ids.put(subject.getKey(), client.register(subject.getKey(), subject.getValue()));
        }
        return ids;
    }

    /** Every subject with the class schema of its record, commands first, in name order. */
    static Map<String, AvroSchema> subjects(Path avroDir) throws IOException {
        Map<String, AvroSchema> subjects = new LinkedHashMap<>();
        for (String command : commandRecords(avroDir)) {
            subjects.put(COMMAND_TOPIC + "-" + MSG + command, classSchema(command));
        }
        EVENT_SUBJECTS.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .forEach(event -> subjects.put(event.getKey(), classSchema(event.getValue())));
        return subjects;
    }

    private static boolean isCompatible(SchemaRegistryClient client, String subject, AvroSchema schema)
            throws IOException, RestClientException {
        try {
            return client.testCompatibility(subject, schema);
        } catch (RestClientException e) {
            if (NOT_FOUND.contains(e.getErrorCode())) {
                return true;
            }
            throw e;
        }
    }

    private static List<String> commandRecords(Path avroDir) throws IOException {
        try (Stream<Path> files = Files.list(avroDir)) {
            return files.map(p -> p.getFileName().toString())
                    .filter(f -> f.endsWith("Cmd.avsc"))
                    .map(f -> f.substring(0, f.length() - ".avsc".length()))
                    .sorted()
                    .toList();
        }
    }

    private static AvroSchema classSchema(String record) {
        try {
            Schema schema = (Schema) Class.forName(MSG + record).getMethod("getClassSchema").invoke(null);
            return new AvroSchema(schema);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("No generated class for " + MSG + record, e);
        }
    }
}
