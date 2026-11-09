package org.example.oms.load;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** SPEC-0024 AC-5: the load report states throughput and p50/p95/p99 beside the run configuration. */
class LoadReportWriterTest {

    @Test
    void writesThroughputAndLatencyPercentilesToFile(@TempDir Path directory) throws IOException {
        Map<String, LoadReport.Percentiles> latencies = new LinkedHashMap<>();
        latencies.put("oms_order_time_to_ack", new LoadReport.Percentiles(500, 3.25, 9.5, 24.75));
        latencies.put("oms_order_time_to_market", new LoadReport.Percentiles(0, null, null, null));
        LoadReport report = new LoadReport(
                Instant.parse("2026-11-08T10:15:30Z"),
                "http://localhost:8090",
                500,
                8,
                2,
                Duration.ofSeconds(20),
                2000,
                null,
                latencies,
                Map.of("FILLED", 500L));

        Path file = LoadReportWriter.write(report, directory);

        assertEquals("load-baseline-20261108-101530.md", file.getFileName().toString());
        String content = Files.readString(file);
        assertEquals(100.0, report.throughputPerSecond(), 1e-9);
        assertTrue(content.contains("| Throughput (commands/s) | 100.00 |"), content);
        assertTrue(content.contains("| Commands applied | 2000 |"), content);
        assertTrue(content.contains("| Timer | Observations | p50 | p95 | p99 |"), content);
        assertTrue(content.contains("| oms_order_time_to_ack | 500 | 3.25 | 9.50 | 24.75 |"), content);
        assertTrue(content.contains("| oms_order_time_to_market | 0 | n/a | n/a | n/a |"), content);
        assertTrue(content.contains("| Orders | 500 |"), content);
        assertTrue(content.contains("| Concurrency (creates in flight) | 8 |"), content);
        assertTrue(content.contains("| Fill slices per order | 2 |"), content);
        assertTrue(content.contains("| Orders ending FILLED | 500 |"), content);
        assertTrue(content.contains("| WAL bytes written | n/a |"), "no database probe, no figure: " + content);
    }

    /** SPEC-0047 AC-9: the report states the run's write volume, as WAL bytes and per order. */
    @Test
    void writesWalBytesPerOrder(@TempDir Path directory) throws IOException {
        LoadReport report = new LoadReport(
                Instant.parse("2026-11-08T10:15:30Z"),
                "http://localhost:8090",
                500,
                8,
                1,
                Duration.ofSeconds(20),
                1500,
                12_500_000L,
                Map.of(),
                Map.of("FILLED", 500L));

        String content = Files.readString(LoadReportWriter.write(report, directory));

        assertEquals(25_000.0, report.walBytesPerOrder(), 1e-9);
        assertTrue(content.contains("| WAL bytes written | 12500000 |"), content);
        assertTrue(content.contains("| WAL bytes per order | 25000.00 |"), content);
    }
}
