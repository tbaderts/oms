package org.example.price.provider;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.math.BigDecimal;
import java.util.List;

import org.example.common.model.marketdata.Instrument;
import org.example.common.model.marketdata.MarketDataSource;
import org.example.common.model.marketdata.Quote;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

/**
 * Alpha Vantage's answers mapped to the market data models, and every way it can fail turned into
 * "unavailable", so the price service falls back (SPEC-0072, moved here by SPEC-0079, which adds
 * LISTING_STATUS for the instrument list). The bodies are as Alpha Vantage returns them.
 */
class AlphaVantageProviderTest {

    private static final String KEY = "SECRET-KEY-123";
    private static final MediaType CSV = MediaType.parseMediaType("application/x-download");

    private MockRestServiceServer server;
    private AlphaVantageProvider provider;
    private ListAppender<ILoggingEvent> logs;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        provider = new AlphaVantageProvider(builder, "https://www.alphavantage.co", KEY);
        logs = new ListAppender<>();
        logs.start();
        ((Logger) LoggerFactory.getLogger(AlphaVantageProvider.class)).addAppender(logs);
    }

    @AfterEach
    void tearDown() {
        ((Logger) LoggerFactory.getLogger(AlphaVantageProvider.class)).detachAppender(logs);
        assertTrue(logs.list.stream().noneMatch(e -> e.getFormattedMessage().contains(KEY)),
                "the API key is never logged");
    }

    @Test
    void mapsListingStatus() {
        server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://www.alphavantage.co/query")))
                .andExpect(queryParam("function", "LISTING_STATUS"))
                .andExpect(queryParam("state", "active"))
                .andExpect(queryParam("apikey", KEY))
                .andRespond(withSuccess("""
                        symbol,name,exchange,assetType,ipoDate,delistingDate,status\r
                        A,Agilent Technologies Inc,NYSE,Stock,1999-11-18,null,Active\r
                        BRK-A,"Berkshire Hathaway, Inc.",NYSE,Stock,1980-03-17,null,Active\r
                        SPY,SPDR S&P 500 ETF Trust,NYSE ARCA,ETF,1993-01-29,null,Active\r
                        """, CSV));

        List<Instrument> listings = provider.listings();

        assertEquals(3, listings.size());
        Instrument brk = listings.get(1);
        assertEquals("BRK-A", brk.getSymbol());
        assertEquals("Berkshire Hathaway, Inc.", brk.getName());
        assertEquals("Stock", brk.getType());
        assertEquals("NYSE", brk.getRegion());
        assertEquals("USD", brk.getCurrency());
        assertEquals("ETF", listings.get(2).getType());
        server.verify();
    }

    @Test
    void skipsListingRowsWithoutASymbol() {
        server.expect(queryParam("function", "LISTING_STATUS"))
                .andRespond(withSuccess("symbol,name,exchange,assetType,ipoDate,delistingDate,status\n,No symbol,NYSE,Stock,,null,Active\nIBM,IBM,NYSE,Stock,,null,Active\n", CSV));

        assertEquals(List.of("IBM"), provider.listings().stream().map(Instrument::getSymbol).toList());
    }

    @Test
    void mapsGlobalQuote() {
        server.expect(queryParam("function", "GLOBAL_QUOTE"))
                .andExpect(queryParam("symbol", "IBM"))
                .andRespond(withSuccess("""
                        {"Global Quote":{"01. symbol":"IBM","02. open":"248.10","03. high":"251.20",
                          "04. low":"247.50","05. price":"250.35","06. volume":"3012345",
                          "07. latest trading day":"2026-11-23","08. previous close":"249.00",
                          "09. change":"1.35","10. change percent":"0.5422%"}}""",
                        MediaType.APPLICATION_JSON));

        Quote quote = provider.quote("IBM").orElseThrow();

        assertEquals("IBM", quote.getSymbol());
        assertEquals(0, new BigDecimal("250.35").compareTo(quote.getLast()));
        assertEquals(0, new BigDecimal("1.35").compareTo(quote.getChange()));
        assertEquals(0, new BigDecimal("0.5422").compareTo(quote.getChangePercent()));
        assertEquals(0, new BigDecimal("251.20").compareTo(quote.getHigh()));
        assertEquals(0, new BigDecimal("247.50").compareTo(quote.getLow()));
        assertEquals(0, new BigDecimal("249.00").compareTo(quote.getPreviousClose()));
        assertEquals("2026-11-23", quote.getAsOf());
        assertNull(quote.getBid(), "the free quote has no bid");
        assertNull(quote.getAsk(), "the free quote has no ask");
        assertEquals(MarketDataSource.ALPHA_VANTAGE, quote.getSource());
    }

    @Test
    void anEmptyQuoteIsNotFound() {
        server.expect(queryParam("function", "GLOBAL_QUOTE"))
                .andRespond(withSuccess("{\"Global Quote\":{}}", MediaType.APPLICATION_JSON));

        assertFalse(provider.quote("NOPE").isPresent());
    }

    /**
     * Alpha Vantage answers 200 with a Note or Information member when the quota is spent, for the
     * CSV listing too (a JSON body instead of CSV).
     */
    @Test
    void aRateLimitAnswerIsUnavailable() {
        server.expect(queryParam("function", "LISTING_STATUS"))
                .andRespond(withSuccess("""
                        {"Information":"We have detected your API key as SECRET-KEY-123 and our standard API rate limit is 25 requests per day."}""",
                        MediaType.APPLICATION_JSON));
        server.expect(queryParam("function", "GLOBAL_QUOTE"))
                .andRespond(withSuccess("{\"Note\":\"Thank you for using Alpha Vantage! Our standard API call frequency is 5 calls per minute.\"}",
                        MediaType.APPLICATION_JSON));

        ProviderUnavailableException listing = assertThrows(ProviderUnavailableException.class, () -> provider.listings());
        assertEquals(ProviderUnavailableException.Reason.RATE_LIMITED, listing.reason());
        assertFalse(listing.getMessage().contains(KEY), "the provider's message, which may echo the key, is not passed on");
        assertEquals(ProviderUnavailableException.Reason.RATE_LIMITED,
                assertThrows(ProviderUnavailableException.class, () -> provider.quote("AAPL")).reason());
    }

    /** A symbol is data, not a URI template: braces reach Alpha Vantage encoded, not as variables. */
    @Test
    void encodesTheSymbol() {
        server.expect(requestTo(org.hamcrest.Matchers.containsString("symbol=a%7Bb%7D%20%26c")))
                .andRespond(withSuccess("{\"Global Quote\":{}}", MediaType.APPLICATION_JSON));

        assertTrue(provider.quote("a{b} &c").isEmpty());
        server.verify();
    }

    /** "Error Message" (e.g. a bad key), an unknown shape or CSV without the listing header are not data. */
    @Test
    void anErrorMessageOrAnUnknownAnswerIsUnavailable() {
        server.expect(queryParam("function", "LISTING_STATUS"))
                .andRespond(withSuccess("{\"Error Message\":\"Invalid API call.\"}", MediaType.APPLICATION_JSON));
        server.expect(queryParam("function", "LISTING_STATUS"))
                .andRespond(withSuccess("not,a,listing\n1,2,3\n", CSV));
        server.expect(queryParam("function", "GLOBAL_QUOTE"))
                .andRespond(withSuccess("{\"something\":\"else\"}", MediaType.APPLICATION_JSON));

        assertEquals(ProviderUnavailableException.Reason.UNREACHABLE,
                assertThrows(ProviderUnavailableException.class, () -> provider.listings()).reason());
        assertEquals(ProviderUnavailableException.Reason.UNREACHABLE,
                assertThrows(ProviderUnavailableException.class, () -> provider.listings()).reason());
        assertEquals(ProviderUnavailableException.Reason.UNREACHABLE,
                assertThrows(ProviderUnavailableException.class, () -> provider.quote("AAPL")).reason());
    }

    @Test
    void anHttpErrorIsUnavailable() {
        server.expect(queryParam("function", "GLOBAL_QUOTE")).andRespond(withServerError());

        assertEquals(ProviderUnavailableException.Reason.UNREACHABLE,
                assertThrows(ProviderUnavailableException.class, () -> provider.quote("AAPL")).reason());
    }

    @Test
    void withoutAKeyNothingIsCalled() {
        AlphaVantageProvider unconfigured = new AlphaVantageProvider(RestClient.builder(), "https://example.invalid", "");

        assertEquals(ProviderUnavailableException.Reason.NOT_CONFIGURED,
                assertThrows(ProviderUnavailableException.class, () -> unconfigured.listings()).reason());
        assertEquals(ProviderUnavailableException.Reason.NOT_CONFIGURED,
                assertThrows(ProviderUnavailableException.class, () -> unconfigured.quote("AAPL")).reason());
        assertFalse(unconfigured.isConfigured());
        assertTrue(provider.isConfigured());
    }
}
