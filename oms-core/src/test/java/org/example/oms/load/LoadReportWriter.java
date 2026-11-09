package org.example.oms.load;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;

/**
 * Writes a load-suite run as a Markdown report (SPEC-0024): the run configuration beside the
 * measured throughput and latency percentiles, so a later run of the same shape can be compared.
 */
public final class LoadReportWriter {

    private static final DateTimeFormatter FILE_STAMP =
            DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC);

    private LoadReportWriter() {}

    /** Writes the report into the directory as {@code load-baseline-<timestamp>.md}. */
    public static Path write(LoadReport report, Path directory) {
        Path file = directory.resolve("load-baseline-" + FILE_STAMP.format(report.startedAt()) + ".md");
        try {
            Files.createDirectories(directory);
            Files.writeString(file, render(report));
        } catch (IOException e) {
            throw new UncheckedIOException("Could not write load report " + file, e);
        }
        return file;
    }

    public static String render(LoadReport report) {
        StringBuilder md = new StringBuilder();
        md.append("# Load suite run — ").append(report.startedAt()).append("\n\n");
        md.append("## Configuration\n\n");
        md.append("| Setting | Value |\n|---|---|\n");
        row(md, "oms-core", report.baseUrl());
        row(md, "Orders", String.valueOf(report.orderCount()));
        row(md, "Concurrency (creates in flight)", String.valueOf(report.concurrency()));
        row(md, "Fill slices per order", String.valueOf(report.fillSlices()));
        md.append("\n## Throughput\n\n");
        md.append("| Measure | Value |\n|---|---|\n");
        row(md, "Duration (s)", format(report.duration().toNanos() / 1e9));
        row(md, "Commands applied", String.valueOf(report.commandsApplied()));
        row(md, "Throughput (commands/s)", format(report.throughputPerSecond()));
        for (Map.Entry<String, Long> state : report.finalStates().entrySet()) {
            row(md, "Orders ending " + state.getKey(), String.valueOf(state.getValue()));
        }
        md.append("\n## Write volume (PostgreSQL WAL)\n\n");
        md.append("| Measure | Value |\n|---|---|\n");
        row(md, "WAL bytes written", report.walBytes() == null ? "n/a" : String.valueOf(report.walBytes()));
        row(md, "WAL bytes per order", format(report.walBytesPerOrder()));
        md.append("\n## Command latency (SLA timers, ms)\n\n");
        md.append("| Timer | Observations | p50 | p95 | p99 |\n|---|---|---|---|---|\n");
        for (Map.Entry<String, LoadReport.Percentiles> timer : report.latencies().entrySet()) {
            LoadReport.Percentiles p = timer.getValue();
            md.append("| ").append(timer.getKey())
                    .append(" | ").append(p.count())
                    .append(" | ").append(format(p.p50Millis()))
                    .append(" | ").append(format(p.p95Millis()))
                    .append(" | ").append(format(p.p99Millis()))
                    .append(" |\n");
        }
        md.append("\nPercentiles are interpolated from this run's histogram bucket deltas, as PromQL's ")
                .append("`histogram_quantile` does; their precision is the bucket bounds.\n");
        return md.toString();
    }

    private static void row(StringBuilder md, String name, String value) {
        md.append("| ").append(name).append(" | ").append(value).append(" |\n");
    }

    private static String format(Double value) {
        return value == null ? "n/a" : String.format(Locale.ROOT, "%.2f", value);
    }
}
