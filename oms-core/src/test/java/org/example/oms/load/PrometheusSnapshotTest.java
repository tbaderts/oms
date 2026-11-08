package org.example.oms.load;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.Map;

import org.junit.jupiter.api.Test;

/** SPEC-0024 AC-5: the load suite's percentiles come from this run's histogram bucket deltas. */
class PrometheusSnapshotTest {

    private static final String BEFORE = """
            # HELP oms_order_time_to_ack_seconds Time to ack
            # TYPE oms_order_time_to_ack_seconds histogram
            oms_order_time_to_ack_seconds_bucket{exDestination="XNAS",leg="UNSET",le="0.001"} 10.0
            oms_order_time_to_ack_seconds_bucket{exDestination="XNAS",leg="UNSET",le="0.005"} 10.0
            oms_order_time_to_ack_seconds_bucket{exDestination="XNAS",leg="UNSET",le="0.01"} 10.0
            oms_order_time_to_ack_seconds_bucket{exDestination="XNAS",leg="UNSET",le="+Inf"} 10.0
            oms_commands_consumed_total{outcome="applied",type="OrderAcceptCmd"} 5.0
            """;

    private static final String AFTER = """
            oms_order_time_to_ack_seconds_bucket{exDestination="XNAS",leg="UNSET",le="0.001"} 10.0
            oms_order_time_to_ack_seconds_bucket{exDestination="XNAS",leg="UNSET",le="0.005"} 60.0
            oms_order_time_to_ack_seconds_bucket{exDestination="XNAS",leg="UNSET",le="0.01"} 100.0
            oms_order_time_to_ack_seconds_bucket{exDestination="XNAS",leg="UNSET",le="+Inf"} 110.0
            oms_commands_consumed_total{outcome="applied",type="OrderAcceptCmd"} 105.0
            oms_commands_consumed_total{outcome="applied",type="ExecutionCreateCmd"} 100.0
            oms_commands_consumed_total{outcome="refused",type="ExecutionCreateCmd"} 3.0
            """;

    @Test
    void interpolatesQuantilesFromThisRunsBucketDeltas() {
        PrometheusSnapshot before = PrometheusSnapshot.parse(BEFORE);
        PrometheusSnapshot after = PrometheusSnapshot.parse(AFTER);
        String histogram = "oms_order_time_to_ack_seconds";

        // The run observed 100: none ≤1ms, 50 in (1ms,5ms], 40 in (5ms,10ms], 10 above 10ms.
        assertEquals(100, PrometheusSnapshot.countBetween(before, after, histogram));
        assertEquals(0.005, PrometheusSnapshot.quantileBetween(before, after, histogram, 0.50), 1e-12);
        assertEquals(0.01, PrometheusSnapshot.quantileBetween(before, after, histogram, 0.90), 1e-12);
        assertEquals(0.01, PrometheusSnapshot.quantileBetween(before, after, histogram, 0.99), 1e-12,
                "a quantile in the +Inf bucket is the highest finite bound");
        // Rank 75 is the 25th of the 40 in (5ms, 10ms]: 5ms + 5ms * 25/40.
        assertEquals(0.008125, PrometheusSnapshot.quantileBetween(before, after, histogram, 0.75), 1e-12);
    }

    @Test
    void noObservationsMeansNoQuantile() {
        PrometheusSnapshot same = PrometheusSnapshot.parse(BEFORE);

        assertNull(PrometheusSnapshot.quantileBetween(same, same, "oms_order_time_to_ack_seconds", 0.5));
        assertNull(PrometheusSnapshot.quantileBetween(same, same, "oms_order_unknown_seconds", 0.5));
    }

    @Test
    void sumsSamplesMatchingTheLabels() {
        PrometheusSnapshot after = PrometheusSnapshot.parse(AFTER);

        assertEquals(205.0, after.sum("oms_commands_consumed_total", Map.of("outcome", "applied")));
        assertEquals(208.0, after.sum("oms_commands_consumed_total", Map.of()));
    }
}
