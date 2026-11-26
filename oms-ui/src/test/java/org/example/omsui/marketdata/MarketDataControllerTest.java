package org.example.omsui.marketdata;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import org.example.common.model.marketdata.Instrument;
import org.example.common.model.marketdata.InstrumentSearchResult;
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
 * The market data API as oms-ui serves it to order entry: the price service's answers, forwarded
 * (SPEC-0072; since SPEC-0079 oms-ui no longer asks a provider itself). AC-10.
 */
@SpringBootTest
class MarketDataControllerTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Autowired WebApplicationContext context;
    @MockitoBean PriceServiceClient priceService;

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
    }

    @Test
    void forwardsSearchAndQuoteFromPriceService() throws Exception {
        when(priceService.search("micro")).thenReturn(InstrumentSearchResult.builder()
                .instruments(List.of(Instrument.builder().symbol("MSFT").name("Microsoft Corporation").currency("USD").build()))
                .source(MarketDataSource.REFERENCE_DATA).build());
        when(priceService.quote("IBM")).thenReturn(Optional.of(Quote.builder().symbol("IBM").last(new BigDecimal("250.35"))
                .previousClose(new BigDecimal("249.00")).asOf("2026-11-25").source(MarketDataSource.END_OF_DAY)
                .notice("Live price request limit reached: end-of-day close shown").build()));

        JsonNode result = json(get("/api/market-data/instruments?query=micro"), 200);
        JsonNode quote = json(get("/api/market-data/quotes/IBM"), 200);

        assertEquals("REFERENCE_DATA", result.get("source").asString());
        assertEquals("MSFT", result.get("instruments").get(0).get("symbol").asString());
        assertEquals("END_OF_DAY", quote.get("source").asString());
        assertEquals(0, new BigDecimal("250.35").compareTo(quote.get("last").decimalValue()));
        assertEquals("2026-11-25", quote.get("asOf").asString());
        assertEquals("Live price request limit reached: end-of-day close shown", quote.get("notice").asString());
    }

    @Test
    void notFoundPassesThrough() throws Exception {
        when(priceService.quote("ZZZZ")).thenReturn(Optional.empty());

        assertEquals(404, mvc.perform(get("/api/market-data/quotes/ZZZZ")).andReturn().getResponse().getStatus());
    }

    @Test
    void priceServiceUnreachableIs503Problem() throws Exception {
        when(priceService.search(anyString())).thenThrow(new PriceServiceUnavailableException(null));
        when(priceService.quote(anyString())).thenThrow(new PriceServiceUnavailableException(null));

        JsonNode search = json(get("/api/market-data/instruments?query=ap"), 503);
        JsonNode quote = json(get("/api/market-data/quotes/AAPL"), 503);

        assertEquals("urn:oms:error:price-service-unavailable", search.get("type").asString());
        assertEquals("urn:oms:error:price-service-unavailable", quote.get("type").asString());
    }

    @Test
    void anInvalidQueryIs400AndNeverLeavesOmsUi() throws Exception {
        assertEquals(400, mvc.perform(get("/api/market-data/instruments")).andReturn().getResponse().getStatus());
        assertEquals(400, mvc.perform(get("/api/market-data/instruments?query=" + "x".repeat(41)))
                .andReturn().getResponse().getStatus());
        verify(priceService, never()).search(anyString());
    }

    /** AC-11: no market data provider key is configured in oms-ui, nor shown by it. */
    @Test
    void noProviderKeyIsConfiguredOrShown() throws Exception {
        assertFalse(context.getEnvironment().containsProperty("oms.ui.market-data.alpha-vantage.api-key"));
        for (String uri : List.of("/api/config", "/actuator/health", "/actuator/info")) {
            MockHttpServletResponse response = mvc.perform(get(uri)).andReturn().getResponse();
            assertFalse(response.getContentAsString().toLowerCase().contains("alphavantage"), uri);
        }
    }

    private JsonNode json(org.springframework.test.web.servlet.RequestBuilder request, int status) throws Exception {
        MockHttpServletResponse response = mvc.perform(request).andReturn().getResponse();
        assertEquals(status, response.getStatus(), response.getContentAsString());
        return JSON.readTree(response.getContentAsString());
    }
}
