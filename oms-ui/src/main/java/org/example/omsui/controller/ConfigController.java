package org.example.omsui.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

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

    /**
     * Get application configuration.
     * This endpoint provides dynamic configuration to the React application,
     * allowing it to adapt to different deployment environments.
     *
     * @return configuration map with appName and apiBaseUrl
     */
    @GetMapping
    public Map<String, String> getConfig() {
        Map<String, String> config = new HashMap<>();
        config.put("appName", appName);
        config.put("apiBaseUrl", apiBaseUrl);
        return config;
    }
}
