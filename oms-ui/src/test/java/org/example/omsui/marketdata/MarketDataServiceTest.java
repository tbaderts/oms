package org.example.omsui.marketdata;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.example.common.model.marketdata.Instrument;
import org.example.common.model.marketdata.InstrumentSearchResult;
import org.example.common.model.marketdata.MarketDataSource;
import org.example.common.model.marketdata.Quote;
import org.junit.jupiter.api.Test;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/**
 * SPEC-0072 AC-7, AC-8: provider answers are cached for their time to live; when the provider cannot
 * answer, the built-in instruments are used, with a notice, and that fallback is not cached.
 */
class MarketDataServiceTest {

    private Instant now = Instant.parse("2026-11-24T10:00:00Z");
    private final Clock clock = new Clock() {
        @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    };

    private final MarketDataProvider provider = mock(MarketDataProvider.class);
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();

    private final BuiltInMarketData builtIn = new BuiltInMarketData(List.of(
            new MarketDataProperties.BuiltInInstrument("AAPL", "Apple Inc.", "USD", new BigDecimal("170.00")),
            new MarketDataProperties.BuiltInInstrument("MSFT", "Microsoft Corporation", "USD", new BigDecimal("420.00")),
            new MarketDataProperties.BuiltInInstrument("INTC", "Intel Corporation", "USD", new BigDecimal("86.96"))));

    private final MarketDataService service =
            new MarketDataService(provider, builtIn, Duration.ofHours(24), Duration.ofMinutes(5), clock, meters);

    /** AC-8 */
    @Test
    void answersRepeatedRequestsFromTheCache() {
        when(provider.search("micro")).thenReturn(List.of(Instrument.builder().symbol("MSFT").build()));
        when(provider.quote("MSFT")).thenReturn(Optional.of(Quote.builder().symbol("MSFT").last(new BigDecimal("421"))
                .source(MarketDataSource.ALPHA_VANTAGE).build()));

        service.search("micro");
        InstrumentSearchResult again = service.search(" Micro ");
        service.quote("MSFT");
        Quote quoteAgain = service.quote("msft").orElseThrow();

        verify(provider, times(1)).search("micro");
        verify(provider, times(1)).quote("MSFT");
        assertEquals(MarketDataSource.ALPHA_VANTAGE, again.getSource());
        assertEquals(0, new BigDecimal("421").compareTo(quoteAgain.getLast()));
    }

    /** AC-8 */
    @Test
    void expiresAfterTtl() {
        when(provider.quote("MSFT")).thenReturn(Optional.of(Quote.builder().symbol("MSFT").source(MarketDataSource.ALPHA_VANTAGE).build()));

        service.quote("MSFT");
        now = now.plus(Duration.ofMinutes(5));
        service.quote("MSFT");

        verify(provider, times(2)).quote("MSFT");
    }

    /** AC-7: the built-in list, with a notice saying why. */
    @Test
    void fallsBackToTheBuiltInInstrumentsWithANotice() {
        when(provider.search("in")).thenThrow(new ProviderUnavailableException(ProviderUnavailableException.Reason.NOT_CONFIGURED, null));

        InstrumentSearchResult result = service.search("in");

        assertEquals(MarketDataSource.BUILT_IN, result.getSource());
        assertEquals("Market data provider not configured", result.getNotice());
        assertEquals(List.of("INTC", "AAPL"), result.getInstruments().stream().map(Instrument::getSymbol).toList(),
                "symbol matches first, then name matches (Apple Inc.)");
        assertEquals("Intel Corporation", result.getInstruments().get(0).getName());
    }

    /** AC-7, AC-8: a fallback is not cached, so data returns as soon as the provider does. */
    @Test
    void doesNotCacheFallbacks() {
        when(provider.quote("AAPL"))
                .thenThrow(new ProviderUnavailableException(ProviderUnavailableException.Reason.RATE_LIMITED, null))
                .thenReturn(Optional.of(Quote.builder().symbol("AAPL").last(new BigDecimal("171.5")).source(MarketDataSource.ALPHA_VANTAGE).build()));

        Quote fallback = service.quote("AAPL").orElseThrow();
        Quote live = service.quote("AAPL").orElseThrow();

        assertEquals(MarketDataSource.BUILT_IN, fallback.getSource());
        assertEquals(0, new BigDecimal("170.00").compareTo(fallback.getLast()));
        assertEquals("Market data provider rate limit reached", fallback.getNotice());
        assertNull(fallback.getBid());
        assertEquals("USD", fallback.getCurrency());
        assertEquals(MarketDataSource.ALPHA_VANTAGE, live.getSource());
        verify(provider, times(2)).quote("AAPL");
    }

    /** A blank query matches nothing and spends no provider quota. */
    @Test
    void aBlankQueryIsNotSentToTheProvider() {
        InstrumentSearchResult result = service.search("   ");

        assertTrue(result.getInstruments().isEmpty());
        org.mockito.Mockito.verifyNoInteractions(provider);
    }

    @Test
    void aSymbolNobodyKnowsHasNoQuote() {
        when(provider.quote("ZZZZ")).thenReturn(Optional.empty());

        assertTrue(service.quote("ZZZZ").isEmpty());
    }

    @Test
    void aBuiltInSymbolTheProviderDoesNotKnowStillHasAQuote() {
        when(provider.quote("INTC")).thenReturn(Optional.empty());

        assertEquals(MarketDataSource.BUILT_IN, service.quote("INTC").orElseThrow().getSource());
    }

    @Test
    void countsRequestsBySourceAndOutcome() {
        when(provider.search("in")).thenThrow(new ProviderUnavailableException(ProviderUnavailableException.Reason.UNREACHABLE, null));

        service.search("in");

        assertEquals(1.0, meters.counter("oms.ui.marketdata.requests", "kind", "search", "source", "BUILT_IN",
                "outcome", "UNREACHABLE").count());
    }
}
