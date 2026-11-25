package org.example.simulator.marketdata;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;

import org.example.simulator.metrics.SimulatorMetrics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/**
 * SPEC-0073 AC-2, AC-4, AC-5, AC-9: where the venue's reference price comes from. The cache comes
 * first, then Alpha Vantage, then the static prices. A failing provider is left alone for the
 * back-off, and every lookup is counted by where its price came from.
 */
class ReferencePriceServiceTest {

    private static final Duration TTL = Duration.ofMinutes(5);
    private static final Duration BACKOFF = Duration.ofSeconds(60);
    private static final Map<String, BigDecimal> STATIC =
            Map.of("AAPL", new BigDecimal("170.00"), "MSFT", new BigDecimal("420.00"));

    private final MutableClock clock = new MutableClock();
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private AlphaVantageQuoteClient client;
    private ReferencePriceService service;

    @BeforeEach
    void setUp() {
        client = mock(AlphaVantageQuoteClient.class);
        when(client.isConfigured()).thenReturn(true);
        service = new ReferencePriceService(client, STATIC, TTL, BACKOFF, clock, new SimulatorMetrics(meters));
    }

    // AC-2
    @Test
    void providerPriceWinsOverStaticPrice() {
        when(client.lastPrice("AAPL")).thenReturn(Optional.of(new BigDecimal("189.50")));

        assertEquals(Optional.of(new BigDecimal("189.50")), service.referencePrice("AAPL"));
        assertEquals(1.0, lookups("ALPHA_VANTAGE", "FOUND"));
    }

    @Test
    void symbolOnlyKnownToProvider_isPriced() {
        when(client.lastPrice("GOOGL")).thenReturn(Optional.of(new BigDecimal("141.80")));

        assertEquals(Optional.of(new BigDecimal("141.80")), service.referencePrice("GOOGL"));
    }

    @Test
    void providerHasNoQuote_staticPriceIsUsed_elseEmpty() {
        when(client.lastPrice(anyString())).thenReturn(Optional.empty());

        assertEquals(Optional.of(new BigDecimal("170.00")), service.referencePrice("AAPL"));
        assertEquals(Optional.empty(), service.referencePrice("ZZZZ"));
        assertEquals(1.0, lookups("STATIC", "NOT_FOUND"));
        assertEquals(1.0, lookups("NONE", "NOT_FOUND"));
    }

    // AC-4
    @Test
    void notConfigured_usesStaticWithoutRequest() {
        when(client.isConfigured()).thenReturn(false);

        assertEquals(Optional.of(new BigDecimal("170.00")), service.referencePrice("AAPL"));
        assertEquals(Optional.empty(), service.referencePrice("GOOGL"));
        verify(client, never()).lastPrice(anyString());
        assertEquals(1.0, lookups("STATIC", "NOT_CONFIGURED"));
        assertEquals(1.0, lookups("NONE", "NOT_CONFIGURED"));
    }

    // AC-4
    @Test
    void rateLimited_fallsBackToStatic() {
        when(client.lastPrice("MSFT")).thenThrow(new ProviderUnavailableException(ProviderUnavailableException.Reason.RATE_LIMITED));

        assertEquals(Optional.of(new BigDecimal("420.00")), service.referencePrice("MSFT"));
        assertEquals(1.0, lookups("STATIC", "RATE_LIMITED"));
    }

    // AC-4
    @Test
    void unreachable_fallsBackToStatic() {
        when(client.lastPrice("AAPL")).thenThrow(new ProviderUnavailableException(ProviderUnavailableException.Reason.UNREACHABLE));

        assertEquals(Optional.of(new BigDecimal("170.00")), service.referencePrice("AAPL"));
        assertEquals(1.0, lookups("STATIC", "UNREACHABLE"));
    }

    // AC-4
    @Test
    void unavailableAndNotStatic_isEmpty() {
        when(client.lastPrice("GOOGL")).thenThrow(new ProviderUnavailableException(ProviderUnavailableException.Reason.UNREACHABLE));

        assertEquals(Optional.empty(), service.referencePrice("GOOGL"));
        assertEquals(1.0, lookups("NONE", "UNREACHABLE"));
    }

    // AC-4: a lookup never throws on the engine thread, so no order is left unanswered.
    @Test
    void unexpectedFailure_fallsBackAsUnreachable() {
        when(client.lastPrice("AAPL")).thenThrow(new IllegalStateException("bug"));

        assertEquals(Optional.of(new BigDecimal("170.00")), service.referencePrice("AAPL"));
        assertEquals(1.0, lookups("STATIC", "UNREACHABLE"));
    }

    // AC-4: a failing provider costs at most one call per back-off period.
    @Test
    void backoff_skipsProviderUntilItExpires() {
        when(client.lastPrice(anyString()))
                .thenThrow(new ProviderUnavailableException(ProviderUnavailableException.Reason.RATE_LIMITED))
                .thenReturn(Optional.of(new BigDecimal("190.00")));

        service.referencePrice("AAPL");
        clock.advance(BACKOFF.minusSeconds(1));
        assertEquals(Optional.of(new BigDecimal("420.00")), service.referencePrice("MSFT"));
        verify(client, times(1)).lastPrice(anyString());
        assertEquals(2.0, lookups("STATIC", "RATE_LIMITED"), "the reason holds through the back-off");

        clock.advance(Duration.ofSeconds(1));
        assertEquals(Optional.of(new BigDecimal("190.00")), service.referencePrice("AAPL"));
        verify(client, times(2)).lastPrice(anyString());
    }

    // AC-5
    @Test
    void cachedWithinTtl_noSecondRequest_refetchedAfterTtl() {
        when(client.lastPrice("KO"))
                .thenReturn(Optional.of(new BigDecimal("60.10")))
                .thenReturn(Optional.of(new BigDecimal("61.00")));

        assertEquals(Optional.of(new BigDecimal("60.10")), service.referencePrice("KO"));
        clock.advance(TTL.minusSeconds(1));
        assertEquals(Optional.of(new BigDecimal("60.10")), service.referencePrice("ko"));
        verify(client, times(1)).lastPrice(anyString());

        clock.advance(Duration.ofSeconds(1));
        assertEquals(Optional.of(new BigDecimal("61.00")), service.referencePrice("KO"));
        verify(client, times(2)).lastPrice(anyString());
    }

    // AC-5
    @Test
    void notFoundIsCachedToo() {
        when(client.lastPrice("ZZZZ")).thenReturn(Optional.empty());

        service.referencePrice("ZZZZ");
        service.referencePrice("ZZZZ");

        verify(client, times(1)).lastPrice("ZZZZ");
        assertEquals(2.0, lookups("NONE", "NOT_FOUND"));
    }

    @Test
    void fallbacksAreNotCached() {
        when(client.lastPrice("AAPL"))
                .thenThrow(new ProviderUnavailableException(ProviderUnavailableException.Reason.UNREACHABLE))
                .thenReturn(Optional.of(new BigDecimal("190.00")));

        service.referencePrice("AAPL");
        clock.advance(BACKOFF);

        assertEquals(Optional.of(new BigDecimal("190.00")), service.referencePrice("AAPL"));
    }

    // AC-9
    @Test
    void lookupsCountedBySourceAndOutcome() {
        when(client.lastPrice("AAPL")).thenReturn(Optional.of(new BigDecimal("189.50")));
        when(client.lastPrice("ZZZZ")).thenReturn(Optional.empty());

        service.referencePrice("AAPL"); // ALPHA_VANTAGE / FOUND
        service.referencePrice("AAPL"); // CACHE / FOUND
        service.referencePrice("AAPL"); // CACHE / FOUND
        service.referencePrice("ZZZZ"); // NONE / NOT_FOUND

        assertEquals(1.0, lookups("ALPHA_VANTAGE", "FOUND"));
        assertEquals(2.0, lookups("CACHE", "FOUND"));
        assertEquals(1.0, lookups("NONE", "NOT_FOUND"));
        assertEquals(4.0, meters.find("simulator.reference.price.lookups").counters().stream().mapToDouble(c -> c.count()).sum());
    }

    private double lookups(String source, String outcome) {
        var counter = meters.find("simulator.reference.price.lookups").tag("source", source).tag("outcome", outcome).counter();
        return counter == null ? 0.0 : counter.count();
    }

    private static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-11-25T10:00:00Z");

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
