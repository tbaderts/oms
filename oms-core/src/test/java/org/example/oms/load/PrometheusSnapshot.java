package org.example.oms.load;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * One scrape of a Prometheus text exposition, such as {@code /actuator/prometheus} (SPEC-0024).
 * Only what the load suite needs: summed samples, and quantiles of a histogram between two scrapes.
 */
public final class PrometheusSnapshot {

    private static final Pattern SAMPLE = Pattern.compile("^([a-zA-Z_:][a-zA-Z0-9_:]*)(\\{(.*)})?\\s+(\\S+).*$");
    private static final Pattern LABEL = Pattern.compile("([a-zA-Z_][a-zA-Z0-9_]*)=\"((?:[^\"\\\\]|\\\\.)*)\"");

    private record Sample(String name, Map<String, String> labels, double value) {}

    private final List<Sample> samples;

    private PrometheusSnapshot(List<Sample> samples) {
        this.samples = samples;
    }

    public static PrometheusSnapshot parse(String text) {
        List<Sample> samples = new ArrayList<>();
        for (String line : text.split("\\R")) {
            if (line.isBlank() || line.startsWith("#")) {
                continue;
            }
            Matcher sample = SAMPLE.matcher(line.trim());
            if (!sample.matches()) {
                continue;
            }
            Map<String, String> labels = new HashMap<>();
            if (sample.group(3) != null) {
                Matcher label = LABEL.matcher(sample.group(3));
                while (label.find()) {
                    labels.put(label.group(1), label.group(2));
                }
            }
            samples.add(new Sample(sample.group(1), labels, parseValue(sample.group(4))));
        }
        return new PrometheusSnapshot(samples);
    }

    /** The sum of every sample of this name whose labels include the given ones. */
    public double sum(String name, Map<String, String> labels) {
        return samples.stream()
                .filter(s -> s.name().equals(name) && s.labels().entrySet().containsAll(labels.entrySet()))
                .mapToDouble(Sample::value)
                .sum();
    }

    /** The histogram's cumulative bucket counts by upper bound, summed over all other labels. */
    public TreeMap<Double, Double> buckets(String histogram) {
        TreeMap<Double, Double> buckets = new TreeMap<>();
        for (Sample s : samples) {
            if (s.name().equals(histogram + "_bucket") && s.labels().containsKey("le")) {
                buckets.merge(parseValue(s.labels().get("le")), s.value(), Double::sum);
            }
        }
        return buckets;
    }

    /**
     * The q-quantile of the observations a histogram recorded between {@code before} and
     * {@code after}, interpolated linearly within the bucket as PromQL's {@code histogram_quantile}
     * does. Null when there were none. A quantile in the +Inf bucket is the highest finite bound.
     */
    public static Double quantileBetween(PrometheusSnapshot before, PrometheusSnapshot after, String histogram, double q) {
        TreeMap<Double, Double> start = before.buckets(histogram);
        TreeMap<Double, Double> end = after.buckets(histogram);
        TreeMap<Double, Double> delta = new TreeMap<>();
        end.forEach((le, count) -> delta.put(le, count - start.getOrDefault(le, 0.0)));
        return quantile(delta, q);
    }

    /** The number of observations between two scrapes: the +Inf bucket's delta. */
    public static long countBetween(PrometheusSnapshot before, PrometheusSnapshot after, String histogram) {
        Double end = after.buckets(histogram).get(Double.POSITIVE_INFINITY);
        Double start = before.buckets(histogram).get(Double.POSITIVE_INFINITY);
        return Math.round((end == null ? 0 : end) - (start == null ? 0 : start));
    }

    static Double quantile(TreeMap<Double, Double> cumulative, double q) {
        if (cumulative.isEmpty()) {
            return null;
        }
        double total = cumulative.lastEntry().getValue();
        if (total <= 0) {
            return null;
        }
        double rank = q * total;
        double lowerBound = 0;
        double lowerCount = 0;
        for (Map.Entry<Double, Double> bucket : cumulative.entrySet()) {
            double upper = bucket.getKey();
            double count = bucket.getValue();
            if (count >= rank) {
                if (Double.isInfinite(upper)) {
                    return lowerBound;
                }
                double inBucket = count - lowerCount;
                return inBucket <= 0 ? upper : lowerBound + (upper - lowerBound) * (rank - lowerCount) / inBucket;
            }
            lowerBound = upper;
            lowerCount = count;
        }
        return lowerBound;
    }

    private static double parseValue(String value) {
        return switch (value) {
            case "+Inf" -> Double.POSITIVE_INFINITY;
            case "-Inf" -> Double.NEGATIVE_INFINITY;
            case "NaN" -> Double.NaN;
            default -> Double.parseDouble(value);
        };
    }
}
