package org.example.common.orchestration;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Unit tests for TaskContext. */
class TaskContextTest {

    private TaskContext context;

    @BeforeEach
    void setUp() {
        context = new TaskContext();
    }

    @Test
    void testContextIdGenerated() {
        assertNotNull(context.getContextId());
        assertFalse(context.getContextId().isEmpty());
    }

    @Test
    void testCreatedAtSet() {
        assertNotNull(context.getCreatedAt());
    }

    @Test
    void testPutAndGet() {
        context.put("key1", "value1");
        context.put("key2", 42);

        assertEquals("value1", context.get("key1").orElse(null));
        assertEquals(42, context.get("key2").orElse(null));
    }

    @Test
    void testGetNonExistent() {
        assertTrue(context.get("nonexistent").isEmpty());
    }

    @Test
    void testGetOrDefault() {
        context.put("existingKey", "existingValue");

        assertEquals("existingValue", context.getOrDefault("existingKey", "default"));
        assertEquals("default", context.getOrDefault("nonExistentKey", "default"));
    }

    @Test
    void testContains() {
        context.put("key1", "value1");

        assertTrue(context.contains("key1"));
        assertFalse(context.contains("key2"));
    }

    @Test
    void testMetadata() {
        context.putMetadata("correlationId", "12345");
        context.putMetadata("userId", "user123");

        assertEquals("12345", context.getMetadata("correlationId").orElse(null));
        assertEquals("user123", context.getMetadata("userId").orElse(null));
    }

    @Test
    void testRemove() {
        context.put("key1", "value1");
        assertTrue(context.contains("key1"));

        context.remove("key1");
        assertFalse(context.contains("key1"));
    }

    @Test
    void testClear() {
        context.put("key1", "value1");
        context.put("key2", "value2");
        context.putMetadata("meta1", "metaValue");

        context.clear();

        assertFalse(context.contains("key1"));
        assertFalse(context.contains("key2"));
        // Metadata should still be present
        assertEquals("metaValue", context.getMetadata("meta1").orElse(null));
    }

    @Test
    void testMethodChaining() {
        TaskContext result =
                context.put("key1", "value1").put("key2", "value2").putMetadata("meta", "value");

        assertSame(context, result);
        assertTrue(context.contains("key1"));
        assertTrue(context.contains("key2"));
        assertTrue(context.getMetadata("meta").isPresent());
    }
}
