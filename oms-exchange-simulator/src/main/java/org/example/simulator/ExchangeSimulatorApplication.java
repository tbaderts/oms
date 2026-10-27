package org.example.simulator;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/** Entry point of the exchange simulator. */
@SpringBootApplication
@ConfigurationPropertiesScan
public class ExchangeSimulatorApplication {

    public static void main(String[] args) {
        SpringApplication.run(ExchangeSimulatorApplication.class, args);
    }
}
