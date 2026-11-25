package org.example.omsui.marketdata;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.example.common.model.marketdata.Instrument;
import org.example.common.model.marketdata.MarketDataSource;
import org.example.common.model.marketdata.Quote;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import lombok.extern.slf4j.Slf4j;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Alpha Vantage (www.alphavantage.co) as the market data provider (SPEC-0072): {@code SYMBOL_SEARCH}
 * for instruments and {@code GLOBAL_QUOTE} for quotes. The free quote has the last price, the day's
 * range and the change, but no bid or ask.
 *
 * <p>The API key is sent only to Alpha Vantage: it is never logged (requests are logged by
 * function, not URL) and never passed on, not even in the provider's own messages, which echo it.
 * A rate-limited key gets HTTP 200 with a {@code Note} or {@code Information} member instead of
 * data; that, an HTTP error or a timeout make the provider unavailable.
 */
@Slf4j
public class AlphaVantageProvider implements MarketDataProvider {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final RestClient restClient;
    private final String apiKey;

    /**
     * @param builder a builder with the connect and read timeouts already set (see
     *     {@code MarketDataConfiguration}); the provider only adds the base URL
     */
    public AlphaVantageProvider(RestClient.Builder builder, String baseUrl, String apiKey) {
        this.restClient = builder.baseUrl(baseUrl).build();
        this.apiKey = apiKey == null ? "" : apiKey.trim();
    }

    @Override
    public boolean isConfigured() {
        return !apiKey.isEmpty();
    }

    @Override
    public List<Instrument> search(String query) {
        JsonNode root = call("SYMBOL_SEARCH", "keywords", query);
        if (!root.path("bestMatches").isArray()) {
            throw unexpectedAnswer("SYMBOL_SEARCH");
        }
        List<Instrument> instruments = new ArrayList<>();
        root.path("bestMatches").forEach(match -> instruments.add(Instrument.builder()
                .symbol(text(match, "1. symbol"))
                .name(text(match, "2. name"))
                .type(text(match, "3. type"))
                .region(text(match, "4. region"))
                .currency(text(match, "8. currency"))
                .build()));
        return instruments;
    }

    @Override
    public Optional<Quote> quote(String symbol) {
        JsonNode root = call("GLOBAL_QUOTE", "symbol", symbol);
        if (!root.has("Global Quote")) {
            throw unexpectedAnswer("GLOBAL_QUOTE");
        }
        JsonNode quote = root.path("Global Quote");
        if (!quote.isObject() || quote.isEmpty() || text(quote, "05. price") == null) {
            return Optional.empty();
        }
        String changePercent = text(quote, "10. change percent");
        return Optional.of(Quote.builder()
                .symbol(text(quote, "01. symbol") != null ? text(quote, "01. symbol") : symbol)
                .last(decimal(text(quote, "05. price")))
                .change(decimal(text(quote, "09. change")))
                .changePercent(decimal(changePercent != null ? changePercent.replace("%", "") : null))
                .high(decimal(text(quote, "03. high")))
                .low(decimal(text(quote, "04. low")))
                .previousClose(decimal(text(quote, "08. previous close")))
                .asOf(text(quote, "07. latest trading day"))
                .source(MarketDataSource.ALPHA_VANTAGE)
                .build());
    }

    private JsonNode call(String function, String param, String value) {
        if (!isConfigured()) {
            throw new ProviderUnavailableException(ProviderUnavailableException.Reason.NOT_CONFIGURED, null);
        }
        long started = System.nanoTime();
        JsonNode root;
        try {
            String body = restClient.get()
                    // Values as URI variables, so they are encoded, never read as a template.
                    .uri(uri -> uri.path("/query")
                            .queryParam("function", "{function}")
                            .queryParam(param, "{value}")
                            .queryParam("apikey", "{apikey}")
                            .build(Map.of("function", function, "value", value, "apikey", apiKey)))
                    .retrieve()
                    .body(String.class);
            root = body == null ? null : JSON.readTree(body);
        } catch (RestClientException | JacksonException | IllegalArgumentException e) {
            // The exception text can hold the URL, and so the key: log its type only.
            log.warn("Alpha Vantage {} failed after {} ms: {}", function, elapsedMs(started), e.getClass().getSimpleName());
            throw new ProviderUnavailableException(ProviderUnavailableException.Reason.UNREACHABLE, null);
        }
        if (root == null || root.has("Note") || root.has("Information")) {
            log.warn("Alpha Vantage {} answered without data after {} ms (rate limit)", function, elapsedMs(started));
            throw new ProviderUnavailableException(ProviderUnavailableException.Reason.RATE_LIMITED, null);
        }
        log.info("Alpha Vantage {} answered in {} ms", function, elapsedMs(started));
        return root;
    }

    /** An answer that is neither data nor a rate limit, e.g. {"Error Message": …}: not usable. */
    private static ProviderUnavailableException unexpectedAnswer(String function) {
        log.warn("Alpha Vantage {} answered in an unexpected shape", function);
        return new ProviderUnavailableException(ProviderUnavailableException.Reason.UNREACHABLE, null);
    }

    private static long elapsedMs(long started) {
        return (System.nanoTime() - started) / 1_000_000;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isMissingNode() || value.isNull() || value.asString().isBlank() ? null : value.asString();
    }

    private static BigDecimal decimal(String value) {
        if (value == null) {
            return null;
        }
        try {
            return new BigDecimal(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
