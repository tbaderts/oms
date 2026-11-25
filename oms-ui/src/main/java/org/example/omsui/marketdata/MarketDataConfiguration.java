package org.example.omsui.marketdata;

import java.time.Clock;
import java.time.Duration;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;

/** Wires order entry's market data (SPEC-0072): the provider, the built-in list and the service. */
@Slf4j
@Configuration
@EnableConfigurationProperties(MarketDataProperties.class)
public class MarketDataConfiguration {

    @Bean
    MarketDataProvider marketDataProvider(MarketDataProperties properties) {
        SimpleClientHttpRequestFactory timeouts = new SimpleClientHttpRequestFactory();
        // A slow provider must not hold up the form: fall back to the built-in list quickly.
        timeouts.setConnectTimeout(Duration.ofSeconds(2));
        timeouts.setReadTimeout(Duration.ofSeconds(5));
        AlphaVantageProvider provider = new AlphaVantageProvider(
                RestClient.builder().requestFactory(timeouts),
                properties.alphaVantage().baseUrl(),
                properties.alphaVantage().apiKey());
        log.info("Market data: {}", provider.isConfigured()
                ? "Alpha Vantage (" + properties.alphaVantage().baseUrl() + ")"
                : "built-in instruments only (no ALPHAVANTAGE_API_KEY)");
        return provider;
    }

    @Bean
    BuiltInMarketData builtInMarketData(MarketDataProperties properties) {
        return new BuiltInMarketData(properties.builtIn());
    }

    @Bean
    MarketDataService marketDataService(
            MarketDataProvider provider, BuiltInMarketData builtIn, MarketDataProperties properties, MeterRegistry meters) {
        return new MarketDataService(
                provider, builtIn, properties.searchTtl(), properties.quoteTtl(), Clock.systemUTC(), meters);
    }
}
