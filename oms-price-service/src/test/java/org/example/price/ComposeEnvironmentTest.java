package org.example.price;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;

/**
 * In the compose stack only the price service gets the market data provider's key; oms-ui and the
 * exchange simulator get the price service's address instead (SPEC-0079 AC-11).
 */
class ComposeEnvironmentTest {

    private static final Pattern SERVICE = Pattern.compile("^  ([a-z0-9][a-z0-9-]*):\\s*$");

    /** Each service's lines, from {@code docker-compose.yml} at the repository root. */
    private static Map<String, String> services() throws IOException {
        Path compose = Path.of("..", "docker-compose.yml");
        Map<String, String> services = new LinkedHashMap<>();
        boolean inServices = false;
        String current = null;
        List<String> lines = new ArrayList<>();
        for (String line : Files.readAllLines(compose)) {
            if (!line.startsWith(" ") && !line.isBlank()) {
                if (current != null) {
                    services.put(current, String.join("\n", lines));
                    current = null;
                }
                inServices = line.startsWith("services:");
                continue;
            }
            Matcher service = SERVICE.matcher(line);
            if (inServices && service.matches()) {
                if (current != null) {
                    services.put(current, String.join("\n", lines));
                }
                current = service.group(1);
                lines = new ArrayList<>();
            } else if (current != null) {
                lines.add(line);
            }
        }
        if (current != null) {
            services.put(current, String.join("\n", lines));
        }
        return services;
    }

    @Test
    void onlyThePriceServiceGetsTheProviderKey() throws IOException {
        Map<String, String> services = services();

        assertThat(services).containsKeys("price-service", "oms-ui", "exchange-simulator");
        services.forEach((name, block) -> {
            boolean hasKey = block.contains("ALPHAVANTAGE_API_KEY");
            assertThat(hasKey).as(name + " has ALPHAVANTAGE_API_KEY").isEqualTo(name.equals("price-service"));
        });
    }

    @Test
    void omsUiAndTheSimulatorAreToldWhereThePriceServiceIs() throws IOException {
        Map<String, String> services = services();

        assertThat(services.get("oms-ui")).contains("PRICE_SERVICE_URL: http://price-service:8098");
        assertThat(services.get("exchange-simulator")).contains("SIMULATOR_PRICE_SERVICE_URL: http://price-service:8098");
        assertThat(services.get("price-service")).contains("8098:8098").contains("price-data:/data");
    }
}
