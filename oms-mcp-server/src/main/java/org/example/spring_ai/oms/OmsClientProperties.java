package org.example.spring_ai.oms;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "oms")
public record OmsClientProperties(String baseUrl) {}
