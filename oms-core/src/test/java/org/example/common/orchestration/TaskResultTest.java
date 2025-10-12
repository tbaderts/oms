package org.example.common.orchestration;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

/** Unit tests for TaskResult. */
class TaskResultTest {

    @Test
    void testSuccess() {
        TaskResult result = TaskResult.success("TestTask");

        assertEquals(TaskResult.Status.SUCCESS, result.getStatus());
        assertEquals("TestTask", result.getTaskName());
        assertTrue(result.isSuccess());
        assertFalse(result.isFailed());
        assertFalse(result.isSkipped());
    }

    @Test
    void testSuccessWithMessage() {
        TaskResult result = TaskResult.success("TestTask", "Operation completed");

        assertEquals(TaskResult.Status.SUCCESS, result.getStatus());
        assertEquals("TestTask", result.getTaskName());
        assertEquals("Operation completed", result.getMessage());
        assertTrue(result.isSuccess());
    }

    @Test
    void testFailed() {
        TaskResult result = TaskResult.failed("TestTask", "Validation error");

        assertEquals(TaskResult.Status.FAILED, result.getStatus());
        assertEquals("TestTask", result.getTaskName());
        assertEquals("Validation error", result.getMessage());
        assertTrue(result.isFailed());
        assertFalse(result.isSuccess());
        assertNotNull(result.getErrors());
        assertTrue(result.getErrors().contains("Validation error"));
    }

    @Test
    void testFailedWithException() {
        Exception ex = new RuntimeException("Test exception");
        TaskResult result = TaskResult.failed("TestTask", ex);

        assertEquals(TaskResult.Status.FAILED, result.getStatus());
        assertEquals("TestTask", result.getTaskName());
        assertTrue(result.isFailed());
        assertTrue(result.getException().isPresent());
        assertEquals(ex, result.getException().get());
    }

    @Test
    void testSkipped() {
        TaskResult result = TaskResult.skipped("TestTask", "Precondition not met");

        assertEquals(TaskResult.Status.SKIPPED, result.getStatus());
        assertEquals("TestTask", result.getTaskName());
        assertEquals("Precondition not met", result.getMessage());
        assertTrue(result.isSkipped());
        assertFalse(result.isSuccess());
        assertFalse(result.isFailed());
    }

    @Test
    void testWarning() {
        TaskResult result = TaskResult.warning("TestTask", "Potential issue detected");

        assertEquals(TaskResult.Status.WARNING, result.getStatus());
        assertEquals("TestTask", result.getTaskName());
        assertEquals("Potential issue detected", result.getMessage());
        assertNotNull(result.getWarnings());
        assertTrue(result.getWarnings().contains("Potential issue detected"));
    }

    @Test
    void testBuilderWithMultipleWarningsAndErrors() {
        TaskResult result =
                TaskResult.builder()
                        .status(TaskResult.Status.WARNING)
                        .taskName("TestTask")
                        .warning("Warning 1")
                        .warning("Warning 2")
                        .error("Error 1")
                        .build();

        assertEquals(2, result.getWarnings().size());
        assertEquals(1, result.getErrors().size());
        assertTrue(result.getWarnings().contains("Warning 1"));
        assertTrue(result.getWarnings().contains("Warning 2"));
        assertTrue(result.getErrors().contains("Error 1"));
    }

    @Test
    void testGetExceptionWhenNotPresent() {
        TaskResult result = TaskResult.success("TestTask");

        assertTrue(result.getException().isEmpty());
    }
}
