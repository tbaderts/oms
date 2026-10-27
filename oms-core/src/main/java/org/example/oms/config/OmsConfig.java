package org.example.oms.config;

import java.time.Clock;
import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.config.MeterFilter;
import io.micrometer.core.instrument.distribution.DistributionStatisticConfig;
import io.opentelemetry.exporter.otlp.trace.OtlpGrpcSpanExporter;
import lombok.extern.slf4j.Slf4j;

@Configuration
@Slf4j
public class OmsConfig {

    /** Prefix of the order SLA latency timers. */
    private static final String SLA_METER_PREFIX = "oms.order.";

    @Bean
    @ConditionalOnProperty(prefix = "tracing", name = "enabled", havingValue = "true")
    public OtlpGrpcSpanExporter otlpGrpcSpanExporter(@Value("${tracing.url}") String url) {
        return OtlpGrpcSpanExporter.builder().setEndpoint(url).build();
    }

    /**
     * Injectable clock, so anything that stamps a timestamp can be tested against a fixed instant
     * rather than asserted on a range around {@code Instant.now()}.
     */
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }

    /**
     * Publishes percentile histograms and explicit SLO buckets for the order SLA timers.
     *
     * <p>Averages are useless here. An order that takes 800ms while ninety-nine others take 3ms is
     * exactly the event worth alerting on, and the mean buries it. The histogram gives Grafana real
     * p95/p99 across instances, and the SLO buckets give a direct "share of orders inside the SLA"
     * from {@code _bucket{le="..."}} — so no separate breach counter is needed.
     *
     * <p>Applied as a filter rather than per-timer so the bucket set stays in one place.
     */
    @Bean
    public MeterFilter orderSlaHistogramFilter() {
        return new MeterFilter() {
            @Override
            public DistributionStatisticConfig configure(
                    Meter.Id id, DistributionStatisticConfig config) {
                if (!id.getName().startsWith(SLA_METER_PREFIX)) {
                    return config;
                }
                return DistributionStatisticConfig.builder()
                        .percentilesHistogram(true)
                        .serviceLevelObjectives(
                                Duration.ofMillis(1).toNanos(),
                                Duration.ofMillis(5).toNanos(),
                                Duration.ofMillis(10).toNanos(),
                                Duration.ofMillis(25).toNanos(),
                                Duration.ofMillis(50).toNanos(),
                                Duration.ofMillis(100).toNanos(),
                                Duration.ofMillis(250).toNanos(),
                                Duration.ofMillis(500).toNanos(),
                                Duration.ofSeconds(1).toNanos())
                        .build()
                        .merge(config);
            }
        };
    }
}
