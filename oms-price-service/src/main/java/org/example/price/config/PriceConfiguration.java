package org.example.price.config;

import java.time.Clock;
import java.time.Duration;

import org.example.price.budget.RequestBudget;
import org.example.price.eod.EndOfDayStore;
import org.example.price.provider.AlphaVantageProvider;
import org.example.price.provider.MarketDataProvider;
import org.example.price.reference.InstrumentCatalog;
import org.example.price.reference.ReferenceDataRefresher;
import org.example.price.service.PriceMetrics;
import org.example.price.service.PriceService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;

/** Wires the price service (SPEC-0079): the provider, its budget, the instrument list and the end-of-day store. */
@Slf4j
@Configuration
public class PriceConfiguration {

    @Bean
    Clock priceClock() {
        return Clock.systemUTC();
    }

    @Bean
    MarketDataProvider marketDataProvider(PriceProperties properties) {
        SimpleClientHttpRequestFactory timeouts = new SimpleClientHttpRequestFactory();
        // Below the exchange simulator's 3 s read timeout, so a slow provider still leaves time to
        // answer the simulator from the end-of-day store.
        timeouts.setConnectTimeout(Duration.ofSeconds(1));
        timeouts.setReadTimeout(Duration.ofSeconds(2));
        PriceProperties.AlphaVantage alphaVantage = properties.alphaVantage();
        AlphaVantageProvider provider = new AlphaVantageProvider(
                RestClient.builder().requestFactory(timeouts), alphaVantage.baseUrl(), alphaVantage.apiKey());
        log.info("Live prices: {}", provider.isConfigured()
                ? "Alpha Vantage (" + alphaVantage.baseUrl() + "), " + properties.budget().daily() + " requests a day, "
                        + properties.budget().perMinute() + " a minute"
                : "none (no ALPHAVANTAGE_API_KEY): quotes are end-of-day closes");
        return provider;
    }

    @Bean
    RequestBudget requestBudget(PriceProperties properties, Clock clock) {
        PriceProperties.Budget budget = properties.budget();
        return new RequestBudget(budget.daily(), budget.perMinute(), budget.resetZone(), clock,
                properties.dataDir().resolve("budget.txt"));
    }

    @Bean
    PriceMetrics priceMetrics(MeterRegistry meters, RequestBudget budget) {
        return new PriceMetrics(meters, budget);
    }

    @Bean
    InstrumentCatalog instrumentCatalog(PriceProperties properties, Clock clock) {
        return new InstrumentCatalog(properties.dataDir(), clock);
    }

    @Bean
    EndOfDayStore endOfDayStore(PriceProperties properties) {
        return new EndOfDayStore(properties.dataDir());
    }

    @Bean
    ReferenceDataRefresher referenceDataRefresher(
            MarketDataProvider provider, InstrumentCatalog catalog, RequestBudget budget,
            PriceProperties properties, PriceMetrics metrics) {
        return new ReferenceDataRefresher(provider, catalog, budget, properties.reference().refreshInterval(), metrics);
    }

    @Bean
    PriceService priceService(
            MarketDataProvider provider, InstrumentCatalog catalog, EndOfDayStore store, RequestBudget budget,
            PriceProperties properties, Clock clock, PriceMetrics metrics) {
        return new PriceService(provider, catalog, store, budget, properties.quoteTtl(), clock, metrics);
    }
}
