package org.example.common.orchestration;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import io.micrometer.observation.annotation.Observed;
import lombok.Getter;

/**
 * Orchestrates the execution of a pipeline of tasks. Tasks are executed in the order they are added
 * to the pipeline. Supports conditional task execution, error handling, and result aggregation.
 */
@Component
public class TaskOrchestrator {

    private static final Logger logger = LoggerFactory.getLogger(TaskOrchestrator.class);

    /** Represents the overall result of a pipeline execution. */
    @Getter
    public static class PipelineResult {
        private final List<TaskResult> taskResults;
        private final boolean success;
        private final Duration executionTime;
        private final String pipelineName;

        public PipelineResult(
                String pipelineName,
                List<TaskResult> taskResults,
                boolean success,
                Duration executionTime) {
            this.pipelineName = pipelineName;
            this.taskResults = new ArrayList<>(taskResults);
            this.success = success;
            this.executionTime = executionTime;
        }

        public boolean hasFailures() {
            return taskResults.stream().anyMatch(TaskResult::isFailed);
        }

        public boolean hasWarnings() {
            return taskResults.stream().anyMatch(r -> r.getStatus() == TaskResult.Status.WARNING);
        }

        public long getSkippedCount() {
            return taskResults.stream().filter(TaskResult::isSkipped).count();
        }

        public long getSuccessCount() {
            return taskResults.stream().filter(TaskResult::isSuccess).count();
        }

        public long getFailedCount() {
            return taskResults.stream().filter(TaskResult::isFailed).count();
        }

        @Override
        public String toString() {
            return String.format(
                    "PipelineResult[pipeline=%s, success=%s, duration=%dms, total=%d, success=%d,"
                            + " failed=%d, skipped=%d]",
                    pipelineName,
                    success,
                    executionTime.toMillis(),
                    taskResults.size(),
                    getSuccessCount(),
                    getFailedCount(),
                    getSkippedCount());
        }
    }

    /**
     * Executes a pipeline of tasks in sequence.
     *
     * @param pipeline the pipeline to execute
     * @param context the task context
     * @param <T> the type of the task context
     * @return the pipeline execution result
     */
    @Observed(name = "task.orchestrator.execute")
    public <T extends TaskContext> PipelineResult execute(TaskPipeline<T> pipeline, T context) {
        logger.info("Starting pipeline execution: {}", pipeline.getName());
        Instant startTime = Instant.now();

        List<TaskResult> results = new ArrayList<>();
        boolean overallSuccess = true;

        try {
            for (Task<T> task : pipeline.getTasks()) {
                TaskResult result = executeTask(task, context, pipeline.isStopOnFailure());
                results.add(result);

                logger.debug(
                        "Task {} completed with status: {}", task.getName(), result.getStatus());

                if (result.isFailed()) {
                    overallSuccess = false;
                    if (pipeline.isStopOnFailure()) {
                        logger.warn("Pipeline stopped due to task failure: {}", task.getName());
                        break;
                    }
                }
            }
        } catch (Exception e) {
            logger.error("Unexpected error during pipeline execution", e);
            overallSuccess = false;
        }

        Duration executionTime = Duration.between(startTime, Instant.now());
        PipelineResult pipelineResult =
                new PipelineResult(pipeline.getName(), results, overallSuccess, executionTime);

        logger.info("Pipeline execution completed: {}", pipelineResult);
        return pipelineResult;
    }

    /**
     * Executes a single task with precondition checking and error handling.
     *
     * @param task the task to execute
     * @param context the task context
     * @param stopOnFailure whether to stop the pipeline on failure
     * @param <T> the type of the task context
     * @return the task execution result
     */
    private <T extends TaskContext> TaskResult executeTask(
            Task<T> task, T context, boolean stopOnFailure) {
        String taskName = task.getName();
        logger.debug("Executing task: {}", taskName);

        try {
            // Check precondition for conditional tasks
            if (task instanceof ConditionalTask) {
                ConditionalTask<T> conditionalTask = (ConditionalTask<T>) task;
                if (!conditionalTask.shouldExecute(context)) {
                    String skipReason = conditionalTask.getSkipReason(context);
                    logger.info("Task {} skipped: {}", taskName, skipReason);
                    return TaskResult.skipped(taskName, skipReason);
                }
            }

            // Execute the task
            TaskResult result = task.execute(context);
            return result != null ? result : TaskResult.success(taskName);

        } catch (TaskExecutionException e) {
            logger.error("Task execution failed: {}", taskName, e);
            return TaskResult.failed(taskName, e);

        } catch (Exception e) {
            logger.error("Unexpected error in task: {}", taskName, e);
            return TaskResult.failed(taskName, e);
        }
    }
}
