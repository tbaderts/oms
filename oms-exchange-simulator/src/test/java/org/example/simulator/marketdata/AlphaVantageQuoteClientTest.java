package org.example.simulator.marketdata;

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
import java.util.Optional;

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
 * SPEC-0073 AC-1, AC-3, AC-4, AC-8: Alpha Vantage's GLOBAL_QUOTE as the venue's reference price,
 * every way it can fail turned into "unavailable" with a reason, and the API key never logged or
 * passed on. The JSON is as Alpha Vantage returns it.
 */
class AlphaVantageQuoteClientTest {

    private static final String KEY = "SECRET-KEY-123";

    private MockRestServiceServer server;
    private AlphaVantageQuoteClient client;
    private ListAppender<ILoggingEvent> logs;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        client = new AlphaVantageQuoteClient(builder, "https://www.alphavantage.co", KEY);
        logs = new ListAppender<>();
        logs.start();
        ((Logger) LoggerFactory.getLogger(AlphaVantageQuoteClient.class)).addAppender(logs);
    }

    // AC-8
    @AfterEach
    void tearDown() {
        ((Logger) LoggerFactory.getLogger(AlphaVantageQuoteClient.class)).detachAppender(logs);
        assertTrue(logs.list.stream().noneMatch(e -> e.getFormattedMessage().contains(KEY)), "the API key is never logged");
        assertTrue(logs.list.stream().allMatch(e -> e.getThrowableProxy() == null), "exceptions, which can hold the URL, are not logged");
    }

    // AC-1
    @Test
    void globalQuote_returnsLastPrice() {
        server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://www.alphavantage.co/query")))
                .andExpect(queryParam("function", "GLOBAL_QUOTE"))
                .andExpect(queryParam("symbol", "GOOGL"))
                .andExpect(queryParam("apikey", KEY))
                .andRespond(withSuccess("""
                        {"Global Quote":{"01. symbol":"GOOGL","02. open":"140.10","03. high":"142.20",
                          "04. low":"139.50","05. price":"141.80","06. volume":"3012345",
                          "07. latest trading day":"2026-11-24","08. previous close":"140.00",
                          "09. change":"1.80","10. change percent":"1.2857%"}}""",
                        MediaType.APPLICATION_JSON));

        assertEquals(Optional.of(new BigDecimal("141.80")), client.lastPrice("GOOGL"));
        server.verify();
    }

    // AC-3
    @Test
    void emptyGlobalQuote_isNotFound() {
        server.expect(queryParam("function", "GLOBAL_QUOTE"))
                .andRespond(withSuccess("{\"Global Quote\":{}}", MediaType.APPLICATION_JSON));

        assertEquals(Optional.empty(), client.lastPrice("ZZZZ"));
    }

    @Test
    void quoteWithoutAUsablePrice_isNotFound() {
        server.expect(queryParam("function", "GLOBAL_QUOTE"))
                .andRespond(withSuccess("{\"Global Quote\":{\"01. symbol\":\"X\",\"05. price\":\"n/a\"}}", MediaType.APPLICATION_JSON));

        assertEquals(Optional.empty(), client.lastPrice("X"));
    }

    // AC-4, AC-8: the quota answers echo the key; it is not passed on.
    @Test
    void noteAnswer_isRateLimited() {
        server.expect(queryParam("function", "GLOBAL_QUOTE"))
                .andRespond(withSuccess("{\"Note\":\"Thank you for using Alpha Vantage! Your key " + KEY + " is limited to 5 calls per minute.\"}",
                        MediaType.APPLICATION_JSON));

        assertUnavailable(ProviderUnavailableException.Reason.RATE_LIMITED);
    }

    // AC-4, AC-8
    @Test
    void informationAnswer_isRateLimited() {
        server.expect(queryParam("function", "GLOBAL_QUOTE"))
                .andRespond(withSuccess("{\"Information\":\"We have detected your API key as " + KEY + " and our standard API rate limit is 25 requests per day.\"}",
                        MediaType.APPLICATION_JSON));

        assertUnavailable(ProviderUnavailableException.Reason.RATE_LIMITED);
    }

    // AC-4
    @Test
    void serverError_isUnreachable() {
        server.expect(queryParam("function", "GLOBAL_QUOTE")).andRespond(withServerError());

        assertUnavailable(ProviderUnavailableException.Reason.UNREACHABLE);
    }

    // AC-4: no answer within the read timeout.
    @Test
    void readTimeout_isUnreachable() {
        server.expect(queryParam("function", "GLOBAL_QUOTE")).andRespond(request -> {
            throw new java.net.SocketTimeoutException("Read timed out");
        });

        assertUnavailable(ProviderUnavailableException.Reason.UNREACHABLE);
    }

    // AC-4, AC-8
    @Test
    void errorMessageAnswer_isUnreachable() {
        server.expect(queryParam("function", "GLOBAL_QUOTE"))
                .andRespond(withSuccess("{\"Error Message\":\"Invalid API call for apikey=" + KEY + ".\"}", MediaType.APPLICATION_JSON));

        assertUnavailable(ProviderUnavailableException.Reason.UNREACHABLE);
    }

    @Test
    void unknownShapeOrInvalidJson_isUnreachable() {
        server.expect(queryParam("function", "GLOBAL_QUOTE"))
                .andRespond(withSuccess("{\"something\":\"else\"}", MediaType.APPLICATION_JSON));
        server.expect(queryParam("function", "GLOBAL_QUOTE"))
                .andRespond(withSuccess("<html>not json</html>", MediaType.TEXT_HTML));

        assertUnavailable(ProviderUnavailableException.Reason.UNREACHABLE);
        assertUnavailable(ProviderUnavailableException.Reason.UNREACHABLE);
    }

    // AC-4
    @Test
    void notConfigured_makesNoRequest() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer noCalls = MockRestServiceServer.bindTo(builder).build();
        AlphaVantageQuoteClient unconfigured = new AlphaVantageQuoteClient(builder, "https://example.invalid", "  ");

        assertFalse(unconfigured.isConfigured());
        assertTrue(client.isConfigured());
        assertEquals(ProviderUnavailableException.Reason.NOT_CONFIGURED,
                assertThrows(ProviderUnavailableException.class, () -> unconfigured.lastPrice("AAPL")).reason());
        noCalls.verify();
    }

    /** A symbol is data, not a URI template: it reaches Alpha Vantage encoded. */
    @Test
    void encodesTheSymbol() {
        server.expect(requestTo(org.hamcrest.Matchers.containsString("symbol=BRK%7Bb%7D%20%26x")))
                .andRespond(withSuccess("{\"Global Quote\":{}}", MediaType.APPLICATION_JSON));

        assertEquals(Optional.empty(), client.lastPrice("BRK{b} &x"));
        server.verify();
    }

    // AC-8
    @Test
    void exceptionsNeverCarryTheKey() {
        server.expect(queryParam("function", "GLOBAL_QUOTE")).andRespond(withServerError());

        ProviderUnavailableException e = assertThrows(ProviderUnavailableException.class, () -> client.lastPrice("AAPL"));
        assertFalse(e.getMessage().contains(KEY));
        assertNull(e.getCause(), "the cause can hold the URL, so it is not kept");
    }

    private void assertUnavailable(ProviderUnavailableException.Reason expected) {
        ProviderUnavailableException e = assertThrows(ProviderUnavailableException.class, () -> client.lastPrice("AAPL"));
        assertEquals(expected, e.reason());
        assertFalse(e.getMessage().contains(KEY), "the provider's message, which may echo the key, is not passed on");
    }
}
