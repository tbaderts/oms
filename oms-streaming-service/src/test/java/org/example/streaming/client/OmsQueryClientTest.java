package org.example.streaming.client;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.LongStream;

import org.example.common.model.query.OrderDto;
import org.example.streaming.model.StreamFilter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriComponentsBuilder;

import reactor.core.publisher.Mono;

/**
 * SPEC-0057 AC-3: the order snapshot is bounded to the client's limit, newest first, and reports how
 * many orders match, without paging the Query API past the limit.
 */
class OmsQueryClientTest {

    private static final int MATCHING = 8300;

    /** The (page, size, sort) of each Query API call, in order. */
    private final List<String> calls = new ArrayList<>();
    private final List<String> paths = new ArrayList<>();
    private final List<String> queries = new ArrayList<>();

    @Test
    void fetchOrderSnapshot_stopsAtLimitAndReportsMatching() {
        OmsQueryClient client = clientOver(MATCHING);

        OmsQueryClient.OrderSnapshot snapshot = client.fetchOrderSnapshot(StreamFilter.withSnapshot(), 2000);
        List<OrderDto> rows = snapshot.rows().collectList().block();
        Long matching = snapshot.matching().block();

        assertEquals(2000, rows.size());
        assertEquals(8300L, rows.get(0).getId(), "newest first");
        assertEquals(6301L, rows.get(rows.size() - 1).getId());
        assertTrue(isDescending(rows), "ids descending");
        assertEquals(8300L, matching);
        assertEquals(8300L % 7 + 1, rows.get(0).getEventVersion(),
                "each order's event version, which live events are deduplicated against (SPEC-0018)");
        assertEquals(List.of("0,500,id,DESC", "1,500,id,DESC", "2,500,id,DESC", "3,500,id,DESC"), calls,
                "the first page is fetched once, and no page past the limit");
    }

    @Test
    void fetchOrderSnapshot_withFewerMatchesThanTheLimitSendsThemAll() {
        OmsQueryClient client = clientOver(120);

        OmsQueryClient.OrderSnapshot snapshot = client.fetchOrderSnapshot(null, 2000);

        assertEquals(120, snapshot.rows().collectList().block().size());
        assertEquals(120L, snapshot.matching().block());
        assertEquals(List.of("0,500,id,DESC"), calls);
    }

    @Test
    void fetchOrderSnapshot_withLimitZeroSendsNoRowsButCounts() {
        OmsQueryClient client = clientOver(MATCHING);

        OmsQueryClient.OrderSnapshot snapshot = client.fetchOrderSnapshot(null, 0);

        assertEquals(0, snapshot.rows().collectList().block().size());
        assertEquals(8300L, snapshot.matching().block());
    }

    /** One stored fill as GET /api/query/executions/search returns it (SPEC-0070). */
    private static final String FILL_JSON = """
            {"id":41,"orderId":"ORD-1","execId":"ORD-1-F1","rootOrderId":"ORD-1","symbol":"INTC",
             "securityId":"US4581401001","securityIdSource":"ISIN","execType":"F","lastQty":200.00000000,
             "lastPx":86.95000000,"lastMkt":"XSIM","lastCapacity":"A","cumQty":200.00000000,
             "leavesQty":300.00000000,"avgPx":86.95000000,"transactTime":"2026-11-16T17:12:07.556Z",
             "status":"APPLIED","orderVersion":3}""";

    /** The (path, query) of each executions request. */
    private final List<String> executionCalls = new ArrayList<>();

    /** SPEC-0071 AC-1: a stored fill maps to the streaming ExecutionDto with the execution's fields. */
    @Test
    void fetchExecutionSnapshot_mapsStoredFills() {
        OmsQueryClient client = clientAnswering("{\"content\":[" + FILL_JSON + "],"
                + "\"page\":{\"size\":500,\"number\":0,\"totalElements\":1,\"totalPages\":1}}");

        OmsQueryClient.ExecutionSnapshot snapshot = client.fetchExecutionSnapshot(null, 2000);
        List<org.example.streaming.model.ExecutionDto> fills = snapshot.rows().collectList().block();

        assertEquals(1, fills.size());
        var fill = fills.get(0);
        assertEquals("ORD-1-F1", fill.getExecId());
        assertEquals("ORD-1", fill.getOrderId());
        assertEquals("INTC", fill.getSymbol());
        assertEquals("US4581401001", fill.getSecurityId());
        assertEquals(0, new java.math.BigDecimal("200").compareTo(fill.getLastQty()));
        assertEquals(0, new java.math.BigDecimal("86.95").compareTo(fill.getLastPx()));
        assertEquals(0, new java.math.BigDecimal("200").compareTo(fill.getCumQty()));
        assertEquals(0, new java.math.BigDecimal("300").compareTo(fill.getLeavesQty()));
        assertEquals(0, new java.math.BigDecimal("86.95").compareTo(fill.getAvgPx()));
        assertEquals("F", fill.getExecType());
        assertEquals("XSIM", fill.getLastMkt());
        assertEquals("A", fill.getLastCapacity());
        assertEquals(java.time.Instant.parse("2026-11-16T17:12:07.556Z"), fill.getTransactTime());
        assertEquals(3L, fill.getOrderVersion());
        assertEquals(3L, fill.getSequenceNumber());
        assertEquals(1L, snapshot.matching().block());
    }

    /**
     * SPEC-0071 AC-1: the execution snapshot pages the execution search newest first, with the
     * stream filter as search filters, stops at the limit and counts the matches.
     */
    @Test
    void fetchExecutionSnapshot_pagesTheSearchAndCountsMatches() {
        OmsQueryClient client = clientOver(1200);

        OmsQueryClient.ExecutionSnapshot snapshot =
                client.fetchExecutionSnapshot(StreamFilter.eq("symbol", "AAPL"), 600);

        assertEquals(600, snapshot.rows().collectList().block().size());
        assertEquals(1200L, snapshot.matching().block());
        assertEquals(List.of("0,500,id,DESC", "1,500,id,DESC"), calls, "the first page once, none past the limit");
        assertTrue(paths.stream().allMatch(path -> path.equals("/api/query/executions/search")), paths.toString());
        assertTrue(queries.stream().allMatch(q -> q.contains("symbol=AAPL")), queries.toString());
    }

    /** A client over a Query API stub answering every executions request with {@code json}. */
    @SuppressWarnings("unchecked")
    private OmsQueryClient clientAnswering(String json) {
        WebClient.Builder builder = WebClient.builder().exchangeFunction(request -> {
            executionCalls.add(request.url().getPath() + "?" + request.url().getQuery());
            return Mono.just(ClientResponse.create(HttpStatus.OK)
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                    .body(json)
                    .build());
        });
        ObjectProvider<WebClient.Builder> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable(any())).thenReturn(builder);
        OmsQueryClient client = new OmsQueryClient(provider, "http://oms-core", 16);
        ReflectionTestUtils.setField(client, "readTimeoutMs", 5000);
        return client;
    }

    /** A client over a Query API stub holding {@code total} orders with ids 1..total. */
    @SuppressWarnings("unchecked")
    private OmsQueryClient clientOver(int total) {
        WebClient.Builder builder = WebClient.builder().exchangeFunction(request -> {
            var params = UriComponentsBuilder.fromUri(request.url()).build().getQueryParams();
            int page = Integer.parseInt(params.getFirst("page"));
            int size = Integer.parseInt(params.getFirst("size"));
            calls.add(page + "," + size + "," + params.getFirst("sort"));
            paths.add(request.url().getPath());
            queries.add(request.url().getQuery());
            return Mono.just(ClientResponse.create(HttpStatus.OK)
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                    .body(pageJson(total, page, size))
                    .build());
        });
        ObjectProvider<WebClient.Builder> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable(any())).thenReturn(builder);
        OmsQueryClient client = new OmsQueryClient(provider, "http://oms-core", 16);
        ReflectionTestUtils.setField(client, "readTimeoutMs", 5000);
        return client;
    }

    /** One page of the Query API, newest (highest id) first, as {@code sort=id,DESC} returns it. */
    private static String pageJson(int total, int page, int size) {
        long from = (long) total - (long) page * size;
        String content = LongStream.iterate(from, id -> id - 1)
                .limit(Math.max(0, Math.min(size, from)))
                .mapToObj(id -> "{\"id\":" + id + ",\"orderId\":\"O-" + id + "\",\"eventVersion\":" + (id % 7 + 1) + "}")
                .collect(Collectors.joining(","));
        int totalPages = (total + size - 1) / size;
        return "{\"content\":[" + content + "],\"page\":{\"size\":" + size + ",\"number\":" + page
                + ",\"totalElements\":" + total + ",\"totalPages\":" + totalPages + "}}";
    }

    private static boolean isDescending(List<OrderDto> rows) {
        for (int i = 1; i < rows.size(); i++) {
            if (rows.get(i - 1).getId() <= rows.get(i).getId()) {
                return false;
            }
        }
        return true;
    }
}
