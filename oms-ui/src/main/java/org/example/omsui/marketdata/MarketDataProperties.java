package org.example.omsui.marketdata;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Market data settings for order entry, under {@code oms.ui.market-data} (SPEC-0072). Since SPEC-0079
 * the price service owns market data, its provider key included; oms-ui only knows where it is.
 *
 * @param priceServiceUrl the price service's base URL
 */
@ConfigurationProperties(prefix = "oms.ui.market-data")
public record MarketDataProperties(String priceServiceUrl) {

    public MarketDataProperties {
        priceServiceUrl = priceServiceUrl != null && !priceServiceUrl.isBlank() ? priceServiceUrl : "http://localhost:8098";
    }
}
