package org.example.common.orchestration;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

import lombok.Getter;

/**
 * Represents a pipeline of tasks to be executed in sequence. Tasks can be added individually or in
 * bulk, and will execute in the order added (unless ordering is specified via {@link
 * Task#getOrder()}).
 *
 * @param <T> the type of TaskContext used by tasks in this pipeline
 */
@Getter
public class TaskPipeline<T extends TaskContext> {

    private final String name;
    private final List<Task<T>> tasks;
    private boolean stopOnFailure;
    private boolean sortByOrder;

    private TaskPipeline(String name) {
        this.name = name;
        this.tasks = new ArrayList<>();
        this.stopOnFailure = true;
        this.sortByOrder = false;
    }

    /**
     * Creates a new pipeline builder.
     *
     * @param name the pipeline name
     * @param <T> the type of TaskContext
     * @return a new pipeline builder
     */
    public static <T extends TaskContext> Builder<T> builder(String name) {
        return new Builder<>(name);
    }

    /**
     * Creates a new named pipeline.
     *
     * @param name the pipeline name
     * @param <T> the type of TaskContext
     * @return a new pipeline
     */
    public static <T extends TaskContext> TaskPipeline<T> create(String name) {
        return new TaskPipeline<>(name);
    }

    /**
     * Adds a task to the pipeline.
     *
     * @param task the task to add
     * @return this pipeline for method chaining
     */
    public TaskPipeline<T> addTask(Task<T> task) {
        this.tasks.add(task);
        return this;
    }

    /**
     * Adds multiple tasks to the pipeline.
     *
     * @param tasks the tasks to add
     * @return this pipeline for method chaining
     */
    @SafeVarargs
    public final TaskPipeline<T> addTasks(Task<T>... tasks) {
        this.tasks.addAll(Arrays.asList(tasks));
        return this;
    }

    /**
     * Adds multiple tasks to the pipeline.
     *
     * @param tasks the tasks to add
     * @return this pipeline for method chaining
     */
    public TaskPipeline<T> addTasks(List<Task<T>> tasks) {
        this.tasks.addAll(tasks);
        return this;
    }

    /**
     * Configures whether the pipeline should stop on the first task failure.
     *
     * @param stopOnFailure true to stop on failure, false to continue
     * @return this pipeline for method chaining
     */
    public TaskPipeline<T> stopOnFailure(boolean stopOnFailure) {
        this.stopOnFailure = stopOnFailure;
        return this;
    }

    /**
     * Configures whether tasks should be sorted by their order value before execution.
     *
     * @param sortByOrder true to sort by order
     * @return this pipeline for method chaining
     */
    public TaskPipeline<T> sortByOrder(boolean sortByOrder) {
        this.sortByOrder = sortByOrder;
        return this;
    }

    /**
     * Finalizes the pipeline configuration and sorts tasks if configured.
     *
     * @return this pipeline ready for execution
     */
    public TaskPipeline<T> build() {
        if (sortByOrder) {
            tasks.sort(Comparator.comparingInt(Task::getOrder));
        }
        return this;
    }

    /**
     * Builder for creating task pipelines with a fluent API.
     *
     * @param <T> the type of TaskContext
     */
    public static class Builder<T extends TaskContext> {
        private final TaskPipeline<T> pipeline;

        private Builder(String name) {
            this.pipeline = new TaskPipeline<>(name);
        }

        public Builder<T> addTask(Task<T> task) {
            pipeline.addTask(task);
            return this;
        }

        @SafeVarargs
        public final Builder<T> addTasks(Task<T>... tasks) {
            pipeline.addTasks(tasks);
            return this;
        }

        public Builder<T> addTasks(List<Task<T>> tasks) {
            pipeline.addTasks(tasks);
            return this;
        }

        public Builder<T> stopOnFailure(boolean stopOnFailure) {
            pipeline.stopOnFailure(stopOnFailure);
            return this;
        }

        public Builder<T> sortByOrder(boolean sortByOrder) {
            pipeline.sortByOrder(sortByOrder);
            return this;
        }

        public TaskPipeline<T> build() {
            return pipeline.build();
        }
    }

    @Override
    public String toString() {
        return String.format(
                "TaskPipeline[name=%s, tasks=%d, stopOnFailure=%s]",
                name, tasks.size(), stopOnFailure);
    }
}
