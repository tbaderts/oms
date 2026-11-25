package org.example.simulator.marketdata;

import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/**
 * A stand-in for Alpha Vantage's {@code /query} endpoint (SPEC-0073): answers each symbol with a
 * canned JSON body (an empty {@code Global Quote} for symbols not set up) and records every request,
 * so tests can count how often the venue asked.
 */
public final class StubAlphaVantage implements AutoCloseable {

    /** One request received: its query parameters. */
    public record Request(Map<String, String> params) {
        public String symbol() {
            return params.get("symbol");
        }
    }

    private final HttpServer server;
    private final Map<String, String> answers = new ConcurrentHashMap<>();
    private final List<Request> requests = new CopyOnWriteArrayList<>();

    public StubAlphaVantage() {
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        server.createContext("/query", this::handle);
        server.start();
    }

    public String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    /** Alpha Vantage quotes the symbol at this last price. */
    public void quote(String symbol, String price) {
        answer(symbol, """
                {"Global Quote":{"01. symbol":"%s","02. open":"%s","03. high":"%s","04. low":"%s",
                  "05. price":"%s","06. volume":"1000","07. latest trading day":"2026-11-24",
                  "08. previous close":"%s","09. change":"0.00","10. change percent":"0.0000%%"}}"""
                .formatted(symbol, price, price, price, price, price));
    }

    /** Alpha Vantage answers the symbol with this body, as is. */
    public void answer(String symbol, String json) {
        answers.put(symbol, json);
    }

    public long requestsFor(String symbol) {
        return requests.stream().filter(r -> symbol.equals(r.symbol())).count();
    }

    public List<Request> requests() {
        return List.copyOf(requests);
    }

    @Override
    public void close() {
        server.stop(0);
    }

    private void handle(HttpExchange exchange) throws IOException {
        Map<String, String> params = new HashMap<>();
        String query = exchange.getRequestURI().getRawQuery();
        if (query != null) {
            for (String pair : query.split("&")) {
                int eq = pair.indexOf('=');
                if (eq > 0) {
                    params.put(decode(pair.substring(0, eq)), decode(pair.substring(eq + 1)));
                }
            }
        }
        Request request = new Request(params);
        requests.add(request);
        String body = answers.getOrDefault(request.symbol(), "{\"Global Quote\":{}}");
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }

    private static String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }
}
