package org.example.oms.archive;

import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * What must hold, besides the replica, before an order is archived (SPEC-0052). Today: optionally,
 * that post-trade analytics holds its history ({@link AnalyticsHistoryCheck}), off by default.
 */
@Component
public class ArchivePreconditions {

    private final Optional<AnalyticsHistoryCheck> analytics;
    private final boolean requireAnalytics;

    public ArchivePreconditions(
            Optional<AnalyticsHistoryCheck> analytics,
            @Value("${oms.retention.require-analytics:false}") boolean requireAnalytics) {
        this.analytics = analytics;
        this.requireAnalytics = requireAnalytics;
    }

    /** Why the order must not be archived yet, or empty when nothing stands in the way. */
    public Optional<String> refuse(String orderId) {
        if (!requireAnalytics) {
            return Optional.empty();
        }
        if (analytics.isEmpty()) {
            return Optional.of("analytics is required (oms.retention.require-analytics) but no analytics check is available");
        }
        return analytics.get().holds(orderId)
                ? Optional.empty()
                : Optional.of("post-trade analytics has not confirmed it holds the order's history");
    }
}
