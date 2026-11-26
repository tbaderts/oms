package org.example.omsui.marketdata;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.math.BigDecimal;

import org.example.common.model.marketdata.MarketDataSource;
import org.example.common.model.marketdata.Quote;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** oms-ui's client of the price service (SPEC-0079 AC-10): its answers as the generated models. */
class PriceServiceClientTest {

    private MockRestServiceServer server;
    private PriceServiceClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        client = new PriceServiceClient(builder, "http://price-service:8098");
    }

    @Test
    void readsASearchResult() {
        server.expect(requestTo("http://price-service:8098/api/market-data/instruments?query=micro%20soft"))
                .andRespond(withSuccess("""
                        {"instruments":[{"symbol":"MSFT","name":"Microsoft Corporation"}],"source":"REFERENCE_DATA"}""",
                        MediaType.APPLICATION_JSON));

        var result = client.search("micro soft");

        assertEquals(MarketDataSource.REFERENCE_DATA, result.getSource());
        assertEquals("MSFT", result.getInstruments().get(0).getSymbol());
        server.verify();
    }

    @Test
    void readsAQuoteAndEncodesTheSymbol() {
        server.expect(requestTo("http://price-service:8098/api/market-data/quotes/BRK%2FA"))
                .andRespond(withSuccess("""
                        {"symbol":"BRK/A","last":712000.5,"asOf":"2026-11-25","source":"END_OF_DAY","notice":"limit"}""",
                        MediaType.APPLICATION_JSON));

        Quote quote = client.quote("BRK/A").orElseThrow();

        assertEquals(0, new BigDecimal("712000.5").compareTo(quote.getLast()));
        assertEquals(MarketDataSource.END_OF_DAY, quote.getSource());
        assertEquals("limit", quote.getNotice());
    }

    @Test
    void notFoundIsEmpty() {
        server.expect(requestTo("http://price-service:8098/api/market-data/quotes/NOPE"))
                .andRespond(withStatus(HttpStatus.NOT_FOUND).contentType(MediaType.APPLICATION_PROBLEM_JSON)
                        .body("{\"type\":\"urn:oms:error:not-found\"}"));

        assertTrue(client.quote("NOPE").isEmpty());
    }

    @Test
    void aServerErrorOrNoServerIsUnavailable() {
        server.expect(requestTo("http://price-service:8098/api/market-data/quotes/AAPL")).andRespond(withServerError());

        assertThrows(PriceServiceUnavailableException.class, () -> client.quote("AAPL"));

        PriceServiceClient nobody = new PriceServiceClient(RestClient.builder(), "http://127.0.0.1:1");
        assertThrows(PriceServiceUnavailableException.class, () -> nobody.search("aa"));
    }
}
