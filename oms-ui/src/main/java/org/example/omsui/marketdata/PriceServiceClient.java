package org.example.omsui.marketdata;

import java.util.Optional;

import org.example.common.model.marketdata.InstrumentSearchResult;
import org.example.common.model.marketdata.Quote;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import lombok.extern.slf4j.Slf4j;

/**
 * oms-ui's client of the price service (SPEC-0079), which owns market data: instrument search and
 * quotes, read as the generated models. A 404 is "no price"; anything else that is not an answer
 * (no connection, a timeout, a server error) makes the price service unavailable.
 */
@Slf4j
public class PriceServiceClient {

    private final RestClient restClient;

    /**
     * @param builder a builder with the connect and read timeouts already set (see
     *     {@code MarketDataConfiguration}); the client only adds the base URL
     */
    public PriceServiceClient(RestClient.Builder builder, String baseUrl) {
        this.restClient = builder.baseUrl(baseUrl).build();
    }

    public InstrumentSearchResult search(String query) {
        try {
            return restClient.get()
                    .uri(uri -> uri.path("/api/market-data/instruments").queryParam("query", "{query}").build(query))
                    .retrieve()
                    .body(InstrumentSearchResult.class);
        } catch (RestClientException e) {
            throw unavailable("search", e);
        }
    }

    public Optional<Quote> quote(String symbol) {
        try {
            return Optional.ofNullable(restClient.get()
                    .uri("/api/market-data/quotes/{symbol}", symbol)
                    .retrieve()
                    .body(Quote.class));
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode().isSameCodeAs(HttpStatus.NOT_FOUND)) {
                return Optional.empty();
            }
            throw unavailable("quote", e);
        } catch (RestClientException e) {
            throw unavailable("quote", e);
        }
    }

    private static PriceServiceUnavailableException unavailable(String what, RestClientException e) {
        log.warn("Price service {} failed: {}", what, e.getClass().getSimpleName());
        return new PriceServiceUnavailableException(e);
    }
}
