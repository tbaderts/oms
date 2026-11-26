package org.example.price.provider;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.example.common.model.marketdata.Instrument;
import org.example.common.model.marketdata.MarketDataSource;
import org.example.common.model.marketdata.Quote;
import org.example.price.util.Csv;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import lombok.extern.slf4j.Slf4j;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Alpha Vantage (www.alphavantage.co) as the market data provider (SPEC-0072, moved here by
 * SPEC-0079): {@code LISTING_STATUS} for the instrument list (every active US listing as CSV, in one
 * request) and {@code GLOBAL_QUOTE} for quotes. The free quote has the last price, the day's range
 * and the change, but no bid or ask.
 *
 * <p>The API key is sent only to Alpha Vantage: it is never logged (requests are logged by
 * function, not URL) and never passed on, not even in the provider's own messages, which echo it.
 * A rate-limited key gets HTTP 200 with a {@code Note} or {@code Information} member instead of
 * data, as JSON even where CSV was asked for; that, an HTTP error or a timeout make the provider
 * unavailable.
 */
@Slf4j
public class AlphaVantageProvider implements MarketDataProvider {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String LISTING_HEADER = "symbol,name,exchange,assetType";
    /** LISTING_STATUS covers US listings, all priced in dollars. */
    private static final String LISTING_CURRENCY = "USD";

    private final RestClient restClient;
    private final String apiKey;

    /**
     * @param builder a builder with the connect and read timeouts already set (see
     *     {@code PriceConfiguration}); the provider only adds the base URL
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
    public List<Instrument> listings() {
        String body = call("LISTING_STATUS", "state", "active");
        if (body.stripLeading().startsWith("{")) {
            json("LISTING_STATUS", body); // a rate limit or error instead of CSV: throws
            throw unexpectedAnswer("LISTING_STATUS");
        }
        String[] lines = body.split("\n");
        if (lines.length == 0 || !lines[0].strip().startsWith(LISTING_HEADER)) {
            throw unexpectedAnswer("LISTING_STATUS");
        }
        List<Instrument> instruments = new ArrayList<>();
        for (int i = 1; i < lines.length; i++) {
            List<String> fields = Csv.split(lines[i]);
            if (fields.size() < 4 || fields.get(0).isBlank()) {
                continue;
            }
            instruments.add(Instrument.builder()
                    .symbol(fields.get(0).strip())
                    .name(blankToNull(fields.get(1)))
                    .type(blankToNull(fields.get(3)))
                    .region(blankToNull(fields.get(2)))
                    .currency(LISTING_CURRENCY)
                    .build());
        }
        return instruments;
    }

    @Override
    public Optional<Quote> quote(String symbol) {
        JsonNode root = json("GLOBAL_QUOTE", call("GLOBAL_QUOTE", "symbol", symbol));
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

    /** One request; the body as text. */
    private String call(String function, String param, String value) {
        if (!isConfigured()) {
            throw new ProviderUnavailableException(ProviderUnavailableException.Reason.NOT_CONFIGURED, null);
        }
        long started = System.nanoTime();
        String body;
        try {
            body = restClient.get()
                    // Values as URI variables, so they are encoded, never read as a template.
                    .uri(uri -> uri.path("/query")
                            .queryParam("function", "{function}")
                            .queryParam(param, "{value}")
                            .queryParam("apikey", "{apikey}")
                            .build(Map.of("function", function, "value", value, "apikey", apiKey)))
                    .retrieve()
                    .body(String.class);
        } catch (RestClientException | IllegalArgumentException e) {
            // The exception text can hold the URL, and so the key: log its type only.
            log.warn("Alpha Vantage {} failed after {} ms: {}", function, elapsedMs(started), e.getClass().getSimpleName());
            throw new ProviderUnavailableException(ProviderUnavailableException.Reason.UNREACHABLE, null);
        }
        if (body == null || body.isBlank()) {
            log.warn("Alpha Vantage {} answered without data after {} ms (rate limit)", function, elapsedMs(started));
            throw new ProviderUnavailableException(ProviderUnavailableException.Reason.RATE_LIMITED, null);
        }
        log.info("Alpha Vantage {} answered in {} ms", function, elapsedMs(started));
        return body;
    }

    /** The body as JSON; a {@code Note} or {@code Information} member is the rate limit. */
    private static JsonNode json(String function, String body) {
        JsonNode root;
        try {
            root = JSON.readTree(body);
        } catch (JacksonException e) {
            throw unexpectedAnswer(function);
        }
        if (root.has("Note") || root.has("Information")) {
            log.warn("Alpha Vantage {} answered without data (rate limit)", function);
            throw new ProviderUnavailableException(ProviderUnavailableException.Reason.RATE_LIMITED, null);
        }
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

    private static String blankToNull(String value) {
        return value == null || value.isBlank() || "null".equals(value.strip()) ? null : value.strip();
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
