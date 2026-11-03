package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.yaml.snakeyaml.Yaml;

import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.MeterRegistry;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The dashboards Grafana provisions are the JSON files in {@code oms-core/grafana/dashboards}
 * (SPEC-0038 AC-4), and every oms-core metric they query exists (AC-5). The live check, that every
 * query returns data in the compose stack, is in {@code scripts/lgtm-smoke-test.ps1}.
 */
class GrafanaDashboardsTest extends AbstractFillFlowIntegrationTest {

    private static final Path DASHBOARDS = Path.of("grafana", "dashboards");
    private static final Path PROVIDER = Path.of("grafana", "provisioning", "dashboards", "oms.yml");
    private static final Set<String> DATASOURCES = Set.of("oms-mimir", "oms-loki", "oms-tempo");
    private static final Map<String, String> EXPECTED = Map.of(
            "oms-overview.json", "oms-overview",
            "oms-services.json", "oms-services");

    @Autowired MeterRegistry meterRegistry;

    @Test
    @SuppressWarnings("unchecked")
    void dashboardsAreProvisionedFromTheRepository() throws IOException {
        Map<String, Object> provider;
        try (InputStream in = Files.newInputStream(PROVIDER)) {
            provider = new Yaml().load(in);
        }
        var providers = (List<Map<String, Object>>) provider.get("providers");
        assertEquals(1, providers.size());
        assertEquals("OMS", providers.getFirst().get("folder"));
        assertEquals(false, providers.getFirst().get("allowUiUpdates"));
        assertEquals("/etc/grafana/dashboards", ((Map<String, Object>) providers.getFirst().get("options")).get("path"));

        for (var expected : EXPECTED.entrySet()) {
            JsonNode dashboard = read(expected.getKey());
            assertEquals(expected.getValue(), dashboard.get("uid").asString(), expected.getKey());
            assertFalse(dashboard.get("title").asString().isBlank());
            for (JsonNode datasource : datasources(dashboard)) {
                assertTrue(DATASOURCES.contains(datasource.get("uid").asString()),
                        expected.getKey() + " uses datasource " + datasource);
            }
        }
    }

    @Test
    void everyOmsMetricInTheDashboardsExists() throws Exception {
        createLiveOrder(); // the SLA timers and the command counter are created by an order's flow

        Set<String> meters = meterRegistry.getMeters().stream()
                .map(Meter::getId)
                .map(id -> id.getName().replace('.', '_').replace('-', '_'))
                .collect(Collectors.toCollection(TreeSet::new));
        Pattern metric = Pattern.compile("\\b(oms_[a-z_]+)");

        for (String file : EXPECTED.keySet()) {
            for (JsonNode target : targets(read(file))) {
                if (!target.has("expr") || !"oms-mimir".equals(target.get("datasource").get("uid").asString())) {
                    continue;
                }
                Matcher m = metric.matcher(target.get("expr").asString());
                while (m.find()) {
                    String name = m.group(1);
                    String base = name.replaceFirst("_(bucket|count|sum|max)$", "");
                    assertTrue(meters.contains(name) || meters.contains(base),
                            file + " queries " + name + ", which oms-core does not register; known: " + meters);
                }
            }
        }
    }

    private static JsonNode read(String file) throws IOException {
        return JsonMapper.builder().build().readTree(Files.readString(DASHBOARDS.resolve(file)));
    }

    private static List<JsonNode> targets(JsonNode dashboard) {
        List<JsonNode> targets = new ArrayList<>();
        dashboard.get("panels").forEach(panel -> panel.path("targets").forEach(targets::add));
        return targets;
    }

    private static List<JsonNode> datasources(JsonNode dashboard) {
        List<JsonNode> datasources = new ArrayList<>();
        dashboard.get("panels").forEach(panel -> {
            datasources.add(panel.get("datasource"));
            panel.path("targets").forEach(target -> datasources.add(target.get("datasource")));
        });
        dashboard.path("templating").path("list").forEach(variable -> datasources.add(variable.get("datasource")));
        return datasources;
    }
}
