package org.example.oms.load;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * The load suite (SPEC-0024): a scripted order flow against a running stack, measured.
 *
 * <p>Runs only with {@code OMS_LOAD_SUITE=true}, against oms-core with Kafka on and the exchange
 * simulator connected (the root docker compose). It submits MARKET orders through the command API,
 * waits for every one to reach a terminal state, and writes a report of throughput and the SLA
 * timers' percentiles over this run. See oms-knowledge-base/oms-concepts/exchange-simulator.md §8.
 */
@EnabledIfEnvironmentVariable(named = "OMS_LOAD_SUITE", matches = "true")
class LoadSuiteRunnerTest {

    /** The order SLA timers, as Prometheus names their histograms. */
    static final List<String> SLA_TIMERS = List.of(
            "oms_order_time_to_ack",
            "oms_order_oms_processing_time",
            "oms_order_market_round_trip",
            "oms_order_time_to_market");

    private static final Set<String> TERMINAL = Set.of("FILLED", "CXL", "REJ", "CLOSED");
    private static final ObjectMapper JSON = JsonMapper.builder().build();

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final String baseUrl = env("OMS_LOAD_BASE_URL", "http://localhost:8090");
    private final int orders = Integer.parseInt(env("OMS_LOAD_ORDERS", "500"));
    private final int concurrency = Integer.parseInt(env("OMS_LOAD_CONCURRENCY", "8"));
    private final int fillSlices = Integer.parseInt(env("OMS_LOAD_FILL_SLICES", "1"));
    private final Duration timeout = Duration.ofSeconds(Long.parseLong(env("OMS_LOAD_TIMEOUT_SECONDS", "600")));
    private final Path reportDir = Path.of(env("OMS_LOAD_REPORT_DIR", "build/load-reports"));

    @Test
    void runsScriptedFlowAndWritesReport() throws Exception {
        String run = UUID.randomUUID().toString().substring(0, 8);
        PrometheusSnapshot before = scrape();

        Instant startedAt = Instant.now();
        long start = System.nanoTime();
        List<String> orderIds = submitOrders(run);
        Map<String, Long> finalStates = awaitTerminal(orderIds);
        Duration duration = Duration.ofNanos(System.nanoTime() - start);

        PrometheusSnapshot after = scrape();
        Map<String, String> applied = Map.of("outcome", "applied");
        long consumed = Math.round(after.sum("oms_commands_consumed_total", applied)
                - before.sum("oms_commands_consumed_total", applied));

        Map<String, LoadReport.Percentiles> latencies = new LinkedHashMap<>();
        for (String timer : SLA_TIMERS) {
            String histogram = timer + "_seconds";
            latencies.put(timer, new LoadReport.Percentiles(
                    PrometheusSnapshot.countBetween(before, after, histogram),
                    millis(PrometheusSnapshot.quantileBetween(before, after, histogram, 0.50)),
                    millis(PrometheusSnapshot.quantileBetween(before, after, histogram, 0.95)),
                    millis(PrometheusSnapshot.quantileBetween(before, after, histogram, 0.99))));
        }

        LoadReport report = new LoadReport(startedAt, baseUrl, orders, concurrency, fillSlices, duration,
                orderIds.size() + consumed, latencies, finalStates);
        Path file = LoadReportWriter.write(report, reportDir);
        System.out.println("Load report written to " + file.toAbsolutePath());
        System.out.println(LoadReportWriter.render(report));

        assertEquals(orders, orderIds.size(), "every create was applied");
        assertTrue(Files.exists(file));
        // The report states fillSlices from OMS_LOAD_FILL_SLICES; the simulator's own setting decides
        // what happened. Each filled order costs one accept plus one command per slice from Kafka, so a
        // mismatch (or other traffic on the stack) shows here and the report is not a valid baseline.
        long filled = finalStates.getOrDefault("FILLED", 0L);
        assertEquals(filled * (1 + fillSlices), consumed,
                "Kafka commands applied do not match " + filled + " filled orders x (1 accept + " + fillSlices
                        + " fill slices): set OMS_LOAD_FILL_SLICES to the simulator's SIMULATOR_FILL_SLICES,"
                        + " and run on an otherwise idle stack");
    }

    private List<String> submitOrders(String run) throws Exception {
        List<String> orderIds = Collections.synchronizedList(new ArrayList<>());
        try (ExecutorService pool = Executors.newFixedThreadPool(concurrency)) {
            List<Future<?>> submitted = new ArrayList<>();
            for (int i = 0; i < orders; i++) {
                String clOrdId = "LOAD-" + run + "-" + i;
                submitted.add(pool.submit(() -> {
                    orderIds.add(create(clOrdId));
                    return null;
                }));
            }
            for (Future<?> future : submitted) {
                future.get();
            }
        }
        return orderIds;
    }

    private String create(String clOrdId) throws IOException, InterruptedException {
        String body = """
                {"type":"OrderCreateCmd","version":"1.0.0","order":{
                  "sessionId":"load-suite","clOrdId":"%s","account":"load-account","handlInst":"AUTO",
                  "securityIdSource":"ISIN","securityId":"US0378331005","symbol":"AAPL","side":"BUY",
                  "ordType":"MARKET","priceType":"PER_UNIT","orderQty":100,"timeInForce":"DAY",
                  "exDestination":"XSIM","settlCurrency":"USD"}}""".formatted(clOrdId);
        HttpResponse<String> response = http.send(
                HttpRequest.newBuilder(URI.create(baseUrl + "/api/command/execute"))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body))
                        .build(),
                HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 201) {
            throw new IllegalStateException("Create " + clOrdId + " answered " + response.statusCode() + ": " + response.body());
        }
        return JSON.readTree(response.body()).get("id").asString();
    }

    /** Polls until every order is terminal; returns how many ended in each state. */
    private Map<String, Long> awaitTerminal(List<String> orderIds) throws IOException, InterruptedException {
        long deadline = System.nanoTime() + timeout.toNanos();
        Map<String, String> states = new LinkedHashMap<>();
        List<String> open = new ArrayList<>(orderIds);
        while (!open.isEmpty()) {
            if (System.nanoTime() > deadline) {
                throw new AssertionError(open.size() + " order(s) not terminal after " + timeout + ", e.g. " + open.getFirst());
            }
            List<String> stillOpen = new ArrayList<>();
            for (String orderId : open) {
                String state = stateOf(orderId);
                if (state != null && TERMINAL.contains(state)) {
                    states.put(orderId, state);
                } else {
                    stillOpen.add(orderId);
                }
            }
            open = stillOpen;
            if (!open.isEmpty()) {
                Thread.sleep(200);
            }
        }
        Map<String, Long> counts = new TreeMap<>();
        states.values().forEach(state -> counts.merge(state, 1L, Long::sum));
        return counts;
    }

    private String stateOf(String orderId) throws IOException, InterruptedException {
        HttpResponse<String> response = http.send(
                HttpRequest.newBuilder(URI.create(baseUrl + "/api/orders/orderId/" + orderId)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            return null;
        }
        JsonNode state = JSON.readTree(response.body()).get("state");
        return state == null || state.isNull() ? null : state.asString();
    }

    private PrometheusSnapshot scrape() throws IOException, InterruptedException {
        HttpResponse<String> response = http.send(
                HttpRequest.newBuilder(URI.create(baseUrl + "/actuator/prometheus")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IllegalStateException("/actuator/prometheus answered " + response.statusCode());
        }
        return PrometheusSnapshot.parse(response.body());
    }

    private static Double millis(Double seconds) {
        return seconds == null ? null : seconds * 1000;
    }

    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }
}
