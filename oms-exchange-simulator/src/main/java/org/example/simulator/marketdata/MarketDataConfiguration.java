package org.example.simulator.marketdata;

import java.time.Clock;
import java.time.Duration;

import org.example.simulator.config.SimulatorProperties;
import org.example.simulator.metrics.SimulatorMetrics;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import lombok.extern.slf4j.Slf4j;

/** Wires the venue's reference prices (SPEC-0073): Alpha Vantage, the cache and the static fallback. */
@Slf4j
@Configuration
public class MarketDataConfiguration {

    @Bean
    AlphaVantageQuoteClient alphaVantageQuoteClient(SimulatorProperties properties) {
        SimpleClientHttpRequestFactory timeouts = new SimpleClientHttpRequestFactory();
        // Lookups run on the engine thread: a slow provider must not hold up the venue for long.
        timeouts.setConnectTimeout(Duration.ofSeconds(2));
        timeouts.setReadTimeout(Duration.ofSeconds(3));
        SimulatorProperties.AlphaVantage alphaVantage = properties.alphaVantage();
        AlphaVantageQuoteClient client = new AlphaVantageQuoteClient(
                RestClient.builder().requestFactory(timeouts), alphaVantage.baseUrl(), alphaVantage.apiKey());
        log.info("Reference prices: {}", client.isConfigured()
                ? "Alpha Vantage (" + alphaVantage.baseUrl() + "), static prices as fallback"
                : "static prices only (no ALPHAVANTAGE_API_KEY)");
        return client;
    }

    @Bean
    ReferencePriceService referencePriceService(
            AlphaVantageQuoteClient client, SimulatorProperties properties, SimulatorMetrics metrics) {
        return new ReferencePriceService(
                client,
                properties.referencePrices(),
                properties.quoteTtl(),
                properties.providerBackoff(),
                Clock.systemUTC(),
                metrics);
    }
}
