package org.example.oms.load;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

/**
 * One load-suite run (SPEC-0024): its configuration and what it measured.
 *
 * @param startedAt when the first order was submitted
 * @param baseUrl the oms-core under test
 * @param orderCount orders submitted
 * @param concurrency creates in flight at once
 * @param fillSlices fills per order the simulator was configured for
 * @param duration first submit until the last order was terminal
 * @param commandsApplied commands applied by oms-core during the run: the creates plus the accepts
 *     and fills consumed from Kafka
 * @param latencies per SLA timer name, its percentiles over this run
 * @param finalStates per terminal state, how many orders ended in it
 */
public record LoadReport(
        Instant startedAt,
        String baseUrl,
        int orderCount,
        int concurrency,
        int fillSlices,
        Duration duration,
        long commandsApplied,
        Map<String, Percentiles> latencies,
        Map<String, Long> finalStates) {

    /** Commands applied per second of wall time. */
    public double throughputPerSecond() {
        double seconds = duration.toNanos() / 1e9;
        return seconds <= 0 ? 0 : commandsApplied / seconds;
    }

    /**
     * A timer's latency percentiles in milliseconds, over the observations of one run; null where
     * the run recorded none.
     *
     * @param count observations in the run
     */
    public record Percentiles(long count, Double p50Millis, Double p95Millis, Double p99Millis) {}
}
