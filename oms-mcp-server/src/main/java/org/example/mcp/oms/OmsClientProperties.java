package org.example.mcp.oms;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "oms")
public record OmsClientProperties(String baseUrl) {}
