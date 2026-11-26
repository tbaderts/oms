package org.example.streaming.kafka.errors;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.util.backoff.BackOff;
import org.springframework.util.backoff.ExponentialBackOff;

/**
 * The retry window and back-off every Kafka client of this service uses (SPEC-0077). Retryable
 * failures are retried with exponential back-off until {@code retryFor} has passed, then the record
 * is dead-lettered; failures that cannot succeed on a retry are dead-lettered at once.
 *
 * <p>The same keys and defaults exist in every service ({@code kafka.error-policy.*}).
 *
 * @param serviceName the service, in dead-letter topic names: {@code <topic>.<serviceName>.DLT}
 * @param retryFor how long a retryable failure is retried
 * @param initialInterval the first back-off
 * @param maxInterval the longest back-off; below {@code max.poll.interval.ms} so a sleeping
 *     consumer keeps its partitions
 * @param multiplier the back-off growth
 */
@ConfigurationProperties("kafka.error-policy")
public record ErrorPolicyProperties(
        String serviceName,
        @DefaultValue("PT2M") Duration retryFor,
        @DefaultValue("PT0.5S") Duration initialInterval,
        @DefaultValue("PT30S") Duration maxInterval,
        @DefaultValue("2.0") double multiplier) {

    /** Kafka's default {@code max.poll.interval.ms}; a longer sleep would cost the consumer its group. */
    static final Duration MAX_POLL_INTERVAL = Duration.ofMinutes(5);

    public ErrorPolicyProperties {
        if (serviceName == null || serviceName.isBlank()) {
            throw new IllegalArgumentException("kafka.error-policy.service-name must be set");
        }
        if (retryFor.isNegative() || initialInterval.isNegative() || initialInterval.isZero()) {
            throw new IllegalArgumentException("kafka.error-policy: retry-for must be >= 0 and initial-interval > 0");
        }
        if (maxInterval.compareTo(initialInterval) < 0) {
            throw new IllegalArgumentException("kafka.error-policy.max-interval must be >= initial-interval");
        }
        if (!retryFor.isZero() && maxInterval.compareTo(retryFor) > 0) {
            throw new IllegalArgumentException("kafka.error-policy.max-interval must be <= retry-for");
        }
        if (maxInterval.compareTo(MAX_POLL_INTERVAL) >= 0) {
            throw new IllegalArgumentException(
                    "kafka.error-policy.max-interval must be shorter than max.poll.interval.ms (5 minutes)");
        }
        if (multiplier < 1.0) {
            throw new IllegalArgumentException("kafka.error-policy.multiplier must be >= 1");
        }
    }

    /** Exponential back-off that gives up once the waits add up to {@code retryFor}. */
    public BackOff windowBackOff() {
        ExponentialBackOff backOff = new ExponentialBackOff(initialInterval.toMillis(), multiplier);
        backOff.setMaxInterval(maxInterval.toMillis());
        backOff.setMaxElapsedTime(retryFor.toMillis());
        return backOff;
    }

    /** Kafka's default {@code request.timeout.ms}; a shorter window shortens it too. */
    static final Duration DEFAULT_REQUEST_TIMEOUT = Duration.ofSeconds(30);

    /**
     * Producer settings that make the client's own retries last the window (design D-2): a retriable
     * send error is retried inside the client until {@code delivery.timeout.ms}, which is
     * {@code retryFor}. Kafka requires {@code delivery.timeout.ms >= linger.ms + request.timeout.ms},
     * so a short window shortens the request timeout and keeps a second of margin for linger.
     */
    public java.util.Map<String, Object> producerTimeouts() {
        long request = Math.max(1_000, Math.min(DEFAULT_REQUEST_TIMEOUT.toMillis(), retryFor.toMillis()));
        long delivery = Math.max(retryFor.toMillis(), request + 1_000);
        return java.util.Map.of(
                org.apache.kafka.clients.producer.ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, (int) Math.min(Integer.MAX_VALUE, delivery),
                org.apache.kafka.clients.producer.ProducerConfig.REQUEST_TIMEOUT_MS_CONFIG, (int) request,
                org.apache.kafka.clients.producer.ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE);
    }

    /** The wait before retry number {@code attempt} (1-based), as {@link #windowBackOff()} grows it. */
    public Duration backOffBefore(int attempt) {
        double millis = initialInterval.toMillis() * Math.pow(multiplier, Math.max(0, attempt - 1));
        return Duration.ofMillis((long) Math.min(millis, maxInterval.toMillis()));
    }
}
