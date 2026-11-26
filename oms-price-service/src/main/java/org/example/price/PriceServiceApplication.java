package org.example.price;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * The price service (SPEC-0079): price and reference data for the other services, from a market
 * data provider within a request budget, a local instrument list and an end-of-day store.
 */
@SpringBootApplication
@EnableScheduling
@ConfigurationPropertiesScan
public class PriceServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(PriceServiceApplication.class, args);
    }
}
