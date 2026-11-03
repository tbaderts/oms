package org.example.mcp.telemetry;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.function.Predicate;
import java.util.zip.GZIPInputStream;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/**
 * A stand-in for the OTLP/HTTP endpoint of the Alloy agent (SPEC-0033): it accepts every POST,
 * answers 200, and keeps the protobuf bodies by path ({@code /v1/traces}, {@code /v1/metrics},
 * {@code /v1/logs}). Tests look for strings and trace ids in the raw bytes rather than decoding
 * the protobuf, which would need the OTLP proto classes on the test classpath.
 */
public final class MockOtlpReceiver {

    /** One received export request. */
    public record Request(String path, byte[] body) {

        public boolean contains(String text) {
            return contains(text.getBytes(StandardCharsets.UTF_8));
        }

        /** True if the body contains the trace id (32 hex digits), as its 16 raw bytes. */
        public boolean containsTraceId(String traceIdHex) {
            return contains(HexFormat.of().parseHex(traceIdHex));
        }

        private boolean contains(byte[] needle) {
            outer:
            for (int i = 0; i <= body.length - needle.length; i++) {
                for (int j = 0; j < needle.length; j++) {
                    if (body[i + j] != needle[j]) {
                        continue outer;
                    }
                }
                return true;
            }
            return false;
        }
    }

    private final HttpServer server;
    private final List<Request> requests = new CopyOnWriteArrayList<>();

    private MockOtlpReceiver(HttpServer server) {
        this.server = server;
    }

    /** Starts a receiver on a free local port. */
    public static MockOtlpReceiver start() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            MockOtlpReceiver receiver = new MockOtlpReceiver(server);
            server.createContext("/", receiver::handle);
            server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
            server.start();
            return receiver;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** The base URL to use as {@code OTLP_ENDPOINT}. */
    public String endpoint() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    /** Waits until a request on {@code path} matches, and returns it. */
    public Request await(String path, Predicate<Request> condition, Duration timeout, String description)
            throws InterruptedException {
        long deadline = System.nanoTime() + timeout.toNanos();
        while (System.nanoTime() < deadline) {
            for (Request request : requests) {
                if (request.path().equals(path) && condition.test(request)) {
                    return request;
                }
            }
            Thread.sleep(100);
        }
        throw new AssertionError("Timed out after " + timeout + " waiting for an OTLP request on " + path
                + " with " + description + "; received " + paths());
    }

    private List<String> paths() {
        return requests.stream().map(Request::path).distinct().toList();
    }

    private void handle(HttpExchange exchange) throws IOException {
        try (exchange) {
            InputStream body = exchange.getRequestBody();
            if ("gzip".equalsIgnoreCase(exchange.getRequestHeaders().getFirst("Content-Encoding"))) {
                body = new GZIPInputStream(body);
            }
            byte[] bytes = body.readAllBytes();
            requests.add(new Request(exchange.getRequestURI().getPath(), Arrays.copyOf(bytes, bytes.length)));
            exchange.getResponseHeaders().add("Content-Type", "application/x-protobuf");
            exchange.sendResponseHeaders(200, -1);
        }
    }
}
