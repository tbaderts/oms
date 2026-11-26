package org.example.oms.kafka.errors;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.micrometer.core.instrument.MeterRegistry;

/** The error policy's shared beans (SPEC-0077). */
@Configuration
@EnableConfigurationProperties(ErrorPolicyProperties.class)
public class ErrorPolicyConfig {

    @Bean
    public DeadLetters deadLetters(ErrorPolicyProperties properties) {
        return new DeadLetters(properties);
    }

    @Bean
    public DeadLetterMetrics deadLetterMetrics(MeterRegistry registry, ErrorPolicyProperties properties) {
        return new DeadLetterMetrics(registry, properties.serviceName());
    }
}
