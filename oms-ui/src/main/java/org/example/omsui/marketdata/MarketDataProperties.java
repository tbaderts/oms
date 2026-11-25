package org.example.omsui.marketdata;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Market data settings for order entry (SPEC-0072), under {@code oms.ui.market-data}.
 *
 * @param alphaVantage the provider; without an API key it is not asked and the built-in list is used
 * @param searchTtl how long an instrument search answer is reused
 * @param quoteTtl how long a quote is reused
 * @param builtIn the instruments offered when the provider cannot answer: the exchange simulator's
 *     symbols, with its reference prices as their last price
 */
@ConfigurationProperties(prefix = "oms.ui.market-data")
public record MarketDataProperties(
        AlphaVantage alphaVantage, Duration searchTtl, Duration quoteTtl, List<BuiltInInstrument> builtIn) {

    public MarketDataProperties {
        alphaVantage = alphaVantage != null ? alphaVantage : new AlphaVantage(null, null);
        searchTtl = searchTtl != null ? searchTtl : Duration.ofHours(24);
        quoteTtl = quoteTtl != null ? quoteTtl : Duration.ofMinutes(5);
        builtIn = builtIn != null ? List.copyOf(builtIn) : List.of();
    }

    /** The key is read from the environment (ALPHAVANTAGE_API_KEY) and stays on the server. */
    public record AlphaVantage(String apiKey, String baseUrl) {
        public AlphaVantage {
            apiKey = apiKey != null ? apiKey : "";
            baseUrl = baseUrl != null && !baseUrl.isBlank() ? baseUrl : "https://www.alphavantage.co";
        }

        @Override
        public String toString() {
            // Never print the key, e.g. when the properties are logged.
            return "AlphaVantage[baseUrl=" + baseUrl + ", apiKey=" + (apiKey.isEmpty() ? "<none>" : "<set>") + "]";
        }
    }

    public record BuiltInInstrument(String symbol, String name, String currency, BigDecimal price) {}
}
