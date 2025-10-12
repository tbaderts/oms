package org.example.omsui;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Main application class for the OMS UI microservice.
 * This Spring Boot application serves a React.js single-page application.
 */
@SpringBootApplication
public class OmsUiApplication {

    public static void main(String[] args) {
        SpringApplication.run(OmsUiApplication.class, args);
    }
}
