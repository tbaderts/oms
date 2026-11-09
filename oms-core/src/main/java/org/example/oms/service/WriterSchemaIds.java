package org.example.oms.service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.apache.avro.Schema;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import io.confluent.kafka.schemaregistry.ParsedSchema;
import io.confluent.kafka.schemaregistry.avro.AvroSchema;
import io.confluent.kafka.schemaregistry.avro.AvroSchemaProvider;
import io.confluent.kafka.schemaregistry.client.SchemaRegistryClient;
import io.confluent.kafka.schemaregistry.client.SchemaRegistryClientFactory;
import io.confluent.kafka.schemaregistry.client.rest.exceptions.RestClientException;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;

/**
 * Schema Registry ids of the schemas PROJECTION payloads are encoded with (SPEC-0049).
 *
 * <p>Staging asks {@link #idFor} and never waits for the registry: on a miss it gets null, and the
 * id is looked up in the background, so later rows carry it. The registry therefore cannot slow or
 * fail a command. When {@code auto.register.schemas} is on (docker-compose, tests), the lookup
 * registers the schema, as the serializer would; otherwise the schema must be registered already
 * (oms-contracts' {@code registerSchemas}, SPEC-0025). Subjects follow the default topic-name
 * strategy: {@code <topic>-value}.
 *
 * <p>The relay asks {@link #schemaById} on its drain thread; the client caches schemas by id.
 */
@Component
@Slf4j
public class WriterSchemaIds {

    private final SchemaRegistryClient client;
    private final boolean autoRegister;
    private final Map<String, Integer> ids = new ConcurrentHashMap<>();
    private final Set<String> pending = ConcurrentHashMap.newKeySet();
    /** When a lookup last failed, per subject and schema: it is not retried within a minute. */
    private final Map<String, Long> failedAt = new ConcurrentHashMap<>();
    private final ExecutorService lookups =
            Executors.newSingleThreadExecutor(Thread.ofPlatform().name("writer-schema-ids").daemon().factory());

    public WriterSchemaIds(
            @Value("${spring.kafka.producer.properties.schema.registry.url:}") String registryUrl,
            @Value("${spring.kafka.properties.auto.register.schemas:false}") boolean autoRegister) {
        this.client = registryUrl == null || registryUrl.isBlank()
                ? null
                : SchemaRegistryClientFactory.newClient(
                        List.of(registryUrl.split(",")), 100, List.of(new AvroSchemaProvider()), Map.of(), Map.of());
        this.autoRegister = autoRegister;
    }

    /** The schema's registry id under the topic's value subject, or null while it is not known yet. */
    public Integer idFor(String topic, Schema schema) {
        if (client == null) {
            return null;
        }
        String subject = topic + "-value";
        String key = subject + '\n' + schema.toString();
        Integer id = ids.get(key);
        Long failed = failedAt.get(key);
        boolean backingOff = failed != null && System.nanoTime() - failed < java.util.concurrent.TimeUnit.MINUTES.toNanos(1);
        if (id == null && !backingOff && pending.add(key)) {
            lookups.execute(() -> lookUp(key, subject, schema));
        }
        return id;
    }

    /** The schema registered under this id. */
    public Schema schemaById(int id) {
        if (client == null) {
            throw new IllegalStateException("No schema registry configured to resolve writer schema id " + id);
        }
        try {
            ParsedSchema schema = client.getSchemaById(id);
            return ((AvroSchema) schema).rawSchema();
        } catch (IOException e) {
            // Reaching the registry failed: transient for the relay, which retries without counting.
            throw new UncheckedIOException("Could not read writer schema " + id + " from the registry", e);
        } catch (RestClientException e) {
            if (e.getStatus() >= 500) {
                // The registry failed, not the request: transient, like an unreachable registry.
                throw new UncheckedIOException(new IOException("The registry failed reading writer schema " + id, e));
            }
            throw new IllegalStateException("The registry has no schema with id " + id, e);
        }
    }

    private void lookUp(String key, String subject, Schema schema) {
        try {
            AvroSchema avro = new AvroSchema(schema);
            int id = autoRegister ? client.register(subject, avro) : client.getId(subject, avro);
            ids.put(key, id);
            failedAt.remove(key);
        } catch (IOException | RestClientException | RuntimeException e) {
            failedAt.put(key, System.nanoTime());
            log.warn("Could not look up the registry id of {} under {}; rows are staged without it: {}",
                    schema.getFullName(), subject, e.toString());
        } finally {
            pending.remove(key);
        }
    }

    @PreDestroy
    void shutdown() {
        lookups.shutdownNow();
    }
}
