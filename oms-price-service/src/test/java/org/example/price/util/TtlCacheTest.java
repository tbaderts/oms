package org.example.price.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import org.junit.jupiter.api.Test;

/** SPEC-0072 AC-8: answers are kept for their time to live, then fetched again. */
class TtlCacheTest {

    private Instant now = Instant.parse("2026-11-24T10:00:00Z");

    private final Clock clock = new Clock() {
        @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(java.time.ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    };

    @Test
    void keepsAValueForItsTimeToLive() {
        TtlCache<String, String> cache = new TtlCache<>(Duration.ofMinutes(5), clock);
        cache.put("AAPL", "quote-1");

        now = now.plus(Duration.ofMinutes(4));
        assertEquals(Optional.of("quote-1"), cache.get("AAPL"));

        now = now.plus(Duration.ofMinutes(1));
        assertTrue(cache.get("AAPL").isEmpty(), "expired at exactly the time to live");
    }

    @Test
    void missesWhatWasNeverPut() {
        assertTrue(new TtlCache<String, String>(Duration.ofMinutes(5), clock).get("MSFT").isEmpty());
    }

    @Test
    void dropsExpiredEntriesSoItDoesNotGrowForever() {
        TtlCache<String, String> cache = new TtlCache<>(Duration.ofMinutes(5), clock);
        cache.put("A", "1");
        now = now.plus(Duration.ofMinutes(6));
        cache.put("B", "2");

        assertEquals(1, cache.size(), "the expired entry was dropped on the next put");
    }
}
