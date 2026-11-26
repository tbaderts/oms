package org.example.simulator.marketdata;

import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/**
 * A stand-in for the price service's quote endpoint, {@code GET /api/market-data/quotes/{symbol}}
 * (SPEC-0079): a quote for each symbol set up, a 404 Problem for the others, a 503 while failing. It
 * records every symbol asked for, so tests can count how often the venue asked.
 */
public final class StubPriceService implements AutoCloseable {

    private static final String PATH = "/api/market-data/quotes/";

    private final HttpServer server;
    private final Map<String, String> answers = new ConcurrentHashMap<>();
    private final List<String> requests = new CopyOnWriteArrayList<>();
    private volatile boolean failing;

    public StubPriceService() {
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        server.createContext(PATH, this::handle);
        server.start();
    }

    public String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    /** The price service quotes the symbol at this last price, from the given source. */
    public void quote(String symbol, String last, String source) {
        answer(symbol, """
                {"symbol":"%s","last":%s,"asOf":"2026-11-25","source":"%s"}""".formatted(symbol, last, source));
    }

    public void quote(String symbol, String last) {
        quote(symbol, last, "ALPHA_VANTAGE");
    }

    /** The price service answers the symbol with this body, as is. */
    public void answer(String symbol, String json) {
        answers.put(symbol, json);
    }

    /** Every request is answered 503, as a price service that is up but cannot serve. */
    public void failing(boolean value) {
        failing = value;
    }

    public long requestsFor(String symbol) {
        return requests.stream().filter(symbol::equals).count();
    }

    @Override
    public void close() {
        server.stop(0);
    }

    private void handle(HttpExchange exchange) throws IOException {
        String symbol = URLDecoder.decode(exchange.getRequestURI().getRawPath().substring(PATH.length()), StandardCharsets.UTF_8);
        requests.add(symbol);
        int status;
        String body;
        String type = "application/json";
        if (failing) {
            status = 503;
            body = "{\"type\":\"about:blank\",\"status\":503}";
            type = "application/problem+json";
        } else if (answers.containsKey(symbol)) {
            status = 200;
            body = answers.get(symbol);
        } else {
            status = 404;
            body = "{\"type\":\"urn:oms:error:not-found\",\"status\":404}";
            type = "application/problem+json";
        }
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", type);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }
}
