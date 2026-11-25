package org.example.omsui.marketdata;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import org.example.common.model.marketdata.Instrument;
import org.example.common.model.marketdata.MarketDataSource;
import org.example.common.model.marketdata.Quote;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * SPEC-0072 AC-5, AC-6, AC-7: the market data API as oms-ui serves it, with the real wiring and the
 * built-in instruments from application.yml; only the provider is replaced.
 */
@SpringBootTest(properties = "oms.ui.market-data.alpha-vantage.api-key=" + MarketDataControllerTest.KEY)
class MarketDataControllerTest {

    static final String KEY = "SECRET-KEY-XYZ";
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Autowired WebApplicationContext context;
    @MockitoBean MarketDataProvider provider;

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
    }

    /** AC-5 */
    @Test
    void searchReturnsProviderInstruments() throws Exception {
        when(provider.search("micro")).thenReturn(List.of(Instrument.builder()
                .symbol("MSFT").name("Microsoft Corporation").region("United States").currency("USD").build()));

        JsonNode result = json(get("/api/market-data/instruments?query=micro"), 200);

        assertEquals("ALPHA_VANTAGE", result.get("source").asString());
        assertEquals("MSFT", result.get("instruments").get(0).get("symbol").asString());
        assertEquals("USD", result.get("instruments").get(0).get("currency").asString());
    }

    /** AC-6 */
    @Test
    void quoteReturnsProviderQuote() throws Exception {
        when(provider.quote("IBM")).thenReturn(Optional.of(Quote.builder().symbol("IBM").last(new BigDecimal("250.35"))
                .high(new BigDecimal("251.2")).low(new BigDecimal("247.5")).asOf("2026-11-23")
                .source(MarketDataSource.ALPHA_VANTAGE).build()));

        JsonNode quote = json(get("/api/market-data/quotes/IBM"), 200);

        assertEquals(0, new BigDecimal("250.35").compareTo(quote.get("last").decimalValue()));
        assertEquals("2026-11-23", quote.get("asOf").asString());
        assertFalse(quote.hasNonNull("bid"), "no bid from the provider");
    }

    @Test
    void aSymbolNobodyKnowsIs404() throws Exception {
        when(provider.quote("ZZZZ")).thenReturn(Optional.empty());

        assertEquals(404, mvc.perform(get("/api/market-data/quotes/ZZZZ")).andReturn().getResponse().getStatus());
    }

    @Test
    void anInvalidQueryIs400() throws Exception {
        assertEquals(400, mvc.perform(get("/api/market-data/instruments")).andReturn().getResponse().getStatus());
        assertEquals(400, mvc.perform(get("/api/market-data/instruments?query=" + "x".repeat(41)))
                .andReturn().getResponse().getStatus());
    }

    // The service's cache lives as long as the context, which the tests share: each fallback test
    // asks for a query or symbol no other test asks for, so no cached provider answer hides it.

    /** AC-7: the built-in instruments (application.yml), with the reason. */
    @Test
    void fallsBackToBuiltInWithoutKey() throws Exception {
        when(provider.search(anyString())).thenThrow(
                new ProviderUnavailableException(ProviderUnavailableException.Reason.NOT_CONFIGURED, null));

        JsonNode result = json(get("/api/market-data/instruments?query=ap"), 200);

        assertEquals("BUILT_IN", result.get("source").asString());
        assertEquals("Market data provider not configured", result.get("notice").asString());
        assertEquals("AAPL", result.get("instruments").get(0).get("symbol").asString());
    }

    /** AC-7 */
    @Test
    void fallsBackWhenRateLimited() throws Exception {
        when(provider.quote("NVDA")).thenThrow(
                new ProviderUnavailableException(ProviderUnavailableException.Reason.RATE_LIMITED, null));

        JsonNode quote = json(get("/api/market-data/quotes/NVDA"), 200);

        assertEquals("BUILT_IN", quote.get("source").asString());
        assertEquals(0, new BigDecimal("120").compareTo(quote.get("last").decimalValue()), "the simulator's reference price");
        assertEquals("Market data provider rate limit reached", quote.get("notice").asString());
    }

    /** AC-7 */
    @Test
    void fallsBackWhenUnreachable() throws Exception {
        when(provider.search(anyString())).thenThrow(
                new ProviderUnavailableException(ProviderUnavailableException.Reason.UNREACHABLE, null));

        assertEquals("Market data provider not reachable",
                json(get("/api/market-data/instruments?query=intel"), 200).get("notice").asString());
    }

    /** AC-7: the configured key reaches no browser-facing response. */
    @Test
    void keyIsInNoResponse() throws Exception {
        when(provider.search(anyString())).thenReturn(List.of(Instrument.builder().symbol("AAPL").build()));
        when(provider.quote(anyString())).thenReturn(Optional.of(Quote.builder().symbol("AAPL")
                .source(MarketDataSource.ALPHA_VANTAGE).build()));

        for (String uri : List.of("/api/config", "/api/market-data/instruments?query=aa", "/api/market-data/quotes/AAPL",
                "/actuator/health", "/actuator/info")) {
            MockHttpServletResponse response = mvc.perform(get(uri)).andReturn().getResponse();
            assertFalse(response.getContentAsString().contains(KEY), uri + " leaks the key");
        }
    }

    private JsonNode json(org.springframework.test.web.servlet.RequestBuilder request, int status) throws Exception {
        MockHttpServletResponse response = mvc.perform(request).andReturn().getResponse();
        assertEquals(status, response.getStatus(), response.getContentAsString());
        return JSON.readTree(response.getContentAsString());
    }
}
