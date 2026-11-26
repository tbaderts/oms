package org.example.simulator.marketdata;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

/**
 * The venue's client of the price service (SPEC-0079 AC-9): the quote's last price, "no price" for a
 * 404, and "unavailable" for anything that is not an answer.
 */
class PriceServiceQuoteClientTest {

    private StubPriceService priceService;
    private PriceServiceQuoteClient client;

    @BeforeEach
    void setUp() {
        priceService = new StubPriceService();
        client = new PriceServiceQuoteClient(RestClient.builder(), priceService.baseUrl());
    }

    @AfterEach
    void tearDown() {
        priceService.close();
    }

    @Test
    void readsTheLastPriceWhateverItsSource() {
        priceService.quote("ORCL", "191.50");
        priceService.quote("AAPL", "170.00", "END_OF_DAY");

        assertEquals(Optional.of(new BigDecimal("191.50")), client.lastPrice("ORCL"));
        assertEquals(Optional.of(new BigDecimal("170.00")), client.lastPrice("AAPL"));
    }

    @Test
    void notFoundIsEmpty() {
        assertEquals(Optional.empty(), client.lastPrice("ZZZZ"));
        assertEquals(1, priceService.requestsFor("ZZZZ"));
    }

    @Test
    void aQuoteWithoutAPositiveLastIsEmpty() {
        priceService.answer("NOLAST", "{\"symbol\":\"NOLAST\",\"source\":\"END_OF_DAY\"}");
        priceService.answer("ZERO", "{\"symbol\":\"ZERO\",\"last\":0,\"source\":\"END_OF_DAY\"}");

        assertEquals(Optional.empty(), client.lastPrice("NOLAST"));
        assertEquals(Optional.empty(), client.lastPrice("ZERO"));
    }

    @Test
    void encodesTheSymbol() {
        priceService.quote("BRK/A", "712000.50");

        assertEquals(Optional.of(new BigDecimal("712000.50")), client.lastPrice("BRK/A"));
    }

    @Test
    void notFoundIsEmptyAndErrorsAreUnavailable() {
        priceService.failing(true);
        assertEquals(ProviderUnavailableException.Reason.UNREACHABLE,
                assertThrows(ProviderUnavailableException.class, () -> client.lastPrice("AAPL")).reason());

        priceService.failing(false);
        priceService.answer("BAD", "not json");
        assertEquals(ProviderUnavailableException.Reason.UNREACHABLE,
                assertThrows(ProviderUnavailableException.class, () -> client.lastPrice("BAD")).reason());

        PriceServiceQuoteClient nobody = new PriceServiceQuoteClient(RestClient.builder(), "http://127.0.0.1:1");
        assertEquals(ProviderUnavailableException.Reason.UNREACHABLE,
                assertThrows(ProviderUnavailableException.class, () -> nobody.lastPrice("AAPL")).reason());
    }

    @Test
    void withoutAUrlNothingIsAsked() {
        PriceServiceQuoteClient unconfigured = new PriceServiceQuoteClient(RestClient.builder(), "");

        assertFalse(unconfigured.isConfigured());
        assertTrue(client.isConfigured());
        assertEquals(ProviderUnavailableException.Reason.NOT_CONFIGURED,
                assertThrows(ProviderUnavailableException.class, () -> unconfigured.lastPrice("AAPL")).reason());
    }
}
