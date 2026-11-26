package org.example.price.provider;

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
 * A stand-in for Alpha Vantage's {@code /query} endpoint (SPEC-0073, moved here by SPEC-0079):
 * answers {@code GLOBAL_QUOTE} for each symbol with a canned JSON body (an empty {@code Global Quote}
 * for symbols not set up), {@code LISTING_STATUS} with a canned CSV, or every request with the rate
 * limit {@code Note}; it records every request, so tests can count how often the service asked.
 */
public final class StubAlphaVantage implements AutoCloseable {

    /** One request received: its query parameters. */
    public record Request(Map<String, String> params) {
        public String symbol() {
            return params.get("symbol");
        }

        public String function() {
            return params.get("function");
        }
    }

    private final HttpServer server;
    private final Map<String, String> answers = new ConcurrentHashMap<>();
    private final List<Request> requests = new CopyOnWriteArrayList<>();
    private volatile String listing = "symbol,name,exchange,assetType,ipoDate,delistingDate,status\r\n";
    private volatile boolean rateLimited;
    private final Map<String, Long> delays = new ConcurrentHashMap<>();

    /** Answers this symbol only after a pause, as a slow provider would. */
    public void delay(String symbol, long millis) {
        delays.put(symbol, millis);
    }

    public StubAlphaVantage() {
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        server.createContext("/query", this::handle);
        server.setExecutor(java.util.concurrent.Executors.newCachedThreadPool());
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

    /** LISTING_STATUS answers these rows (after the header). */
    public void listing(String... rows) {
        listing = "symbol,name,exchange,assetType,ipoDate,delistingDate,status\r\n" + String.join("\r\n", rows) + "\r\n";
    }

    /** Every request is answered with Alpha Vantage's rate limit Note, as a spent free key is. */
    public void rateLimited(boolean value) {
        rateLimited = value;
    }

    /** Forgets the requests and the rate limit, keeping the canned answers. */
    public void reset() {
        requests.clear();
        rateLimited = false;
    }

    public long requestsForFunction(String function) {
        return requests.stream().filter(r -> function.equals(r.function())).count();
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
        Long pause = request.symbol() == null ? null : delays.get(request.symbol());
        if (pause != null) {
            try {
                Thread.sleep(pause);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        requests.add(request);
        String body;
        String contentType = "application/json";
        if (rateLimited) {
            body = "{\"Note\":\"Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day.\"}";
        } else if ("LISTING_STATUS".equals(request.function())) {
            body = listing;
            contentType = "application/x-download";
        } else {
            body = answers.getOrDefault(request.symbol(), "{\"Global Quote\":{}}");
        }
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", contentType);
        exchange.sendResponseHeaders(200, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }

    private static String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }
}
