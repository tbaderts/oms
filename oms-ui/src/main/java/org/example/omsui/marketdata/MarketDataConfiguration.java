package org.example.omsui.marketdata;

import java.time.Duration;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import lombok.extern.slf4j.Slf4j;

/** Wires order entry's market data: the client of the price service (SPEC-0079). */
@Slf4j
@Configuration
@EnableConfigurationProperties(MarketDataProperties.class)
public class MarketDataConfiguration {

    @Bean
    PriceServiceClient priceServiceClient(MarketDataProperties properties) {
        SimpleClientHttpRequestFactory timeouts = new SimpleClientHttpRequestFactory();
        // A slow price service must not hold up the form: the user can type the symbol instead.
        timeouts.setConnectTimeout(Duration.ofSeconds(2));
        timeouts.setReadTimeout(Duration.ofSeconds(5));
        log.info("Market data: price service at {}", properties.priceServiceUrl());
        return new PriceServiceClient(RestClient.builder().requestFactory(timeouts), properties.priceServiceUrl());
    }
}
