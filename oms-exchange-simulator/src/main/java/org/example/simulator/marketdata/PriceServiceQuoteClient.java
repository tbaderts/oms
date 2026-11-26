package org.example.simulator.marketdata;

import java.math.BigDecimal;
import java.util.Optional;

import org.example.common.model.marketdata.Quote;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import lombok.extern.slf4j.Slf4j;

/**
 * The venue's client of the price service (SPEC-0079), which owns market data:
 * {@code GET /api/market-data/quotes/{symbol}}, read as the generated {@link Quote}. Its last price,
 * live or an end-of-day close, is the reference price. Before SPEC-0079 the simulator asked Alpha
 * Vantage itself (SPEC-0073); the price service now holds the key and the request budget.
 *
 * <p>A 404 is "no price"; no connection, a timeout, a server error or an answer that cannot be read
 * make the price service unavailable, and the venue uses its static prices.
 */
@Slf4j
public class PriceServiceQuoteClient {

    private final RestClient restClient;
    private final boolean configured;

    /**
     * @param builder a builder with the connect and read timeouts already set (see
     *     {@code MarketDataConfiguration}); the client only adds the base URL
     * @param baseUrl the price service; blank means none, and the static prices are used
     */
    public PriceServiceQuoteClient(RestClient.Builder builder, String baseUrl) {
        this.configured = baseUrl != null && !baseUrl.isBlank();
        this.restClient = configured ? builder.baseUrl(baseUrl).build() : builder.build();
    }

    /** Whether it can be asked at all, i.e. a price service URL is set. */
    public boolean isConfigured() {
        return configured;
    }

    /**
     * The symbol's last price, or empty when the price service has no positive price for it.
     *
     * @throws ProviderUnavailableException when the price service cannot answer now
     */
    public Optional<BigDecimal> lastPrice(String symbol) {
        if (!configured) {
            throw new ProviderUnavailableException(ProviderUnavailableException.Reason.NOT_CONFIGURED);
        }
        long started = System.nanoTime();
        Quote quote;
        try {
            quote = restClient.get()
                    .uri("/api/market-data/quotes/{symbol}", symbol)
                    .retrieve()
                    .body(Quote.class);
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode().isSameCodeAs(HttpStatus.NOT_FOUND)) {
                return Optional.empty();
            }
            throw unavailable(started, e);
        } catch (RestClientException | IllegalArgumentException e) {
            throw unavailable(started, e);
        }
        log.debug("Price service quoted {} in {} ms", symbol, elapsedMs(started));
        if (quote == null || quote.getLast() == null || quote.getLast().signum() <= 0) {
            return Optional.empty();
        }
        return Optional.of(quote.getLast());
    }

    private static ProviderUnavailableException unavailable(long started, RuntimeException e) {
        log.warn("Price service quote failed after {} ms: {}", elapsedMs(started), e.getClass().getSimpleName());
        return new ProviderUnavailableException(ProviderUnavailableException.Reason.UNREACHABLE);
    }

    private static long elapsedMs(long started) {
        return (System.nanoTime() - started) / 1_000_000;
    }
}
