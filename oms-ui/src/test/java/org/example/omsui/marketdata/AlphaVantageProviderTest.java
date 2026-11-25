package org.example.omsui.marketdata;

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
 * SPEC-0072 AC-5, AC-6, AC-7: Alpha Vantage's answers mapped to the market data API, and every way
 * it can fail turned into "unavailable" (so the service falls back), never an error for the user.
 * The JSON is as Alpha Vantage returns it.
 */
class AlphaVantageProviderTest {

    private static final String KEY = "SECRET-KEY-123";

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
    void mapsSymbolSearch() {
        server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://www.alphavantage.co/query")))
                .andExpect(queryParam("function", "SYMBOL_SEARCH"))
                .andExpect(queryParam("keywords", "micro"))
                .andExpect(queryParam("apikey", KEY))
                .andRespond(withSuccess("""
                        {"bestMatches":[
                          {"1. symbol":"MSFT","2. name":"Microsoft Corporation","3. type":"Equity",
                           "4. region":"United States","5. marketOpen":"09:30","6. marketClose":"16:00",
                           "7. timezone":"UTC-04","8. currency":"USD","9. matchScore":"0.6154"},
                          {"1. symbol":"MCHP","2. name":"Microchip Technology Inc","3. type":"Equity",
                           "4. region":"United States","8. currency":"USD","9. matchScore":"0.5"}]}""",
                        MediaType.APPLICATION_JSON));

        List<Instrument> found = provider.search("micro");

        assertEquals(2, found.size());
        Instrument msft = found.get(0);
        assertEquals("MSFT", msft.getSymbol());
        assertEquals("Microsoft Corporation", msft.getName());
        assertEquals("Equity", msft.getType());
        assertEquals("United States", msft.getRegion());
        assertEquals("USD", msft.getCurrency());
        server.verify();
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

    /** Alpha Vantage answers 200 with a Note or Information member when the quota is spent. */
    @Test
    void aRateLimitAnswerIsUnavailable() {
        server.expect(queryParam("function", "SYMBOL_SEARCH"))
                .andRespond(withSuccess("""
                        {"Information":"We have detected your API key as SECRET-KEY-123 and our standard API rate limit is 25 requests per day."}""",
                        MediaType.APPLICATION_JSON));
        server.expect(queryParam("function", "GLOBAL_QUOTE"))
                .andRespond(withSuccess("{\"Note\":\"Thank you for using Alpha Vantage! Our standard API call frequency is 5 calls per minute.\"}",
                        MediaType.APPLICATION_JSON));

        ProviderUnavailableException search = assertThrows(ProviderUnavailableException.class, () -> provider.search("aa"));
        assertEquals(ProviderUnavailableException.Reason.RATE_LIMITED, search.reason());
        assertFalse(search.getMessage().contains(KEY), "the provider's message, which may echo the key, is not passed on");
        assertEquals(ProviderUnavailableException.Reason.RATE_LIMITED,
                assertThrows(ProviderUnavailableException.class, () -> provider.quote("AAPL")).reason());
    }

    /** A query is data, not a URI template: braces reach Alpha Vantage encoded, not as variables. */
    @Test
    void encodesTheQuery() {
        server.expect(requestTo(org.hamcrest.Matchers.containsString("keywords=a%7Bb%7D%20%26c")))
                .andRespond(withSuccess("{\"bestMatches\":[]}", MediaType.APPLICATION_JSON));

        assertTrue(provider.search("a{b} &c").isEmpty());
        server.verify();
    }

    /** "Error Message" (e.g. an unknown function or a bad key) and unknown shapes are not data. */
    @Test
    void anErrorMessageOrAnUnknownAnswerIsUnavailable() {
        server.expect(queryParam("function", "SYMBOL_SEARCH"))
                .andRespond(withSuccess("{\"Error Message\":\"Invalid API call.\"}", MediaType.APPLICATION_JSON));
        server.expect(queryParam("function", "GLOBAL_QUOTE"))
                .andRespond(withSuccess("{\"something\":\"else\"}", MediaType.APPLICATION_JSON));

        assertEquals(ProviderUnavailableException.Reason.UNREACHABLE,
                assertThrows(ProviderUnavailableException.class, () -> provider.search("aa")).reason());
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
                assertThrows(ProviderUnavailableException.class, () -> unconfigured.search("aa")).reason());
        assertFalse(unconfigured.isConfigured());
        assertTrue(provider.isConfigured());
    }
}
