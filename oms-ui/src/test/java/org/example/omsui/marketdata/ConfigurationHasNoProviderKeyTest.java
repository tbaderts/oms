package org.example.omsui.marketdata;

import static org.junit.jupiter.api.Assertions.assertFalse;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

import org.junit.jupiter.api.Test;

/**
 * Only the price service holds the market data provider's key (SPEC-0079 AC-11): oms-ui's
 * configuration has no Alpha Vantage setting left.
 */
class ConfigurationHasNoProviderKeyTest {

    @Test
    void applicationYmlHasNoAlphaVantageSetting() throws IOException {
        String yml;
        try (InputStream in = getClass().getResourceAsStream("/application.yml")) {
            yml = new String(in.readAllBytes(), StandardCharsets.UTF_8).toLowerCase(Locale.ROOT);
        }

        assertFalse(yml.contains("alphavantage"), "ALPHAVANTAGE_* variables belong to the price service");
        assertFalse(yml.contains("alpha-vantage"), "alpha-vantage settings belong to the price service");
    }
}
