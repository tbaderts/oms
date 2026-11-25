package org.example.omsui.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * SPEC-0072: the order entry form sends its orders under the configured session id, read from
 * /api/config; the market data key is not part of that configuration (AC-7).
 */
@SpringBootTest(properties = {
        "oms.ui.order-entry.session-id=DESK-7",
        "oms.ui.market-data.alpha-vantage.api-key=SECRET-KEY-XYZ"})
class ConfigControllerTest {

    @Autowired ConfigController controller;

    @Test
    void offersTheOrderEntrySessionId() {
        Map<String, Object> config = controller.getConfig();

        assertEquals(Map.of("sessionId", "DESK-7"), config.get("orderEntry"));
    }

    @Test
    void configHasNoMarketDataKey() {
        assertFalse(controller.getConfig().toString().contains("SECRET-KEY-XYZ"));
    }
}
