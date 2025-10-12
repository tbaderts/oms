package org.example.common.orchestration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.util.function.Predicate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

/** Unit tests for TaskOrchestrator. */
@ExtendWith(MockitoExtension.class)
class TaskOrchestratorTest {

    private TaskOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        orchestrator = new TaskOrchestrator();
    }

    @Test
    void testExecuteEmptyPipeline() {
        TaskContext context = new TaskContext();
        TaskPipeline<TaskContext> pipeline = TaskPipeline.create("EmptyPipeline");

        TaskOrchestrator.PipelineResult result = orchestrator.execute(pipeline, context);

        assertTrue(result.isSuccess());
        assertEquals(0, result.getTaskResults().size());
        assertEquals(0, result.getSuccessCount());
    }

    @Test
    void testExecuteSingleSuccessfulTask() throws TaskExecutionException {
        Task<TaskContext> task = mock(Task.class);
        when(task.getName()).thenReturn("TestTask");
        when(task.execute(any())).thenReturn(TaskResult.success("TestTask"));

        TaskContext context = new TaskContext();
        TaskPipeline<TaskContext> pipeline =
                TaskPipeline.<TaskContext>create("SingleTaskPipeline").addTask(task);

        TaskOrchestrator.PipelineResult result = orchestrator.execute(pipeline, context);

        assertTrue(result.isSuccess());
        assertEquals(1, result.getSuccessCount());
        assertEquals(0, result.getFailedCount());
        verify(task, times(1)).execute(context);
    }

    @Test
    void testExecuteMultipleSuccessfulTasks() throws TaskExecutionException {
        Task<TaskContext> task1 = mock(Task.class);
        Task<TaskContext> task2 = mock(Task.class);

        when(task1.getName()).thenReturn("Task1");
        when(task2.getName()).thenReturn("Task2");
        when(task1.execute(any())).thenReturn(TaskResult.success("Task1"));
        when(task2.execute(any())).thenReturn(TaskResult.success("Task2"));

        TaskContext context = new TaskContext();
        TaskPipeline<TaskContext> pipeline =
                TaskPipeline.<TaskContext>create("MultiTaskPipeline").addTask(task1).addTask(task2);

        TaskOrchestrator.PipelineResult result = orchestrator.execute(pipeline, context);

        assertTrue(result.isSuccess());
        assertEquals(2, result.getSuccessCount());
        assertEquals(0, result.getFailedCount());
        verify(task1, times(1)).execute(context);
        verify(task2, times(1)).execute(context);
    }

    @Test
    void testExecuteWithFailureStopOnFailureTrue() throws TaskExecutionException {
        Task<TaskContext> task1 = mock(Task.class);
        Task<TaskContext> task2 = mock(Task.class);

        when(task1.getName()).thenReturn("Task1");
        when(task1.execute(any())).thenReturn(TaskResult.failed("Task1", "Error"));

        TaskContext context = new TaskContext();
        TaskPipeline<TaskContext> pipeline =
                TaskPipeline.<TaskContext>create("FailPipeline")
                        .addTask(task1)
                        .addTask(task2)
                        .stopOnFailure(true);

        TaskOrchestrator.PipelineResult result = orchestrator.execute(pipeline, context);

        assertFalse(result.isSuccess());
        assertEquals(1, result.getFailedCount());
        verify(task1, times(1)).execute(context);
        verify(task2, never()).execute(context); // Should not execute after failure
    }

    @Test
    void testExecuteWithFailureStopOnFailureFalse() throws TaskExecutionException {
        Task<TaskContext> task1 = mock(Task.class);
        Task<TaskContext> task2 = mock(Task.class);

        when(task1.getName()).thenReturn("Task1");
        when(task2.getName()).thenReturn("Task2");
        when(task1.execute(any())).thenReturn(TaskResult.failed("Task1", "Error"));
        when(task2.execute(any())).thenReturn(TaskResult.success("Task2"));

        TaskContext context = new TaskContext();
        TaskPipeline<TaskContext> pipeline =
                TaskPipeline.<TaskContext>create("ContinuePipeline")
                        .addTask(task1)
                        .addTask(task2)
                        .stopOnFailure(false);

        TaskOrchestrator.PipelineResult result = orchestrator.execute(pipeline, context);

        assertFalse(result.isSuccess()); // Overall failed
        assertTrue(result.hasFailures());
        assertEquals(1, result.getFailedCount());
        assertEquals(1, result.getSuccessCount());
        verify(task1, times(1)).execute(context);
        verify(task2, times(1)).execute(context); // Should execute even after failure
    }

    @Test
    void testExecuteConditionalTaskWithPreconditionMet() throws TaskExecutionException {
        ConditionalTask<TaskContext> task = mock(ConditionalTask.class);
        when(task.getName()).thenReturn("ConditionalTask");
        when(task.getPrecondition()).thenReturn(ctx -> true);
        when(task.shouldExecute(any())).thenCallRealMethod();
        when(task.execute(any())).thenReturn(TaskResult.success("ConditionalTask"));

        TaskContext context = new TaskContext();
        TaskPipeline<TaskContext> pipeline =
                TaskPipeline.<TaskContext>create("ConditionalPipeline").addTask(task);

        TaskOrchestrator.PipelineResult result = orchestrator.execute(pipeline, context);

        assertTrue(result.isSuccess());
        assertEquals(1, result.getSuccessCount());
        verify(task, times(1)).execute(context);
    }

    @Test
    void testExecuteConditionalTaskWithPreconditionNotMet() throws TaskExecutionException {
        ConditionalTask<TaskContext> task = mock(ConditionalTask.class);
        when(task.getName()).thenReturn("ConditionalTask");
        when(task.getPrecondition()).thenReturn(ctx -> false);
        when(task.shouldExecute(any())).thenCallRealMethod();
        when(task.getSkipReason(any())).thenReturn("Condition not met");

        TaskContext context = new TaskContext();
        TaskPipeline<TaskContext> pipeline =
                TaskPipeline.<TaskContext>create("SkippedPipeline").addTask(task);

        TaskOrchestrator.PipelineResult result = orchestrator.execute(pipeline, context);

        assertTrue(result.isSuccess());
        assertEquals(0, result.getSuccessCount());
        assertEquals(1, result.getSkippedCount());
        verify(task, never()).execute(any()); // Should not execute
    }

    @Test
    void testExecuteTaskThrowsException() throws TaskExecutionException {
        Task<TaskContext> task = mock(Task.class);
        when(task.getName()).thenReturn("ErrorTask");
        when(task.execute(any()))
                .thenThrow(new TaskExecutionException("ErrorTask", "Execution failed"));

        TaskContext context = new TaskContext();
        TaskPipeline<TaskContext> pipeline =
                TaskPipeline.<TaskContext>create("ErrorPipeline").addTask(task);

        TaskOrchestrator.PipelineResult result = orchestrator.execute(pipeline, context);

        assertFalse(result.isSuccess());
        assertEquals(1, result.getFailedCount());
        assertTrue(result.hasFailures());
    }

    @Test
    void testPipelineResultStatistics() throws TaskExecutionException {
        Task<TaskContext> successTask = mock(Task.class);
        Task<TaskContext> failTask = mock(Task.class);
        ConditionalTask<TaskContext> skipTask = mock(ConditionalTask.class);

        when(successTask.getName()).thenReturn("SuccessTask");
        when(failTask.getName()).thenReturn("FailTask");
        when(skipTask.getName()).thenReturn("SkipTask");

        when(successTask.execute(any())).thenReturn(TaskResult.success("SuccessTask"));
        when(failTask.execute(any())).thenReturn(TaskResult.failed("FailTask", "Error"));
        when(skipTask.getPrecondition()).thenReturn(ctx -> false);
        when(skipTask.shouldExecute(any())).thenCallRealMethod();
        when(skipTask.getSkipReason(any())).thenReturn("Skipped");

        TaskContext context = new TaskContext();
        TaskPipeline<TaskContext> pipeline =
                TaskPipeline.<TaskContext>create("StatsPipeline")
                        .addTask(successTask)
                        .addTask(failTask)
                        .addTask(skipTask)
                        .stopOnFailure(false);

        TaskOrchestrator.PipelineResult result = orchestrator.execute(pipeline, context);

        assertEquals(3, result.getTaskResults().size());
        assertEquals(1, result.getSuccessCount());
        assertEquals(1, result.getFailedCount());
        assertEquals(1, result.getSkippedCount());
        assertTrue(result.hasFailures());
    }

    @Test
    void testPipelineExecutionTime() {
        TaskContext context = new TaskContext();
        TaskPipeline<TaskContext> pipeline = TaskPipeline.create("TimingPipeline");

        TaskOrchestrator.PipelineResult result = orchestrator.execute(pipeline, context);

        assertNotNull(result.getExecutionTime());
        assertTrue(result.getExecutionTime().toMillis() >= 0);
    }

    // Helper implementation of ConditionalTask for testing
    private static class TestConditionalTask implements ConditionalTask<TaskContext> {
        private final Predicate<TaskContext> precondition;
        private final TaskResult result;

        TestConditionalTask(Predicate<TaskContext> precondition, TaskResult result) {
            this.precondition = precondition;
            this.result = result;
        }

        @Override
        public TaskResult execute(TaskContext context) {
            return result;
        }

        @Override
        public Predicate<TaskContext> getPrecondition() {
            return precondition;
        }
    }

    @Test
    void testRealConditionalTask() {
        TaskContext context = new TaskContext();
        context.put("shouldRun", true);

        ConditionalTask<TaskContext> task =
                new TestConditionalTask(
                        ctx -> ctx.getOrDefault("shouldRun", false),
                        TaskResult.success("TestConditionalTask"));

        TaskPipeline<TaskContext> pipeline =
                TaskPipeline.<TaskContext>create("RealConditionalPipeline").addTask(task);

        TaskOrchestrator.PipelineResult result = orchestrator.execute(pipeline, context);

        assertTrue(result.isSuccess());
        assertEquals(1, result.getSuccessCount());
    }

    @Test
    void testRealConditionalTaskSkipped() {
        TaskContext context = new TaskContext();
        context.put("shouldRun", false);

        ConditionalTask<TaskContext> task =
                new TestConditionalTask(
                        ctx -> ctx.getOrDefault("shouldRun", false),
                        TaskResult.success("TestConditionalTask"));

        TaskPipeline<TaskContext> pipeline =
                TaskPipeline.<TaskContext>create("SkipConditionalPipeline").addTask(task);

        TaskOrchestrator.PipelineResult result = orchestrator.execute(pipeline, context);

        assertTrue(result.isSuccess());
        assertEquals(1, result.getSkippedCount());
    }
}
