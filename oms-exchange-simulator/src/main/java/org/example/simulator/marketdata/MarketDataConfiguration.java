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

/**
 * Wires the venue's reference prices (SPEC-0073, SPEC-0079): the price service, the cache and the
 * static fallback.
 */
@Slf4j
@Configuration
public class MarketDataConfiguration {

    @Bean
    PriceServiceQuoteClient priceServiceQuoteClient(SimulatorProperties properties) {
        SimpleClientHttpRequestFactory timeouts = new SimpleClientHttpRequestFactory();
        // Lookups run on the engine thread: a slow price service must not hold up the venue for long.
        timeouts.setConnectTimeout(Duration.ofSeconds(2));
        timeouts.setReadTimeout(Duration.ofSeconds(3));
        String url = properties.priceService().url();
        PriceServiceQuoteClient client = new PriceServiceQuoteClient(RestClient.builder().requestFactory(timeouts), url);
        log.info("Reference prices: {}", client.isConfigured()
                ? "price service (" + url + "), static prices as fallback"
                : "static prices only (no SIMULATOR_PRICE_SERVICE_URL)");
        return client;
    }

    @Bean
    ReferencePriceService referencePriceService(
            PriceServiceQuoteClient client, SimulatorProperties properties, SimulatorMetrics metrics) {
        return new ReferencePriceService(
                client,
                properties.referencePrices(),
                properties.quoteTtl(),
                properties.providerBackoff(),
                Clock.systemUTC(),
                metrics);
    }
}
