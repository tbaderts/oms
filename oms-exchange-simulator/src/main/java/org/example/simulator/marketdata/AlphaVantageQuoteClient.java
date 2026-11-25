package org.example.simulator.marketdata;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;

import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import lombok.extern.slf4j.Slf4j;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The last price of a symbol from Alpha Vantage's {@code GLOBAL_QUOTE} (SPEC-0073): the venue's
 * reference price. The quote half of oms-ui's {@code AlphaVantageProvider} (SPEC-0072), trimmed to
 * the one number the venue needs; keep the two in step when Alpha Vantage changes.
 *
 * <p>The API key is sent only to Alpha Vantage: it is never logged (requests are logged by
 * function, failures by exception type) and never passed on, not even in the provider's own
 * messages, which echo it. A rate-limited key gets HTTP 200 with a {@code Note} or
 * {@code Information} member instead of data; that, an HTTP error, a timeout or an answer of
 * another shape make the provider unavailable.
 */
@Slf4j
public class AlphaVantageQuoteClient {

    private static final String FUNCTION = "GLOBAL_QUOTE";
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final RestClient restClient;
    private final String apiKey;

    /**
     * @param builder a builder with the connect and read timeouts already set (see
     *     {@code MarketDataConfiguration}); the client only adds the base URL
     */
    public AlphaVantageQuoteClient(RestClient.Builder builder, String baseUrl, String apiKey) {
        this.restClient = builder.baseUrl(baseUrl).build();
        this.apiKey = apiKey == null ? "" : apiKey.trim();
    }

    /** Whether it can be asked at all, i.e. it has an API key. */
    public boolean isConfigured() {
        return !apiKey.isEmpty();
    }

    /**
     * The symbol's latest price, or empty when Alpha Vantage has no quote for it.
     *
     * @throws ProviderUnavailableException when Alpha Vantage cannot answer now
     */
    public Optional<BigDecimal> lastPrice(String symbol) {
        if (!isConfigured()) {
            throw new ProviderUnavailableException(ProviderUnavailableException.Reason.NOT_CONFIGURED);
        }
        long started = System.nanoTime();
        JsonNode root;
        try {
            String body = restClient.get()
                    // Values as URI variables, so they are encoded, never read as a template.
                    .uri(uri -> uri.path("/query")
                            .queryParam("function", "{function}")
                            .queryParam("symbol", "{symbol}")
                            .queryParam("apikey", "{apikey}")
                            .build(Map.of("function", FUNCTION, "symbol", symbol, "apikey", apiKey)))
                    .retrieve()
                    .body(String.class);
            root = body == null ? null : JSON.readTree(body);
        } catch (RestClientException | JacksonException | IllegalArgumentException e) {
            // The exception text can hold the URL, and so the key: log its type only.
            log.warn("Alpha Vantage {} failed after {} ms: {}", FUNCTION, elapsedMs(started), e.getClass().getSimpleName());
            throw new ProviderUnavailableException(ProviderUnavailableException.Reason.UNREACHABLE);
        }
        if (root == null || root.has("Note") || root.has("Information")) {
            log.warn("Alpha Vantage {} answered without data after {} ms (rate limit)", FUNCTION, elapsedMs(started));
            throw new ProviderUnavailableException(ProviderUnavailableException.Reason.RATE_LIMITED);
        }
        if (!root.path("Global Quote").isObject()) {
            // e.g. {"Error Message": …}, which echoes the request: not usable, and not passed on.
            log.warn("Alpha Vantage {} answered in an unexpected shape after {} ms", FUNCTION, elapsedMs(started));
            throw new ProviderUnavailableException(ProviderUnavailableException.Reason.UNREACHABLE);
        }
        log.info("Alpha Vantage {} answered in {} ms", FUNCTION, elapsedMs(started));
        return decimal(root.path("Global Quote").path("05. price"));
    }

    private static long elapsedMs(long started) {
        return (System.nanoTime() - started) / 1_000_000;
    }

    private static Optional<BigDecimal> decimal(JsonNode value) {
        if (value.isMissingNode() || value.isNull() || value.asString().isBlank()) {
            return Optional.empty();
        }
        try {
            BigDecimal price = new BigDecimal(value.asString().trim());
            return price.signum() > 0 ? Optional.of(price) : Optional.empty();
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }
}
