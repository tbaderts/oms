package org.example.price.config;

import java.nio.file.Path;
import java.time.Duration;
import java.time.ZoneId;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The price service's settings, {@code oms.price.*} (SPEC-0079); defaults in {@code application.yml}.
 *
 * @param quoteTtl how long a live quote is served from the cache
 * @param dataDir where the instrument list, learned closes and operator end-of-day files live
 */
@ConfigurationProperties("oms.price")
public record PriceProperties(
        AlphaVantage alphaVantage,
        Budget budget,
        @DefaultValue("PT15M") Duration quoteTtl,
        Reference reference,
        @DefaultValue("./data") Path dataDir,
        Eod eod) {

    /** The provider; the key comes from the environment only ({@code ALPHAVANTAGE_API_KEY}). */
    public record AlphaVantage(@DefaultValue("") String apiKey, @DefaultValue("https://www.alphavantage.co") String baseUrl) {

        /** Never print the key. */
        @Override
        public String toString() {
            return "AlphaVantage[baseUrl=" + baseUrl + ", apiKey=" + (apiKey.isBlank() ? "<none>" : "<set>") + "]";
        }
    }

    /** Provider requests the service allows itself: a day starts at 00:00 in {@code resetZone}. */
    public record Budget(@DefaultValue("25") int daily, @DefaultValue("5") int perMinute, @DefaultValue("UTC") ZoneId resetZone) {}

    /**
     * @param refreshInterval the instrument list is downloaded again when older than this
     * @param scheduled whether the hourly refresh check runs (off in tests that count requests)
     */
    public record Reference(@DefaultValue("P1D") Duration refreshInterval, @DefaultValue("true") boolean scheduled) {}

    /** @param reloadInterval how often the operator's end-of-day files are checked for changes */
    public record Eod(@DefaultValue("PT1M") Duration reloadInterval) {}
}
