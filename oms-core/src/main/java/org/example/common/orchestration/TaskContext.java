package org.example.common.orchestration;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import lombok.Getter;

/**
 * Context object that carries state and metadata through a task pipeline. Provides a type-safe way
 * to store and retrieve values during task execution. The context is passed to each task in the
 * pipeline and can be modified by tasks.
 */
@Getter
public class TaskContext {

    private final String contextId;
    private final Instant createdAt;
    private final Map<String, Object> attributes;
    private final Map<String, Object> metadata;

    public TaskContext() {
        this.contextId = java.util.UUID.randomUUID().toString();
        this.createdAt = Instant.now();
        this.attributes = new HashMap<>();
        this.metadata = new HashMap<>();
    }

    /**
     * Stores a value in the context.
     *
     * @param key the attribute key
     * @param value the attribute value
     * @return this context for method chaining
     */
    public TaskContext put(String key, Object value) {
        attributes.put(key, value);
        return this;
    }

    /**
     * Retrieves a value from the context.
     *
     * @param key the attribute key
     * @param <T> the expected type of the value
     * @return an Optional containing the value if present
     */
    @SuppressWarnings("unchecked")
    public <T> Optional<T> get(String key) {
        return Optional.ofNullable((T) attributes.get(key));
    }

    /**
     * Retrieves a value from the context with a default value.
     *
     * @param key the attribute key
     * @param defaultValue the default value if key is not found
     * @param <T> the expected type of the value
     * @return the value or default value
     */
    @SuppressWarnings("unchecked")
    public <T> T getOrDefault(String key, T defaultValue) {
        return (T) attributes.getOrDefault(key, defaultValue);
    }

    /**
     * Checks if the context contains a specific key.
     *
     * @param key the attribute key
     * @return true if the key exists
     */
    public boolean contains(String key) {
        return attributes.containsKey(key);
    }

    /**
     * Stores metadata (not modified by tasks, but available for inspection).
     *
     * @param key the metadata key
     * @param value the metadata value
     * @return this context for method chaining
     */
    public TaskContext putMetadata(String key, Object value) {
        metadata.put(key, value);
        return this;
    }

    /**
     * Retrieves metadata.
     *
     * @param key the metadata key
     * @param <T> the expected type of the metadata
     * @return an Optional containing the metadata if present
     */
    @SuppressWarnings("unchecked")
    public <T> Optional<T> getMetadata(String key) {
        return Optional.ofNullable((T) metadata.get(key));
    }

    /**
     * Removes an attribute from the context.
     *
     * @param key the attribute key
     * @return this context for method chaining
     */
    public TaskContext remove(String key) {
        attributes.remove(key);
        return this;
    }

    /**
     * Clears all attributes (metadata is preserved).
     *
     * @return this context for method chaining
     */
    public TaskContext clear() {
        attributes.clear();
        return this;
    }

    @Override
    public String toString() {
        return String.format(
                "TaskContext[id=%s, createdAt=%s, attributes=%d, metadata=%d]",
                contextId, createdAt, attributes.size(), metadata.size());
    }
}
