package org.example.omsui.controller;

import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Configuration controller that provides runtime configuration to the React frontend.
 */
@RestController
@RequestMapping("/api/config")
public class ConfigController {

    @Value("${oms.ui.app-name:OMS Admin Tool}")
    private String appName;

    @Value("${oms.api.base-url:http://localhost:8090}")
    private String apiBaseUrl;

    @Value("${oms.streaming.url:ws://localhost:7000/trade-blotter/stream}")
    private String streamingUrl;

    @Value("${oms.ui.features.quotes-enabled:false}")
    private boolean quotesEnabled;

    @Value("${oms.ui.features.quote-requests-enabled:false}")
    private boolean quoteRequestsEnabled;

    @Value("${oms.ui.features.streaming-enabled:true}")
    private boolean streamingEnabled;

    /**
     * Get application configuration.
     * This endpoint provides dynamic configuration to the React application,
     * allowing it to adapt to different deployment environments.
     *
     * @return configuration map with appName, apiBaseUrl, streamingUrl and feature flags
     */
    @GetMapping
    public Map<String, Object> getConfig() {
        Map<String, Object> config = new HashMap<>();
        config.put("appName", appName);
        config.put("apiBaseUrl", apiBaseUrl);
        config.put("streamingUrl", streamingUrl);
        config.put("features", Map.of(
                "quotesEnabled", quotesEnabled,
                "quoteRequestsEnabled", quoteRequestsEnabled,
                "streamingEnabled", streamingEnabled));
        return config;
    }
}
